package sub

import (
	"strings"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service/portal"
)

const (
	hiddenUUIDA = "11111111-2222-4333-8444-00000000000a"
	hiddenUUIDB = "11111111-2222-4333-8444-00000000000b"
)

// hiddenFixture: a.smirnova on a VLESS inbound with hosts h1/h2 and on a host-less Trojan inbound.
type hiddenFixture struct {
	client        *model.ClientRecord
	vless, trojan *model.Inbound
	h1, h2        *model.Host
}

func seedHiddenFixture(t *testing.T) hiddenFixture {
	t.Helper()
	seedSubDB(t)
	db := database.GetDB()
	f := hiddenFixture{}
	f.client = &model.ClientRecord{Email: "a.smirnova", SubID: "s1", UUID: hiddenUUIDA, Password: "trojan-pw-a", Enable: true}
	if err := db.Create(f.client).Error; err != nil {
		t.Fatal(err)
	}
	f.vless = &model.Inbound{
		UserId: 1, Tag: "v", Enable: true, Listen: "203.0.113.5", Port: 4601, Protocol: model.VLESS, Remark: "v",
		Settings:       `{"clients":[{"id":"` + hiddenUUIDA + `","email":"a.smirnova","subId":"s1","enable":true}],"decryption":"none"}`,
		StreamSettings: `{"network":"tcp","security":"tls","tlsSettings":{"serverName":"base.sni"}}`,
	}
	f.trojan = &model.Inbound{
		UserId: 1, Tag: "t", Enable: true, Listen: "203.0.113.5", Port: 4602, Protocol: model.Trojan, Remark: "t",
		Settings:       `{"clients":[{"password":"trojan-pw-a","email":"a.smirnova","subId":"s1","enable":true}]}`,
		StreamSettings: `{"network":"tcp","security":"tls","tlsSettings":{"serverName":"base.sni"}}`,
	}
	for _, ib := range []*model.Inbound{f.vless, f.trojan} {
		if err := db.Create(ib).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&model.ClientInbound{ClientId: f.client.Id, InboundId: ib.Id}).Error; err != nil {
			t.Fatal(err)
		}
	}
	f.h1 = seedHost(t, &model.Host{InboundId: f.vless.Id, SortOrder: 1, Remark: "H1", Address: "h1.cdn.com", Port: 8443, Security: "tls"})
	f.h2 = seedHost(t, &model.Host{InboundId: f.vless.Id, SortOrder: 2, Remark: "H2", Address: "h2.cdn.com", Port: 8443, Security: "tls"})
	return f
}

func hide(t *testing.T, clientID int, keys ...portal.Key) {
	t.Helper()
	if err := (&portal.Service{}).ReplaceHidden(clientID, keys); err != nil {
		t.Fatalf("ReplaceHidden: %v", err)
	}
}

func renderSub(t *testing.T, format string) string {
	t.Helper()
	switch format {
	case "raw":
		links, _, _, _, err := NewSubService("").GetSubs("s1", "req.example.com")
		if err != nil {
			t.Fatalf("GetSubs: %v", err)
		}
		return strings.Join(links, "\n")
	case "json":
		out, _, err := NewSubJsonService("", "", "", "", NewSubService("")).GetJson("s1", "req.example.com", false)
		if err != nil {
			t.Fatalf("GetJson: %v", err)
		}
		return out
	default:
		out, _, err := NewSubClashService(false, "", NewSubService("")).GetClash("s1", "req.example.com")
		if err != nil {
			t.Fatalf("GetClash: %v", err)
		}
		return out
	}
}

func hasTrojan(format, out string) bool {
	switch format {
	case "raw":
		return strings.Contains(out, "trojan://")
	case "json":
		return strings.Contains(out, `"protocol": "trojan"`) || strings.Contains(out, `"protocol":"trojan"`)
	default:
		return strings.Contains(out, "type: trojan")
	}
}

func TestSubs_HidesKeyInEveryFormat(t *testing.T) {
	for _, format := range []string{"raw", "json", "clash"} {
		t.Run(format+"/host key", func(t *testing.T) {
			f := seedHiddenFixture(t)
			hide(t, f.client.Id, portal.Key{InboundID: f.vless.Id, HostID: f.h1.Id})
			out := renderSub(t, format)
			if strings.Contains(out, "h1.cdn.com") {
				t.Fatalf("hidden host h1 is still in the %s subscription:\n%s", format, out)
			}
			if !strings.Contains(out, "h2.cdn.com") || !hasTrojan(format, out) {
				t.Fatalf("visible keys are missing from the %s subscription:\n%s", format, out)
			}
		})
		t.Run(format+"/host-less key", func(t *testing.T) {
			f := seedHiddenFixture(t)
			hide(t, f.client.Id, portal.Key{InboundID: f.trojan.Id})
			out := renderSub(t, format)
			if hasTrojan(format, out) {
				t.Fatalf("hidden trojan key is still in the %s subscription:\n%s", format, out)
			}
			if !strings.Contains(out, "h1.cdn.com") {
				t.Fatalf("visible vless key is missing from the %s subscription:\n%s", format, out)
			}
		})
	}
}

func TestSubs_SharedSubIDHidesOnlyOwner(t *testing.T) {
	f := seedHiddenFixture(t)
	db := database.GetDB()
	second := &model.ClientRecord{Email: "d.volkov", SubID: "s1", UUID: hiddenUUIDB, Enable: true}
	if err := db.Create(second).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ClientInbound{ClientId: second.Id, InboundId: f.vless.Id}).Error; err != nil {
		t.Fatal(err)
	}
	hide(t, f.client.Id, portal.Key{InboundID: f.vless.Id, HostID: f.h1.Id})

	out := renderSub(t, "raw")
	var ownerH1, secondH1 bool
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "h1.cdn.com") {
			ownerH1 = ownerH1 || strings.Contains(line, hiddenUUIDA)
			secondH1 = secondH1 || strings.Contains(line, hiddenUUIDB)
		}
	}
	if ownerH1 || !secondH1 {
		t.Fatalf("owner h1 = %v (want false), second client h1 = %v (want true):\n%s", ownerH1, secondH1, out)
	}
}

func TestSubs_AllRemainingHiddenShowsEverything(t *testing.T) {
	f := seedHiddenFixture(t)
	hide(t, f.client.Id, portal.Key{InboundID: f.vless.Id, HostID: f.h1.Id})
	db := database.GetDB()
	db.Delete(&model.Host{}, f.h2.Id)
	db.Where("client_id = ? AND inbound_id = ?", f.client.Id, f.trojan.Id).Delete(&model.ClientInbound{})

	out := renderSub(t, "raw")
	if !strings.Contains(out, "h1.cdn.com") {
		t.Fatalf("with every remaining key hidden the subscription must ignore the hidden set:\n%q", out)
	}
}

// h2 is excluded from Clash, so hiding h1 leaves Clash with no key of the client's only inbound.
func TestSubs_FormatWithEveryKeyHiddenStaysWhole(t *testing.T) {
	f := seedHiddenFixture(t)
	db := database.GetDB()
	db.Where("client_id = ? AND inbound_id = ?", f.client.Id, f.trojan.Id).Delete(&model.ClientInbound{})
	f.h2.ExcludeFromSubTypes = []string{"clash"}
	if err := db.Save(f.h2).Error; err != nil {
		t.Fatal(err)
	}
	hide(t, f.client.Id, portal.Key{InboundID: f.vless.Id, HostID: f.h1.Id})

	if out := renderSub(t, "clash"); !strings.Contains(out, "h1.cdn.com") {
		t.Fatalf("clash must ignore the hidden set when it would carry no key of the client:\n%s", out)
	}
	if out := renderSub(t, "raw"); strings.Contains(out, "h1.cdn.com") || !strings.Contains(out, "h2.cdn.com") {
		t.Fatalf("raw still has h2 visible, so h1 must stay hidden there:\n%s", out)
	}
}

func TestPanelLinks_IgnoreHidden(t *testing.T) {
	f := seedHiddenFixture(t)
	hide(t, f.client.Id, portal.Key{InboundID: f.vless.Id, HostID: f.h1.Id})

	links := NewLinkProvider().LinksForClient("req.example.com", f.vless, "a.smirnova")
	if !strings.Contains(strings.Join(links, "\n"), "h1.cdn.com") {
		t.Fatalf("panel links must stay complete: %v", links)
	}
}
