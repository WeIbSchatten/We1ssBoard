package service

import (
	"reflect"
	"testing"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
)

func seedHistoryInbound(t *testing.T, tag string, up, down int64) *model.Inbound {
	t.Helper()
	ib := &model.Inbound{Tag: tag, Port: 30000 + len(tag), Protocol: model.VLESS, Enable: true, Settings: "{}", Up: up, Down: down}
	if err := database.GetDB().Create(ib).Error; err != nil {
		t.Fatalf("seed inbound %s: %v", tag, err)
	}
	return ib
}

func setInboundCounters(t *testing.T, ib *model.Inbound, up, down int64) {
	t.Helper()
	if err := database.GetDB().Model(ib).Updates(map[string]any{"up": up, "down": down}).Error; err != nil {
		t.Fatalf("update counters: %v", err)
	}
}

func hoursByStart(t *testing.T) map[int64][2]int64 {
	t.Helper()
	var rows []model.TrafficHour
	if err := database.GetDB().Find(&rows).Error; err != nil {
		t.Fatalf("load traffic hours: %v", err)
	}
	out := map[int64][2]int64{}
	for _, r := range rows {
		out[r.Hour] = [2]int64{r.Up, r.Down}
	}
	return out
}

// Counters already on the inbounds at start-up were earned before the panel was
// watching, so the first sample is only a baseline; later samples add the growth,
// and a counter that went down was reset, so all of it is new traffic.
func TestTrafficHistorySampleCountsGrowthSinceBaseline(t *testing.T) {
	setupConflictDB(t)
	a := seedHistoryInbound(t, "hist-a", 1000, 5000)
	b := seedHistoryInbound(t, "hist-b", 700, 900)
	at := time.Date(2026, 10, 31, 14, 10, 0, 0, time.Local)

	svc := &TrafficHistoryService{}
	if err := svc.Sample(at); err != nil {
		t.Fatalf("baseline sample: %v", err)
	}
	if got := hoursByStart(t); len(got) != 0 {
		t.Fatalf("baseline sample recorded %v, want nothing", got)
	}

	setInboundCounters(t, a, 1300, 5600)
	setInboundCounters(t, b, 50, 20)
	c := seedHistoryInbound(t, "hist-c", 10, 40)
	if err := svc.Sample(at.Add(time.Minute)); err != nil {
		t.Fatalf("second sample: %v", err)
	}
	setInboundCounters(t, c, 25, 40)
	if err := svc.Sample(at.Add(2 * time.Minute)); err != nil {
		t.Fatalf("third sample: %v", err)
	}

	hour := time.Date(2026, 10, 31, 14, 0, 0, 0, time.Local).Unix()
	want := map[int64][2]int64{hour: {300 + 50 + 10 + 15, 600 + 20 + 40}}
	if got := hoursByStart(t); !reflect.DeepEqual(got, want) {
		t.Fatalf("traffic hours = %v, want %v", got, want)
	}
}

// The dashboard draws every slot of the range, so empty hours and days come back
// as zeros, the last slot is the current one, and days add up their hours.
func TestTrafficHistoryRanges(t *testing.T) {
	setupConflictDB(t)
	now := time.Date(2026, 10, 31, 14, 30, 0, 0, time.Local)
	hour := func(d, h int) int64 { return time.Date(2026, 10, d, h, 0, 0, 0, time.Local).Unix() }
	day := func(d int) int64 { return time.Date(2026, 10, d, 0, 0, 0, 0, time.Local).Unix() }
	for _, row := range []model.TrafficHour{
		{Hour: hour(31, 14), Up: 5, Down: 50},
		{Hour: hour(31, 9), Up: 1, Down: 10},
		{Hour: hour(30, 15), Up: 2, Down: 20},
		{Hour: hour(30, 1), Up: 3, Down: 30},
		{Hour: hour(20, 12), Up: 7, Down: 70},
	} {
		if err := database.GetDB().Create(&row).Error; err != nil {
			t.Fatalf("seed hour: %v", err)
		}
	}
	svc := &TrafficHistoryService{}

	h24, err := svc.History("24h", now)
	if err != nil {
		t.Fatalf("24h: %v", err)
	}
	if len(h24) != 24 || h24[23].Time != hour(31, 14) || h24[0].Time != hour(30, 15) {
		t.Fatalf("24h slots = %d from %d to %d", len(h24), h24[0].Time, h24[len(h24)-1].Time)
	}
	if h24[23] != (TrafficPoint{Time: hour(31, 14), Up: 5, Down: 50}) || h24[0] != (TrafficPoint{Time: hour(30, 15), Up: 2, Down: 20}) || h24[1].Up != 0 {
		t.Fatalf("24h points wrong: first %+v, second %+v, last %+v", h24[0], h24[1], h24[23])
	}

	d7, err := svc.History("7d", now)
	if err != nil {
		t.Fatalf("7d: %v", err)
	}
	if len(d7) != 7 || d7[6] != (TrafficPoint{Time: day(31), Up: 6, Down: 60}) || d7[5] != (TrafficPoint{Time: day(30), Up: 5, Down: 50}) {
		t.Fatalf("7d = %+v", d7)
	}

	d30, err := svc.History("30d", now)
	if err != nil {
		t.Fatalf("30d: %v", err)
	}
	if len(d30) != 30 || d30[18] != (TrafficPoint{Time: day(20), Up: 7, Down: 70}) {
		t.Fatalf("30d day 20 = %+v (len %d)", d30[18], len(d30))
	}

	if _, err := svc.History("1y", now); err == nil || err.Error() != `unknown traffic range "1y"` {
		t.Fatalf("unknown range error = %v", err)
	}
}

// Old hours beyond what the longest range shows are dropped as samples come in.
func TestTrafficHistoryPrunesOldHours(t *testing.T) {
	setupConflictDB(t)
	now := time.Date(2026, 10, 31, 14, 30, 0, 0, time.Local)
	old := now.AddDate(0, 0, -40).Truncate(time.Hour).Unix()
	recent := now.AddDate(0, 0, -20).Truncate(time.Hour).Unix()
	for _, h := range []int64{old, recent} {
		if err := database.GetDB().Create(&model.TrafficHour{Hour: h, Up: 1, Down: 1}).Error; err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	if err := (&TrafficHistoryService{}).Sample(now); err != nil {
		t.Fatalf("sample: %v", err)
	}
	got := hoursByStart(t)
	if _, ok := got[old]; ok {
		t.Fatalf("hour from 40 days ago survived pruning")
	}
	if _, ok := got[recent]; !ok {
		t.Fatalf("hour from 20 days ago was pruned")
	}
}
