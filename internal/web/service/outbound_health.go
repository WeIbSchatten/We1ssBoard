package service

import (
	"encoding/json"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/eventbus"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/json_util"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/xray"
)

// outboundFullCheckEvery is how often every proxy outbound is probed; a failing
// one is rechecked on every tick (a minute) until it answers again.
const outboundFullCheckEvery = 10 * time.Minute

// OutboundRef names an outbound of the running config.
type OutboundRef struct {
	Tag      string
	Protocol string
}

// OutboundProbeResult is one outbound's answer to a probe.
type OutboundProbeResult struct {
	Success bool
	Delay   int64
	Error   string
}

// OutboundHealth is the dashboard's view of one proxy outbound. Checked is false
// until its first probe; Alive turns false only after the configured number of
// failures in a row.
type OutboundHealth struct {
	Tag       string `json:"tag" example:"warp"`
	Protocol  string `json:"protocol" example:"wireguard"`
	Checked   bool   `json:"checked" example:"true"`
	Alive     bool   `json:"alive" example:"true"`
	Delay     int64  `json:"delay" example:"120"`
	Error     string `json:"error,omitempty" example:""`
	Failures  int    `json:"failures" example:"0"`
	CheckedAt int64  `json:"checkedAt" example:"1793437200000"`
}

// OutboundHealthMonitor probes the panel's proxy outbounds without Xray's
// observatory, so their health shows even when no observatory is configured.
type OutboundHealthMonitor struct {
	mu       sync.Mutex
	state    map[string]*OutboundHealth
	lastFull time.Time
	probe    func(tags []string) map[string]OutboundProbeResult
	publish  func(eventbus.Event)
}

var outboundHealthMonitor = &OutboundHealthMonitor{}

// GetOutboundHealthMonitor returns the process-wide monitor the cron job drives.
func GetOutboundHealthMonitor() *OutboundHealthMonitor { return outboundHealthMonitor }

// Configure sets how outbounds are probed and where transitions are published.
func (m *OutboundHealthMonitor) Configure(probe func(tags []string) map[string]OutboundProbeResult, publish func(eventbus.Event)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.probe, m.publish = probe, publish
}

func outboundProbeable(protocol string) bool {
	switch protocol {
	case "freedom", "blackhole", "dns", "loopback", "":
		return false
	}
	return true
}

// Tick probes what is due: every proxy outbound once outboundFullCheckEvery has
// passed, otherwise only the ones currently failing. observed reports tags that
// Xray's observatory already announces, which get no events from here.
func (m *OutboundHealthMonitor) Tick(now time.Time, outbounds []OutboundRef, observed func(string) bool, threshold int) {
	due, probe, publish := m.planTick(now, outbounds)
	if len(due) == 0 {
		return
	}
	// A probe can take many seconds; the dashboard keeps reading the old state meanwhile.
	results := probe(due)
	for _, e := range m.applyTick(now, due, results, observed, threshold) {
		if publish != nil {
			publish(e)
		}
	}
}

func (m *OutboundHealthMonitor) planTick(now time.Time, outbounds []OutboundRef) ([]string, func([]string) map[string]OutboundProbeResult, func(eventbus.Event)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.probe == nil {
		return nil, nil, nil
	}
	if m.state == nil {
		m.state = map[string]*OutboundHealth{}
	}
	present := map[string]bool{}
	for _, o := range outbounds {
		if o.Tag == "" || !outboundProbeable(o.Protocol) {
			continue
		}
		present[o.Tag] = true
		if h := m.state[o.Tag]; h == nil {
			m.state[o.Tag] = &OutboundHealth{Tag: o.Tag, Protocol: o.Protocol, Alive: true}
		} else {
			h.Protocol = o.Protocol
		}
	}
	for tag := range m.state {
		if !present[tag] {
			delete(m.state, tag)
		}
	}

	full := m.lastFull.IsZero() || now.Sub(m.lastFull) >= outboundFullCheckEvery
	var due []string
	for tag, h := range m.state {
		if full || h.Failures > 0 || !h.Checked {
			due = append(due, tag)
		}
	}
	if len(due) == 0 {
		return nil, nil, nil
	}
	slices.Sort(due)
	if full {
		m.lastFull = now
	}
	return due, m.probe, m.publish
}

func (m *OutboundHealthMonitor) applyTick(now time.Time, due []string, results map[string]OutboundProbeResult, observed func(string) bool, threshold int) []eventbus.Event {
	m.mu.Lock()
	defer m.mu.Unlock()
	var events []eventbus.Event
	for _, tag := range due {
		h := m.state[tag]
		if h == nil {
			continue
		}
		r, answered := results[tag]
		if !answered {
			continue
		}
		h.Checked, h.CheckedAt = true, now.UnixMilli()
		wasAlive := h.Alive
		if r.Success {
			h.Failures, h.Delay, h.Error, h.Alive = 0, r.Delay, "", true
		} else {
			h.Failures++
			h.Error = r.Error
			if h.Failures >= max(threshold, 1) {
				h.Alive = false
			}
		}
		if wasAlive == h.Alive || (observed != nil && observed(tag)) {
			continue
		}
		e := eventbus.Event{
			Type: eventbus.EventOutboundUp, Source: tag, Timestamp: now,
			Data: &eventbus.OutboundHealthData{Delay: h.Delay},
		}
		if !h.Alive {
			e.Type, e.Data = eventbus.EventOutboundDown, &eventbus.OutboundHealthData{Error: h.Error}
		}
		events = append(events, e)
	}
	return events
}

// Snapshot returns every proxy outbound's health, sorted by tag.
func (m *OutboundHealthMonitor) Snapshot() []OutboundHealth {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]OutboundHealth, 0, len(m.state))
	for _, h := range m.state {
		out = append(out, *h)
	}
	slices.SortFunc(out, func(a, b OutboundHealth) int {
		if a.Tag < b.Tag {
			return -1
		}
		if a.Tag > b.Tag {
			return 1
		}
		return 0
	})
	return out
}

// OutboundHealthInputs lists the outbounds of a running config and reports
// which tags its observatory or burst observatory selects (by tag prefix).
func OutboundHealthInputs(cfg *xray.Config) ([]OutboundRef, func(string) bool) {
	var outbounds []struct {
		Tag      string `json:"tag"`
		Protocol string `json:"protocol"`
	}
	_ = json.Unmarshal(cfg.OutboundConfigs, &outbounds)
	refs := make([]OutboundRef, 0, len(outbounds))
	for _, o := range outbounds {
		refs = append(refs, OutboundRef{Tag: o.Tag, Protocol: o.Protocol})
	}
	var prefixes []string
	for _, raw := range []json_util.RawMessage{cfg.Observatory, cfg.BurstObservatory} {
		var obs struct {
			SubjectSelector []string `json:"subjectSelector"`
		}
		if len(raw) > 0 && json.Unmarshal(raw, &obs) == nil {
			prefixes = append(prefixes, obs.SubjectSelector...)
		}
	}
	observed := func(tag string) bool {
		for _, p := range prefixes {
			if p != "" && strings.HasPrefix(tag, p) {
				return true
			}
		}
		return false
	}
	return refs, observed
}
