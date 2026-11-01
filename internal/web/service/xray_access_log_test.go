package service

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/config"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/util/json_util"
)

// The exact active-connection view reads Xray's access log. With the setting on,
// a template that keeps the default "none" (or has no log section) gets the
// panel's own log; a path the admin set is left alone; with it off nothing changes.
func TestWithPanelAccessLog(t *testing.T) {
	panelLog := filepath.Join(config.GetLogFolder(), "access.log")
	custom := filepath.Join(config.GetLogFolder(), "mine.log")
	tests := []struct {
		name    string
		in      string
		enabled bool
		want    map[string]any
	}{
		{
			"default none gets the panel log", `{"access":"none","error":"","loglevel":"warning"}`, true,
			map[string]any{"access": panelLog, "error": "", "loglevel": "warning"},
		},
		{"missing log section gets one", ``, true, map[string]any{"access": panelLog}},
		{
			"empty access gets the panel log", `{"access":"","loglevel":"debug"}`, true,
			map[string]any{"access": panelLog, "loglevel": "debug"},
		},
		{
			"an admin path is kept", `{"access":"` + filepath.ToSlash(custom) + `"}`, true,
			map[string]any{"access": filepath.ToSlash(custom)},
		},
		{"off leaves none alone", `{"access":"none"}`, false, map[string]any{"access": "none"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := withPanelAccessLog(json_util.RawMessage(tt.in), tt.enabled)
			got := map[string]any{}
			if err := json.Unmarshal(out, &got); err != nil {
				t.Fatalf("output %q is not JSON: %v", out, err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("log = %v, want %v", got, tt.want)
			}
		})
	}
}

// On by default after an update; turning the switch off in Settings must stop
// the generated config from carrying the panel's access log.
func TestGetXrayConfigFollowsExactActiveConnectionSetting(t *testing.T) {
	setupConflictDB(t)
	settings := &SettingService{}
	accessOf := func() any {
		t.Helper()
		cfg, err := (&XrayService{}).GetXrayConfig()
		if err != nil {
			t.Fatalf("GetXrayConfig: %v", err)
		}
		log := map[string]any{}
		_ = json.Unmarshal(cfg.LogConfig, &log)
		return log["access"]
	}

	if got, want := accessOf(), filepath.Join(config.GetLogFolder(), "access.log"); got != want {
		t.Fatalf("default access log = %v, want the panel's %v", got, want)
	}

	all, err := settings.GetAllSetting()
	if err != nil {
		t.Fatal(err)
	}
	all.ExactActiveConnection = false
	if err := settings.UpdateAllSetting(all, SecretClears{}); err != nil {
		t.Fatalf("UpdateAllSetting: %v", err)
	}
	if got := accessOf(); got != "none" {
		t.Fatalf("access log with the switch off = %v, want the template's none", got)
	}
}
