package job

import (
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/logger"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
)

// TrafficHistoryJob records how much the inbound counters grew since its last run
// into the hourly table the dashboard traffic chart reads.
type TrafficHistoryJob struct{}

func NewTrafficHistoryJob() *TrafficHistoryJob {
	return new(TrafficHistoryJob)
}

func (j *TrafficHistoryJob) Run() {
	if err := service.GetTrafficHistoryService().Sample(time.Now()); err != nil {
		logger.Warning("sample traffic history failed:", err)
	}
}
