package service

import (
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/eventbus"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/json_util"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/xray"
)

type fakeProbe struct {
	calls [][]string
	fail  map[string]bool
}

func (f *fakeProbe) probe(tags []string) map[string]OutboundProbeResult {
	f.calls = append(f.calls, append([]string(nil), tags...))
	out := map[string]OutboundProbeResult{}
	for _, tag := range tags {
		if f.fail[tag] {
			out[tag] = OutboundProbeResult{Error: "i/o timeout"}
		} else {
			out[tag] = OutboundProbeResult{Success: true, Delay: 120}
		}
	}
	return out
}

var healthOutbounds = []OutboundRef{
	{Tag: "direct", Protocol: "freedom"},
	{Tag: "blocked", Protocol: "blackhole"},
	{Tag: "warp", Protocol: "wireguard"},
	{Tag: "fin", Protocol: "vless"},
}

func newTestMonitor(p *fakeProbe, events *[]eventbus.Event) *OutboundHealthMonitor {
	return &OutboundHealthMonitor{
		probe:   p.probe,
		publish: func(e eventbus.Event) { *events = append(*events, e) },
	}
}

// Proxies are checked on the first run and then every 10 minutes; direct and
// blackhole outbounds cannot be probed and are never sent to the prober.
func TestOutboundHealthChecksProxiesEveryTenMinutes(t *testing.T) {
	p := &fakeProbe{}
	var events []eventbus.Event
	m := newTestMonitor(p, &events)
	at := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

	m.Tick(at, healthOutbounds, nil, 3)
	m.Tick(at.Add(time.Minute), healthOutbounds, nil, 3)
	m.Tick(at.Add(10*time.Minute), healthOutbounds, nil, 3)

	if want := [][]string{{"fin", "warp"}, {"fin", "warp"}}; !reflect.DeepEqual(p.calls, want) {
		t.Fatalf("probe calls = %v, want a full check at 0 and 10 minutes only", p.calls)
	}
	snap := m.Snapshot()
	if len(snap) != 2 || !snap[0].Alive || snap[0].Delay != 120 || snap[0].CheckedAt != at.Add(10*time.Minute).UnixMilli() {
		t.Fatalf("snapshot = %+v", snap)
	}
}

// A failing outbound is rechecked every minute; it is reported down only after
// the configured number of failures in a row, once, and up again once it answers.
func TestOutboundHealthRechecksFailuresAndReportsTransitions(t *testing.T) {
	p := &fakeProbe{fail: map[string]bool{"warp": true}}
	var events []eventbus.Event
	m := newTestMonitor(p, &events)
	at := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

	for i := range 4 {
		m.Tick(at.Add(time.Duration(i)*time.Minute), healthOutbounds, nil, 3)
	}
	if want := [][]string{{"fin", "warp"}, {"warp"}, {"warp"}, {"warp"}}; !reflect.DeepEqual(p.calls, want) {
		t.Fatalf("probe calls = %v, want warp rechecked every minute", p.calls)
	}
	if len(events) != 1 || events[0].Type != eventbus.EventOutboundDown || events[0].Source != "warp" {
		t.Fatalf("events after 4 failures = %+v, want one outbound.down for warp", events)
	}
	warp := m.Snapshot()[1]
	if warp.Tag != "warp" || warp.Alive || warp.Error != "i/o timeout" || warp.Failures != 4 {
		t.Fatalf("warp = %+v, want down with its error", warp)
	}

	p.fail = nil
	m.Tick(at.Add(4*time.Minute), healthOutbounds, nil, 3)
	if len(events) != 2 || events[1].Type != eventbus.EventOutboundUp {
		t.Fatalf("events after recovery = %+v, want outbound.up", events)
	}
}

// Observatory already reports its own tags; reporting them again would send
// every notification twice.
func TestOutboundHealthLeavesObservatoryTagsToObservatory(t *testing.T) {
	p := &fakeProbe{fail: map[string]bool{"warp": true}}
	var events []eventbus.Event
	m := newTestMonitor(p, &events)
	at := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	observed := func(tag string) bool { return tag == "warp" }

	for i := range 3 {
		m.Tick(at.Add(time.Duration(i)*time.Minute), healthOutbounds, observed, 3)
	}
	if len(events) != 0 {
		t.Fatalf("events = %+v, want none for an observatory tag", events)
	}
}

// An outbound removed from the config disappears from the card.
func TestOutboundHealthDropsRemovedOutbounds(t *testing.T) {
	p := &fakeProbe{}
	var events []eventbus.Event
	m := newTestMonitor(p, &events)
	at := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	m.Tick(at, healthOutbounds, nil, 3)

	m.Tick(at.Add(time.Minute), healthOutbounds[:3], nil, 3)

	var tags []string
	for _, h := range m.Snapshot() {
		tags = append(tags, h.Tag)
	}
	if !slices.Equal(tags, []string{"warp"}) {
		t.Fatalf("tags = %v, want only warp left", tags)
	}
}

// The running config tells which outbounds exist and which tags the observatory
// watches: its subjectSelector entries are tag prefixes.
func TestOutboundHealthReadsTheRunningConfig(t *testing.T) {
	cfg := &xray.Config{
		OutboundConfigs: json_util.RawMessage(`[{"tag":"direct","protocol":"freedom"},{"tag":"warp-1","protocol":"wireguard"},{"tag":"fin","protocol":"vless"}]`),
		Observatory:     json_util.RawMessage(`{"subjectSelector":["warp"]}`),
	}
	refs, observed := OutboundHealthInputs(cfg)
	want := []OutboundRef{{Tag: "direct", Protocol: "freedom"}, {Tag: "warp-1", Protocol: "wireguard"}, {Tag: "fin", Protocol: "vless"}}
	if !reflect.DeepEqual(refs, want) {
		t.Fatalf("refs = %+v", refs)
	}
	if !observed("warp-1") || observed("fin") {
		t.Fatal("observatory selector must cover warp-1 and not fin")
	}
}

// When the whole probe fails (bad test URL, temp Xray did not start) there are
// no answers; that says nothing about the outbounds and must not mark them down.
func TestOutboundHealthIgnoresAProbeThatAnsweredNothing(t *testing.T) {
	var events []eventbus.Event
	m := &OutboundHealthMonitor{
		probe:   func([]string) map[string]OutboundProbeResult { return nil },
		publish: func(e eventbus.Event) { events = append(events, e) },
	}
	at := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	for i := range 4 {
		m.Tick(at.Add(time.Duration(i)*time.Minute), healthOutbounds, nil, 3)
	}
	for _, h := range m.Snapshot() {
		if !h.Alive || h.Failures != 0 || h.Checked {
			t.Fatalf("%s = %+v, want untouched", h.Tag, h)
		}
	}
	if len(events) != 0 {
		t.Fatalf("events = %+v, want none", events)
	}
}
