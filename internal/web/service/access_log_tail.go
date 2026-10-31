package service

import (
	"bytes"
	"io"
	"os"
	"sync"
)

// accessLogTailMaxRead bounds one read so a first start on a busy server parses
// only the newest part of the backlog instead of the whole file.
const accessLogTailMaxRead = 4 << 20

// accessLogTail follows Xray's access log between traffic polls and reports which
// inbound each client email came in through.
type accessLogTail struct {
	mu     sync.Mutex
	path   string
	offset int64
}

// read returns email -> inbound tag -> newest sighting (unix ms) for the
// complete lines appended since the previous read.
func (t *accessLogTail) read(path string) map[string]map[string]int64 {
	t.mu.Lock()
	defer t.mu.Unlock()
	if path != t.path {
		t.path, t.offset = path, 0
	}
	if path == "" || path == "none" {
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil
	}
	size := info.Size()
	if size < t.offset {
		t.offset = 0
	}
	start, skipFirst := t.offset, false
	if size-start > accessLogTailMaxRead {
		start, skipFirst = size-accessLogTailMaxRead, true
	}
	buf := make([]byte, size-start)
	if _, err := f.ReadAt(buf, start); err != nil && err != io.EOF {
		return nil
	}
	end := bytes.LastIndexByte(buf, '\n')
	if end < 0 {
		t.offset = start
		return nil
	}
	t.offset = start + int64(end) + 1
	buf = buf[:end]
	if skipFirst {
		nl := bytes.IndexByte(buf, '\n')
		if nl < 0 {
			return nil
		}
		buf = buf[nl+1:]
	}

	seen := make(map[string]map[string]int64)
	for line := range bytes.SplitSeq(buf, []byte{'\n'}) {
		entry := parseAccessLogFields(string(line))
		if entry.Email == "" || entry.Inbound == "" || entry.DateTime.IsZero() {
			continue
		}
		at := entry.DateTime.UnixMilli()
		tags := seen[entry.Email]
		if tags == nil {
			tags = make(map[string]int64, 1)
			seen[entry.Email] = tags
		}
		if at > tags[entry.Inbound] {
			tags[entry.Inbound] = at
		}
	}
	return seen
}
