package sub

import (
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
