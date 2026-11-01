package service

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The version dialog polls this snapshot while a geofile update runs: it must
// name the file being fetched, its place in the batch and the bytes so far.
func TestUpdateGeofileReportsProgressWhileDownloading(t *testing.T) {
	bodies := map[string]string{"geoip.dat": "geoip payload", "geosite.dat": strings.Repeat("s", 4096)}
	var midFlight TaskProgress
	mux := http.NewServeMux()
	for asset, body := range bodies {
		tagged := "/a/releases/download/v1/" + asset
		mux.HandleFunc("/a/releases/latest/download/"+asset, func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, tagged, http.StatusFound)
		})
		mux.HandleFunc(tagged, func(w http.ResponseWriter, r *http.Request) {
			if asset == "geosite.dat" {
				midFlight = CurrentTaskProgress()
			}
			w.Header().Set("Content-Length", fmt.Sprint(len(body)))
			_, _ = w.Write([]byte(body))
		})
		sum := sha256.Sum256([]byte(body))
		mux.HandleFunc(tagged+".sha256sum", func(w http.ResponseWriter, r *http.Request) {
			_, _ = fmt.Fprintf(w, "%s  %s\n", hex.EncodeToString(sum[:]), asset)
		})
	}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	geofileTestEnv(t, map[string]geofileEntry{
		"geoip.dat":   {srv.URL + "/a", "geoip.dat", "geoip.dat"},
		"geosite.dat": {srv.URL + "/a", "geosite.dat", "geosite.dat"},
	})
	var restarted bool
	restartStub(t, &restarted)

	if err := (&ServerService{}).UpdateGeofile(""); err != nil {
		t.Fatalf("UpdateGeofile: %v", err)
	}

	if midFlight.Kind != "geofile" || midFlight.Stage != "download" || midFlight.File != "geosite.dat" ||
		midFlight.Step != 2 || midFlight.Steps != 2 {
		t.Fatalf("progress while fetching geosite.dat = %+v, want geofile download of geosite.dat, step 2 of 2", midFlight)
	}
	got := CurrentTaskProgress()
	if got.Stage != "done" || got.Done != 4096 || got.Total != 4096 || got.Error != "" {
		t.Fatalf("final progress = %+v, want done with the last file's 4096 bytes counted", got)
	}
}

// A failed update must say so: the dialog closes its bar on "failed" and shows
// the reason instead of waiting forever.
func TestUpdateGeofileReportsFailure(t *testing.T) {
	srv, _ := geofileServer(t, []fakeUpstream{{
		repo:    "a",
		assets:  map[string]string{"geoip.dat": "good geoip payload"},
		corrupt: map[string]bool{"geoip.dat": true},
	}})
	geofileTestEnv(t, map[string]geofileEntry{"geoip.dat": {srv.URL + "/a", "geoip.dat", "geoip.dat"}})
	var restarted bool
	restartStub(t, &restarted)

	_ = (&ServerService{}).UpdateGeofile("")

	got := CurrentTaskProgress()
	if got.Stage != "failed" || !strings.Contains(got.Error, "checksum") {
		t.Fatalf("progress after a checksum failure = %+v, want stage failed naming the checksum", got)
	}
}
