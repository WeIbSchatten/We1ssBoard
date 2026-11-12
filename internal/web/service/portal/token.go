package portal

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/crypto"
)

var ErrInvalidToken = errors.New("invalid portal token")

// Device is a We1ssConnect login as the client sees it in the portal.
type Device struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt int64  `json:"lastUsedAt"`
}

// IssueToken creates a device login and returns the raw token; only its hash is stored.
func (s *Service) IssueToken(clientID int, device string) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(buf)
	row := &model.ClientPortalToken{ClientId: clientID, TokenHash: crypto.HashTokenSHA256(token), DeviceName: device}
	if err := database.GetDB().Create(row).Error; err != nil {
		return "", err
	}
	return token, nil
}

// ClientByToken resolves a device token to its client and records the use.
func (s *Service) ClientByToken(token string) (*model.ClientRecord, int, error) {
	if token == "" {
		return nil, 0, ErrInvalidToken
	}
	db := database.GetDB()
	var row model.ClientPortalToken
	if err := db.Where("token_hash = ?", crypto.HashTokenSHA256(token)).Limit(1).Find(&row).Error; err != nil {
		return nil, 0, err
	}
	if row.Id == 0 {
		return nil, 0, ErrInvalidToken
	}
	// A client created after the token reuses a deleted client's id; the token is not its.
	var rec model.ClientRecord
	if err := db.Where("id = ? AND created_at <= ?", row.ClientId, row.CreatedAt).Limit(1).Find(&rec).Error; err != nil {
		return nil, 0, err
	}
	if rec.Id == 0 {
		return nil, 0, ErrInvalidToken
	}
	if err := db.Model(&row).Update("last_used_at", time.Now().UnixMilli()).Error; err != nil {
		return nil, 0, err
	}
	return &rec, row.Id, nil
}

func (s *Service) ListDevices(clientID int) ([]Device, error) {
	var rows []model.ClientPortalToken
	if err := database.GetDB().Where("client_id = ?", clientID).Order("id asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]Device, 0, len(rows))
	for _, r := range rows {
		out = append(out, Device{ID: r.Id, Name: r.DeviceName, CreatedAt: r.CreatedAt, LastUsedAt: r.LastUsedAt})
	}
	return out, nil
}

// RevokeDevice deletes one of the client's own tokens.
func (s *Service) RevokeDevice(clientID, tokenID int) error {
	res := database.GetDB().Where("id = ? AND client_id = ?", tokenID, clientID).Delete(&model.ClientPortalToken{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrInvalidToken
	}
	return nil
}
