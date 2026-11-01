package service

import (
	"strings"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
)

// Gates are We1ssBoard releases, not upstream 3x-ui ones: thresholds copied from
// 3x-ui (v3.x) refused every 1.x node. MASQUE arrived in 1.5.0.
func TestCheckNodeCanHostProtocol_NodeVersion(t *testing.T) {
	setupConflictDB(t)
	tests := []struct {
		protocol model.Protocol
		version  string
		wantErr  string
	}{
		{model.MASQUE, "v1.4.8", "need v1.5.0 or newer"},
		{model.MASQUE, "v1.5.0", ""},
		{model.MASQUE, "dev+1d1128cf", ""},
		{model.AmneziaWG, "v1.0.0", ""},
		{model.AmneziaWG, "", ""},
		{model.MTProto, "v1.10.1", ""},
		{model.TUIC, "v1.10.1", ""},
	}
	for i, tc := range tests {
		t.Run(string(tc.protocol)+"@"+tc.version, func(t *testing.T) {
			node := &model.Node{Name: "gate-node-" + string(tc.protocol) + tc.version, Address: "127.0.0.1", Port: 2096 + i, PanelVersion: tc.version}
			if err := database.GetDB().Create(node).Error; err != nil {
				t.Fatalf("create node: %v", err)
			}
			err := checkNodeCanHostProtocol(database.GetDB(), node.Id, tc.protocol)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("node on %q refused %s: %v", tc.version, tc.protocol, err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("node on %s: err = %v, want one containing %q", tc.version, err, tc.wantErr)
			}
		})
	}
}
