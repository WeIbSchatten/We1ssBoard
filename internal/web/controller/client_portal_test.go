package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/dbtest"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/entity"
)

type portalMsg[T any] struct {
	Success bool `json:"success"`
	Obj     T    `json:"obj"`
}

func callPortal[T any](t *testing.T, router *gin.Engine, method, path string) portalMsg[T] {
	t.Helper()
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(method, path, nil))
	var msg portalMsg[T]
	if err := json.Unmarshal(w.Body.Bytes(), &msg); err != nil {
		t.Fatalf("%s %s: %v\n%s", method, path, err, w.Body)
	}
	return msg
}

func TestClientPortalEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dbtest.InitDB(t, filepath.Join(t.TempDir(), "we1ssboard.db"))
	db := database.GetDB()
	if err := db.Create(&model.ClientRecord{Email: "alice", SubID: "s1", Enable: true, TgID: 42}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Setting{Key: "portalEnabled", Value: "true"}).Error; err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	NewClientController(router.Group("/panel/api/clients"))

	status := callPortal[entity.ClientPortalAccess](t, router, http.MethodGet, "/panel/api/clients/portal/alice")
	if !status.Success || status.Obj.Status != "none" || !status.Obj.PortalEnabled || status.Obj.PortalURL != "http://example.com:2096/portal" {
		t.Fatalf("status before access = %+v", status)
	}

	if err := db.Create(&model.Setting{Key: "subURI", Value: "https://vpn.example.com/sub/"}).Error; err != nil {
		t.Fatal(err)
	}
	if got := callPortal[entity.ClientPortalAccess](t, router, http.MethodGet, "/panel/api/clients/portal/alice"); got.Obj.PortalURL != "https://vpn.example.com/portal" {
		t.Fatalf("portalUrl behind a configured subURI = %q, want https://vpn.example.com/portal", got.Obj.PortalURL)
	}

	issued := callPortal[entity.ClientPortalPassword](t, router, http.MethodPost, "/panel/api/clients/portalPassword/alice")
	if !issued.Success || len(issued.Obj.Password) != 12 || issued.Obj.SentToTelegram {
		t.Fatalf("issue = %+v; want a 12-character password and sentToTelegram=false while the bot is stopped", issued)
	}
	if got := callPortal[entity.ClientPortalAccess](t, router, http.MethodGet, "/panel/api/clients/portal/alice"); got.Obj.Status != "temporary" {
		t.Fatalf("status after issuing = %q, want temporary", got.Obj.Status)
	}

	if revoked := callPortal[any](t, router, http.MethodPost, "/panel/api/clients/portalRevoke/alice"); !revoked.Success {
		t.Fatalf("revoke failed: %+v", revoked)
	}
	if got := callPortal[entity.ClientPortalAccess](t, router, http.MethodGet, "/panel/api/clients/portal/alice"); got.Obj.Status != "none" {
		t.Fatalf("status after revoke = %q, want none", got.Obj.Status)
	}

	for _, path := range []string{"/panel/api/clients/portal/ghost", "/panel/api/clients/portalPassword/ghost", "/panel/api/clients/portalRevoke/ghost"} {
		method := http.MethodPost
		if path == "/panel/api/clients/portal/ghost" {
			method = http.MethodGet
		}
		if got := callPortal[any](t, router, method, path); got.Success {
			t.Fatalf("%s for an unknown client succeeded", path)
		}
	}
}
