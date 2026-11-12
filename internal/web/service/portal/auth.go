// Package portal owns the client self-service portal: login, device tokens and
// the keys a client hides from its own subscription. It knows nothing about HTTP.
package portal

import (
	"errors"
	"sync"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/logger"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/crypto"
	ldaputil "github.com/WeIbSchatten/We1ssBoard/v3/internal/util/ldap"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
)

// Method tells how a client proved its identity.
type Method int

const (
	MethodLocal Method = iota + 1
	MethodLDAP
)

// ErrInvalidCredentials is the single answer for an unknown login and a wrong password.
var ErrInvalidCredentials = errors.New("invalid login or password")

type Service struct {
	Settings *service.SettingService
	LdapAuth func(cfg ldaputil.Config, username, password string) (bool, error)
}

func New(settings *service.SettingService) *Service {
	return &Service{Settings: settings, LdapAuth: ldaputil.AuthenticateUser}
}

var dummyHash = sync.OnceValue(func() string {
	hash, _ := crypto.HashPasswordAsBcrypt("portal-timing-equalizer")
	return hash
})

// burnPasswordCheck spends a bcrypt comparison so a failed lookup costs what a wrong password does.
func burnPasswordCheck(password string) {
	crypto.CheckPasswordHash(dummyHash(), password)
}

// Authenticate checks the client's own portal password, or the directory when the client has none.
func (s *Service) Authenticate(login, password string) (*model.ClientRecord, Method, error) {
	var recs []model.ClientRecord
	if err := database.GetDB().Where("LOWER(email) = LOWER(?)", login).Limit(2).Find(&recs).Error; err != nil {
		return nil, 0, err
	}
	if len(recs) != 1 {
		burnPasswordCheck(password)
		return nil, 0, ErrInvalidCredentials
	}
	rec := &recs[0]
	if rec.PortalPasswordHash != "" {
		if !crypto.CheckPasswordHash(rec.PortalPasswordHash, password) {
			return nil, 0, ErrInvalidCredentials
		}
		return rec, MethodLocal, nil
	}
	cfg, enabled, err := s.Settings.GetLdapConfig()
	if err != nil || !enabled {
		burnPasswordCheck(password)
		return nil, 0, ErrInvalidCredentials
	}
	ok, err := s.LdapAuth(cfg, rec.Email, password)
	if err != nil {
		logger.Warning("portal: LDAP check failed:", err)
		return nil, 0, ErrInvalidCredentials
	}
	if !ok {
		return nil, 0, ErrInvalidCredentials
	}
	return rec, MethodLDAP, nil
}
