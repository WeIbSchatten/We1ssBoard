package service

import (
	"fmt"
	"sync"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/eventbus"
)

// PanelEvent is one line of the dashboard event feed. Level is error, warning,
// success or info; Time is unix milliseconds.
type PanelEvent struct {
	Type   string `json:"type" example:"node.down"`
	Level  string `json:"level" example:"error"`
	Source string `json:"source" example:"de-1"`
	Detail string `json:"detail" example:"i/o timeout"`
	Time   int64  `json:"time" example:"1793437200000"`
}

// EventFeed keeps the newest bus events in memory for the dashboard; it is
// emptied by a restart, which is fine for a "what just happened" view.
type EventFeed struct {
	mu   sync.Mutex
	ring []PanelEvent
	next int
	full bool
}

func NewEventFeed(capacity int) *EventFeed {
	return &EventFeed{ring: make([]PanelEvent, capacity)}
}

var eventFeed = NewEventFeed(200)

// GetEventFeed returns the feed the web server subscribes to the event bus.
func GetEventFeed() *EventFeed { return eventFeed }

// HandleEvent is the bus subscriber callback.
func (f *EventFeed) HandleEvent(e eventbus.Event) {
	at := e.Timestamp
	if at.IsZero() {
		at = time.Now()
	}
	line := PanelEvent{Type: string(e.Type), Source: e.Source, Time: at.UnixMilli()}
	switch e.Type {
	case eventbus.EventOutboundDown, eventbus.EventNodeDown, eventbus.EventXrayCrash:
		line.Level = "error"
	case eventbus.EventOutboundUp, eventbus.EventNodeUp:
		line.Level = "success"
	default:
		line.Level = "warning"
	}
	switch data := e.Data.(type) {
	case *eventbus.OutboundHealthData:
		line.Detail = data.Error
	case *eventbus.NodeHealthData:
		line.Detail = data.XrayError
	case *eventbus.SystemMetricData:
		line.Detail = fmt.Sprintf("%.0f%% / %d%%", data.Percent, data.Threshold)
	case *eventbus.LoginEventData:
		line.Detail = data.Username
		if data.Status == "success" {
			line.Level = "info"
		} else if data.Reason != "" {
			line.Detail += ": " + data.Reason
		}
	case string:
		line.Detail = data
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	f.ring[f.next] = line
	f.next = (f.next + 1) % len(f.ring)
	if f.next == 0 {
		f.full = true
	}
}

// Recent returns up to limit events, newest first; limit <= 0 means all kept.
func (f *EventFeed) Recent(limit int) []PanelEvent {
	f.mu.Lock()
	defer f.mu.Unlock()
	count := f.next
	if f.full {
		count = len(f.ring)
	}
	if limit <= 0 || limit > count {
		limit = count
	}
	out := make([]PanelEvent, 0, limit)
	for i := 1; i <= limit; i++ {
		out = append(out, f.ring[(f.next-i+len(f.ring))%len(f.ring)])
	}
	return out
}
