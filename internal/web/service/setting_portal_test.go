package service

import (
	"path/filepath"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/dbtest"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
)

func savePortalEnabled(t *testing.T, s *SettingService, on bool) {
	t.Helper()
	all, err := s.GetAllSetting()
	if err != nil {
		t.Fatal(err)
	}
	all.PortalEnabled = on
	if err := s.UpdateAllSetting(all, SecretClears{}); err != nil {
		t.Fatalf("UpdateAllSetting(portalEnabled=%v): %v", on, err)
	}
}

func portalState(t *testing.T, clientID int) (tokens int64, epoch int64) {
	t.Helper()
	db := database.GetDB()
	db.Model(&model.ClientPortalToken{}).Count(&tokens)
	var rec model.ClientRecord
	db.First(&rec, clientID)
	return tokens, rec.PortalSessionEpoch
}

func TestUpdateAllSetting_DisablingPortalRevokesAccess(t *testing.T) {
	seed := func(t *testing.T) (*SettingService, int) {
		dbtest.InitDB(t, filepath.Join(t.TempDir(), "we1ssboard.db"))
		rec := &model.ClientRecord{Email: "a.smirnova", SubID: "s1", Enable: true, PortalSessionEpoch: 3}
		db := database.GetDB()
		if err := db.Create(rec).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&model.ClientPortalToken{ClientId: rec.Id, TokenHash: "h1"}).Error; err != nil {
			t.Fatal(err)
		}
		return &SettingService{}, rec.Id
	}

	t.Run("on to off revokes, back on does not resurrect", func(t *testing.T) {
		s, id := seed(t)
		savePortalEnabled(t, s, true)
		savePortalEnabled(t, s, false)
		if tokens, epoch := portalState(t, id); tokens != 0 || epoch != 4 {
			t.Fatalf("after disabling: tokens=%d epoch=%d, want 0 and 4", tokens, epoch)
		}
		savePortalEnabled(t, s, true)
		if tokens, epoch := portalState(t, id); tokens != 0 || epoch != 4 {
			t.Fatalf("after re-enabling: tokens=%d epoch=%d, want 0 and 4", tokens, epoch)
		}
	})
	t.Run("off stays off without touching sessions", func(t *testing.T) {
		s, id := seed(t)
		savePortalEnabled(t, s, false)
		if tokens, epoch := portalState(t, id); tokens != 1 || epoch != 3 {
			t.Fatalf("saving with the portal already off: tokens=%d epoch=%d, want 1 and 3", tokens, epoch)
		}
	})
}
