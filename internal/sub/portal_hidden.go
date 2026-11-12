package sub

import (
	"strings"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/logger"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/portal"
)

// loadHiddenKeys returns the keys clients of subId hid in the portal; nil keeps the
// subscription whole when the lookup fails, since a broken filter must not empty it.
func loadHiddenKeys(subId string) portal.HiddenSet {
	set, err := (&portal.Service{}).HiddenBySubID(subId)
	if err != nil {
		logger.Warning("SubService - hidden keys:", err)
		return nil
	}
	return set
}

// visibleHostEps drops the host endpoints the client hid.
func visibleHostEps(eps []map[string]any, hidden portal.HiddenSet, email string, inboundID int) []map[string]any {
	if len(hidden) == 0 {
		return eps
	}
	out := make([]map[string]any, 0, len(eps))
	for _, ep := range eps {
		hostID, _ := ep["hostId"].(int)
		if hidden.Has(email, portal.Key{InboundID: inboundID, HostID: hostID}) {
			continue
		}
		out = append(out, ep)
	}
	return out
}

// applyVisibleKeys points inbound at the client's visible hosts for the JSON and Clash
// renderers; false means the client hid every key of this inbound.
func applyVisibleKeys(inbound *model.Inbound, baseStream string, hostEps []map[string]any, hidden portal.HiddenSet, email string) bool {
	if len(hostEps) == 0 {
		return !hidden.Has(email, portal.Key{InboundID: inbound.Id})
	}
	eps := visibleHostEps(hostEps, hidden, email, inbound.Id)
	if len(eps) == 0 {
		return false
	}
	inbound.StreamSettings = baseStream
	injectExternalProxy(inbound, eps)
	return true
}

// hiddenForFormat drops a client's hidden set when it would leave that client no key in
// this format: hosts excluded per format can make the portal's "one key visible" check pass yet empty one format.
func (s *SubService) hiddenForFormat(hidden portal.HiddenSet, inbounds []*model.Inbound, subId, format string) portal.HiddenSet {
	if len(hidden) == 0 {
		return hidden
	}
	visible := map[string]bool{}
	for _, inbound := range inbounds {
		if inbound.ExcludeFromSub {
			continue
		}
		clients, err := s.inboundService.GetClientsBySubId(inbound.Id, subId)
		if err != nil {
			return nil
		}
		eps := s.hostEndpoints(inbound, format)
		for _, client := range clients {
			email := strings.ToLower(client.Email)
			if len(eps) == 0 {
				visible[email] = visible[email] || !hidden.Has(client.Email, portal.Key{InboundID: inbound.Id})
				continue
			}
			visible[email] = visible[email] || len(visibleHostEps(eps, hidden, client.Email, inbound.Id)) > 0
		}
	}
	out := portal.HiddenSet{}
	for email, keys := range hidden {
		if visible[email] {
			out[email] = keys
		}
	}
	return out
}
