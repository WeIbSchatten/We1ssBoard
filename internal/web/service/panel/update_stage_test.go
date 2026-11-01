package panel

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/config"
)

// updateScriptFunctions cuts the named shell functions out of the real
// update.sh, so the test runs the exact code that writes the status file.
func updateScriptFunctions(t *testing.T, names ...string) string {
	t.Helper()
	src, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "update.sh"))
	if err != nil {
		t.Fatal(err)
	}
	var out string
	for _, name := range names {
		re := regexp.MustCompile(`(?ms)^` + regexp.QuoteMeta(name) + `\(\) \{\n.*?^\}\n`)
		fn := re.Find(src)
		if fn == nil {
			t.Fatalf("update.sh has no %s() function", name)
		}
		out += string(fn)
	}
	return out
}

// The progress bar reads the current step from the status file update.sh writes
// mid-run; a step the panel cannot parse would leave the bar frozen at zero.
func TestGetUpdateStatusReadsStageWrittenByUpdateScript(t *testing.T) {
	bash, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}
	t.Setenv("XUI_DB_FOLDER", t.TempDir())
	statusFile := config.GetUpdateStatusFilePath()

	script := updateScriptFunctions(t, "_write_update_status", "_write_update_stage") +
		"xui_update_run_id=1735689600123456789\n" +
		"xui_update_status_file=\"$1\"\n" +
		"_write_update_stage install\n"
	cmd := exec.Command(bash, "-c", script, "bash", filepath.ToSlash(statusFile))
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("run update.sh stage writer: %v\n%s", err, out)
	}

	got := (&PanelService{}).GetUpdateStatus()
	if got.RunID != "1735689600123456789" || got.State != updateStatePending || got.Stage != "install" {
		t.Fatalf("status = %+v, want run 1735689600123456789 pending at stage install", got)
	}
}
