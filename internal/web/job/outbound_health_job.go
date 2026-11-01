package job

import (
	"encoding/json"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/eventbus"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/logger"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/outbound"
)

// OutboundHealthJob feeds the dashboard's outbound health card: every proxy
// outbound is probed every 10 minutes and a failing one every minute.
type OutboundHealthJob struct {
	xrayService     service.XrayService
	settingService  service.SettingService
	outboundService outbound.OutboundService
	outbounds       []json.RawMessage
}

func NewOutboundHealthJob() *OutboundHealthJob {
	j := new(OutboundHealthJob)
	service.GetOutboundHealthMonitor().Configure(j.probe, func(e eventbus.Event) {
		if EventBus != nil {
			EventBus.Publish(e)
		}
	})
	return j
}

func (j *OutboundHealthJob) Run() {
	if !j.xrayService.IsXrayRunning() {
		return
	}
	cfg, err := j.xrayService.GetXrayConfig()
	if err != nil {
		logger.Debug("outbound health: read xray config:", err)
		return
	}
	j.outbounds = nil
	_ = json.Unmarshal(cfg.OutboundConfigs, &j.outbounds)
	refs, observed := service.OutboundHealthInputs(cfg)
	threshold, err := j.settingService.GetOutboundDownThreshold()
	if err != nil {
		threshold = 3
	}
	service.GetOutboundHealthMonitor().Tick(time.Now(), refs, observed, threshold)
}

// probe runs the same check as the Outbounds tab's Test button, one temporary
// Xray for the whole batch.
func (j *OutboundHealthJob) probe(tags []string) map[string]service.OutboundProbeResult {
	out := make(map[string]service.OutboundProbeResult, len(tags))
	wanted := make(map[string]bool, len(tags))
	for _, tag := range tags {
		wanted[tag] = true
	}
	var batch []json.RawMessage
	for _, raw := range j.outbounds {
		var head struct {
			Tag string `json:"tag"`
		}
		if json.Unmarshal(raw, &head) == nil && wanted[head.Tag] {
			batch = append(batch, raw)
		}
	}
	testURL, _ := j.settingService.GetXrayOutboundTestUrl()
	testURL, err := service.SanitizePublicHTTPURL(testURL, false)
	if err != nil {
		logger.Warning("outbound health: test URL:", err)
		return out
	}
	batchJSON, _ := json.Marshal(batch)
	allJSON, _ := json.Marshal(j.outbounds)
	results, err := j.outboundService.TestOutbounds(string(batchJSON), testURL, string(allJSON), "")
	if err != nil {
		logger.Warning("outbound health: probe:", err)
		return out
	}
	for _, r := range results {
		if r != nil && r.Tag != "" {
			out[r.Tag] = service.OutboundProbeResult{Success: r.Success, Delay: r.Delay, Error: r.Error}
		}
	}
	return out
}
