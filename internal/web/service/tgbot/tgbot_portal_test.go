package tgbot

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/dbtest"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/crypto"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/locale"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/portal"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/xray"

	"github.com/nicksnyder/go-i18n/v2/i18n"
	"golang.org/x/text/language"
)

// textCaptureServer answers the Bot API and keeps every sendMessage text.
func textCaptureServer(t *testing.T) (*httptest.Server, func() []string) {
	t.Helper()
	var mu sync.Mutex
	var texts []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/sendMessage") {
			var body struct {
				Text string `json:"text"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			mu.Lock()
			texts = append(texts, body.Text)
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": map[string]any{
				"message_id": 1, "date": 0, "chat": map[string]any{"id": ownerTgID, "type": "private"},
			}})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": true})
	}))
	t.Cleanup(srv.Close)
	return srv, func() []string {
		mu.Lock()
		defer mu.Unlock()
		return append([]string(nil), texts...)
	}
}

type portalBotEnv struct {
	tb    *Tgbot
	texts func() []string
}

// newPortalBot seeds the owner's client (bound to ownerTgID) and a foreign client.
func newPortalBot(t *testing.T, portalOn, ldapOn bool, ownerPassword string) portalBotEnv {
	t.Helper()
	srv, texts := textCaptureServer(t)
	swapTestBot(t, srv.URL)
	dbtest.InitDB(t, filepath.Join(t.TempDir(), "we1ssboard.db"))
	db := database.GetDB()
	inbound := &model.Inbound{
		UserId: 1, Remark: "in", Port: 443, Protocol: model.VLESS, Enable: true,
		Settings: `{"clients":[{"email":"` + ownerMail + `","tgId":4242,"subId":"sub-owned"}]}`,
	}
	if err := db.Create(inbound).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&xray.ClientTraffic{InboundId: inbound.Id, Email: ownerMail, Enable: true}).Error; err != nil {
		t.Fatal(err)
	}
	owner := &model.ClientRecord{Email: ownerMail, SubID: "sub-owned", TgID: ownerTgID, Enable: true}
	if ownerPassword != "" {
		owner.PortalPasswordHash, _ = crypto.HashPasswordAsBcrypt(ownerPassword)
	}
	foreignHash, _ := crypto.HashPasswordAsBcrypt("foreign-pass-1")
	for _, rec := range []*model.ClientRecord{owner, {Email: "someone-else@x", SubID: "sub-other", Enable: true, PortalPasswordHash: foreignHash}} {
		if err := db.Create(rec).Error; err != nil {
			t.Fatal(err)
		}
	}
	for key, on := range map[string]bool{"portalEnabled": portalOn, "ldapEnable": ldapOn} {
		value := "false"
		if on {
			value = "true"
		}
		if err := db.Create(&model.Setting{Key: key, Value: value}).Error; err != nil {
			t.Fatal(err)
		}
	}
	origRunning := isRunning
	t.Cleanup(func() { isRunning = origRunning })
	isRunning = true
	portalLocalizer(t)
	return portalBotEnv{tb: &Tgbot{}, texts: texts}
}

// portalLocalizer carries the en-US templates the portal reset prints; without it I18n returns bare keys.
func portalLocalizer(t *testing.T) {
	t.Helper()
	bundle := i18n.NewBundle(language.MustParse("en-US"))
	_ = bundle.AddMessages(language.MustParse("en-US"),
		&i18n.Message{ID: "tgbot.messages.portalDisabled", Other: "The client portal is off. Ask your admin to turn it on."},
		&i18n.Message{ID: "tgbot.messages.portalLdapManaged", Other: "Your portal password is managed by the company directory."},
		&i18n.Message{ID: "tgbot.messages.portalNoAccess", Other: "You have no portal access. Ask your admin to issue a password."},
		&i18n.Message{ID: "tgbot.messages.portalTempPassword", Other: "Password for {{ .Email }}: <code>{{ .Password }}</code>"},
	)
	orig := locale.LocalizerBot
	t.Cleanup(func() { locale.LocalizerBot = orig })
	locale.LocalizerBot = i18n.NewLocalizer(bundle, "en-US")
}

var codeRe = regexp.MustCompile(`<code>([^<]+)</code>`)

func TestResetPortalPassword(t *testing.T) {
	cases := []struct {
		name          string
		portalOn      bool
		ldapOn        bool
		ownerPassword string
		wantText      string
		wantPassword  bool
	}{
		{name: "portal off", ldapOn: false, ownerPassword: "own-pass-1", wantText: "The client portal is off"},
		{name: "directory-managed client", portalOn: true, ldapOn: true, wantText: "company directory"},
		{name: "revoked or never granted", portalOn: true, wantText: "Ask your admin"},
		{name: "own client", portalOn: true, ownerPassword: "own-pass-1", wantPassword: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := newPortalBot(t, tc.portalOn, tc.ldapOn, tc.ownerPassword)
			tapClientLinks(t, env.tb, ownerTgID, "client_portal_password_c "+ownerMail)
			texts := env.texts()
			if len(texts) != 1 {
				t.Fatalf("sent %d messages, want 1: %q", len(texts), texts)
			}
			svc := portal.New(&service.SettingService{})
			if !tc.wantPassword {
				if !strings.Contains(texts[0], tc.wantText) {
					t.Fatalf("message %q does not contain %q", texts[0], tc.wantText)
				}
				if tc.ownerPassword != "" {
					if _, _, err := svc.Authenticate(ownerMail, tc.ownerPassword); err != nil {
						t.Fatalf("the refused reset still changed the password: %v", err)
					}
				}
				return
			}
			m := codeRe.FindStringSubmatch(texts[0])
			if m == nil {
				t.Fatalf("no password in %q", texts[0])
			}
			rec, _, err := svc.Authenticate(ownerMail, m[1])
			if err != nil || !rec.PortalMustChange {
				t.Fatalf("sent password does not log in as a temporary one: err=%v", err)
			}
		})
	}
}

func TestPortalResetCallback_ForeignEmail(t *testing.T) {
	env := newPortalBot(t, true, false, "own-pass-1")
	tapClientLinks(t, env.tb, ownerTgID, "client_portal_password_c someone-else@x")

	if texts := env.texts(); len(texts) != 0 {
		t.Fatalf("a non-admin reset a foreign client's password: %q", texts)
	}
	svc := portal.New(&service.SettingService{})
	if _, _, err := svc.Authenticate("someone-else@x", "foreign-pass-1"); err != nil {
		t.Fatalf("the foreign client's password no longer works: %v", err)
	}
}
