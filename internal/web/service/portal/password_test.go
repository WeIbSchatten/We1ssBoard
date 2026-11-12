package portal

import (
	"errors"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
)

func TestChangePassword(t *testing.T) {
	cases := []struct {
		name    string
		email   string
		current string
		next    string
		wantErr error
	}{
		{name: "too short", email: "local", current: "correct-horse", next: "1234567", wantErr: ErrWeakPassword},
		{name: "ldap managed", email: "dir.user", current: "whatever", next: "long-enough-1", wantErr: ErrLDAPManaged},
		{name: "wrong current", email: "local", current: "nope", next: "long-enough-1", wantErr: ErrInvalidCredentials},
		{name: "success", email: "local", current: "correct-horse", next: "long-enough-1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			initPortalDB(t)
			local := addClient(t, "local", "correct-horse")
			database.GetDB().Model(local).Updates(map[string]any{"portal_must_change": true, "portal_session_epoch": 4})
			dir := addClient(t, "dir.user", "")
			ids := map[string]int{"local": local.Id, "dir.user": dir.Id}
			svc := New(&service.SettingService{})
			oldToken, _ := svc.IssueToken(local.Id, "phone")

			epoch, err := svc.ChangePassword(ids[tc.email], tc.current, tc.next)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if tc.wantErr != nil {
				return
			}
			var rec model.ClientRecord
			database.GetDB().First(&rec, local.Id)
			if epoch != 5 || rec.PortalSessionEpoch != 5 || rec.PortalMustChange {
				t.Fatalf("epoch = %d, stored = %d, mustChange = %v", epoch, rec.PortalSessionEpoch, rec.PortalMustChange)
			}
			if _, _, err := svc.ClientByToken(oldToken); !errors.Is(err, ErrInvalidToken) {
				t.Fatalf("old token still works: %v", err)
			}
			if _, _, err := svc.Authenticate("local", "long-enough-1"); err != nil {
				t.Fatalf("new password rejected: %v", err)
			}
		})
	}
}
