package service

import (
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/logger"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/xray"
)

// ActiveConnection is one inbound an online client is using right now. Exact
// is true when the access log saw the client on it, false when inferred.
type ActiveConnection struct {
	InboundId int  `json:"inboundId" example:"1"`
	Exact     bool `json:"exact" example:"true"`
}

var localAccessLog accessLogTail

// RefreshLocalClientInbounds reads the access-log lines Xray appended since the
// last poll and folds which inbound each client came in through into the local set.
func (s *InboundService) RefreshLocalClientInbounds() {
	process := currentXrayProcess()
	if process == nil {
		return
	}
	path, err := xray.GetAccessLogPath()
	if err != nil {
		logger.Debug("access log path for active connections:", err)
	}
	process.RecordLocalClientInbounds(localAccessLog.read(path), time.Now().UnixMilli(), onlineGracePeriodMs)
}

// GetClientInboundsByGuid returns email -> inbound tags seen in the access logs,
// keyed by the GUID of the panel hosting each inbound: this panel plus every node below it.
func (s *InboundService) GetClientInboundsByGuid() map[string]map[string][]string {
	process := currentXrayProcess()
	if process == nil {
		return map[string]map[string][]string{}
	}
	out := process.GetMergedClientInboundTrees()
	if local := process.GetLocalClientInbounds(); len(local) > 0 {
		if guid := s.panelGuid(); guid != "" {
			if out[guid] == nil {
				out[guid] = map[string][]string{}
			}
			for email, tags := range local {
				out[guid][email] = mergeEmails(out[guid][email], tags)
			}
		}
	}
	return out
}

// GetActiveConnections returns, per online client email, the inbounds it is
// using now: access-log sightings first, else its attached inbounds that moved bytes.
func (s *InboundService) GetActiveConnections() (map[string][]ActiveConnection, error) {
	out := map[string][]ActiveConnection{}
	online := s.GetOnlineClients()
	if len(online) == 0 {
		return out, nil
	}
	db := database.GetDB()
	var inbounds []struct {
		Id  int
		Tag string
	}
	if err := db.Table("inbounds").Select("id, tag").Scan(&inbounds).Error; err != nil {
		return nil, err
	}
	idByTag := make(map[string]int, len(inbounds))
	for _, ib := range inbounds {
		idByTag[ib.Tag] = ib.Id
	}

	exact := map[string]map[int]struct{}{}
	for _, byEmail := range s.GetClientInboundsByGuid() {
		for email, tags := range byEmail {
			for _, tag := range tags {
				id, ok := idByTag[tag]
				if !ok {
					continue
				}
				if exact[email] == nil {
					exact[email] = map[int]struct{}{}
				}
				exact[email][id] = struct{}{}
			}
		}
	}
	active := map[int]struct{}{}
	for _, tags := range s.GetActiveInboundsByGuid() {
		for _, tag := range tags {
			if id, ok := idByTag[tag]; ok {
				active[id] = struct{}{}
			}
		}
	}

	attached := map[string][]int{}
	for _, batch := range chunkStrings(uniqueNonEmptyStrings(online), sqliteMaxVars) {
		var rows []struct {
			Email     string
			InboundId int
		}
		err := db.Table("client_inbounds").
			Select("clients.email AS email, client_inbounds.inbound_id AS inbound_id").
			Joins("JOIN clients ON clients.id = client_inbounds.client_id").
			Where("clients.email IN ?", batch).
			Order("client_inbounds.inbound_id").
			Scan(&rows).Error
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			attached[r.Email] = append(attached[r.Email], r.InboundId)
		}
	}

	for email, ids := range attached {
		var seen, moved []ActiveConnection
		for _, id := range ids {
			if _, ok := exact[email][id]; ok {
				seen = append(seen, ActiveConnection{InboundId: id, Exact: true})
			} else if _, ok := active[id]; ok {
				moved = append(moved, ActiveConnection{InboundId: id})
			}
		}
		switch {
		case len(seen) > 0:
			out[email] = seen
		case len(moved) > 0:
			out[email] = moved
		default:
			fallback := make([]ActiveConnection, len(ids))
			for i, id := range ids {
				fallback[i] = ActiveConnection{InboundId: id}
			}
			out[email] = fallback
		}
	}
	return out, nil
}
