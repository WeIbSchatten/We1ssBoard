package service

import (
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm/clause"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
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

// TrafficHistoryService turns the inbounds' running up/down counters into hourly
// traffic rows by sampling them and storing the growth since the previous sample.
type TrafficHistoryService struct {
	mu     sync.Mutex
	primed bool
	prev   map[int][2]int64
}

var trafficHistory = &TrafficHistoryService{}

// GetTrafficHistoryService returns the process-wide sampler; its baseline lives in memory.
func GetTrafficHistoryService() *TrafficHistoryService { return trafficHistory }

func localHourStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, t.Location())
}

func localDayStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

// Sample adds the counter growth since the previous call to the hour holding now.
// A counter below its last value was reset, so its whole value is new traffic.
func (s *TrafficHistoryService) Sample(now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	db := database.GetDB()
	var rows []struct {
		Id   int
		Up   int64
		Down int64
	}
	if err := db.Model(&model.Inbound{}).Select("id, up, down").Scan(&rows).Error; err != nil {
		return err
	}
	current := make(map[int][2]int64, len(rows))
	var up, down int64
	for _, r := range rows {
		current[r.Id] = [2]int64{r.Up, r.Down}
		if !s.primed {
			continue
		}
		prev := s.prev[r.Id]
		up += counterGrowth(prev[0], r.Up)
		down += counterGrowth(prev[1], r.Down)
	}
	s.prev, s.primed = current, true

	if up > 0 || down > 0 {
		row := model.TrafficHour{Hour: localHourStart(now).Unix(), Up: up, Down: down}
		err := db.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "hour"}},
			DoUpdates: clause.Assignments(map[string]any{
				"up":   clause.Expr{SQL: "traffic_hours.up + ?", Vars: []any{up}},
				"down": clause.Expr{SQL: "traffic_hours.down + ?", Vars: []any{down}},
			}),
		}).Create(&row).Error
		if err != nil {
			return err
		}
	}
	return db.Where("hour < ?", now.Add(-trafficHistoryRetention).Unix()).Delete(&model.TrafficHour{}).Error
}

func counterGrowth(prev, cur int64) int64 {
	if cur >= prev {
		return cur - prev
	}
	return cur
}

// History returns every slot of rangeKey ("24h", "7d" or "30d") ending with the
// one holding now, oldest first, with empty slots as zeros.
func (s *TrafficHistoryService) History(rangeKey string, now time.Time) ([]TrafficPoint, error) {
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
