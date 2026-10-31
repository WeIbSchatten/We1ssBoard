package service

import (
	"reflect"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
)

func seedActiveConnectionFixture(t *testing.T) map[string]int {
	t.Helper()
	db := database.GetDB()
	ids := map[string]int{}
	for i, tag := range []string{"in-vless", "in-trojan", "in-ss"} {
		ib := &model.Inbound{Tag: tag, Port: 20001 + i, Protocol: model.VLESS, Enable: true, Settings: "{}"}
		if err := db.Create(ib).Error; err != nil {
			t.Fatalf("seed inbound %s: %v", tag, err)
		}
		ids[tag] = ib.Id
	}
	attach := map[string][]string{
		"user1": {"in-vless", "in-trojan"},
		"user2": {"in-vless", "in-trojan"},
		"user3": {"in-trojan", "in-ss"},
		"user4": {"in-vless"},
	}
	for _, email := range []string{"user1", "user2", "user3", "user4"} {
		rec := &model.ClientRecord{Email: email, Enable: true}
		if err := db.Create(rec).Error; err != nil {
			t.Fatalf("seed client %s: %v", email, err)
		}
		for _, tag := range attach[email] {
			if err := db.Create(&model.ClientInbound{ClientId: rec.Id, InboundId: ids[tag]}).Error; err != nil {
				t.Fatalf("attach %s to %s: %v", email, tag, err)
			}
		}
	}
	return ids
}

// One email is shared by every inbound a client is attached to, so the online
// set alone cannot say which inbound is in use: the access log must win where
// it has a sighting, and only an online client without one falls back to its
// attached inbounds that carried traffic.
func TestGetActiveConnectionsPrefersAccessLogOverActiveInbounds(t *testing.T) {
	setupConflictDB(t)
	process := useOnlineTestProcess(t)
	ids := seedActiveConnectionFixture(t)

	process.RefreshLocalOnline([]string{"user1", "user2"}, []string{"in-vless", "in-trojan"}, 1000, onlineGracePeriodMs)
	process.RecordLocalClientInbounds(map[string]map[string]int64{"user1": {"in-vless": 1000}}, 1000, onlineGracePeriodMs)
	process.SetNodeOnlineTree(7, map[string][]string{"guid-n": {"user3"}})
	process.SetNodeActiveInboundTree(7, map[string][]string{"guid-n": {"in-trojan", "in-ss"}})
	process.SetNodeClientInboundTree(7, map[string]map[string][]string{"guid-n": {"user3": {"in-ss"}}})

	got, err := (&InboundService{}).GetActiveConnections()
	if err != nil {
		t.Fatalf("GetActiveConnections: %v", err)
	}
	want := map[string][]ActiveConnection{
		"user1": {{InboundId: ids["in-vless"], Exact: true}},
		"user2": {{InboundId: ids["in-vless"]}, {InboundId: ids["in-trojan"]}},
		"user3": {{InboundId: ids["in-ss"], Exact: true}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("active connections = %v, want %v", got, want)
	}
}

// An online client whose attached inbounds moved no bytes this window (an idle
// but open connection) still shows where it can be, marked as a guess.
func TestGetActiveConnectionsFallsBackToAttachedWhenNoInboundMoved(t *testing.T) {
	setupConflictDB(t)
	process := useOnlineTestProcess(t)
	ids := seedActiveConnectionFixture(t)

	process.RefreshLocalOnline([]string{"user4"}, []string{"in-ss"}, 1000, onlineGracePeriodMs)

	got, err := (&InboundService{}).GetActiveConnections()
	if err != nil {
		t.Fatalf("GetActiveConnections: %v", err)
	}
	want := map[string][]ActiveConnection{"user4": {{InboundId: ids["in-vless"]}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("active connections = %v, want %v", got, want)
	}
}

// A node reports its own exact sightings under its GUID, plus everything the
// nodes behind it reported, so the master can merge a whole chain.
func TestGetClientInboundsByGuidKeysLocalUnderOwnGuid(t *testing.T) {
	setupConflictDB(t)
	process := useOnlineTestProcess(t)
	process.RecordLocalClientInbounds(map[string]map[string]int64{"user1": {"in-vless": 1000}}, 1000, onlineGracePeriodMs)
	process.SetNodeClientInboundTree(7, map[string]map[string][]string{"guid-n": {"user3": {"in-ss"}}})

	svc := &InboundService{}
	want := map[string]map[string][]string{
		svc.panelGuid(): {"user1": {"in-vless"}},
		"guid-n":        {"user3": {"in-ss"}},
	}
	if got := svc.GetClientInboundsByGuid(); !reflect.DeepEqual(got, want) {
		t.Fatalf("client inbounds by guid = %v, want %v", got, want)
	}
}
