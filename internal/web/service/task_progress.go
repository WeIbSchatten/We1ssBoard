package service

import (
	"io"
	"sync"
	"sync/atomic"
	"time"
)

// TaskProgress is the state of the Xray or geofile update running on this panel,
// which the version dialog polls to draw its progress bar.
type TaskProgress struct {
	// Kind is "xray" or "geofile"; empty when nothing has run since start.
	Kind string `json:"kind" example:"geofile"`
	// Stage is download, verify, install, restart, done or failed.
	Stage string `json:"stage" example:"download"`
	File  string `json:"file" example:"geosite.dat"`
	// Step and Steps place File in a batch, counting from 1.
	Step  int `json:"step" example:"2"`
	Steps int `json:"steps" example:"6"`
	// Done and Total are bytes of File; Total is 0 when the server sent no length.
	Done      int64  `json:"done" example:"1048576"`
	Total     int64  `json:"total" example:"4194304"`
	Error     string `json:"error,omitempty" example:""`
	UpdatedAt int64  `json:"updatedAt" example:"1793437200000"`
}

type taskTracker struct {
	mu   sync.Mutex
	cur  TaskProgress
	done atomic.Int64
}

var serverTasks = &taskTracker{}

// CurrentTaskProgress returns the latest Xray or geofile update progress.
func CurrentTaskProgress() TaskProgress {
	serverTasks.mu.Lock()
	defer serverTasks.mu.Unlock()
	p := serverTasks.cur
	p.Done = serverTasks.done.Load()
	return p
}

func (t *taskTracker) begin(kind string, steps int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.cur = TaskProgress{Kind: kind, Steps: steps, UpdatedAt: time.Now().UnixMilli()}
	t.done.Store(0)
}

func (t *taskTracker) stage(stage string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.cur.Stage = stage
	t.cur.UpdatedAt = time.Now().UnixMilli()
}

// nextFile starts downloading the next file of the batch.
func (t *taskTracker) nextFile(name string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.cur.Stage = "download"
	t.cur.File = name
	t.cur.Step++
	if t.cur.Step > t.cur.Steps {
		t.cur.Steps = t.cur.Step
	}
	t.cur.Total = 0
	t.cur.UpdatedAt = time.Now().UnixMilli()
	t.done.Store(0)
}

// setTotal records the size the server announced for the current file; -1 means unknown.
func (t *taskTracker) setTotal(total int64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.cur.Total = max(total, 0)
}

func (t *taskTracker) finish(err error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if err != nil {
		t.cur.Stage = "failed"
		t.cur.Error = err.Error()
	} else {
		t.cur.Stage = "done"
	}
	t.cur.UpdatedAt = time.Now().UnixMilli()
}

// count wraps a download body so every read adds to the bytes reported for the current file.
func (t *taskTracker) count(r io.Reader) io.Reader {
	return countingReader{r: r, done: &t.done}
}

type countingReader struct {
	r    io.Reader
	done *atomic.Int64
}

func (c countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.done.Add(int64(n))
	return n, err
}
