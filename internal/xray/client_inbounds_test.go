package xray

import (
	"reflect"
	"testing"
)

// The access log can say "user1 came in through in-a" for a line logged long
// ago; only sightings inside the grace window may count as the live connection.
func TestRecordLocalClientInboundsKeepsOnlyRecentSightings(t *testing.T) {
	p := newOnlineTestProcess()
	const grace = 20000

	p.RecordLocalClientInbounds(map[string]map[string]int64{
		"user1": {"in-a": 1000, "in-b": 9000},
		"user2": {"in-a": 500},
	}, 21000, grace)

	want := map[string][]string{"user1": {"in-b"}}
	if got := p.GetLocalClientInbounds(); !reflect.DeepEqual(got, want) {
		t.Fatalf("local client inbounds = %v, want %v", got, want)
	}

	// A later read with nothing new still ages the old sighting out.
	p.RecordLocalClientInbounds(nil, 40000, grace)
	if got := p.GetLocalClientInbounds(); len(got) != 0 {
		t.Fatalf("after grace, local client inbounds = %v, want empty", got)
	}
}

// An older log line read after a newer one must not move lastSeen backwards.
func TestRecordLocalClientInboundsKeepsNewestSighting(t *testing.T) {
	p := newOnlineTestProcess()
	p.RecordLocalClientInbounds(map[string]map[string]int64{"user1": {"in-a": 15000}}, 15000, 20000)
	p.RecordLocalClientInbounds(map[string]map[string]int64{"user1": {"in-a": 1000}}, 30000, 20000)

	want := map[string][]string{"user1": {"in-a"}}
	if got := p.GetLocalClientInbounds(); !reflect.DeepEqual(got, want) {
		t.Fatalf("local client inbounds = %v, want %v", got, want)
	}
}

// A downed or dropped node must take its clients' live inbounds with it, the
// same way its online set goes.
func TestNodeClientInboundTreesFollowNodeLifecycle(t *testing.T) {
	p := newOnlineTestProcess()
	p.SetNodeClientInboundTree(1, map[string]map[string][]string{"guid-a": {"user1": {"in-1"}}})
	p.SetNodeClientInboundTree(2, map[string]map[string][]string{
		"guid-b": {"user2": {"in-2"}},
		"guid-c": {"user3": {"in-3", "in-4"}},
	})

	want := map[string]map[string][]string{
		"guid-a": {"user1": {"in-1"}},
		"guid-b": {"user2": {"in-2"}},
		"guid-c": {"user3": {"in-3", "in-4"}},
	}
	if got := p.GetMergedClientInboundTrees(); !reflect.DeepEqual(got, want) {
		t.Fatalf("merged = %v, want %v", got, want)
	}

	p.ClearNodeOnlineClients(1)
	p.RetainNodeOnlineClients(func(nodeID int) bool { return nodeID != 2 })
	if got := p.GetMergedClientInboundTrees(); len(got) != 0 {
		t.Fatalf("after clearing both nodes, merged = %v, want empty", got)
	}
}
