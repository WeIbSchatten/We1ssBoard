package service

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func accessLine(at time.Time, inbound, email string) string {
	return at.Format("2006/01/02 15:04:05.000000") +
		" from 203.0.113.9:51514 accepted tcp:example.com:443 [" + inbound + " >> direct] email: " + email + "\n"
}

func appendLog(t *testing.T, path, text string) {
	t.Helper()
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if _, err := f.WriteString(text); err != nil {
		t.Fatal(err)
	}
}

// Each read must report only lines appended since the last one, keyed email ->
// inbound tag -> sighting time, and skip lines with no client email.
func TestAccessLogTailReadsOnlyNewLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "access.log")
	at := time.Date(2026, 10, 31, 12, 0, 0, 0, time.Local)
	appendLog(t, path, accessLine(at, "in-old", "user1"))

	var tail accessLogTail
	first := tail.read(path)
	if want := (map[string]map[string]int64{"user1": {"in-old": at.UnixMilli()}}); !reflect.DeepEqual(first, want) {
		t.Fatalf("first read = %v, want %v", first, want)
	}

	later := at.Add(5 * time.Second)
	appendLog(t, path, accessLine(later, "in-vless", "user1")+
		at.Format("2006/01/02 15:04:05.000000")+" from 127.0.0.1:1 accepted tcp:127.0.0.1:62789 [api -> api]\n"+
		accessLine(later, "in-trojan", "user2"))
	want := map[string]map[string]int64{
		"user1": {"in-vless": later.UnixMilli()},
		"user2": {"in-trojan": later.UnixMilli()},
	}
	if got := tail.read(path); !reflect.DeepEqual(got, want) {
		t.Fatalf("second read = %v, want %v", got, want)
	}
}

// A line Xray is still writing has no newline yet; it must be read once it is
// complete instead of being half-parsed now and skipped later.
func TestAccessLogTailWaitsForCompleteLine(t *testing.T) {
	path := filepath.Join(t.TempDir(), "access.log")
	at := time.Date(2026, 10, 31, 12, 0, 0, 0, time.Local)
	line := accessLine(at, "in-vless", "user1")
	appendLog(t, path, line[:40])

	var tail accessLogTail
	if got := tail.read(path); len(got) != 0 {
		t.Fatalf("partial line read = %v, want nothing", got)
	}
	appendLog(t, path, line[40:])
	if want := (map[string]map[string]int64{"user1": {"in-vless": at.UnixMilli()}}); !reflect.DeepEqual(tail.read(path), want) {
		t.Fatalf("completed line was not read")
	}
}

// The clear-logs job truncates the file; the next read must start over rather
// than wait for the file to grow past the old offset.
func TestAccessLogTailRestartsAfterTruncate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "access.log")
	at := time.Date(2026, 10, 31, 12, 0, 0, 0, time.Local)
	appendLog(t, path, accessLine(at, "in-a", "user1")+accessLine(at, "in-a", "user1"))

	var tail accessLogTail
	tail.read(path)
	if err := os.Truncate(path, 0); err != nil {
		t.Fatal(err)
	}
	appendLog(t, path, accessLine(at, "in-b", "user2"))

	if want := (map[string]map[string]int64{"user2": {"in-b": at.UnixMilli()}}); !reflect.DeepEqual(tail.read(path), want) {
		t.Fatalf("read after truncate did not start over")
	}
}

// A huge backlog (first start on a busy server) is capped to its newest part.
func TestAccessLogTailCapsBacklog(t *testing.T) {
	path := filepath.Join(t.TempDir(), "access.log")
	at := time.Date(2026, 10, 31, 12, 0, 0, 0, time.Local)
	appendLog(t, path, accessLine(at, "in-first", "first"))
	filler := accessLine(at, "in-old", "old")
	var backlog []byte
	for len(backlog) <= accessLogTailMaxRead {
		backlog = append(backlog, filler...)
	}
	appendLog(t, path, string(backlog)+accessLine(at, "in-new", "new"))

	var tail accessLogTail
	got := tail.read(path)
	if _, ok := got["new"]; !ok {
		t.Fatalf("newest line missing from capped read")
	}
	if _, ok := got["first"]; ok {
		t.Fatalf("read reached the start of a backlog larger than the cap")
	}
	if want := map[string]int64{"in-old": at.UnixMilli()}; !reflect.DeepEqual(got["old"], want) {
		t.Fatalf("old sightings = %v, want only whole lines parsed", got["old"])
	}
}
