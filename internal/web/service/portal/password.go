package portal

import (
	"errors"

	"gorm.io/gorm"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/crypto"
)

const MinPasswordLength = 8

var (
	ErrWeakPassword = errors.New("password is too short")
	ErrLDAPManaged  = errors.New("password is managed by the company directory")
)

// ChangePassword sets the client's own password and logs out every device and older web session.
func (s *Service) ChangePassword(clientID int, current, next string) (int64, error) {
	if len(next) < MinPasswordLength {
		return 0, ErrWeakPassword
	}
	var rec model.ClientRecord
	if err := database.GetDB().First(&rec, clientID).Error; err != nil {
		return 0, err
	}
	if rec.PortalPasswordHash == "" {
		return 0, ErrLDAPManaged
	}
	if !crypto.CheckPasswordHash(rec.PortalPasswordHash, current) {
		return 0, ErrInvalidCredentials
	}
	hash, err := crypto.HashPasswordAsBcrypt(next)
	if err != nil {
		return 0, err
	}
	epoch := rec.PortalSessionEpoch + 1
	err = database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&rec).Updates(map[string]any{
			"portal_password_hash": hash,
			"portal_must_change":   false,
			"portal_session_epoch": epoch,
		}).Error; err != nil {
			return err
		}
		return tx.Where("client_id = ?", clientID).Delete(&model.ClientPortalToken{}).Error
	})
	if err != nil {
		return 0, err
	}
	return epoch, nil
}
