package portal

import (
	"errors"
	"strings"

	"gorm.io/gorm"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
)

var (
	ErrForeignKey     = errors.New("the key is not in the client's subscription")
	ErrNothingVisible = errors.New("at least one key must stay in the subscription")
)

// Key is one subscription key: an inbound and one of its hosts, or HostID 0 for a host-less inbound.
type Key struct {
	InboundID int `json:"inboundId"`
	HostID    int `json:"hostId"`
}

type KeyInfo struct {
	Key
	Remark   string `json:"remark"`
	Protocol string `json:"protocol"`
	Hidden   bool   `json:"hidden"`
}

// HiddenSet holds the live hidden keys of every client of one subscription, by lower-cased email.
type HiddenSet map[string]map[Key]struct{}

func (h HiddenSet) Has(email string, k Key) bool {
	_, ok := h[strings.ToLower(email)][k]
	return ok
}

// ClientKeys lists the keys the client's subscription carries, in subscription order.
func (s *Service) ClientKeys(clientID int) ([]KeyInfo, error) {
	db := database.GetDB()
	var inbounds []model.Inbound
	err := db.Joins("JOIN client_inbounds ci ON ci.inbound_id = inbounds.id").
		Where("ci.client_id = ? AND inbounds.enable = ? AND inbounds.exclude_from_sub = ?", clientID, true, false).
		Order("inbounds.sub_sort_index asc, inbounds.id asc").
		Find(&inbounds).Error
	if err != nil {
		return nil, err
	}
	hidden, err := s.liveHidden(db.Where("h.client_id = ?", clientID))
	if err != nil {
		return nil, err
	}
	var out []KeyInfo
	for _, ib := range inbounds {
		var hosts []model.Host
		if err := db.Where("inbound_id = ? AND is_disabled = ?", ib.Id, false).
			Order("sort_order asc, id asc").Find(&hosts).Error; err != nil {
			return nil, err
		}
		if len(hosts) == 0 {
			out = append(out, keyInfo(Key{ib.Id, 0}, ib.Remark, ib, hidden))
			continue
		}
		for _, h := range hosts {
			out = append(out, keyInfo(Key{ib.Id, h.Id}, h.Remark, ib, hidden))
		}
	}
	return out, nil
}

func keyInfo(k Key, remark string, ib model.Inbound, hidden []hiddenRow) KeyInfo {
	info := KeyInfo{Key: k, Remark: remark, Protocol: string(ib.Protocol)}
	for _, r := range hidden {
		if r.InboundId == k.InboundID && r.HostId == k.HostID {
			info.Hidden = true
		}
	}
	return info
}

// ReplaceHidden makes keys the client's complete hidden set.
func (s *Service) ReplaceHidden(clientID int, keys []Key) error {
	all, err := s.ClientKeys(clientID)
	if err != nil {
		return err
	}
	own := make(map[Key]struct{}, len(all))
	for _, k := range all {
		own[k.Key] = struct{}{}
	}
	want := make(map[Key]struct{}, len(keys))
	for _, k := range keys {
		if _, ok := own[k]; !ok {
			return ErrForeignKey
		}
		want[k] = struct{}{}
	}
	if len(want) >= len(own) {
		return ErrNothingVisible
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("client_id = ?", clientID).Delete(&model.ClientSubHidden{}).Error; err != nil {
			return err
		}
		for k := range want {
			row := &model.ClientSubHidden{ClientId: clientID, InboundId: k.InboundID, HostId: k.HostID}
			if err := tx.Create(row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// HiddenBySubID loads the live hidden keys of every client sharing the subscription.
func (s *Service) HiddenBySubID(subID string) (HiddenSet, error) {
	rows, err := s.liveHidden(database.GetDB().Where("c.sub_id = ?", subID))
	if err != nil {
		return nil, err
	}
	set := HiddenSet{}
	for _, r := range rows {
		email := strings.ToLower(r.Email)
		if set[email] == nil {
			set[email] = map[Key]struct{}{}
		}
		set[email][Key{r.InboundId, r.HostId}] = struct{}{}
	}
	return set, nil
}

type hiddenRow struct {
	Email     string
	InboundId int
	HostId    int
}

// liveHidden skips rows older than the client's current attachment or host, which a
// delete-and-recreate leaves behind; no delete site has to clean them up.
func (s *Service) liveHidden(scope *gorm.DB) ([]hiddenRow, error) {
	var rows []hiddenRow
	err := scope.Table("client_sub_hidden h").
		Select("c.email AS email, h.inbound_id AS inbound_id, h.host_id AS host_id").
		Joins("JOIN clients c ON c.id = h.client_id").
		Joins("JOIN client_inbounds ci ON ci.client_id = h.client_id AND ci.inbound_id = h.inbound_id AND ci.created_at <= h.created_at").
		Joins("LEFT JOIN hosts ho ON ho.id = h.host_id AND ho.inbound_id = h.inbound_id").
		Where("h.host_id = 0 OR (ho.id IS NOT NULL AND ho.created_at <= h.created_at)").
		Scan(&rows).Error
	return rows, err
}
