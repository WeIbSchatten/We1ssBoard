package portal

import (
	"errors"
	"strings"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	ldaputil "github.com/WeIbSchatten/We1ssBoard/v3/internal/util/ldap"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
)

func TestIssueTemporaryPassword(t *testing.T) {
	initPortalDB(t)
	rec := addClient(t, "a.smirnova", "correct-horse")
	svc := New(&service.SettingService{})
	oldToken, _ := svc.IssueToken(rec.Id, "phone")

	first, err := svc.IssueTemporaryPassword(rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 12 || strings.Trim(first, temporaryPasswordAlphabet) != "" {
		t.Fatalf("temporary password %q: want 12 characters from the unambiguous alphabet", first)
	}
	got, _, err := svc.Authenticate("a.smirnova", first)
	if err != nil || !got.PortalMustChange {
		t.Fatalf("login with the temporary password: err=%v mustChange=%v", err, got != nil && got.PortalMustChange)
	}
	if _, _, err := svc.ClientByToken(oldToken); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("device token survived a password reset: %v", err)
	}
	second, err := svc.IssueTemporaryPassword(rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Authenticate("a.smirnova", second); err != nil {
		t.Fatalf("the re-issued password does not work: %v", err)
	}
	if _, _, err := svc.Authenticate("a.smirnova", first); first != second && !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("the previous temporary password still works: %v", err)
	}
}

func TestIssueTemporaryPassword_LDAPClient(t *testing.T) {
	initPortalDB(t)
	rec := addClient(t, "dir.user", "")
	setSetting(t, "ldapEnable", "true")
	svc := New(&service.SettingService{})
	svc.LdapAuth = func(_ ldaputil.Config, user, pass string) (bool, error) {
		return user == "dir.user" && pass == "dir-pass", nil
	}

	temp, err := svc.IssueTemporaryPassword(rec.Id)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Authenticate("dir.user", "dir-pass"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("directory password still works after an admin-issued password: %v", err)
	}
	if _, method, err := svc.Authenticate("dir.user", temp); err != nil || method != MethodLocal {
		t.Fatalf("temporary password: method=%v err=%v", method, err)
	}
}

func TestRevokeAccess(t *testing.T) {
	initPortalDB(t)
	rec := addClient(t, "a.smirnova", "correct-horse")
	svc := New(&service.SettingService{})
	token, _ := svc.IssueToken(rec.Id, "phone")

	if err := svc.RevokeAccess(rec.Id); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Authenticate("a.smirnova", "correct-horse"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("password works after revoke: %v", err)
	}
	if _, _, err := svc.ClientByToken(token); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("token works after revoke: %v", err)
	}
	var after model.ClientRecord
	database.GetDB().First(&after, rec.Id)
	if after.PortalSessionEpoch != rec.PortalSessionEpoch+1 || after.PortalMustChange {
		t.Fatalf("after revoke: epoch %d (was %d), mustChange %v", after.PortalSessionEpoch, rec.PortalSessionEpoch, after.PortalMustChange)
	}
}

func TestAccessOf(t *testing.T) {
	cases := []struct {
		name       string
		password   string
		mustChange bool
		ldapOn     bool
		want       AccessStatus
	}{
		{name: "no password, ldap off", want: AccessNone},
		{name: "no password, ldap on", ldapOn: true, want: AccessLDAP},
		{name: "temporary", password: "temp-pass-1", mustChange: true, want: AccessTemporary},
		{name: "own", password: "own-pass-1", want: AccessOwn},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newKeysFixture(t)
			if tc.password != "" {
				database.GetDB().Model(f.client).Update("portal_must_change", tc.mustChange)
			} else {
				database.GetDB().Model(f.client).Update("portal_password_hash", "")
			}
			if tc.ldapOn {
				setSetting(t, "ldapEnable", "true")
			}
			if err := f.svc.ReplaceHidden(f.client.Id, []Key{{f.a.Id, 0}}); err != nil {
				t.Fatal(err)
			}
			if _, err := f.svc.IssueToken(f.client.Id, "phone"); err != nil {
				t.Fatal(err)
			}
			got, err := f.svc.AccessOf(f.client.Id)
			if err != nil {
				t.Fatal(err)
			}
			if got != (Access{Status: tc.want, HiddenKeys: 1, Devices: 1}) {
				t.Fatalf("AccessOf = %+v, want status %q with 1 hidden key and 1 device", got, tc.want)
			}
		})
	}
}
