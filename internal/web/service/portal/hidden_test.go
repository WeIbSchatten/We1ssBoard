package portal

import (
	"errors"
	"reflect"
	"testing"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/service"
)

func addInbound(t *testing.T, tag string, port int, excluded bool) *model.Inbound {
	t.Helper()
	ib := &model.Inbound{
		UserId: 1, Tag: tag, Enable: true, Port: port, Protocol: model.VLESS, Remark: tag,
		Settings: `{"clients":[]}`, StreamSettings: "{}", ExcludeFromSub: excluded,
	}
	if err := database.GetDB().Create(ib).Error; err != nil {
		t.Fatal(err)
	}
	return ib
}

func attach(t *testing.T, clientID, inboundID int, createdAt int64) {
	t.Helper()
	row := &model.ClientInbound{ClientId: clientID, InboundId: inboundID, CreatedAt: createdAt}
	if err := database.GetDB().Create(row).Error; err != nil {
		t.Fatal(err)
	}
}

func addHost(t *testing.T, inboundID int, remark string, disabled bool) *model.Host {
	t.Helper()
	h := &model.Host{InboundId: inboundID, Remark: remark, IsDisabled: disabled}
	if err := database.GetDB().Create(h).Error; err != nil {
		t.Fatal(err)
	}
	return h
}

// keysFixture: inbound A without hosts, B with hosts h1 and disabled h2, C excluded from subscriptions.
type keysFixture struct {
	client  *model.ClientRecord
	a, b, c *model.Inbound
	h1, h2  *model.Host
	svc     *Service
}

func newKeysFixture(t *testing.T) keysFixture {
	t.Helper()
	initPortalDB(t)
	f := keysFixture{client: addClient(t, "a.smirnova", "correct-horse"), svc: New(&service.SettingService{})}
	f.a = addInbound(t, "A", 10001, false)
	f.b = addInbound(t, "B", 10002, false)
	f.c = addInbound(t, "C", 10003, true)
	f.h1 = addHost(t, f.b.Id, "B via CDN", false)
	f.h2 = addHost(t, f.b.Id, "B spare", true)
	for _, ib := range []*model.Inbound{f.a, f.b, f.c} {
		attach(t, f.client.Id, ib.Id, 0)
	}
	return f
}

func TestClientKeys(t *testing.T) {
	f := newKeysFixture(t)
	got, err := f.svc.ClientKeys(f.client.Id)
	if err != nil {
		t.Fatal(err)
	}
	want := []KeyInfo{
		{Key: Key{f.a.Id, 0}, Remark: "A", Protocol: "vless"},
		{Key: Key{f.b.Id, f.h1.Id}, Remark: "B via CDN", Protocol: "vless"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ClientKeys = %+v\nwant %+v", got, want)
	}
}

func TestReplaceHidden(t *testing.T) {
	cases := []struct {
		name    string
		keys    func(f keysFixture) []Key
		wantErr error
		hidden  func(f keysFixture) []Key
	}{
		{name: "hide one", keys: func(f keysFixture) []Key { return []Key{{f.b.Id, f.h1.Id}} }, hidden: func(f keysFixture) []Key { return []Key{{f.b.Id, f.h1.Id}} }},
		{name: "hide all", keys: func(f keysFixture) []Key { return []Key{{f.a.Id, 0}, {f.b.Id, f.h1.Id}} }, wantErr: ErrNothingVisible},
		{name: "excluded inbound is not the client's key", keys: func(f keysFixture) []Key { return []Key{{f.c.Id, 0}} }, wantErr: ErrForeignKey},
		{name: "disabled host is not the client's key", keys: func(f keysFixture) []Key { return []Key{{f.b.Id, f.h2.Id}} }, wantErr: ErrForeignKey},
		{name: "empty clears", keys: func(f keysFixture) []Key { return nil }, hidden: func(f keysFixture) []Key { return nil }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newKeysFixture(t)
			if err := f.svc.ReplaceHidden(f.client.Id, []Key{{f.a.Id, 0}}); err != nil {
				t.Fatal(err)
			}
			err := f.svc.ReplaceHidden(f.client.Id, tc.keys(f))
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if tc.wantErr != nil {
				return
			}
			infos, _ := f.svc.ClientKeys(f.client.Id)
			var hidden []Key
			for _, k := range infos {
				if k.Hidden {
					hidden = append(hidden, k.Key)
				}
			}
			if !reflect.DeepEqual(hidden, tc.hidden(f)) {
				t.Fatalf("hidden = %v, want %v", hidden, tc.hidden(f))
			}
		})
	}
}

func TestHiddenBySubID_IgnoresStaleRows(t *testing.T) {
	t.Run("client re-attached to the inbound", func(t *testing.T) {
		f := newKeysFixture(t)
		if err := f.svc.ReplaceHidden(f.client.Id, []Key{{f.a.Id, 0}}); err != nil {
			t.Fatal(err)
		}
		var row model.ClientSubHidden
		database.GetDB().Where("client_id = ?", f.client.Id).First(&row)
		database.GetDB().Where("client_id = ? AND inbound_id = ?", f.client.Id, f.a.Id).Delete(&model.ClientInbound{})
		attach(t, f.client.Id, f.a.Id, row.CreatedAt+1)

		set, err := f.svc.HiddenBySubID(f.client.SubID)
		if err != nil {
			t.Fatal(err)
		}
		if set.Has("a.smirnova", Key{f.a.Id, 0}) {
			t.Fatal("hiding survived a detach and re-attach")
		}
	})
	t.Run("host deleted", func(t *testing.T) {
		f := newKeysFixture(t)
		if err := f.svc.ReplaceHidden(f.client.Id, []Key{{f.b.Id, f.h1.Id}}); err != nil {
			t.Fatal(err)
		}
		set, _ := f.svc.HiddenBySubID(f.client.SubID)
		if !set.Has("A.Smirnova", Key{f.b.Id, f.h1.Id}) {
			t.Fatal("live hiding is not reported (email lookup must ignore case)")
		}
		database.GetDB().Delete(&model.Host{}, f.h1.Id)
		set, _ = f.svc.HiddenBySubID(f.client.SubID)
		if set.Has("a.smirnova", Key{f.b.Id, f.h1.Id}) {
			t.Fatal("hiding of a deleted host still applies")
		}
	})
}

func TestHiddenBySubID_PerClient(t *testing.T) {
	f := newKeysFixture(t)
	second := &model.ClientRecord{Email: "d.volkov", SubID: f.client.SubID, Enable: true}
	if err := database.GetDB().Create(second).Error; err != nil {
		t.Fatal(err)
	}
	attach(t, second.Id, f.a.Id, 0)
	if err := f.svc.ReplaceHidden(f.client.Id, []Key{{f.a.Id, 0}}); err != nil {
		t.Fatal(err)
	}
	set, err := f.svc.HiddenBySubID(f.client.SubID)
	if err != nil {
		t.Fatal(err)
	}
	if !set.Has("a.smirnova", Key{f.a.Id, 0}) || set.Has("d.volkov", Key{f.a.Id, 0}) {
		t.Fatalf("set = %v: hiding must belong to the client that hid", set)
	}
}
