package service

import (
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
)

type hiddenNodeFixture struct {
	local, onHidden, onVisible *model.Inbound
	hiddenNode                 *model.Node
}

// A panel with one hidden and one visible node, an inbound on each plus a local
// one, and clients attached to them in every combination that matters.
func seedHiddenNodeFixture(t *testing.T) hiddenNodeFixture {
	t.Helper()
	db := database.GetDB()
	hidden := &model.Node{Name: "relay", Address: "10.0.0.1", Port: 2053, ApiToken: "t", Enable: true, Hidden: true}
	visible := &model.Node{Name: "fin", Address: "10.0.0.2", Port: 2053, ApiToken: "t", Enable: true}
	for _, n := range []*model.Node{hidden, visible} {
		if err := db.Create(n).Error; err != nil {
			t.Fatalf("create node %s: %v", n.Name, err)
		}
	}
	mk := func(tag string, port int, node *int) *model.Inbound {
		ib := &model.Inbound{UserId: 1, Tag: tag, Port: port, Protocol: model.VLESS, Enable: true, Settings: "{}", NodeID: node}
		if err := db.Create(ib).Error; err != nil {
			t.Fatalf("create inbound %s: %v", tag, err)
		}
		return ib
	}
	f := hiddenNodeFixture{
		local:      mk("in-local", 40001, nil),
		onHidden:   mk("in-relay", 40002, &hidden.Id),
		onVisible:  mk("in-fin", 40003, &visible.Id),
		hiddenNode: hidden,
	}
	attach := map[string][]*model.Inbound{
		"local@x":  {f.local},
		"relay@x":  {f.onHidden},
		"both@x":   {f.onHidden, f.onVisible},
		"orphan@x": nil,
	}
	for _, email := range []string{"local@x", "relay@x", "both@x", "orphan@x"} {
		rec := &model.ClientRecord{Email: email, Enable: true}
		if err := db.Create(rec).Error; err != nil {
			t.Fatalf("create client %s: %v", email, err)
		}
		for _, ib := range attach[email] {
			if err := db.Create(&model.ClientInbound{ClientId: rec.Id, InboundId: ib.Id}).Error; err != nil {
				t.Fatalf("attach %s: %v", email, err)
			}
		}
	}
	return f
}

// The client form and bulk attach build their inbound lists from these options;
// a hidden node's inbounds must be marked so the pickers can leave them out.
func TestInboundOptionsMarkHiddenNodeInbounds(t *testing.T) {
	setupConflictDB(t)
	f := seedHiddenNodeFixture(t)

	opts, err := (&InboundService{}).GetInboundOptions(1)
	if err != nil {
		t.Fatalf("GetInboundOptions: %v", err)
	}
	hidden := map[int]bool{}
	for _, o := range opts {
		hidden[o.Id] = o.Hidden
	}
	want := map[int]bool{f.local.Id: false, f.onHidden.Id: true, f.onVisible.Id: false}
	if !reflect.DeepEqual(hidden, want) {
		t.Fatalf("hidden by inbound = %v, want %v", hidden, want)
	}
}

// The dashboard lists clients with node=visible: a client reachable only through
// a hidden node drops out, one with any visible inbound (or none at all) stays.
func TestListPagedVisibleScopeDropsHiddenNodeClients(t *testing.T) {
	setupConflictDB(t)
	seedHiddenNodeFixture(t)

	resp, err := (&ClientService{}).ListPaged(&InboundService{}, &SettingService{}, ClientPageParams{PageSize: 50, Node: "visible"})
	if err != nil {
		t.Fatalf("ListPaged: %v", err)
	}
	var got []string
	for _, c := range resp.Items {
		got = append(got, c.Email)
	}
	slices.Sort(got)
	if want := []string{"both@x", "local@x", "orphan@x"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("visible clients = %v, want %v", got, want)
	}
	if resp.Summary.Total != 3 {
		t.Fatalf("summary = %+v, want the counters scoped to the 3 visible clients", resp.Summary)
	}
}

// Saving the node form must persist the flag; Update writes an explicit column
// map, so a field missing from it would silently never save.
func TestNodeUpdatePersistsHidden(t *testing.T) {
	setupConflictDB(t)
	f := seedHiddenNodeFixture(t)
	node := *f.hiddenNode
	node.Hidden = false

	if err := (&NodeService{}).Update(node.Id, &node); err != nil {
		t.Fatalf("Update: %v", err)
	}
	var stored model.Node
	if err := database.GetDB().First(&stored, node.Id).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Hidden {
		t.Fatal("hidden flag still set after saving the node with it cleared")
	}
}

// The traffic chart leaves out a hidden node, and showing the node again must
// not count its whole lifetime counter as one hour's traffic.
func TestTrafficHistorySkipsHiddenNodeInbounds(t *testing.T) {
	setupConflictDB(t)
	f := seedHiddenNodeFixture(t)
	db := database.GetDB()
	set := func(ib *model.Inbound, up, down int64) {
		t.Helper()
		if err := db.Model(ib).Updates(map[string]any{"up": up, "down": down}).Error; err != nil {
			t.Fatal(err)
		}
	}
	at := time.Date(2026, 11, 1, 10, 5, 0, 0, time.Local)
	svc := &TrafficHistoryService{}
	if err := svc.Sample(at); err != nil {
		t.Fatal(err)
	}

	set(f.local, 100, 1000)
	set(f.onHidden, 5000, 50000)
	if err := svc.Sample(at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(f.hiddenNode).Update("hidden", false).Error; err != nil {
		t.Fatal(err)
	}
	set(f.onHidden, 5010, 50020)
	if err := svc.Sample(at.Add(2 * time.Minute)); err != nil {
		t.Fatal(err)
	}

	hour := time.Date(2026, 11, 1, 10, 0, 0, 0, time.Local).Unix()
	if got, want := hoursByStart(t), (map[int64][2]int64{hour: {100 + 10, 1000 + 20}}); !reflect.DeepEqual(got, want) {
		t.Fatalf("traffic hours = %v, want only local growth plus the node's growth after it was shown", got)
	}
}
