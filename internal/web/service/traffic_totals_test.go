package service

import (
	"reflect"
	"testing"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/xray"
)

func seedClientCounter(t *testing.T, email string, up, down int64) {
	t.Helper()
	if err := database.GetDB().Create(&xray.ClientTraffic{Email: email, Up: up, Down: down, Enable: true}).Error; err != nil {
		t.Fatalf("seed client traffic %s: %v", email, err)
	}
}

func setClientCounter(t *testing.T, email string, up, down int64) {
	t.Helper()
	if err := database.GetDB().Model(&xray.ClientTraffic{}).Where("email = ?", email).
		Updates(map[string]any{"up": up, "down": down}).Error; err != nil {
		t.Fatal(err)
	}
}

func inboundTotal(t *testing.T, id int) [2]int64 {
	t.Helper()
	var row model.InboundTrafficTotal
	if err := database.GetDB().First(&row, "inbound_id = ?", id).Error; err != nil {
		t.Fatalf("inbound %d total: %v", id, err)
	}
	return [2]int64{row.Up, row.Down}
}

func clientTotal(t *testing.T, email string) [2]int64 {
	t.Helper()
	var row model.ClientTrafficTotal
	if err := database.GetDB().First(&row, "email = ?", email).Error; err != nil {
		t.Fatalf("client %s total: %v", email, err)
	}
	return [2]int64{row.Up, row.Down}
}

// "All time" must survive a traffic reset: the counters drop to zero, the total
// keeps what was used before and adds what comes after. It starts from the
// counters found on the first run, so it is never below the current period.
func TestTrafficTotalsSurviveResets(t *testing.T) {
	setupConflictDB(t)
	ib := seedHistoryInbound(t, "tot-a", 1000, 9000)
	seedClientCounter(t, "alice", 300, 3000)
	at := time.Date(2026, 11, 1, 12, 0, 0, 0, time.Local)
	svc := &TrafficHistoryService{}
	if err := svc.Sample(at); err != nil {
		t.Fatal(err)
	}

	setInboundCounters(t, ib, 1500, 9500)
	setClientCounter(t, "alice", 350, 3100)
	if err := svc.Sample(at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	setInboundCounters(t, ib, 20, 40)
	setClientCounter(t, "alice", 5, 6)
	if err := svc.Sample(at.Add(2 * time.Minute)); err != nil {
		t.Fatal(err)
	}

	if got, want := inboundTotal(t, ib.Id), [2]int64{1000 + 500 + 20, 9000 + 500 + 40}; got != want {
		t.Fatalf("inbound all-time = %v, want %v", got, want)
	}
	if got, want := clientTotal(t, "alice"), [2]int64{300 + 50 + 5, 3000 + 100 + 6}; got != want {
		t.Fatalf("client all-time = %v, want %v", got, want)
	}
}

// The baseline lives in the database: traffic carried while the panel was
// restarting is counted on the first sample of the new process.
func TestTrafficHistoryCountsGrowthAcrossRestart(t *testing.T) {
	setupConflictDB(t)
	ib := seedHistoryInbound(t, "tot-b", 100, 100)
	at := time.Date(2026, 11, 1, 12, 0, 0, 0, time.Local)
	if err := (&TrafficHistoryService{}).Sample(at); err != nil {
		t.Fatal(err)
	}
	setInboundCounters(t, ib, 160, 190)

	if err := (&TrafficHistoryService{}).Sample(at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}

	hour := time.Date(2026, 11, 1, 12, 0, 0, 0, time.Local).Unix()
	if got, want := hoursByStart(t), (map[int64][2]int64{hour: {60, 90}}); !reflect.DeepEqual(got, want) {
		t.Fatalf("traffic hours after restart = %v, want %v", got, want)
	}
}

// A deleted client must not leave its total behind for a new client that later
// reuses the email.
func TestTrafficTotalsForgetDeletedClients(t *testing.T) {
	setupConflictDB(t)
	seedClientCounter(t, "bob", 10, 10)
	at := time.Date(2026, 11, 1, 12, 0, 0, 0, time.Local)
	svc := &TrafficHistoryService{}
	if err := svc.Sample(at); err != nil {
		t.Fatal(err)
	}
	if err := database.GetDB().Where("email = ?", "bob").Delete(&xray.ClientTraffic{}).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.Sample(at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	var n int64
	database.GetDB().Model(&model.ClientTrafficTotal{}).Where("email = ?", "bob").Count(&n)
	if n != 0 {
		t.Fatal("all-time total of a deleted client was kept")
	}
}

// "All time" on the chart is by month, kept forever, and includes the hours
// recorded before the monthly table existed.
func TestTrafficHistoryAllTimeByMonth(t *testing.T) {
	setupConflictDB(t)
	db := database.GetDB()
	sep := time.Date(2026, 9, 20, 10, 0, 0, 0, time.Local).Unix()
	oct := time.Date(2026, 10, 15, 9, 0, 0, 0, time.Local).Unix()
	for _, h := range []model.TrafficHour{{Hour: sep, Up: 1, Down: 2}, {Hour: oct, Up: 3, Down: 4}} {
		if err := db.Create(&h).Error; err != nil {
			t.Fatal(err)
		}
	}
	ib := seedHistoryInbound(t, "tot-c", 0, 0)
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.Local)
	svc := &TrafficHistoryService{}
	if err := svc.Sample(now); err != nil {
		t.Fatal(err)
	}
	setInboundCounters(t, ib, 5, 6)
	if err := svc.Sample(now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}

	got, err := svc.History("all", now)
	if err != nil {
		t.Fatalf("History(all): %v", err)
	}
	month := func(m time.Month) int64 { return time.Date(2026, m, 1, 0, 0, 0, 0, time.Local).Unix() }
	want := []TrafficPoint{
		{Time: month(time.September), Up: 1, Down: 2},
		{Time: month(time.October), Up: 3, Down: 4},
		{Time: month(time.November), Up: 5, Down: 6},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("all-time = %+v, want %+v", got, want)
	}
}

// The dashboard's "all time" view lists the heaviest clients by their all-time
// total, leaving out clients reachable only through a hidden node.
func TestAllTimeTrafficTopsVisibleClients(t *testing.T) {
	setupConflictDB(t)
	f := seedHiddenNodeFixture(t)
	db := database.GetDB()
	for email, total := range map[string][2]int64{"local@x": {10, 90}, "relay@x": {500, 500}, "both@x": {50, 150}, "orphan@x": {1, 1}} {
		if err := db.Create(&model.ClientTrafficTotal{Email: email, Up: total[0], Down: total[1]}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&model.InboundTrafficTotal{InboundId: f.local.Id, Up: 7, Down: 8}).Error; err != nil {
		t.Fatal(err)
	}

	got, err := (&TrafficHistoryService{}).AllTimeTraffic(2)
	if err != nil {
		t.Fatalf("AllTimeTraffic: %v", err)
	}
	want := []ClientAllTime{{Email: "both@x", Up: 50, Down: 150}, {Email: "local@x", Up: 10, Down: 90}}
	if !reflect.DeepEqual(got.Clients, want) {
		t.Fatalf("top clients = %+v, want %+v", got.Clients, want)
	}
	if got.Inbounds[f.local.Id] != (TrafficTotal{Up: 7, Down: 8}) {
		t.Fatalf("inbound totals = %+v", got.Inbounds)
	}
}
