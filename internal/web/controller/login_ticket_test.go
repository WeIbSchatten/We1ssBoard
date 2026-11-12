package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/loginlimit"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/session"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

type ticketReply struct {
	Success bool `json:"success"`
	Obj     struct {
		Ticket    string `json:"ticket"`
		ExpiresIn int    `json:"expiresIn"`
	} `json:"obj"`
}

func postWithScope(t *testing.T, scope string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/loginTicket", func(c *gin.Context) {
		if scope != "" {
			c.Set("api_token_scope", scope)
		}
	}, handler)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/loginTicket", nil))
	return rec
}

func TestIssueLoginTicketIsAdminTokenOnly(t *testing.T) {
	a := &SettingController{}
	for _, scope := range []string{model.ApiScopeNodeSync, model.ApiScopeMonitor, "", "unknown"} {
		name := scope
		if name == "" {
			name = "browser session"
		}
		t.Run(name, func(t *testing.T) {
			rec := postWithScope(t, scope, a.issueLoginTicket)
			if rec.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want 403", rec.Code)
			}
			var reply ticketReply
			_ = json.Unmarshal(rec.Body.Bytes(), &reply)
			if reply.Success || reply.Obj.Ticket != "" {
				t.Fatalf("a refused caller received a ticket: %s", rec.Body.String())
			}
		})
	}
}

func TestIssueLoginTicketHandsAdminASingleUseTicket(t *testing.T) {
	rec := postWithScope(t, model.ApiScopeAdmin, (&SettingController{}).issueLoginTicket)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var reply ticketReply
	if err := json.Unmarshal(rec.Body.Bytes(), &reply); err != nil {
		t.Fatal(err)
	}
	if !reply.Success || reply.Obj.Ticket == "" {
		t.Fatalf("reply = %s", rec.Body.String())
	}
	if want := int(session.LoginTicketTTL.Seconds()); reply.Obj.ExpiresIn != want {
		t.Fatalf("expiresIn = %d, want %d", reply.Obj.ExpiresIn, want)
	}
	if !session.ConsumeLoginTicket(reply.Obj.Ticket) {
		t.Fatal("issued ticket is not redeemable")
	}
	if session.ConsumeLoginTicket(reply.Obj.Ticket) {
		t.Fatal("issued ticket redeemed twice")
	}
}

func loginTicketRouter(a *IndexController) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(sessions.Sessions("We1ssBoard", cookie.NewStore([]byte("01234567890123456789012345678901"))))
	r.POST("/login/ticket", a.loginWithTicket)
	return r
}

func redeem(r *gin.Engine, ticket string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/login/ticket", strings.NewReader(`{"ticket":"`+ticket+`"}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "203.0.113.9:4444"
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestLoginWithTicketRefusesUnknownTicketWithoutSession(t *testing.T) {
	prev := defaultLoginLimiter
	defaultLoginLimiter = loginlimit.New(loginlimit.MaxFailures, loginlimit.Window, loginlimit.Cooldown)
	t.Cleanup(func() { defaultLoginLimiter = prev })

	rec := redeem(loginTicketRouter(&IndexController{}), "not-a-ticket")
	var reply struct{ Success bool }
	if err := json.Unmarshal(rec.Body.Bytes(), &reply); err != nil {
		t.Fatal(err)
	}
	if reply.Success {
		t.Fatalf("unknown ticket logged in: %s", rec.Body.String())
	}
	if rec.Header().Get("Set-Cookie") != "" {
		t.Fatalf("refused ticket still set a cookie: %q", rec.Header().Get("Set-Cookie"))
	}
}

// Guessing tickets must hit the same lockout as guessing passwords.
func TestLoginWithTicketLocksOutRepeatedFailures(t *testing.T) {
	prev := defaultLoginLimiter
	defaultLoginLimiter = loginlimit.New(loginlimit.MaxFailures, loginlimit.Window, loginlimit.Cooldown)
	t.Cleanup(func() { defaultLoginLimiter = prev })

	r := loginTicketRouter(&IndexController{})
	for range loginlimit.MaxFailures {
		redeem(r, "guess")
	}
	genuine, err := session.IssueLoginTicket()
	if err != nil {
		t.Fatal(err)
	}
	rec := redeem(r, genuine)
	if strings.Contains(rec.Body.String(), `"success":true`) {
		t.Fatalf("locked-out client logged in with a genuine ticket: %s", rec.Body.String())
	}
	if !session.ConsumeLoginTicket(genuine) {
		t.Fatal("a locked-out request burned the genuine ticket")
	}
}

// The remote admin proxy must stay out of every non-admin token scope: it can
// stop Xray, replace the database and mint logins on a managed node.
func TestRemoteAdminRoutesRefuseNonAdminTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	api := &APIController{}
	var scope string
	r := gin.New()
	g := r.Group("/panel/api")
	g.Use(func(c *gin.Context) { c.Set("api_token_scope", scope) }, api.enforceTokenScope)
	NewNodeController(g.Group("/nodes"))

	var checked int
	for _, route := range r.Routes() {
		if !strings.Contains(route.Path, "/nodes/remote/:id/") {
			continue
		}
		for _, s := range []string{model.ApiScopeNodeSync, model.ApiScopeMonitor} {
			scope = s
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequest(route.Method, strings.Replace(route.Path, ":id", "1", 1), nil))
			if rec.Code != http.StatusForbidden {
				t.Errorf("%s %s with %s token = %d, want 403", route.Method, route.Path, s, rec.Code)
			}
			checked++
		}
	}
	if checked < 2*11 {
		t.Fatalf("only %d remote route checks ran; the router no longer registers the admin proxy", checked)
	}
}
