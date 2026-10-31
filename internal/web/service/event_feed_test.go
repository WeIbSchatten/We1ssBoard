package service

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/eventbus"
)

// Each bus payload type must surface as a readable line with a level the
// dashboard can colour, newest first.
func TestEventFeedTurnsBusEventsIntoDashboardLines(t *testing.T) {
	feed := NewEventFeed(10)
	at := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	feed.HandleEvent(eventbus.Event{
		Type: eventbus.EventOutboundDown, Source: "warp", Timestamp: at,
		Data: &eventbus.OutboundHealthData{Error: "i/o timeout"},
	})
	feed.HandleEvent(eventbus.Event{Type: eventbus.EventNodeUp, Source: "de-1", Timestamp: at.Add(time.Second)})
	feed.HandleEvent(eventbus.Event{
		Type: eventbus.EventCPUHigh, Timestamp: at.Add(2 * time.Second),
		Data: &eventbus.SystemMetricData{Percent: 93.4, Threshold: 80},
	})
	feed.HandleEvent(eventbus.Event{
		Type: eventbus.EventLoginAttempt, Source: "203.0.113.9", Timestamp: at.Add(3 * time.Second),
		Data: &eventbus.LoginEventData{Username: "admin", IP: "203.0.113.9", Status: "fail", Reason: "wrong password"},
	})
	feed.HandleEvent(eventbus.Event{
		Type: eventbus.EventXrayCrash, Timestamp: at.Add(4 * time.Second),
		Data: errors.New("exit status 23").Error(),
	})

	want := []PanelEvent{
		{Type: "xray.crash", Level: "error", Detail: "exit status 23", Time: at.Add(4 * time.Second).UnixMilli()},
		{Type: "login.attempt", Level: "warning", Source: "203.0.113.9", Detail: "admin: wrong password", Time: at.Add(3 * time.Second).UnixMilli()},
		{Type: "cpu.high", Level: "warning", Detail: "93% / 80%", Time: at.Add(2 * time.Second).UnixMilli()},
		{Type: "node.up", Level: "success", Source: "de-1", Time: at.Add(time.Second).UnixMilli()},
		{Type: "outbound.down", Level: "error", Source: "warp", Detail: "i/o timeout", Time: at.UnixMilli()},
	}
	if got := feed.Recent(0); !reflect.DeepEqual(got, want) {
		t.Fatalf("recent =\n%+v\nwant\n%+v", got, want)
	}
	if got := feed.Recent(2); !reflect.DeepEqual(got, want[:2]) {
		t.Fatalf("recent(2) = %+v", got)
	}
}

// A successful login is routine; it stays in the feed at info level, not as a warning.
func TestEventFeedSuccessfulLoginIsInfo(t *testing.T) {
	feed := NewEventFeed(4)
	feed.HandleEvent(eventbus.Event{
		Type: eventbus.EventLoginAttempt, Source: "198.51.100.4",
		Data: &eventbus.LoginEventData{Username: "admin", Status: "success"},
	})
	if got := feed.Recent(1); len(got) != 1 || got[0].Level != "info" || got[0].Detail != "admin" {
		t.Fatalf("successful login = %+v", got)
	}
}

// The feed is a ring: memory stays bounded and the oldest lines drop first.
func TestEventFeedKeepsOnlyNewest(t *testing.T) {
	feed := NewEventFeed(3)
	for i, src := range []string{"a", "b", "c", "d", "e"} {
		feed.HandleEvent(eventbus.Event{Type: eventbus.EventNodeDown, Source: src, Timestamp: time.UnixMilli(int64(i + 1))})
	}
	var got []string
	for _, e := range feed.Recent(0) {
		got = append(got, e.Source)
	}
	if want := []string{"e", "d", "c"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("sources = %v, want %v", got, want)
	}
}
