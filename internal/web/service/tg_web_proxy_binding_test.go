package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/database/model"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/tgwebproxy"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/tgwebproxy/relaytest"
	"github.com/WeIbSchatten/We1ssBoard/v3/internal/web/runtime"
)

const bindingBaseSecret = "000102030405060708090a0b0c0d0e0f"

func setupBindingTest(t *testing.T) *tgwebproxy.Manager {
	t.Helper()
	setupBulkDB(t)
	m := relaytest.New(t, "proxy.example.com", tgwebproxy.RelayProfile{
		Name: "default", Secret: bindingBaseSecret, Backend: "127.0.0.1:2398",
	})
	t.Cleanup(UseTgWebProxyManager(m))
	return m
}

func createBindingClient(t *testing.T, email, subID string, enable bool) model.ClientRecord {
	t.Helper()
	rec := model.ClientRecord{Email: email, SubID: subID, UUID: "uuid-" + email, Enable: enable}
	if err := database.GetDB().Create(&rec).Error; err != nil {
		t.Fatalf("create client %s: %v", email, err)
	}
	if !enable {
		if err := database.GetDB().Model(&rec).Update("enable", false).Error; err != nil {
			t.Fatalf("disable client %s: %v", email, err)
		}
	}
	return rec
}

func relayProfile(t *testing.T, m *tgwebproxy.Manager, name string) (tgwebproxy.RelayProfile, bool) {
	t.Helper()
	snap, err := m.Store().Load()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range snap.Profiles {
		if p.Name == name {
			return p, true
		}
	}
	return tgwebproxy.RelayProfile{}, false
}

func TestBindDedicatedGivesTheClientItsOwnProfileSecret(t *testing.T) {
	m := setupBindingTest(t)
	createBindingClient(t, "alice", "sub-a", true)
	createBindingClient(t, "bob", "sub-b", true)
	svc := &TgWebProxyService{}

	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "alice", ProfileName: "default", Dedicated: true}); err != nil {
		t.Fatalf("bind alice: %v", err)
	}
	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "bob", ProfileName: "default", Dedicated: true}); err != nil {
		t.Fatalf("bind bob: %v", err)
	}
	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatalf("sync: %v", err)
	}

	alice, okA := relayProfile(t, m, tgwebproxy.DedicatedProfileName("alice"))
	bob, okB := relayProfile(t, m, tgwebproxy.DedicatedProfileName("bob"))
	if !okA || !okB {
		t.Fatalf("dedicated profiles missing: alice=%v bob=%v", okA, okB)
	}
	if alice.Secret == bindingBaseSecret || alice.Secret == bob.Secret {
		t.Fatalf("secrets not unique: base=%s alice=%s bob=%s", bindingBaseSecret, alice.Secret, bob.Secret)
	}
}

func TestClientLinksUseSharedOrDedicatedSecretAndSkipDisabled(t *testing.T) {
	m := setupBindingTest(t)
	createBindingClient(t, "shared", "sub-1", true)
	createBindingClient(t, "own", "sub-1", true)
	createBindingClient(t, "off", "sub-1", false)
	createBindingClient(t, "unbound", "sub-1", true)
	createBindingClient(t, "other-sub", "sub-2", true)
	svc := &TgWebProxyService{}
	for _, req := range []TgWebProxyBindRequest{
		{Email: "shared", ProfileName: "default"},
		{Email: "own", ProfileName: "default", Dedicated: true},
		{Email: "off", ProfileName: "default"},
		{Email: "other-sub", ProfileName: "default"},
	} {
		if _, err := svc.BindClient(req); err != nil {
			t.Fatalf("bind %s: %v", req.Email, err)
		}
	}

	links, err := svc.ClientLinksBySubId("sub-1")
	if err != nil {
		t.Fatalf("links: %v", err)
	}
	if len(links) != 1 || links[0].Email != "shared" {
		t.Fatalf("before sync links = %+v, want only the shared binding (dedicated profile not created yet, disabled client skipped)", links)
	}
	wantShared := "https://t.me/webproxy?server=proxy.example.com&secret=" + bindingBaseSecret
	if links[0].Link != wantShared {
		t.Fatalf("shared link = %q, want %q", links[0].Link, wantShared)
	}

	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatalf("sync: %v", err)
	}
	own, _ := relayProfile(t, m, tgwebproxy.DedicatedProfileName("own"))
	links, err = svc.ClientLinksBySubId("sub-1")
	if err != nil {
		t.Fatalf("links: %v", err)
	}
	got := map[string]string{}
	for _, l := range links {
		got[l.Email] = l.Link
	}
	if len(got) != 2 || got["shared"] != wantShared {
		t.Fatalf("after sync links = %v, want shared+own", got)
	}
	if want := "secret=" + own.Secret; !strings.HasSuffix(got["own"], want) {
		t.Fatalf("dedicated link = %q, want it to carry the client's own secret (%s)", got["own"], want)
	}
}

func TestBindClientRejectsUnknownClientAndProfile(t *testing.T) {
	setupBindingTest(t)
	createBindingClient(t, "alice", "sub-a", true)
	svc := &TgWebProxyService{}

	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "nobody", ProfileName: "default"}); err == nil || !strings.Contains(err.Error(), "nobody") {
		t.Fatalf("unknown client error = %v, want the email named", err)
	}
	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "alice", ProfileName: "missing"}); err == nil || !strings.Contains(err.Error(), `"missing"`) {
		t.Fatalf("unknown profile error = %v, want the profile named", err)
	}
	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "alice", ProfileName: tgwebproxy.DedicatedProfileName("bob")}); err == nil {
		t.Fatal("binding to a managed per-client profile was accepted")
	}
}

func TestBindClientRemoteRequiresDedicated(t *testing.T) {
	setupBindingTest(t)
	createBindingClient(t, "alice", "sub-a", true)
	nodeID := 9
	svc := &TgWebProxyService{}
	_, err := svc.BindClient(TgWebProxyBindRequest{
		Email: "alice", ProfileName: "default", NodeId: &nodeID,
	})
	if err == nil || !strings.Contains(err.Error(), "dedicated") {
		t.Fatalf("remote shared bind error = %v, want dedicated required", err)
	}
}

func TestBindClientReplacesExistingBinding(t *testing.T) {
	setupBindingTest(t)
	createBindingClient(t, "alice", "sub-a", true)
	svc := &TgWebProxyService{}
	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "alice", ProfileName: "default"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "alice", ProfileName: "default", Dedicated: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatal(err)
	}
	list, err := svc.ListBindings()
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Bindings) != 1 || !list.Bindings[0].Dedicated || list.Bindings[0].EffectiveProfile != tgwebproxy.DedicatedProfileName("alice") {
		t.Fatalf("bindings = %+v, want one dedicated binding", list.Bindings)
	}
	if list.Bindings[0].Secret == "" || list.Bindings[0].Link == "" {
		t.Fatalf("bindings should expose live secret/link, got %+v", list.Bindings[0])
	}
	if list.Bindings[0].Secret == bindingBaseSecret {
		t.Fatalf("dedicated binding must not reuse the shared secret: %q", list.Bindings[0].Secret)
	}
}

func TestUnbindThenSyncRemovesDedicatedProfile(t *testing.T) {
	m := setupBindingTest(t)
	createBindingClient(t, "alice", "sub-a", true)
	svc := &TgWebProxyService{}
	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "alice", ProfileName: "default", Dedicated: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := svc.UnbindClient("alice"); err != nil {
		t.Fatalf("unbind: %v", err)
	}
	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, ok := relayProfile(t, m, tgwebproxy.DedicatedProfileName("alice")); ok {
		t.Fatal("dedicated profile survived unbind")
	}
	links, err := svc.ClientLinksBySubId("sub-a")
	if err != nil || len(links) != 0 {
		t.Fatalf("links after unbind = %+v, %v; want none", links, err)
	}
}

func TestSyncDropsBindingsOfDeletedClients(t *testing.T) {
	m := setupBindingTest(t)
	rec := createBindingClient(t, "alice", "sub-a", true)
	svc := &TgWebProxyService{}
	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "alice", ProfileName: "default", Dedicated: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := database.GetDB().Delete(&model.ClientRecord{}, rec.Id).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatalf("sync: %v", err)
	}
	if _, ok := relayProfile(t, m, tgwebproxy.DedicatedProfileName("alice")); ok {
		t.Fatal("dedicated profile of a deleted client survived")
	}
	var n int64
	database.GetDB().Model(&model.ClientTgWebProxy{}).Count(&n)
	if n != 0 {
		t.Fatalf("%d orphan binding rows left behind", n)
	}
}

func TestProfileInUseCannotBeDeletedOrRenamed(t *testing.T) {
	setupBindingTest(t)
	createBindingClient(t, "alice", "sub-a", true)
	svc := &TgWebProxyService{}
	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "alice", ProfileName: "default"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.DeleteProfile(context.Background(), "default"); err == nil || !strings.Contains(err.Error(), "bound") {
		t.Fatalf("DeleteProfile error = %v, want a bound-client refusal", err)
	}
	renamed := tgwebproxy.RelayProfile{Name: "renamed", Secret: bindingBaseSecret, Backend: "127.0.0.1:2398"}
	if _, err := svc.UpdateProfile(context.Background(), "default", renamed); err == nil || !strings.Contains(err.Error(), "bound") {
		t.Fatalf("UpdateProfile rename error = %v, want a bound-client refusal", err)
	}
}

func TestBindingChangesAreSyncedAfterDebounce(t *testing.T) {
	m := setupBindingTest(t)
	for _, email := range []string{"a", "b", "c"} {
		createBindingClient(t, email, "sub-"+email, true)
	}
	prev := tgWebProxySyncDelay
	tgWebProxySyncDelay = 20 * time.Millisecond
	t.Cleanup(func() { tgWebProxySyncDelay = prev })

	svc := &TgWebProxyService{}
	for _, email := range []string{"a", "b", "c"} {
		if _, err := svc.BindClient(TgWebProxyBindRequest{Email: email, ProfileName: "default", Dedicated: true}); err != nil {
			t.Fatal(err)
		}
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		_, okA := relayProfile(t, m, tgwebproxy.DedicatedProfileName("a"))
		_, okB := relayProfile(t, m, tgwebproxy.DedicatedProfileName("b"))
		_, okC := relayProfile(t, m, tgwebproxy.DedicatedProfileName("c"))
		if okA && okB && okC {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("debounced sync never created the profiles: a=%v b=%v c=%v", okA, okB, okC)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func writeRelayOK(w http.ResponseWriter, obj any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "msg": "", "obj": obj})
}

// Remote dedicated sync provisions a node-scoped inbound, pushes SyncDedicated
// to the EU panel, and exposes an EU share host in subscription links.
func TestRemoteDedicatedSyncAndSubscriptionShareHost(t *testing.T) {
	setupBindingTest(t)
	createBindingClient(t, "eu-client", "sub-eu", true)

	const euHost = "eu-proxy.example.com"
	const euSecret = "aabbccddeeff00112233445566778899"
	var mu sync.Mutex
	var syncBodies [][]byte
	profiles := map[string]tgwebproxy.RelayProfile{
		"default": {Name: "default", Secret: bindingBaseSecret, Backend: "127.0.0.1:2398"},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/panel/api/tgWebProxy/config", func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		list := make([]tgwebproxy.RelayProfile, 0, len(profiles))
		for _, p := range profiles {
			list = append(list, p)
		}
		mu.Unlock()
		writeRelayOK(w, tgwebproxy.RelaySnapshot{
			ConfigExists: true,
			Config:       tgwebproxy.RelayConfig{PublicHostname: euHost},
			Profiles:     list,
		})
	})
	mux.HandleFunc("/panel/api/tgWebProxy/syncDedicated", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		syncBodies = append(syncBodies, append([]byte(nil), body...))
		var req struct {
			Specs []tgwebproxy.DedicatedSpec `json:"specs"`
		}
		_ = json.Unmarshal(body, &req)
		for _, spec := range req.Specs {
			name := tgwebproxy.DedicatedProfileName(spec.Email)
			secret := spec.Secret
			if secret == "" {
				secret = euSecret
			}
			backend := spec.Backend
			if backend == "" {
				backend = "127.0.0.1:2398"
			}
			profiles[name] = tgwebproxy.RelayProfile{Name: name, Secret: secret, Backend: backend}
		}
		mu.Unlock()
		writeRelayOK(w, tgwebproxy.RelayApplyResult{})
	})
	mux.HandleFunc("/panel/api/tgWebProxy/share/", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/panel/api/tgWebProxy/share/")
		mu.Lock()
		p, ok := profiles[name]
		mu.Unlock()
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "msg": "profile not found"})
			return
		}
		info, err := tgwebproxy.BuildShareInfo(euHost, "", p)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeRelayOK(w, info)
	})
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)

	node := reconcileTestNode(t, ts, "eu-relay", "all", nil)
	if err := database.GetDB().Model(node).Update("panel_version", "v1.10.1").Error; err != nil {
		t.Fatalf("set panel version: %v", err)
	}
	node.PanelVersion = "v1.10.1"
	runtime.SetManager(runtime.NewManager(runtime.LocalDeps{}))
	t.Cleanup(func() { runtime.SetManager(nil) })

	svc := &TgWebProxyService{}
	nodeID := node.Id
	if _, err := svc.BindClient(TgWebProxyBindRequest{
		Email: "eu-client", ProfileName: "default", Dedicated: true, NodeId: &nodeID,
	}); err != nil {
		t.Fatalf("bind: %v", err)
	}

	links, err := svc.ClientLinksBySubId("sub-eu")
	if err != nil {
		t.Fatalf("links before sync: %v", err)
	}
	if len(links) != 0 {
		t.Fatalf("before sync links = %+v, want none (dedicated profile not on EU yet)", links)
	}

	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatalf("sync: %v", err)
	}

	mu.Lock()
	nSync := len(syncBodies)
	mu.Unlock()
	if nSync != 1 {
		t.Fatalf("syncDedicated calls = %d, want 1", nSync)
	}

	links, err = svc.ClientLinksBySubId("sub-eu")
	if err != nil {
		t.Fatalf("links after sync: %v", err)
	}
	if len(links) != 1 || links[0].Email != "eu-client" {
		t.Fatalf("after sync links = %+v, want eu-client", links)
	}
	if !strings.Contains(links[0].Link, "server="+euHost) {
		t.Fatalf("link = %q, want EU hostname %s", links[0].Link, euHost)
	}
	if strings.Contains(links[0].Link, "server=proxy.example.com") {
		t.Fatalf("link still points at the local relay host: %q", links[0].Link)
	}
}

func TestLocalDedicatedBindingUnaffectedByRemotePath(t *testing.T) {
	m := setupBindingTest(t)
	createBindingClient(t, "local-only", "sub-local", true)
	svc := &TgWebProxyService{}
	if _, err := svc.BindClient(TgWebProxyBindRequest{
		Email: "local-only", ProfileName: "default", Dedicated: true,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatal(err)
	}
	p, ok := relayProfile(t, m, tgwebproxy.DedicatedProfileName("local-only"))
	if !ok {
		t.Fatal("local dedicated profile missing")
	}
	links, err := svc.ClientLinksBySubId("sub-local")
	if err != nil || len(links) != 1 {
		t.Fatalf("links = %+v, %v", links, err)
	}
	if !strings.Contains(links[0].Link, "proxy.example.com") {
		t.Fatalf("local link = %q, want local relay host", links[0].Link)
	}
	if p.Secret == bindingBaseSecret {
		t.Fatal("dedicated local binding reused the shared secret")
	}
	var row model.ClientTgWebProxy
	if err := database.GetDB().Joins("JOIN clients c ON c.id = client_tg_web_proxy.client_id").
		Where("c.email = ?", "local-only").First(&row).Error; err != nil {
		t.Fatalf("binding row: %v", err)
	}
	if row.NodeId != nil {
		t.Fatalf("local binding NodeId = %v, want nil", row.NodeId)
	}
}

func TestDisabledClientLosesItsDedicatedSecretOnTheBackend(t *testing.T) {
	m := setupBindingTest(t)
	rec := createBindingClient(t, "carol", "sub-c", true)
	svc := &TgWebProxyService{}
	if _, err := svc.BindClient(TgWebProxyBindRequest{Email: "carol", ProfileName: "default", Dedicated: true}); err != nil {
		t.Fatalf("bind: %v", err)
	}
	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatalf("sync: %v", err)
	}
	before, _ := relayProfile(t, m, tgwebproxy.DedicatedProfileName("carol"))
	if err := database.GetDB().Model(&rec).Update("enable", false).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SyncBindings(context.Background()); err != nil {
		t.Fatalf("sync after disable: %v", err)
	}
	after, ok := relayProfile(t, m, tgwebproxy.DedicatedProfileName("carol"))
	if !ok || after.Backend != tgwebproxy.SuspendedBackend || after.Secret != before.Secret {
		t.Fatalf("disabled client's profile = %+v (was %+v), want its secret parked on %s", after, before, tgwebproxy.SuspendedBackend)
	}
}
