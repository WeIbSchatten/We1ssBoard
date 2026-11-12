package portal

import (
	"crypto/rand"
	"math/big"

	"gorm.io/gorm"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/crypto"
)

// temporaryPasswordAlphabet leaves out 0/O, 1/l/I so a password read aloud or retyped survives.
const temporaryPasswordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

const temporaryPasswordLength = 12

// AccessStatus is how a client can log into the portal right now.
type AccessStatus string

const (
	AccessNone      AccessStatus = "none"
	AccessTemporary AccessStatus = "temporary"
	AccessOwn       AccessStatus = "own"
	AccessLDAP      AccessStatus = "ldap"
)

type Access struct {
	Status     AccessStatus
	HiddenKeys int
	Devices    int
}

func newTemporaryPassword() (string, error) {
	out := make([]byte, temporaryPasswordLength)
	limit := big.NewInt(int64(len(temporaryPasswordAlphabet)))
	for i := range out {
		n, err := rand.Int(rand.Reader, limit)
		if err != nil {
			return "", err
		}
		out[i] = temporaryPasswordAlphabet[n.Int64()]
	}
	return string(out), nil
}

// IssueTemporaryPassword replaces the client's portal password with a one-time one the
// client must change, and logs out every device and web session.
func (s *Service) IssueTemporaryPassword(clientID int) (string, error) {
	password, err := newTemporaryPassword()
	if err != nil {
		return "", err
	}
	hash, err := crypto.HashPasswordAsBcrypt(password)
	if err != nil {
		return "", err
	}
	if err := s.resetAccess(clientID, hash, true); err != nil {
		return "", err
	}
	return password, nil
}

// RevokeAccess removes the client's own password and logs out everything; an LDAP client
// can still log in with the directory password.
func (s *Service) RevokeAccess(clientID int) error {
	return s.resetAccess(clientID, "", false)
}

func (s *Service) resetAccess(clientID int, hash string, mustChange bool) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&model.ClientRecord{}).Where("id = ?", clientID).Updates(map[string]any{
			"portal_password_hash": hash,
			"portal_must_change":   mustChange,
			"portal_session_epoch": gorm.Expr("portal_session_epoch + 1"),
		})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return tx.Where("client_id = ?", clientID).Delete(&model.ClientPortalToken{}).Error
	})
}

// AccessOf summarises the client's portal access for the admin client card.
func (s *Service) AccessOf(clientID int) (Access, error) {
	var rec model.ClientRecord
	if err := database.GetDB().First(&rec, clientID).Error; err != nil {
		return Access{}, err
	}
	var access Access
	switch {
	case rec.PortalPasswordHash != "" && rec.PortalMustChange:
		access.Status = AccessTemporary
	case rec.PortalPasswordHash != "":
		access.Status = AccessOwn
	default:
		_, ldapOn, err := s.Settings.GetLdapConfig()
		if err != nil {
			return Access{}, err
		}
		access.Status = AccessNone
		if ldapOn {
			access.Status = AccessLDAP
		}
	}
	keys, err := s.ClientKeys(clientID)
	if err != nil {
		return Access{}, err
	}
	for _, k := range keys {
		if k.Hidden {
			access.HiddenKeys++
		}
	}
	devices, err := s.ListDevices(clientID)
	if err != nil {
		return Access{}, err
	}
	access.Devices = len(devices)
	return access, nil
}

// ClientByEmail finds a client by its exact email, as the panel addresses clients.
func (s *Service) ClientByEmail(email string) (*model.ClientRecord, error) {
	var rec model.ClientRecord
	if err := database.GetDB().Where("email = ?", email).First(&rec).Error; err != nil {
		return nil, err
	}
	return &rec, nil
}
