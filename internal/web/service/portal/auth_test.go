package portal

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/dbtest"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/crypto"
	ldaputil "github.com/WeIbSchatten/We1ssBoard/v3/internal/util/ldap"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
)

func initPortalDB(t *testing.T) {
	t.Helper()
	dbtest.InitDB(t, filepath.Join(t.TempDir(), "we1ssboard.db"))
}

func addClient(t *testing.T, email, password string) *model.ClientRecord {
	t.Helper()
	rec := &model.ClientRecord{Email: email, SubID: "sub-" + email, Enable: true}
	if password != "" {
		hash, err := crypto.HashPasswordAsBcrypt(password)
		if err != nil {
			t.Fatal(err)
		}
		rec.PortalPasswordHash = hash
	}
	if err := database.GetDB().Create(rec).Error; err != nil {
		t.Fatal(err)
	}
	return rec
}

func setSetting(t *testing.T, key, value string) {
	t.Helper()
	if err := database.GetDB().Create(&model.Setting{Key: key, Value: value}).Error; err != nil {
		t.Fatal(err)
	}
}

// An unknown login must cost a bcrypt check too, or response time tells which emails exist.
func TestAuthenticate_UnknownLoginTakesPasswordCheckTime(t *testing.T) {
	initPortalDB(t)
	addClient(t, "a.smirnova", "correct-horse")
	svc := New(&service.SettingService{})
	timeOf := func(login string) time.Duration {
		start := time.Now()
		_, _, _ = svc.Authenticate(login, "wrong-password")
		return time.Since(start)
	}
	timeOf("a.smirnova")
	wrong, unknown := timeOf("a.smirnova"), timeOf("ghost")
	if unknown < wrong/4 {
		t.Fatalf("unknown login took %v, wrong password %v: the timing reveals existing logins", unknown, wrong)
	}
}

func TestAuthenticate(t *testing.T) {
	dirAuth := func(_ ldaputil.Config, user, pass string) (bool, error) {
		return user == "dir.user" && pass == "dir-pass", nil
	}
	cases := []struct {
		name       string
		ldapOn     bool
		ldapAuth   func(ldaputil.Config, string, string) (bool, error)
		login      string
		password   string
		wantEmail  string
		wantMethod Method
		wantErr    error
	}{
		{name: "own password", login: "a.smirnova", password: "correct-horse", wantEmail: "a.smirnova", wantMethod: MethodLocal},
		{name: "wrong password", login: "a.smirnova", password: "nope", wantErr: ErrInvalidCredentials},
		{name: "unknown login", login: "ghost", password: "correct-horse", wantErr: ErrInvalidCredentials},
		{name: "login in other case", login: "A.Smirnova", password: "correct-horse", wantEmail: "a.smirnova", wantMethod: MethodLocal},
		{name: "ambiguous case-insensitive login", login: "x@A", password: "pw-pw-pw-1", wantErr: ErrInvalidCredentials},
		{name: "no own password, ldap off", login: "dir.user", password: "dir-pass", wantErr: ErrInvalidCredentials},
		{name: "ldap accepts", ldapOn: true, ldapAuth: dirAuth, login: "dir.user", password: "dir-pass", wantEmail: "dir.user", wantMethod: MethodLDAP},
		{name: "ldap rejects", ldapOn: true, ldapAuth: dirAuth, login: "dir.user", password: "bad", wantErr: ErrInvalidCredentials},
		{
			name: "ldap error", ldapOn: true, login: "dir.user", password: "dir-pass", wantErr: ErrInvalidCredentials,
			ldapAuth: func(ldaputil.Config, string, string) (bool, error) { return false, errors.New("dial tcp: refused") },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			initPortalDB(t)
			addClient(t, "a.smirnova", "correct-horse")
			addClient(t, "x@a", "pw-pw-pw-1")
			addClient(t, "X@a", "pw-pw-pw-1")
			addClient(t, "dir.user", "")
			if tc.ldapOn {
				setSetting(t, "ldapEnable", "true")
			}
			svc := New(&service.SettingService{})
			if tc.ldapAuth != nil {
				svc.LdapAuth = tc.ldapAuth
			}

			rec, method, err := svc.Authenticate(tc.login, tc.password)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if tc.wantErr != nil {
				return
			}
			if rec.Email != tc.wantEmail || method != tc.wantMethod {
				t.Fatalf("got (%q, %v), want (%q, %v)", rec.Email, method, tc.wantEmail, tc.wantMethod)
			}
		})
	}
}
