# Changelog

Every We1ssBoard release, newest first. The panel's **Update** dialog shows the
entries between your version and the new one, and each GitHub release carries
its own entry. A Russian copy lives in [CHANGELOG.ru_RU.md](CHANGELOG.ru_RU.md).

Sections: **Added** (new features), **Changed** (behaviour that works
differently now), **Fixed** (bugs), **Removed**, **Breaking** (needs action from
you or breaks an old setup), **Known issues** (problems found after the release
and the version that fixes them).

## [Unreleased]

### Added
- Two new styles in **Appearance**: **Obsidian** (black glass cards, chrome headings, Inter Tight) and **Energy** (after Red Bull cans, Titillium Web, italic headings with a livery stripe). Energy comes in six series: Classic, Sugarfree, Winter Edition, Coconut Edition, Tropical Edition and Red Edition, each with light, dark and AMOLED.
- Drawn backgrounds behind the panel, painted in the current style's colours: Relief, Waves, Mountains, Sakura, Stars, Ribbons, Network, Track and Can, or Plain. Each style keeps its own background and opacity (0–90%).
- A new **Overview** dashboard. Below the Xray status bar: key figures (online now, traffic today, inbounds, nodes, what needs attention), a traffic chart for 24 hours, 7 days or 30 days, a **Needs attention** list with a link to where each problem is fixed, the busiest inbounds, who is connected now and through which inbound, nodes, outbound health, top clients for the current limit period, and a feed of recent events (outbounds and nodes going down or up, Xray crashes, CPU and memory alarms, logins). The resource tiles, live speed and connection stats stay.
- Traffic history: the panel now records the traffic of every inbound, its own and its nodes', per hour and keeps 32 days of it (`GET /panel/api/server/trafficHistory/{24h,7d,30d}`). Recording starts after the update, so the chart begins empty. Recent events are available at `GET /panel/api/server/events`.

### Changed
- Appearance opens only from the palette button in the sidebar; the account menu no longer has it.
- The soft glow behind the panel is gone; styles now default to a drawn background (Monochrome: Relief, Pastel: Sakura, Ocean: Waves, Emerald: Network, Obsidian: Stars, Energy: Can). Pick Plain to get the old flat look.
- On the Clients page the **Attached inbounds** column is now **Active connection**: the protocol and inbound each online client is using right now. With the Xray access log on it comes from the log and is exact; without it the panel infers it from the attached inbounds that carried traffic and shows the chip dashed. Nodes report their own data to the main panel; older nodes get the inferred view. The client info window shows both.

## [1.9.1] - 2026-10-23

### Breaking
- XDRIVE follows Xray-core 26.10.21: it runs only for VLESS with VLESS
  Encryption ("decryption" on the inbound, "encryption" on the outbound), with no
  "flow", on a single port, and an outbound only over Mux. The panel offers XDRIVE
  only for VLESS, refuses to save an inbound without decryption and turns Mux on
  when an outbound picks XDRIVE. An XDRIVE inbound or outbound saved earlier that
  the core refuses is left out of the running config with a warning in the log
  instead of stopping every other inbound: add VLESS Encryption to it (**Generate
  keys → Generate** in its VLESS settings) and hand clients the new link.
- A DNS Lua "script" can no longer be combined with disableFallback,
  disableFallbackIfMatch, enableParallelQuery, or a server's domains,
  skipFallback or finalQuery. Saving such a template is refused; a stored one runs
  without the script, with a warning in the log.

### Added
- XDNS finalmask resolvers take DoH addresses (`https://`) with workers, TLS and
  QUIC settings; the mask editor edits all of them.
- Finalmask `filter` on inbounds: allow or block source IPs for TCP and UDP.
  Share links and JSON subscriptions leave it out, since it only applies on the
  server.
- A Lua script for noise masks; the mask editor gets a Script field.
- XMUX settings for XDRIVE and MASQUE outbounds.

### Changed
- The Go module `xray-core` moves to the 26.10.21 commit, the same version as the
  bundled core, so the panel validates configs the way the running core does.
- XDRIVE's service "Google Drive" is now stored as "google-drive" (the old name
  still reads).

### Fixed
- With a routing Lua script set, Xray-core 26.10.21 refused to start because the
  panel always writes routing rules (its api rule included). Xray-core 26.10.10
  ignored those rules beside a script, so the panel now leaves them out of the
  running config and the script keeps routing, as it did before.

## [1.9.0] - 2026-10-23

### Breaking
- A child panel with a self-signed certificate can only be enrolled with an invite it
  generated on 1.9.0 or later (the invite must carry the certificate pin).
  Update the child, or give it a publicly trusted certificate.

### Added
- **Update** dialog shows the changelog between the installed version and the
  new one, in English or Russian depending on the panel language.
- Node tabs on the Clients and Connections → Inbounds pages: **Local panel**
  plus one tab per connected node (with an online dot). Each tab has its own
  list, stat cards and traffic totals, so a node's rows and traffic no longer
  mix into the local numbers. The open tab is kept in the address (`?node=`).
- `node=local|<id>` parameter of `GET /panel/api/clients/list/paged`: scopes the
  page, total and summary to one tab.
- **Select all (N)** in Telegram WEB Proxy → *Add to subscriptions*. It skips
  clients that already have a web-proxy binding and clients that exist only on
  a connected node's inbounds.
- `GET /panel/api/server/getChangelog` returns the parsed changelog for the
  update dialog.
- Release notes: every GitHub release now carries its CHANGELOG entry in
  English and Russian.
- README: Telegram WEB Proxy installation and setup, including running the
  relay on a node and managing it from the main panel.

### Changed
- The panel is built with Go 1.27.3, which distrusts the compromised intermediate
  certificates in `crypto/x509` (GO-2026-6809); the REALITY target scan verifies
  certificates with it.
- Bundled Xray-core 26.10.21. XTLS withdrew 26.10.10 and 26.10.17 because they
  trusted compromised intermediate certificates; 26.10.21 drops them and is built
  with Go 1.27.3. Release builds had started failing on the deleted download.
- The clients and inbounds tables fit their card: columns are sized to their
  content and, when the window is too narrow, the least-read columns hide in a
  fixed order. The **Columns** menu shows such a column unchecked and locked
  with a "not enough room" hint until the window is wide enough again.
- The speed tag in tables shows upload and download on two lines, so the speed
  column is 128 px wide instead of 216 px.
- Repository layout: Docker scripts moved to `docker/`, service units and the
  OpenRC script to `packaging/`, contributor documents to `.github/`.
  `install.sh` and `update.sh` still find the units of older tags at the old
  paths.

### Removed
- The **Nodes** filter in the clients filter drawer and the node dropdown on
  the inbounds page; the node tabs replace them.

### Fixed
- Enrolling a node from an invite no longer trusts any TLS certificate. The child
  answers with an admin API token, so anyone on the path could read the one-time code
  and the token. Invites of https panels now carry their certificate's SHA-256; the
  master sends the code only to a publicly trusted certificate or one matching that
  pin, and keeps a self-signed node in `pin` TLS mode. Invite addresses must be
  plain http(s) URLs (CodeQL #10, #11).
- The release workflow's version gate runs with a read-only token (CodeQL #14).
- The clients and inbounds tables overflowed their card on windows narrower than
  about 1600 px and clipped the last columns (speed, duration) at the card's edge.
- The API Docs page bundled DOMPurify 3.4.16, which has three critical advisories
  (GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr, GHSA-c6gr-qvv4-5v3f); it now ships 3.4.17.

### Known issues
- Xray-core 26.10.21 shipped in this release is more than a certificate update:
  it refuses XDRIVE without VLESS Encryption and Mux, a routing Lua script next to
  routing rules, and some DNS script combinations. On such configs Xray did not
  start. Fixed in 1.9.1.


## [1.8.4] - 2026-10-20

### Added
- `install.sh` and `update.sh` write `/etc/sysctl.d/99-quic.conf`: UDP socket
  buffers (`rmem/wmem_default` 4 MiB, `max` 16 MiB) and BBR when the kernel
  offers it, then restart the panel so Xray reopens its sockets with the new
  buffers. Hysteria with salamander obfuscation got 208 KiB buffers before,
  dropped packets and lost most of its speed. Opt out with
  `XUI_QUIC_TUNING=false`. A host that already has the file from the manual fix
  converges on it; an unchanged file causes no restart.

### Fixed
- `migrate-3xui.sh` stopped after 3x-ui was already stopped and disabled when
  We1ssBoard failed to start, so the automatic rollback never ran and the server
  was left without a proxy. It now waits for the service, prints the panel's
  last log lines and restores 3x-ui.
- 3x-ui import aborted with "auth is not any value 3x-ui had" when a client's
  password or auth in the 3x-ui clients table differed from the copy in the
  inbound JSON. The table value (the one 3x-ui actually uses) is kept and a
  warning names the field.

## [1.8.3] - 2026-10-19

### Added
- Documentation: migration from 3x-ui and FullBoard, moving servers, SQLite to
  PostgreSQL, the Android app, REALITY client compatibility with Xray 26.9.8+
  and the Xray version pin, running the web-proxy relay on a node.
- The sidebar **Documentation** link opens the docs site in the panel language.
- CI starts every built APK on an emulator, signs in to a real panel and opens
  every screen.

### Fixed
- The Android app (1.8.2) crashed on launch: R8 renamed the WorkManager
  database class that phone alerts need.

## [1.8.2] - 2026-10-19

### Fixed
- A panel update replaced the Xray core with the bundled one, silently undoing
  an operator's switch to an older core (for example 26.7.28 for REALITY
  clients without an X25519MLKEM768 key share). Installing a specific version
  now pins it, and the panel reinstalls the pinned core on start. The Xray
  version dialog shows the pin with a button to return to the bundled version
  (`POST /panel/api/server/unpinXray`). "latest" is never pinned.

### Known issues
- The Android APK of this release crashes on launch. Fixed in 1.8.3.

## [1.8.1] - 2026-10-19

### Added
- Dashboard card with the status of every Telegram WEB Proxy relay this panel
  uses: its own and each node's (running, ready, profiles, bound clients,
  MTProxy backends). `GET /panel/api/tgWebProxy/overview`. Also in the app.

### Fixed
- A relay host with its own bindings and a master pushing bindings to it deleted
  each other's client profiles every minute, so the relay restarted and dropped
  all connections every minute. Managed profiles now have an owner (the host or
  a master) and a sync only touches its own.

## [1.8.0] - 2026-10-19

### Added
- Android app, signed APK attached to every release:
  - every settings tab of the web panel, for this panel and for remote nodes,
    with test sends for Telegram, Discord and email;
  - API tokens, logs, Xray version and geofile updates, panel self-update,
    database backup;
  - full client management (all form fields, IP log, HWID devices, bulk
    actions, groups);
  - inbound create and edit for every protocol, transport, TLS and REALITY;
  - Connections hub: outbounds, routing rules with a route tester, balancers,
    DNS, the Xray template as JSON, Telegram WEB Proxy;
  - Nodes & hosts: add, edit, test, enroll from an invite, remote status, logs,
    restart Xray or the node panel, sign in to the node panel;
  - phone alerts when Xray or a node goes down (checked about every 15 minutes,
    no push server needed) and a fingerprint/face/PIN lock;
  - the panel's 13 languages, themes and style presets, several panels.

### Changed
- The appearance palettes moved into a module the web panel and the app share.

### Fixed
- golangci findings (errorlint, noctx, usestdlibvars) that kept CI red.

## [1.7.1] - 2026-10-19

### Fixed
- Updating a FullBoard install failed with "attempt to write a readonly
  database" when an earlier aborted update had already created
  `/etc/we1ssboard`. The migration now merges the old folders into existing new
  ones, refuses before stopping anything when a file exists in both, and
  repairs installs that 1.7.0 left split.

### Changed
- README screenshots retaken under the We1ssBoard brand.

## [1.7.0] - 2026-10-19

### Breaking
- The panel is renamed from FullBoard to **We1ssBoard**: Go module path, binary,
  CLI (`we1ssboard`), systemd/OpenRC units, default paths (`/usr/local`, `/etc`,
  `/var/log`), release assets and Docker image. `update.sh` moves an existing
  FullBoard install once and leaves symlinks at the old paths, so stored
  certificate paths and the `fullboard` command keep working. Tags before 1.7.0
  cannot be installed with the new scripts. `install.sh` refuses to install
  next to a FullBoard panel and points to `fullboard update`.

### Added
- Mobile app (Expo) for Android: overview with Xray/panel restarts, clients,
  inbounds, nodes, Telegram WEB Proxy profiles.
- Telegram bot: `/nodes` and `/webproxy` for admins (node state, latency,
  CPU/RAM, Xray version, last error; relay host, profiles, bound clients, last
  sync error).
- Telegram WEB Proxy on a node: add, edit and delete its profiles from the node
  tab, and add a profile to many clients' subscriptions at once
  (`POST /panel/api/tgWebProxy/bindings/bindMany`).
- Ocean (blue) and Emerald (green) colour presets.
- New logo and wordmark.

### Fixed
- The "profile is bound" guard counted bindings of every relay by name: a client
  on a node's "default" blocked deleting the master's "default", while a node
  profile in use could be deleted. The guard is now per relay.

### Known issues
- An update that was aborted once left the install split between the old and
  new folders. Fixed in 1.7.1.

## [1.6.1] - 2026-10-18

### Fixed
- `fullboard legacy` rejected every 1.x release (3x-ui's v2.3.5 floor) and
  re-ran first-install setup. It now updates in place to the chosen version.
- A tag on a commit without the version bump produced a Windows-only release
  marked Latest, which broke installs and the panel updater for everyone. The
  release is now created once every platform is built.
- 3x-ui import: a client on two protocols failed verification ("id changed from
  to …"), and a running 3x-ui could fail the test import. Every merged field is
  now checked against all entries of that email, read from the snapshot.
- `migrate-3xui.sh` waits for a yes when the test import printed warnings
  (`--yes` keeps unattended runs).

## [1.6.0] - 2026-10-18

### Added
- Migration from 3x-ui: `fullboard import-3xui` and `migrate-3xui.sh` take a
  read-only snapshot, migrate a copy, compare every row against the source,
  then switch panels with a full backup; `rollback` restores 3x-ui byte for
  byte.
- Subscription page in the panel's look (brand mark, light/dark/AMOLED, style
  presets, interface size).
- Colour-coded key labels in subscriptions, QR and client info: protocol,
  transport, TLS/REALITY, encryption, Vision flow, Hysteria2 obfuscation; links
  without any encryption get a red "No encryption" label.

### Fixed
- Clients disabled in a 3x-ui v2 database came back enabled after the upgrade.

## [1.5.0] - 2026-10-18

### Added
- Sync with 3x-ui v3.10.2: Xray-core 26.10.10, XDRIVE, MASQUE, Hysteria2 Gecko
  obfuscation in Clash, VLESS encryption by default, crash report capture,
  userspace TUN fallback, node-admin API token scope.

### Fixed
- Hysteria port hopping silently stopped for outbounds and JSON subscriptions
  since Xray 26.9.9: the panel wrote the dead `quicParams.udpHop` key instead of
  the `udphop` mask, so all traffic went over one UDP flow. A database migration
  rewrites existing settings.
- Admin and node-admin bearer tokens keep their scope over mTLS, so the remote
  node panel works; a certificate alone stays node-sync.

### Changed
- Bundled Xray-core 26.10.10 (26.9.30 does not understand the new udphop, xdns
  and MASQUE config).

## [1.4.8] - 2026-10-17

### Changed
- Navigation regrouped into hubs with tabs on top: Clients (Clients, Groups),
  Subscriptions, Connections (Inbounds, Outbounds, Routing, Balancers, DNS, TG
  Web Proxy), Nodes & hosts, Notifications (Telegram, Discord, Email), Settings
  (Panel, Security, Xray core, Xray JSON). Every old address redirects.

## [1.4.7] - 2026-10-17

Not published as a separate release; shipped in 1.4.8.

### Changed
- One MTProxy process serves all managed ports (up to 16 secrets each) instead
  of a process plus worker per port; on a 1-vCPU host the old layout held 432
  sockets to :8888 and burned CPU while idle.
- The Telegram WEB Proxy Service panel is always open.
- The left section rail tried in this version was reverted; section tabs stay
  on top.

## [1.4.6] - 2026-10-17

### Removed
- The automatic TCP profile from 1.4.4. Install and update remove it and restore
  kernel defaults. BBR + fq is opt-in with `XUI_NET_TUNING=true` or the
  `fullboard` menu.

### Changed
- Leftover 3x-ui names removed from READMEs and tests.

## [1.4.5] - 2026-10-17

### Added
- Interface size (Auto, 90–150 %): on 2K/4K screens Auto zooms the panel
  instead of leaving a narrow column with huge gutters. Charts stay sharp and
  aligned.
- Pastel style preset and an Appearance menu (style, theme, interface size).
- Columns picker for the clients and inbounds tables, remembered per browser.
- Keyboard shortcuts: `/` focuses the page search, `g` + letter opens a page,
  `?` lists them.

## [1.4.4] - 2026-10-17

Not published as a separate release; shipped in 1.4.5.

### Added
- Own logo instead of the inherited 3X mark; favicon under the web base path.
- Docs in the panel's monochrome look, a Performance page, invite-based node
  enrollment, new README.

### Changed
- `install.sh` and `update.sh` enable BBR, fq and larger TCP buffers by default.

### Fixed
- The Telegram WEB Proxy Overview tab crashed on hosts where the relay is not
  supported.

### Known issues
- The automatic TCP profile made speed and latency worse on at least one
  production host. Removed in 1.4.6.

## [1.4.3] - 2026-10-17

### Added
- The panel runs official MTProxy backends for every web-proxy profile (up to
  16 secrets per port, ports closed to the outside). A second profile no longer
  points at a port nobody listens on, and dedicated secrets work (mtg only
  accepted FakeTLS secrets: "incorrect first byte of secret").
- A disabled client's dedicated secret is parked instead of served.

### Fixed
- Pasting a node invite always failed with "request body failed validation".
- Caddy validation ran without caddy.service's environment, so every WebSocket
  fix was rejected; the patch is now applied once a WebSocket profile exists.
- A relay installed later from the panel could not write `/etc/tproxy-server`
  (read-only file system): install and update create it up front.

## [1.4.2] - 2026-10-16

### Added
- "Cats fixing the connection" public site preset and a template picker.

### Fixed
- Dedicated sync re-enabled clients the panel had disabled or that ran out of
  traffic or time.
- The relay crash-looped once the public site was activated: files were written
  `0600 root`, unreadable for the relay user.

## [1.4.1] - 2026-10-16

### Changed
- A local MTProxy backend is dialled directly on 127.0.0.1; Route via outbound
  only tunnels public MTProxy addresses.
- The managed public site moved to `/srv/tproxy-site` (readable by the relay
  user); the default page is an app sign-up camouflage page. A customised old
  site is carried over.

### Removed
- The unused tproxy-local freedom outbound.

## [1.4.0] - 2026-10-16

### Added
- DreamCut redesign: one monochrome palette for light, dark and AMOLED; grouped
  collapsible sidebar; top bar with page titles; account menu with logout;
  mobile drawer; sticky save bar with an unsaved-changes dot in Settings and
  Xray.

### Fixed
- The public site preview in Telegram WEB Proxy stayed blank.
- The TG proxy node picker showed on panels without nodes.
- Muted text and the light warning colour reach WCAG AA contrast.

## [1.3.1] - 2026-10-12

### Fixed
- Saving custom CSS stripped the Appearance "hide" flags.
- Enroll invites used an empty base when no Web Domain was set; they fall back
  to the browser host.
- Page tabs stay horizontal under top navigation.

## [1.3.0] - 2026-10-12

### Added
- Connections hub for inbounds, outbounds and Telegram WEB Proxy.
- One-time enroll invites: a child panel mints an invite the master pastes to
  register the node.
- Appearance toggles to hide menu items (Routing hidden by default).

## [1.2.1] - 2026-10-12

### Added
- Dedicated web-proxy bindings from the master to a node's relay: the master
  provisions the secret on the node and puts the node's link into the client's
  subscription.

## [1.2.0] - 2026-10-12

### Changed
- Glass-style panel chrome: floating sidebar, top bar with search and
  breadcrumbs, ambient background.

## [1.1.7] - 2026-10-10

### Fixed
- Route via outbound dialled 127.0.0.1 through the remote hop, so HTTPS died
  while the outbound check passed.
- Caddy's encode stalled the WebSocket carrier; it is disabled for the relay.
- Releases are published as stable instead of prerelease.

## [1.1.6] - 2026-10-10

### Fixed
- Saving a profile patched the Caddyfile with mode 0600 and crashed Caddy. The
  patch is no longer automatic, is validated before it replaces the file, and
  Caddy is reloaded or restarted.
- Top navigation compacted.

## [1.1.5] - 2026-10-10

### Fixed
- Fix Caddy failed under the systemd sandbox; the top navigation flashed on
  first paint.

## [1.1.4] - 2026-10-10

### Added
- Custom CSS presets and a top navigation option.

### Fixed
- Under the systemd sandbox the panel could not write `/etc/tproxy-server` and
  left the relay config `root:root`, so tproxy-server failed after a restart.

## [1.1.3] - 2026-10-10

### Added
- Automatic MTProto backends for dedicated web-proxy secrets.

### Fixed
- Dedicated MTProto settings wiped the client's subscription ID.
- The sidebar showed 3.9.0 for every release; the version file must now match
  the tag.

## [1.1.2] - 2026-10-09

### Fixed
- CI and docs build fixes; documentation trimmed to English and Russian.

## [1.1.1] - 2026-10-09

### Added
- Drag-and-drop manual client order.
- Client web-proxy binding on its own tab of the client form; live secrets on
  bindings and profiles; egress IP check for routed profiles.

### Fixed
- Remote Xray settings arrived as a JSON string.
- Xray config check failed without geo files.

## [1.1.0] - 2026-10-09

### Added
- Remote panel administration through the node proxy with login tickets.
- Client ↔ web-proxy profile bindings with links in the raw subscription.
- Route via outbound tunnels, managed public site stub, custom CSS docs.

## [1.0.1] - 2026-10-09

### Fixed
- The relay's Go module cache under systemd-run.

## [1.0.0] - 2026-10-09

First release, forked from 3x-ui.

### Added
- Custom CSS for the panel and login page.
- Remote node panel management and cross-server outbound chains.
- Telegram WEB Proxy (tproxy-server) management.
