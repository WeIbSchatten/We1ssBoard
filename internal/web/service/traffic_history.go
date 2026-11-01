package service

import (
	"fmt"
	"strconv"
	"sync"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/xray"
)

// trafficHistoryRetention covers the longest dashboard range (30 days) plus the
// partial day at each end.
const trafficHistoryRetention = 32 * 24 * time.Hour

// TrafficPoint is one slot of the dashboard traffic chart: an hour for the 24h
// range, a local day for 7d and 30d. Time is the slot's start in unix seconds.
type TrafficPoint struct {
	Time int64 `json:"time" example:"1793430000"`
	Up   int64 `json:"up" example:"1048576"`
	Down int64 `json:"down" example:"8388608"`
}

// TrafficHistoryService turns the running up/down counters of inbounds and
// clients into hourly and monthly traffic and all-time totals, by sampling them
// and adding the growth since the counters it saw last.
type TrafficHistoryService struct {
	mu sync.Mutex
}

var trafficHistory = &TrafficHistoryService{}

// GetTrafficHistoryService returns the process-wide sampler.
func GetTrafficHistoryService() *TrafficHistoryService { return trafficHistory }

func localHourStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, t.Location())
}

func localDayStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

func localMonthStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, t.Location())
}

type counterRow struct {
	Key      string
	Up, Down int64
	Hidden   bool
}

type counterTotal struct {
	Up, Down, LastUp, LastDown int64
}

// advanceTotals adds each counter's growth since its stored last value to its
// total and returns the changed rows plus the growth of the visible ones. On
// the very first run (no totals yet) totals start at the current counters and
// nothing counts as growth; afterwards a key seen for the first time is new,
// so its whole counter is growth.
func advanceTotals(rows []counterRow, totals map[string]counterTotal) (changed map[string]counterTotal, up, down int64) {
	seeding := len(totals) == 0
	changed = make(map[string]counterTotal)
	for _, r := range rows {
		t, known := totals[r.Key]
		if !known && seeding {
			changed[r.Key] = counterTotal{Up: r.Up, Down: r.Down, LastUp: r.Up, LastDown: r.Down}
			continue
		}
		gu, gd := counterGrowth(t.LastUp, r.Up), counterGrowth(t.LastDown, r.Down)
		if known && gu == 0 && gd == 0 && t.LastUp == r.Up && t.LastDown == r.Down {
			continue
		}
		changed[r.Key] = counterTotal{Up: t.Up + gu, Down: t.Down + gd, LastUp: r.Up, LastDown: r.Down}
		// Hidden counters still advance their baseline, so showing a node again
		// only counts what it carried from then on.
		if !r.Hidden {
			up += gu
			down += gd
		}
	}
	return changed, up, down
}

// Sample adds the counter growth since the previous sample to the hour and month
// holding now and to the all-time totals. The baseline is stored, so traffic
// carried while the panel was down still counts. A counter below its last
// value was reset, so its whole value is new traffic.
func (s *TrafficHistoryService) Sample(now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	db := database.GetDB()
	return db.Transaction(func(tx *gorm.DB) error {
		up, down, err := sampleInboundTotals(tx)
		if err != nil {
			return err
		}
		if err := sampleClientTotals(tx); err != nil {
			return err
		}
		if err := backfillTrafficMonths(tx); err != nil {
			return err
		}
		if up > 0 || down > 0 {
			hour := model.TrafficHour{Hour: localHourStart(now).Unix(), Up: up, Down: down}
			if err := addTraffic(tx, &hour, "traffic_hours", "hour", up, down); err != nil {
				return err
			}
			month := model.TrafficMonth{Month: localMonthStart(now).Unix(), Up: up, Down: down}
			if err := addTraffic(tx, &month, "traffic_months", "month", up, down); err != nil {
				return err
			}
		}
		return tx.Where("hour < ?", now.Add(-trafficHistoryRetention).Unix()).Delete(&model.TrafficHour{}).Error
	})
}

func addTraffic(tx *gorm.DB, row any, table, key string, up, down int64) error {
	return tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: key}},
		DoUpdates: clause.Assignments(map[string]any{
			"up":   clause.Expr{SQL: table + ".up + ?", Vars: []any{up}},
			"down": clause.Expr{SQL: table + ".down + ?", Vars: []any{down}},
		}),
	}).Create(row).Error
}

func sampleInboundTotals(tx *gorm.DB) (up, down int64, err error) {
	var counters []struct {
		Id       int
		Up, Down int64
		Hidden   bool
	}
	err = tx.Table("inbounds").
		Select("inbounds.id, inbounds.up, inbounds.down, COALESCE(nodes.hidden, ?) AS hidden", false).
		Joins("LEFT JOIN nodes ON nodes.id = inbounds.node_id").
		Scan(&counters).Error
	if err != nil {
		return 0, 0, err
	}
	var stored []model.InboundTrafficTotal
	if err := tx.Find(&stored).Error; err != nil {
		return 0, 0, err
	}
	rows := make([]counterRow, len(counters))
	for i, c := range counters {
		rows[i] = counterRow{Key: strconv.Itoa(c.Id), Up: c.Up, Down: c.Down, Hidden: c.Hidden}
	}
	totals := make(map[string]counterTotal, len(stored))
	for _, t := range stored {
		totals[strconv.Itoa(t.InboundId)] = counterTotal{t.Up, t.Down, t.LastUp, t.LastDown}
	}
	changed, up, down := advanceTotals(rows, totals)
	save := make([]model.InboundTrafficTotal, 0, len(changed))
	for key, t := range changed {
		id, _ := strconv.Atoi(key)
		save = append(save, model.InboundTrafficTotal{InboundId: id, Up: t.Up, Down: t.Down, LastUp: t.LastUp, LastDown: t.LastDown})
	}
	if len(save) > 0 {
		if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).CreateInBatches(save, 200).Error; err != nil {
			return 0, 0, err
		}
	}
	err = tx.Where("inbound_id NOT IN (?)", tx.Table("inbounds").Select("id")).Delete(&model.InboundTrafficTotal{}).Error
	return up, down, err
}

func sampleClientTotals(tx *gorm.DB) error {
	var counters []struct {
		Email    string
		Up, Down int64
	}
	if err := tx.Model(&xray.ClientTraffic{}).Select("email, up, down").Scan(&counters).Error; err != nil {
		return err
	}
	var stored []model.ClientTrafficTotal
	if err := tx.Find(&stored).Error; err != nil {
		return err
	}
	rows := make([]counterRow, len(counters))
	for i, c := range counters {
		rows[i] = counterRow{Key: c.Email, Up: c.Up, Down: c.Down}
	}
	totals := make(map[string]counterTotal, len(stored))
	for _, t := range stored {
		totals[t.Email] = counterTotal{t.Up, t.Down, t.LastUp, t.LastDown}
	}
	changed, _, _ := advanceTotals(rows, totals)
	save := make([]model.ClientTrafficTotal, 0, len(changed))
	for email, t := range changed {
		save = append(save, model.ClientTrafficTotal{Email: email, Up: t.Up, Down: t.Down, LastUp: t.LastUp, LastDown: t.LastDown})
	}
	if len(save) > 0 {
		if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).CreateInBatches(save, 200).Error; err != nil {
			return err
		}
	}
	return tx.Where("email NOT IN (?)", tx.Model(&xray.ClientTraffic{}).Select("email")).Delete(&model.ClientTrafficTotal{}).Error
}

// backfillTrafficMonths fills an empty monthly table from the hourly rows
// recorded before it existed, once.
func backfillTrafficMonths(tx *gorm.DB) error {
	var n int64
	if err := tx.Model(&model.TrafficMonth{}).Count(&n).Error; err != nil || n > 0 {
		return err
	}
	var hours []model.TrafficHour
	if err := tx.Find(&hours).Error; err != nil {
		return err
	}
	months := map[int64]*model.TrafficMonth{}
	for _, h := range hours {
		start := localMonthStart(time.Unix(h.Hour, 0)).Unix()
		m := months[start]
		if m == nil {
			m = &model.TrafficMonth{Month: start}
			months[start] = m
		}
		m.Up += h.Up
		m.Down += h.Down
	}
	for _, m := range months {
		if err := tx.Create(m).Error; err != nil {
			return err
		}
	}
	return nil
}

func counterGrowth(prev, cur int64) int64 {
	if cur >= prev {
		return cur - prev
	}
	return cur
}

// History returns every slot of rangeKey ("24h", "7d", "30d", or "all" by month) ending with the
// one holding now, oldest first, with empty slots as zeros.
func (s *TrafficHistoryService) History(rangeKey string, now time.Time) ([]TrafficPoint, error) {
	if rangeKey == "all" {
		return allTimeByMonth(now)
	}
	var starts []time.Time
	switch rangeKey {
	case "24h":
		last := localHourStart(now)
		for i := 23; i >= 0; i-- {
			starts = append(starts, last.Add(-time.Duration(i)*time.Hour))
		}
	case "7d", "30d":
		days := 7
		if rangeKey == "30d" {
			days = 30
		}
		last := localDayStart(now)
		for i := days - 1; i >= 0; i-- {
			starts = append(starts, last.AddDate(0, 0, -i))
		}
	default:
		return nil, fmt.Errorf("unknown traffic range %q", rangeKey)
	}

	var rows []model.TrafficHour
	if err := database.GetDB().Where("hour >= ?", starts[0].Unix()).Order("hour").Find(&rows).Error; err != nil {
		return nil, err
	}
	points := make([]TrafficPoint, len(starts))
	for i, st := range starts {
		points[i].Time = st.Unix()
	}
	slot := 0
	for _, r := range rows {
		for slot+1 < len(points) && r.Hour >= points[slot+1].Time {
			slot++
		}
		points[slot].Up += r.Up
		points[slot].Down += r.Down
	}
	return points, nil
}

// allTimeByMonth returns one slot per local month, from the first recorded
// month to the one holding now, with empty months as zeros.
func allTimeByMonth(now time.Time) ([]TrafficPoint, error) {
	var rows []model.TrafficMonth
	if err := database.GetDB().Order("month").Find(&rows).Error; err != nil {
		return nil, err
	}
	last := localMonthStart(now)
	first := last
	if len(rows) > 0 {
		if start := time.Unix(rows[0].Month, 0).In(now.Location()); start.Before(first) {
			first = start
		}
	}
	byMonth := make(map[int64]model.TrafficMonth, len(rows))
	for _, r := range rows {
		byMonth[r.Month] = r
	}
	var points []TrafficPoint
	for m := first; !m.After(last); m = m.AddDate(0, 1, 0) {
		r := byMonth[m.Unix()]
		points = append(points, TrafficPoint{Time: m.Unix(), Up: r.Up, Down: r.Down})
	}
	return points, nil
}

// TrafficTotal is all-time traffic in bytes.
type TrafficTotal struct {
	Up   int64 `json:"up" example:"1048576"`
	Down int64 `json:"down" example:"8388608"`
}

// ClientAllTime is one client's all-time traffic.
type ClientAllTime struct {
	Email string `json:"email" example:"alice@example.com"`
	Up    int64  `json:"up" example:"1048576"`
	Down  int64  `json:"down" example:"8388608"`
}

// AllTimeTraffic is what the dashboard shows in its "all time" mode.
type AllTimeTraffic struct {
	Clients  []ClientAllTime      `json:"clients"`
	Inbounds map[int]TrafficTotal `json:"inbounds"`
}

// AllTimeTraffic returns the limit heaviest clients by all-time traffic, among
// those not reachable only through a hidden node, and every inbound's total.
func (s *TrafficHistoryService) AllTimeTraffic(limit int) (*AllTimeTraffic, error) {
	db := database.GetDB()
	out := &AllTimeTraffic{Clients: []ClientAllTime{}, Inbounds: map[int]TrafficTotal{}}
	visible := clientQuery{}.withNode("visible").scope
	err := db.Table("client_traffic_totals t").
		Select("t.email, t.up, t.down").
		Joins("JOIN clients c ON c.email = t.email").
		Where(visible.sql, visible.args...).
		Order("t.up + t.down DESC, t.email").
		Limit(limit).
		Scan(&out.Clients).Error
	if err != nil {
		return nil, err
	}
	var totals []model.InboundTrafficTotal
	if err := db.Find(&totals).Error; err != nil {
		return nil, err
	}
	for _, t := range totals {
		out.Inbounds[t.InboundId] = TrafficTotal{Up: t.Up, Down: t.Down}
	}
	return out, nil
}
