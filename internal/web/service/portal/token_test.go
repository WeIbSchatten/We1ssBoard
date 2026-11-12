package portal

import (
	"errors"
	"strings"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/crypto"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
)

func TestClientByToken_ResolvesAndTouches(t *testing.T) {
	initPortalDB(t)
	rec := addClient(t, "a.smirnova", "correct-horse")
	svc := New(&service.SettingService{})

	token, err := svc.IssueToken(rec.Id, "Pixel 8")
	if err != nil {
		t.Fatal(err)
	}
	got, tokenID, err := svc.ClientByToken(token)
	if err != nil {
		t.Fatalf("ClientByToken: %v", err)
	}
	if got.Email != "a.smirnova" || tokenID == 0 {
		t.Fatalf("got (%q, %d)", got.Email, tokenID)
	}
	var row model.ClientPortalToken
	database.GetDB().First(&row, tokenID)
	if row.TokenHash != crypto.HashTokenSHA256(token) || row.LastUsedAt == 0 || row.DeviceName != "Pixel 8" {
		t.Fatalf("stored row = %+v", row)
	}
	if strings.Contains(row.TokenHash, token) {
		t.Fatal("the raw token is stored")
	}
}

func TestClientByToken_Unknown(t *testing.T) {
	initPortalDB(t)
	svc := New(&service.SettingService{})
	if _, _, err := svc.ClientByToken("no-such-token"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("err = %v, want ErrInvalidToken", err)
	}
}

func TestClientByToken_RejectsReusedClientID(t *testing.T) {
	initPortalDB(t)
	rec := addClient(t, "old.client", "correct-horse")
	svc := New(&service.SettingService{})
	token, err := svc.IssueToken(rec.Id, "phone")
	if err != nil {
		t.Fatal(err)
	}
	if err := database.GetDB().Delete(&model.ClientRecord{}, rec.Id).Error; err != nil {
		t.Fatal(err)
	}
	var tok model.ClientPortalToken
	database.GetDB().Where("client_id = ?", rec.Id).First(&tok)
	reused := &model.ClientRecord{Id: rec.Id, Email: "new.client", Enable: true, CreatedAt: tok.CreatedAt + 1}
	if err := database.GetDB().Create(reused).Error; err != nil {
		t.Fatal(err)
	}

	if _, _, err := svc.ClientByToken(token); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("err = %v, want ErrInvalidToken for a token issued to a deleted client", err)
	}
}

func TestRevokeDevice_OtherClient(t *testing.T) {
	initPortalDB(t)
	owner := addClient(t, "owner", "correct-horse")
	other := addClient(t, "other", "correct-horse")
	svc := New(&service.SettingService{})
	token, _ := svc.IssueToken(owner.Id, "laptop")
	_, tokenID, _ := svc.ClientByToken(token)

	if err := svc.RevokeDevice(other.Id, tokenID); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("err = %v, want ErrInvalidToken", err)
	}
	if _, _, err := svc.ClientByToken(token); err != nil {
		t.Fatalf("token was revoked by another client: %v", err)
	}
	devices, err := svc.ListDevices(owner.Id)
	if err != nil || len(devices) != 1 || devices[0].Name != "laptop" {
		t.Fatalf("devices = %+v, err = %v", devices, err)
	}
}
