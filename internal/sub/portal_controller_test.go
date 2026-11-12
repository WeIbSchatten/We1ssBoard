package sub

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/crypto"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/portal"
)

const portalPassword = "correct-horse"

type portalEnv struct {
	hiddenFixture
	router *gin.Engine
	svc    *portal.Service
}

func newPortalEnv(t *testing.T, enabled bool) portalEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	f := seedHiddenFixture(t)
	hash, err := crypto.HashPasswordAsBcrypt(portalPassword)
	if err != nil {
		t.Fatal(err)
	}
	database.GetDB().Model(f.client).Update("portal_password_hash", hash)
	if err := database.GetDB().Create(&model.Setting{Key: "portalEnabled", Value: fmt.Sprint(enabled)}).Error; err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	sub := NewSUBController(router.Group("/"), WithSUBJsonEnabled(true), WithSUBClashEnabled(true))
	settings := &service.SettingService{}
	svc := portal.New(settings)
	NewPortalController(router.Group("/portal"), sub, svc, settings)
	return portalEnv{hiddenFixture: f, router: router, svc: svc}
}

type portalReq struct {
	method, path string
	body         any
	cookies      []*http.Cookie
	header       map[string]string
}

func (e portalEnv) do(r portalReq) *httptest.ResponseRecorder {
	var body bytes.Buffer
	if r.body != nil {
		_ = json.NewEncoder(&body).Encode(r.body)
	}
	req := httptest.NewRequest(r.method, r.path, &body)
	req.RemoteAddr = "192.0.2.10:5555"
	req.Header.Set("Content-Type", "application/json")
	for k, v := range r.header {
		req.Header.Set(k, v)
	}
	for _, c := range r.cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	e.router.ServeHTTP(w, req)
	return w
}

type webSession struct {
	cookies []*http.Cookie
	csrf    string
}

func (e portalEnv) loginWeb(t *testing.T, password string) webSession {
	t.Helper()
	w := e.do(portalReq{method: "POST", path: "/portal/api/login", body: map[string]string{"login": "a.smirnova", "password": password, "client": "web"}})
	if w.Code != http.StatusOK {
		t.Fatalf("web login = %d %s", w.Code, w.Body)
	}
	var resp struct{ CSRFToken string }
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return webSession{cookies: mergeCookies(nil, w.Result().Cookies()), csrf: resp.CSRFToken}
}

func (e portalEnv) loginApp(t *testing.T) string {
	t.Helper()
	w := e.do(portalReq{method: "POST", path: "/portal/api/login", body: map[string]string{"login": "a.smirnova", "password": portalPassword, "client": "app", "device": "Pixel 8"}})
	if w.Code != http.StatusOK {
		t.Fatalf("app login = %d %s", w.Code, w.Body)
	}
	var resp struct{ Token string }
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Token == "" {
		t.Fatalf("app login returned no token: %s", w.Body)
	}
	return resp.Token
}

func (s webSession) req(method, path string, body any) portalReq {
	return portalReq{method: method, path: path, body: body, cookies: s.cookies, header: map[string]string{"X-CSRF-Token": s.csrf}}
}

func bearer(token string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + token}
}

func errorCode(w *httptest.ResponseRecorder) string {
	var resp struct{ Error string }
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return resp.Error
}

func TestPortal_DisabledIs404(t *testing.T) {
	e := newPortalEnv(t, false)
	w := e.do(portalReq{method: "POST", path: "/portal/api/login", body: map[string]string{"login": "a.smirnova", "password": portalPassword, "client": "web"}})
	if w.Code != http.StatusNotFound {
		t.Fatalf("code = %d, want 404 while the portal is off", w.Code)
	}
}

func TestPortal_LoginWebAndMe(t *testing.T) {
	e := newPortalEnv(t, true)
	s := e.loginWeb(t, portalPassword)
	w := e.do(s.req("GET", "/portal/api/me", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("me = %d %s", w.Code, w.Body)
	}
	var me PortalProfile
	if err := json.Unmarshal(w.Body.Bytes(), &me); err != nil {
		t.Fatal(err)
	}
	keys, _ := e.svc.ClientKeys(e.client.Id)
	if me.Email != "a.smirnova" || len(me.Keys) != len(keys) || len(keys) != 3 || me.SubURL == "" {
		t.Fatalf("me = %+v, want email a.smirnova, 3 keys and a subscription URL", me)
	}
}

func TestPortal_LoginSameErrorForUnknownAndWrong(t *testing.T) {
	e := newPortalEnv(t, true)
	unknown := e.do(portalReq{method: "POST", path: "/portal/api/login", body: map[string]string{"login": "ghost", "password": portalPassword, "client": "web"}})
	wrong := e.do(portalReq{method: "POST", path: "/portal/api/login", body: map[string]string{"login": "a.smirnova", "password": "nope", "client": "web"}})
	if unknown.Code != http.StatusUnauthorized || wrong.Code != unknown.Code || wrong.Body.String() != unknown.Body.String() {
		t.Fatalf("unknown = %d %q, wrong = %d %q", unknown.Code, unknown.Body, wrong.Code, wrong.Body)
	}
}

func TestPortal_LoginRateLimited(t *testing.T) {
	e := newPortalEnv(t, true)
	bad := portalReq{method: "POST", path: "/portal/api/login", body: map[string]string{"login": "a.smirnova", "password": "nope", "client": "web"}}
	for i := range 5 {
		if w := e.do(bad); w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d = %d, want 401", i+1, w.Code)
		}
	}
	w := e.do(portalReq{method: "POST", path: "/portal/api/login", body: map[string]string{"login": "a.smirnova", "password": portalPassword, "client": "web"}})
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("sixth attempt = %d, Retry-After %q; want 429 with Retry-After", w.Code, w.Header().Get("Retry-After"))
	}
}

func TestPortal_MustChangeGate(t *testing.T) {
	e := newPortalEnv(t, true)
	database.GetDB().Model(e.client).Update("portal_must_change", true)
	s := e.loginWeb(t, portalPassword)
	if w := e.do(s.req("GET", "/portal/api/me", nil)); w.Code != http.StatusForbidden || errorCode(w) != "must_change_password" {
		t.Fatalf("me with a temporary password = %d %s", w.Code, w.Body)
	}
	w := e.do(s.req("POST", "/portal/api/password", map[string]string{"current": portalPassword, "new": "long-enough-1"}))
	if w.Code != http.StatusNoContent {
		t.Fatalf("password change = %d %s", w.Code, w.Body)
	}
	s.cookies = mergeCookies(s.cookies, w.Result().Cookies())
	if w := e.do(s.req("GET", "/portal/api/me", nil)); w.Code != http.StatusOK {
		t.Fatalf("me after the change = %d %s", w.Code, w.Body)
	}
}

func TestPortal_PasswordChangeKillsOldSession(t *testing.T) {
	e := newPortalEnv(t, true)
	first := e.loginWeb(t, portalPassword)
	second := e.loginWeb(t, portalPassword)
	w := e.do(first.req("POST", "/portal/api/password", map[string]string{"current": portalPassword, "new": "long-enough-1"}))
	if w.Code != http.StatusNoContent {
		t.Fatalf("password change = %d %s", w.Code, w.Body)
	}
	first.cookies = mergeCookies(first.cookies, w.Result().Cookies())
	if w := e.do(second.req("GET", "/portal/api/me", nil)); w.Code != http.StatusUnauthorized {
		t.Fatalf("other session after a password change = %d, want 401", w.Code)
	}
	if w := e.do(first.req("GET", "/portal/api/me", nil)); w.Code != http.StatusOK {
		t.Fatalf("the session that changed the password = %d, want 200", w.Code)
	}
}

// mergeCookies applies Set-Cookie headers like a browser jar: by name, the last one wins.
func mergeCookies(old, fresh []*http.Cookie) []*http.Cookie {
	byName := map[string]*http.Cookie{}
	var order []string
	for _, c := range append(append([]*http.Cookie{}, old...), fresh...) {
		if _, seen := byName[c.Name]; !seen {
			order = append(order, c.Name)
		}
		byName[c.Name] = c
	}
	out := make([]*http.Cookie, 0, len(order))
	for _, name := range order {
		if c := byName[name]; c.MaxAge >= 0 {
			out = append(out, c)
		}
	}
	return out
}

func TestPortal_HiddenRules(t *testing.T) {
	e := newPortalEnv(t, true)
	s := e.loginWeb(t, portalPassword)
	all := []portal.Key{{InboundID: e.vless.Id, HostID: e.h1.Id}, {InboundID: e.vless.Id, HostID: e.h2.Id}, {InboundID: e.trojan.Id}}
	h1 := []portal.Key{{InboundID: e.vless.Id, HostID: e.h1.Id}}
	cases := []struct {
		name string
		req  portalReq
		want int
	}{
		{name: "hide all", req: s.req("PUT", "/portal/api/hidden", map[string]any{"keys": all}), want: http.StatusBadRequest},
		{name: "foreign key", req: s.req("PUT", "/portal/api/hidden", map[string]any{"keys": []portal.Key{{InboundID: 9999}}}), want: http.StatusBadRequest},
		{name: "no csrf", req: portalReq{method: "PUT", path: "/portal/api/hidden", body: map[string]any{"keys": h1}, cookies: s.cookies}, want: http.StatusForbidden},
		{name: "ok", req: s.req("PUT", "/portal/api/hidden", map[string]any{"keys": h1}), want: http.StatusNoContent},
	}
	for _, tc := range cases {
		if w := e.do(tc.req); w.Code != tc.want {
			t.Fatalf("%s = %d %s, want %d", tc.name, w.Code, w.Body, tc.want)
		}
	}
	token := e.loginApp(t)
	w := e.do(portalReq{method: "GET", path: "/portal/api/sub?format=clash", header: bearer(token)})
	if w.Code != http.StatusOK || strings.Contains(w.Body.String(), "h1.cdn.com") || !strings.Contains(w.Body.String(), "h2.cdn.com") {
		t.Fatalf("token subscription after hiding h1 = %d:\n%s", w.Code, w.Body)
	}
}

func TestPortal_DisabledClientReadOnly(t *testing.T) {
	e := newPortalEnv(t, true)
	database.GetDB().Model(e.client).Update("enable", false)
	s := e.loginWeb(t, portalPassword)
	if w := e.do(s.req("GET", "/portal/api/me", nil)); w.Code != http.StatusOK {
		t.Fatalf("me = %d", w.Code)
	}
	w := e.do(s.req("PUT", "/portal/api/hidden", map[string]any{"keys": []portal.Key{{InboundID: e.trojan.Id}}}))
	if w.Code != http.StatusForbidden || errorCode(w) != "client_disabled" {
		t.Fatalf("hide while disabled = %d %s", w.Code, w.Body)
	}
	if w := e.do(s.req("POST", "/portal/api/password", map[string]string{"current": portalPassword, "new": "long-enough-1"})); w.Code != http.StatusNoContent {
		t.Fatalf("password change while disabled = %d %s", w.Code, w.Body)
	}
}

func TestPortal_AppTokenSub(t *testing.T) {
	for _, tc := range []struct{ format, direct string }{{"raw", "/sub/s1"}, {"json", "/json/s1"}, {"clash", "/clash/s1"}} {
		t.Run(tc.format, func(t *testing.T) {
			e := newPortalEnv(t, true)
			token := e.loginApp(t)
			viaToken := e.do(portalReq{method: "GET", path: "/portal/api/sub?format=" + tc.format, header: bearer(token)})
			direct := e.do(portalReq{method: "GET", path: tc.direct})
			if viaToken.Code != http.StatusOK || viaToken.Body.String() != direct.Body.String() {
				t.Fatalf("token %s = %d, body differs from %s:\n%s\n---\n%s", tc.format, viaToken.Code, tc.direct, viaToken.Body, direct.Body)
			}
			if got, want := viaToken.Header().Get("Subscription-Userinfo"), direct.Header().Get("Subscription-Userinfo"); got != want || got == "" {
				t.Fatalf("Subscription-Userinfo = %q, want %q", got, want)
			}
		})
	}
}

func TestPortal_BadAuthorization(t *testing.T) {
	e := newPortalEnv(t, true)
	for name, header := range map[string]map[string]string{
		"missing":      nil,
		"basic scheme": {"Authorization": "Basic YTpi"},
		"empty bearer": {"Authorization": "Bearer "},
		"wrong token":  {"Authorization": "Bearer not-a-real-token"},
	} {
		if w := e.do(portalReq{method: "GET", path: "/portal/api/sub", header: header}); w.Code != http.StatusUnauthorized {
			t.Fatalf("%s: code = %d, want 401", name, w.Code)
		}
	}
}

func TestPortal_RevokeDevice(t *testing.T) {
	e := newPortalEnv(t, true)
	token := e.loginApp(t)
	devices, _ := e.svc.ListDevices(e.client.Id)
	s := e.loginWeb(t, portalPassword)
	if w := e.do(s.req("DELETE", fmt.Sprintf("/portal/api/devices/%d", devices[0].ID), nil)); w.Code != http.StatusNoContent {
		t.Fatalf("revoke = %d %s", w.Code, w.Body)
	}
	if w := e.do(portalReq{method: "GET", path: "/portal/api/sub", header: bearer(token)}); w.Code != http.StatusUnauthorized {
		t.Fatalf("revoked token = %d, want 401", w.Code)
	}
}

func TestPortal_Logout(t *testing.T) {
	t.Run("web session", func(t *testing.T) {
		e := newPortalEnv(t, true)
		s := e.loginWeb(t, portalPassword)
		w := e.do(s.req("POST", "/portal/api/logout", nil))
		if w.Code != http.StatusNoContent {
			t.Fatalf("logout = %d %s", w.Code, w.Body)
		}
		s.cookies = mergeCookies(s.cookies, w.Result().Cookies())
		if w := e.do(s.req("GET", "/portal/api/me", nil)); w.Code != http.StatusUnauthorized {
			t.Fatalf("me after logout = %d, want 401", w.Code)
		}
	})
	t.Run("app token", func(t *testing.T) {
		e := newPortalEnv(t, true)
		token := e.loginApp(t)
		if w := e.do(portalReq{method: "POST", path: "/portal/api/logout", header: bearer(token)}); w.Code != http.StatusNoContent {
			t.Fatalf("logout = %d %s", w.Code, w.Body)
		}
		if w := e.do(portalReq{method: "GET", path: "/portal/api/sub", header: bearer(token)}); w.Code != http.StatusUnauthorized {
			t.Fatalf("token after logout = %d, want 401", w.Code)
		}
	})
}
