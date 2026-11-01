#!/bin/bash

red='\033[0;31m'
green='\033[0;32m'
blue='\033[0;34m'
yellow='\033[0;33m'
plain='\033[0m'

xui_folder="${XUI_MAIN_FOLDER:=/usr/local/we1ssboard}"
# A FullBoard (pre-1.7.0) panel hands its own folder to this script; the install moves beside it.
if [[ "${xui_folder##*/}" == "fullboard" ]]; then
    xui_folder="${xui_folder%/*}/we1ssboard"
    XUI_MAIN_FOLDER="${xui_folder}"
fi
xui_service="${XUI_SERVICE:=/etc/systemd/system}"

# Don't edit this config
b_source="${BASH_SOURCE[0]}"
while [ -h "$b_source" ]; do
    b_dir="$(cd -P "$(dirname "$b_source")" > /dev/null 2>&1 && pwd || pwd -P)"
    b_source="$(readlink "$b_source")"
    [[ $b_source != /* ]] && b_source="$b_dir/$b_source"
done
cur_dir="$(cd -P "$(dirname "$b_source")" > /dev/null 2>&1 && pwd || pwd -P)"
script_name=$(basename "$0")

# Check command exist function
_command_exists() {
    type "$1" &> /dev/null
}

# Fail, log and exit script function
_fail() {
    local msg=${1}
    echo -e "${red}${msg}${plain}"
    exit 2
}

# Records this run's outcome for the panel's web updater to poll, since it
# launches this script detached and has no other way to learn whether it
# finished. Written to a fixed path outside XUI_MAIN_FOLDER so it survives
# the update regardless of what happens to that folder. The EXIT trap below
# covers every exit path in this file, including the bare `exit 1`/`exit 2`
# calls that don't go through _fail.
xui_update_run_id="${XUI_UPDATE_RUN_ID:-0}"
[[ "${xui_update_run_id}" =~ ^[0-9]+$ ]] || xui_update_run_id="0"
xui_update_status_file="${XUI_UPDATE_STATUS_FILE:-/etc/we1ssboard/update-status.json}"

_write_update_status() {
    local state="$1"
    local exit_code="$2"
    local stage="${3:-}"
    local status_dir
    status_dir="$(dirname "${xui_update_status_file}")"
    mkdir -p "${status_dir}" > /dev/null 2>&1
    local tmp_file="${xui_update_status_file}.tmp.$$"
    printf '{"runId":"%s","state":"%s","stage":"%s","exitCode":%s,"finishedAt":%s}\n' \
        "${xui_update_run_id}" "${state}" "${stage}" "${exit_code}" "$(date +%s)" > "${tmp_file}" 2> /dev/null
    mv -f "${tmp_file}" "${xui_update_status_file}" > /dev/null 2>&1
}

# The panel's update dialog draws its progress bar from the step written here.
_write_update_stage() {
    _write_update_status "pending" "0" "$1"
}

_report_update_exit() {
    local code=$?
    if [[ "${code}" -eq 0 ]]; then
        _write_update_status "success" "0"
    else
        _write_update_status "failed" "${code}"
    fi
}
trap _report_update_exit EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

# check root
[[ $EUID -ne 0 ]] && _fail "FATAL ERROR: Please run this script with root privilege."

if _command_exists curl; then
    curl_bin=$(which curl)
else
    _fail "ERROR: Command 'curl' not found."
fi

# Check OS and set release variable
if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    release=$ID
elif [[ -f /usr/lib/os-release ]]; then
    source /usr/lib/os-release
    release=$ID
else
    _fail "Failed to check the system OS, please contact the author!"
fi
echo "The OS release is: $release"

arch() {
    case "$(uname -m)" in
        x86_64 | x64 | amd64) echo 'amd64' ;;
        i*86 | x86) echo '386' ;;
        armv8* | armv8 | arm64 | aarch64) echo 'arm64' ;;
        armv7* | armv7 | arm) echo 'armv7' ;;
        armv6* | armv6) echo 'armv6' ;;
        armv5* | armv5) echo 'armv5' ;;
        s390x) echo 's390x' ;;
        *) echo -e "${red}Unsupported CPU architecture!${plain}" && rm -f "${cur_dir}/${script_name}" > /dev/null 2>&1 && exit 2 ;;
    esac
}

echo "Arch: $(arch)"

gen_random_string() {
    local length="$1"
    openssl rand -base64 $((length * 2)) \
        | tr -dc 'a-zA-Z0-9' \
        | head -c "$length"
}

xui_env_file_path() {
    case "${release}" in
        ubuntu | debian | armbian)
            echo "/etc/default/we1ssboard"
            ;;
        arch | manjaro | parch | alpine)
            echo "/etc/conf.d/we1ssboard"
            ;;
        *)
            echo "/etc/sysconfig/we1ssboard"
            ;;
    esac
}

load_xui_env() {
    local env_file
    env_file="$(xui_env_file_path)"
    if [[ -r "$env_file" ]]; then
        set -a
        # shellcheck disable=SC1090
        source "$env_file"
        set +a
    fi
}

install_base() {
    echo -e "${green}Updating and install dependency packages...${plain}"
    case "${release}" in
        ubuntu | debian | armbian)
            apt-get update > /dev/null 2>&1 && apt-get install -y -q cron curl tar tzdata socat openssl > /dev/null 2>&1
            ;;
        fedora | amzn | virtuozzo | rhel | almalinux | rocky | ol)
            dnf makecache -y > /dev/null 2>&1 && dnf install -y -q cronie curl tar tzdata socat openssl > /dev/null 2>&1
            ;;
        centos)
            if [[ "${VERSION_ID}" =~ ^7 ]]; then
                yum makecache -y > /dev/null 2>&1 && yum install -y -q cronie curl tar tzdata socat openssl > /dev/null 2>&1
            else
                dnf makecache -y > /dev/null 2>&1 && dnf install -y -q cronie curl tar tzdata socat openssl > /dev/null 2>&1
            fi
            ;;
        arch | manjaro | parch)
            pacman -Sy --noconfirm cronie curl tar tzdata socat openssl > /dev/null 2>&1
            ;;
        opensuse-tumbleweed | opensuse-leap)
            zypper refresh > /dev/null 2>&1 && zypper -q install -y cron curl tar timezone socat openssl > /dev/null 2>&1
            ;;
        alpine)
            apk update > /dev/null 2>&1 && apk add dcron curl tar tzdata socat openssl > /dev/null 2>&1
            ;;
        *)
            apt-get update > /dev/null 2>&1 && apt install -y -q cron curl tar tzdata socat openssl > /dev/null 2>&1
            ;;
    esac
}

config_after_update() {
    local panel_needs_restart=0

    echo -e "${yellow}we1ssboard settings:${plain}"
    ${xui_folder}/we1ssboard setting -show true
    ${xui_folder}/we1ssboard migrate

    # Properly detect empty cert by checking if cert: line exists and has content after it
    local existing_cert=$(${xui_folder}/we1ssboard setting -getCert true 2> /dev/null | grep 'cert:' | awk -F': ' '{print $2}' | tr -d '[:space:]')
    local existing_port=$(${xui_folder}/we1ssboard setting -show true | grep -Eo 'port: .+' | awk '{print $2}')
    local existing_webBasePath=$(${xui_folder}/we1ssboard setting -show true | grep -Eo 'webBasePath: .+' | awk '{print $2}' | sed 's#^/##')

    # Get server IP
    local URL_lists=(
        "https://api4.ipify.org"
        "https://ipv4.icanhazip.com"
        "https://v4.api.ipinfo.io/ip"
        "https://ipv4.myexternalip.com/raw"
        "https://4.ident.me"
        "https://check-host.net/ip"
    )
    local server_ip=""
    for ip_address in "${URL_lists[@]}"; do
        local response=$(curl -s -w "\n%{http_code}" --max-time 3 "${ip_address}" 2> /dev/null)
        local http_code=$(echo "$response" | tail -n1)
        local ip_result=$(echo "$response" | head -n-1 | tr -d '[:space:]"')
        if [[ "${http_code}" == "200" && "${ip_result}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            server_ip="${ip_result}"
            break
        fi
    done

    # Only used to print the access URL; never prompt, the web updater has no TTY.
    if [[ -z "$server_ip" ]]; then
        server_ip=$(hostname -I 2> /dev/null | awk '{print $1}')
        server_ip="${server_ip:-<server-ip>}"
    fi

    # Handle missing/short webBasePath
    if [[ ${#existing_webBasePath} -lt 4 ]]; then
        echo -e "${yellow}WebBasePath is missing or too short. Generating a new one...${plain}"
        local config_webBasePath=$(gen_random_string 18)
        ${xui_folder}/we1ssboard setting -webBasePath "${config_webBasePath}"
        existing_webBasePath="${config_webBasePath}"
        panel_needs_restart=1
        echo -e "${green}New WebBasePath: ${config_webBasePath}${plain}"
    fi

    # An update only updates the panel: TLS stays exactly as configured. Set it up
    # explicitly from the we1ssboard menu (SSL Certificate Management).
    local access_scheme="http" access_host="${server_ip}"
    if [[ -n "$existing_cert" ]]; then
        access_scheme="https"
        access_host=$(basename "$(dirname "$existing_cert")")
    fi
    echo ""
    echo -e "${green}═══════════════════════════════════════════${plain}"
    echo -e "${green}     Panel Access Information              ${plain}"
    echo -e "${green}═══════════════════════════════════════════${plain}"
    echo -e "${green}Access URL: ${access_scheme}://${access_host}:${existing_port}/${existing_webBasePath}${plain}"
    echo -e "${green}═══════════════════════════════════════════${plain}"
    if [[ -z "$existing_cert" ]]; then
        echo -e "${yellow}No SSL certificate is configured; the panel is served over HTTP.${plain}"
        echo -e "${yellow}Run 'we1ssboard' and choose SSL Certificate Management to set one up.${plain}"
    fi

    if [[ "$panel_needs_restart" -eq 1 ]]; then
        echo -e "${yellow}Restarting panel to apply the new web base path...${plain}"
        systemctl restart we1ssboard 2> /dev/null || rc-service we1ssboard restart 2> /dev/null
    fi
}

# 1.4.4/1.4.5 applied an aggressive TCP profile on every install/update (BBR,
# 32 MiB buffers, notsent_lowat, fq forced onto live NICs). On some hosts it
# lowered throughput and raised latency, so tuning is now opt-in
# (XUI_NET_TUNING=true or the `we1ssboard` BBR menu) and the old profile is undone.
WE1SSBOARD_NET_CONF="/etc/sysctl.d/99-we1ssboard-network.conf"
# The same profile under its pre-1.7.0 (FullBoard) name; reverted the same way.
LEGACY_NET_CONF="/etc/sysctl.d/99-fullboard-network.conf"

revert_network_tuning() {
    local iface
    [[ -f "$WE1SSBOARD_NET_CONF" || -f "$LEGACY_NET_CONF" ]] || return 0
    rm -f "$WE1SSBOARD_NET_CONF" "$LEGACY_NET_CONF"
    command -v sysctl > /dev/null 2>&1 || return 0
    # Kernel defaults for every key the old profile set; distro files re-apply on top.
    sysctl -e -w net.ipv4.tcp_congestion_control=cubic \
        net.core.default_qdisc=fq_codel \
        net.core.rmem_max=212992 net.core.wmem_max=212992 \
        "net.ipv4.tcp_rmem=4096 131072 6291456" "net.ipv4.tcp_wmem=4096 16384 4194304" \
        net.core.netdev_max_backlog=1000 net.ipv4.tcp_fastopen=1 \
        net.ipv4.tcp_mtu_probing=0 net.ipv4.tcp_slow_start_after_idle=1 \
        net.ipv4.tcp_notsent_lowat=4294967295 \
        "net.ipv4.ip_local_port_range=32768 60999" > /dev/null 2>&1 || true
    sysctl --system > /dev/null 2>&1 || true
    # Drop the forced root fq so each NIC gets its default (mq/fq_codel) back.
    if command -v tc > /dev/null 2>&1; then
        for iface in $(ip -o link show up 2> /dev/null | awk -F': ' '{print $2}' | cut -d@ -f1); do
            [[ "$iface" == "lo" ]] && continue
            tc qdisc show dev "$iface" root 2> /dev/null | grep -q '^qdisc fq ' &&
                tc qdisc del dev "$iface" root > /dev/null 2>&1
        done
    fi
    echo -e "${yellow}Removed the 1.4.4 network profile and restored kernel TCP defaults.${plain}"
}

setup_network_tuning() {
    revert_network_tuning
    [[ "${XUI_NET_TUNING:-false}" == "true" ]] || return 0
    command -v sysctl > /dev/null 2>&1 || return 0
    [[ -d /etc/sysctl.d ]] || return 0
    modprobe tcp_bbr > /dev/null 2>&1 || true
    if ! grep -qw bbr /proc/sys/net/ipv4/tcp_available_congestion_control 2> /dev/null; then
        echo -e "${yellow}Kernel has no BBR (container or old kernel); network tuning skipped.${plain}"
        return 0
    fi
    # Only BBR + fq: the same pair as the `we1ssboard` menu, nothing that changes buffering.
    cat > "$WE1SSBOARD_NET_CONF" << 'SYSCTL'
# Written by We1ssBoard because XUI_NET_TUNING=true; remove the variable to undo on next update.
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
SYSCTL
    chmod 644 "$WE1SSBOARD_NET_CONF"
    sysctl -e -p "$WE1SSBOARD_NET_CONF" > /dev/null 2>&1 || true
    echo -e "${green}Network tuning: $(sysctl -n net.ipv4.tcp_congestion_control 2> /dev/null) + $(sysctl -n net.core.default_qdisc 2> /dev/null)${plain}"
}

# Xray opens Hysteria/TUIC UDP sockets without SO_RCVBUF, so they get rmem_default (208 KiB)
# and the kernel drops bursts (UdpRcvbufErrors). Values the host already sets higher are kept;
# XUI_QUIC_TUNING=false removes the file. Sockets take the size at creation, hence the restart.
WE1SSBOARD_QUIC_CONF="/etc/sysctl.d/99-quic.conf"
QUIC_BUFFER_DEFAULT=4194304
QUIC_BUFFER_MAX=16777216

setup_quic_tuning() {
    local key current target applied conf=""
    if [[ "${XUI_QUIC_TUNING:-true}" != "true" ]]; then
        rm -f "$WE1SSBOARD_QUIC_CONF"
        return 0
    fi
    command -v sysctl > /dev/null 2>&1 || return 0
    [[ -d /etc/sysctl.d ]] || return 0
    for key in rmem_max wmem_max rmem_default wmem_default; do
        target=$QUIC_BUFFER_MAX
        [[ "$key" == *_default ]] && target=$QUIC_BUFFER_DEFAULT
        current=$(sysctl -n "net.core.$key" 2> /dev/null)
        [[ "$current" =~ ^[0-9]+$ ]] && ((current > target)) && target=$current
        conf+="net.core.$key = $target"$'\n'
    done
    modprobe tcp_bbr > /dev/null 2>&1 || true
    if grep -qw bbr /proc/sys/net/ipv4/tcp_available_congestion_control 2> /dev/null; then
        conf+="net.ipv4.tcp_congestion_control = bbr"$'\n'
    fi
    conf="# Written by We1ssBoard for QUIC (Hysteria, TUIC); XUI_QUIC_TUNING=false removes it on next update."$'\n'"$conf"
    if [[ -f "$WE1SSBOARD_QUIC_CONF" && "$(cat "$WE1SSBOARD_QUIC_CONF")"$'\n' == "$conf" ]]; then
        sysctl -e -p "$WE1SSBOARD_QUIC_CONF" > /dev/null 2>&1 || true
        return 0
    fi
    printf '%s' "$conf" > "$WE1SSBOARD_QUIC_CONF"
    chmod 644 "$WE1SSBOARD_QUIC_CONF"
    sysctl -e -p "$WE1SSBOARD_QUIC_CONF" > /dev/null 2>&1 || true
    applied=$(sysctl -n net.core.rmem_default 2> /dev/null)
    if [[ ! "$applied" =~ ^[0-9]+$ ]] || ((applied < QUIC_BUFFER_DEFAULT)); then
        rm -f "$WE1SSBOARD_QUIC_CONF"
        echo -e "${yellow}Kernel refused larger UDP buffers (container?); QUIC tuning skipped.${plain}"
        return 0
    fi
    echo -e "${green}QUIC tuning: UDP buffers $(sysctl -n net.core.rmem_default)/$(sysctl -n net.core.rmem_max) bytes, $(sysctl -n net.ipv4.tcp_congestion_control 2> /dev/null); restarting we1ssboard${plain}"
    systemctl restart we1ssboard > /dev/null 2>&1 || rc-service we1ssboard restart > /dev/null 2>&1 || true
}

# setup_fail2ban auto-installs and configures fail2ban for the IP Limit feature
# by invoking the freshly downloaded we1ssboard CLI. IP Limit is load-bearing on
# fail2ban (without it the panel disables the limitIp field and zeroes existing
# limits), so updating an older install should make it work without a manual
# trip through the IP Limit menu. Non-fatal: a fail2ban failure must never abort
# the update. XUI_ENABLE_FAIL2BAN is honored (load_xui_env exports it from the
# persisted env file, so a deliberate opt-out survives updates).
setup_fail2ban() {
    if [[ -n "${XUI_ENABLE_FAIL2BAN+x}" && "${XUI_ENABLE_FAIL2BAN}" != "true" ]]; then
        echo -e "${yellow}XUI_ENABLE_FAIL2BAN=${XUI_ENABLE_FAIL2BAN}, skipping Fail2ban auto-setup.${plain}"
        return 0
    fi

    if [[ ! -x /usr/bin/we1ssboard ]]; then
        echo -e "${yellow}we1ssboard CLI not found; skipping Fail2ban auto-setup.${plain}"
        return 0
    fi

    # Scripts older than v3.4.0 have no setup-fail2ban and exit 0 from the
    # usage banner, which would read as success here.
    if ! grep -q '"setup-fail2ban")' /usr/bin/we1ssboard; then
        echo -e "${yellow}This we1ssboard.sh predates 'we1ssboard setup-fail2ban'; skipping Fail2ban auto-setup.${plain}"
        return 0
    fi

    echo -e "${green}Setting up Fail2ban for the IP Limit feature...${plain}"
    if /usr/bin/we1ssboard setup-fail2ban; then
        echo -e "${green}Fail2ban setup complete.${plain}"
    else
        echo -e "${yellow}Fail2ban setup did not finish; IP Limit stays disabled until you run 'we1ssboard' and open the IP Limit menu. Continuing.${plain}"
    fi
    return 0
}

# The hardened unit makes /usr, /boot, /efi and /etc read-only. The panel's own
# updater is expected to escape that sandbox by running this script through a
# transient systemd-run unit; when systemd-run is unavailable it starts this
# script as a plain child instead, and that child inherits the sandbox and then
# cannot write anything this update needs. Say so once, up front, instead of
# dying partway through with "Failed to download we1ssboard".
require_writable_update_paths() {
    local dir probe
    for dir in "${xui_folder%/*}" "/usr/bin"; do
        [[ -n "$dir" && -d "$dir" ]] || continue
        probe="${dir}/.we1ssboard-write-test.$$"
        # A real write test rather than [[ -w ]]: this runs as root, where a
        # permission bit means little and the test only reflects the file mode
        # and the mount flags, not an immutable attribute or a full filesystem.
        if ! : > "$probe" 2> /dev/null; then
            _fail "ERROR: ${dir} is not writable for this process (read-only mount, attribute or full filesystem). The panel's fallback updater cannot run inside the hardened systemd sandbox; update from the panel UI (which uses systemd-run) or run 'we1ssboard update' in a shell."
        fi
        rm -f "$probe"
    done
}

# Major version of the local systemd, 0 when it cannot be determined. The
# SystemCallFilter=@system-service group only exists from systemd 239 on (other
# @-named groups exist since 231); on older versions an unknown group is not
# ignored safely, the filter stays in force and leaves a whitelist the panel
# cannot run under.
_xui_systemd_major_version() {
    local version=""
    if command -v systemctl > /dev/null 2>&1; then
        version="$(systemctl --version 2>/dev/null | awk 'NR == 1 {print $2}')"
    fi
    if [[ ! "$version" =~ ^[0-9]+$ ]]; then
        echo 0
        return 0
    fi
    echo "$version"
}

# The shipped units list hardening that older systemd does not know: the
# directive is logged and ignored at load time rather than rejected, so the
# panel still starts, only without that protection. Each entry is the systemd
# release that introduced the directive (systemd.exec(5)); everything else in
# the unit predates the oldest systemd install.sh supports (CentOS 7 has 219).
# SystemCallFilter= is listed because the drop-in only writes it from 239 on.
_xui_warn_unsupported_hardening() {
    local version entry missing=""
    version="$(_xui_systemd_major_version)"
    [[ "$version" -gt 0 ]] || return 0
    for entry in RestrictRealtime:231 ReadWritePaths:231 ProtectKernelTunables:232 \
        ProtectKernelModules:232 RestrictNamespaces:233 LockPersonality:235 \
        SystemCallFilter:239 ProtectHostname:242 RestrictSUIDSGID:242 \
        ProtectKernelLogs:244 ProtectClock:245; do
        if [[ "$version" -lt "${entry##*:}" ]]; then
            missing="${missing:+$missing, }${entry%%:*} (${entry##*:})"
        fi
    done
    [[ -n "$missing" ]] || return 0
    echo -e "${yellow}Note: systemd ${version} ignores part of the hardening in we1ssboard.service; the panel still starts.${plain}"
    echo "      Not applied, needs a newer systemd: ${missing}."
    if [[ "$version" -lt 231 ]]; then
        echo "      The panel's folders stay writable through ReadWriteDirectories=, the alias this script installs."
    fi
    echo "      The rest of the hardening is in force. Upgrade systemd to apply the above."
    return 0
}

# ProtectSystem=full makes /usr, /boot, /efi and /etc read-only. ProtectSystem=
# strict would make the whole hierarchy read-only (only the kernel API
# filesystems stay as they are), and that would break the panel's own use of
# /tmp. The panel's stores are configurable (XUI_DB_FOLDER, XUI_LOG_FOLDER,
# XUI_BIN_FOLDER), and XUI_MAIN_FOLDER is the folder install.sh/update.sh place
# the files in -- the unit's WorkingDirectory on a stock install, and what a
# relative XUI_BIN_FOLDER is resolved against. So a hard-coded list in the unit
# either misses a relocated store -- the panel then cannot write its own SQLite
# database and sits in a Restart=on-failure loop -- or forces the operator to
# edit a file that every install/update overwrites from the release tarball.
# install.sh and update.sh therefore regenerate the drop-in from the folders
# actually in use, and the unit's own ReadWritePaths only carry the
# plain-install defaults. A relocated store means re-running install or update:
# the drop-in is only written here.
_xui_service_write_paths_dropin() {
    # $1 is the env file to resolve the XUI_* folders from; callers pass nothing
    # and get the OS-specific path the unit itself uses.
    local env_file="${1:-}"
    local dropin_dir dropin temp_file
    local db_folder log_folder bin_folder main_folder
    local path line="" whitespace_paths="" seen_paths="" escaped_path

    if [[ -z "$env_file" ]]; then
        env_file="$(xui_env_file_path)"
    fi
    if [[ -r "$env_file" ]]; then
        set -a
        # shellcheck disable=SC1090
        source "$env_file"
        set +a
    fi

    # XUI_* wins over the script's own default: the unit hands that same env
    # file to the panel through EnvironmentFile=, so these are the folders it
    # will actually use.
    main_folder="${XUI_MAIN_FOLDER:-${xui_folder}}"
    db_folder="${XUI_DB_FOLDER:-/etc/we1ssboard}"
    log_folder="${XUI_LOG_FOLDER:-/var/log/we1ssboard}"
    # An empty XUI_BIN_FOLDER resolves to "bin" relative to the panel's working
    # directory, which the unit sets to the main folder.
    bin_folder="${XUI_BIN_FOLDER:-bin}"
    if [[ "$bin_folder" != /* ]]; then
        bin_folder="${main_folder%/}/${bin_folder#./}"
    fi

    # /etc/tproxy-server and /etc/caddy are the Telegram WEB proxy stores the
    # panel writes under ProtectSystem=full. systemd silently drops a '-' entry
    # whose folder is missing when the panel starts, and a relay installed later
    # from the panel then hits "read-only file system", so create them up front;
    # the relay installer re-owns them (root:tproxy / root:caddy) later.
    mkdir -p /etc/tproxy-server /etc/caddy > /dev/null 2>&1 || true
    for path in "$db_folder" "$log_folder" "$bin_folder" "$main_folder" "/etc/tproxy-server" "/etc/caddy"; do
        [[ "$path" == /* ]] || continue
        # ReadWritePaths= is a whitespace-separated list, and a folder whose
        # name contains whitespace cannot be written into it without relying on
        # quoting. A wrong entry makes systemd reject the whole drop-in and the
        # panel would not start, so leave such a folder out and say so instead.
        if [[ "$path" != "${path//[[:space:]]/}" ]]; then
            whitespace_paths="${whitespace_paths:+$whitespace_paths }$path"
            continue
        fi
        case " $seen_paths " in
            *" $path "*) continue ;;
        esac
        seen_paths="${seen_paths}${seen_paths:+ }$path"
        # systemd expands %-specifiers in unit files, so a folder name carrying
        # a literal % has to be written as %%, or the entry stops naming the
        # folder systemd is meant to keep writable.
        escaped_path="${path//%/%%}"
        line="${line} -${escaped_path}"
    done
    if [[ -n "$whitespace_paths" ]]; then
        echo "Warning: these folders contain whitespace and were left out of" >&2
        echo "         10-xui-sandbox.conf: $whitespace_paths" >&2
        echo "         The panel cannot write to them under the unit's sandbox." >&2
    fi
    line="${line# }"
    [[ -n "$line" ]] || return 1

    dropin_dir="${xui_service}/we1ssboard.service.d"
    dropin="${dropin_dir}/10-xui-sandbox.conf"
    temp_file="${dropin}.tmp.$$"

    mkdir -p "$dropin_dir" || return 1
    cat > "$temp_file" << EOF
# Regenerated by install.sh/update.sh on every install and update: edits here
# are lost, and the list only reflects the XUI_* variables read from
# ${env_file} at that moment. Re-run install/update after moving a store.
# It lists the folders the panel writes to. Put local additions in their own
# drop-in, for example 20-we1ssboard-local.conf, which nothing here touches.
[Service]
ReadWritePaths=${line}
ReadWriteDirectories=${line}
EOF
    if [[ "$(_xui_systemd_major_version)" -ge 239 ]]; then
        cat >> "$temp_file" << 'EOF'
# @system-service needs systemd >= 239; on older versions the unknown group
# would leave the panel with a filter it cannot start under (we1ssboard.service.*).
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
EOF
    fi
    if [[ ! -s "$temp_file" ]]; then
        rm -f "$temp_file"
        return 1
    fi
    chmod 644 "$temp_file"
    mv -f "$temp_file" "$dropin" || { rm -f "$temp_file"; return 1; }
    if command -v systemctl > /dev/null 2>&1; then
        systemctl daemon-reload > /dev/null 2>&1 || true
    fi
    return 0
}

# Lands a systemd unit file at ${xui_service}/we1ssboard.service via a temp file +
# atomic mv, so a failed cp/curl or an interrupted mv never leaves a
# truncated unit file at the live path -- systemd would then fail to parse
# it on the next daemon-reload/start. Same pattern already used for
# /usr/bin/we1ssboard elsewhere in this script. source_is_url picks cp (from a
# file already extracted from the release tarball) vs curl (GitHub fallback).
_install_xui_service_unit() {
    local source="$1"
    local source_is_url="$2"
    local dest="${xui_service}/we1ssboard.service"
    local temp_file="${dest}.tmp.$$"

    rm -f "$temp_file"
    if [[ "$source_is_url" == "true" ]]; then
        ${curl_bin} -fLRo "$temp_file" "$source" > /dev/null 2>&1
    else
        cp -f "$source" "$temp_file" > /dev/null 2>&1
    fi
    if [[ $? -ne 0 ]]; then
        rm -f "$temp_file"
        return 1
    fi
    if [[ ! -s "$temp_file" ]]; then
        rm -f "$temp_file"
        return 1
    fi
    mv -f "$temp_file" "$dest"
    if [[ $? -ne 0 ]]; then
        rm -f "$temp_file"
        return 1
    fi
    if ! _xui_service_write_paths_dropin; then
        echo -e "${yellow}Warning: could not refresh ${xui_service}/we1ssboard.service.d/10-xui-sandbox.conf.${plain}"
        echo -e "${yellow}If XUI_DB_FOLDER or XUI_LOG_FOLDER points outside /etc/we1ssboard and /var/log/we1ssboard, the panel may not be able to write to it under ProtectSystem=full.${plain}"
    fi
    _xui_warn_unsupported_hardening
    return 0
}

# Older tags predate some of these files (we1ssboard.rc arrived in v2.8.4). Serving
# main's copy against an old binary is the mismatch this pinning exists to
# prevent, so probe before the old install is removed and refuse the tag.
# The unit files and the OpenRC script moved to packaging/ after 1.8.4; older tags
# still serve them from the repository root.
repo_file_url() {
    local ref="$1" name="$2" base="https://raw.githubusercontent.com/WeIbSchatten/We1ssBoard/$1"
    case "${name}" in
        we1ssboard.rc | we1ssboard.service.*)
            if [[ "$(${curl_bin} -sIL --retry 3 --connect-timeout 15 -o /dev/null -w '%{http_code}' "${base}/packaging/${name}")" == "200" ]]; then
                echo "${base}/packaging/${name}"
                return
            fi
            ;;
    esac
    echo "${base}/${name}"
}

require_repo_files() {
    local ref="$1" name status
    shift
    [[ "${ref}" == "main" ]] && return 0
    for name in "$@"; do
        status=$(${curl_bin} -sIL --retry 3 --connect-timeout 15 -o /dev/null -w '%{http_code}' "$(repo_file_url "${ref}" "${name}")")
        if [[ "${status}" != "200" ]]; then
            _fail "ERROR: ${name} is not available for ${ref} (HTTP ${status}). Update to a release that ships it, or to 'dev-latest'. The current installation is untouched."
        fi
    done
}

# Names in both folders, except the transient update-status.json an aborted run
# writes through the EXIT trap; the merge below would refuse to overwrite them.
_legacy_conflicts() {
    local old="$1" new="$2" entry name
    [[ -d "$old" && ! -L "$old" && -d "$new" ]] || return 0
    for entry in "$old"/* "$old"/.[!.]*; do
        [[ -e "$entry" || -L "$entry" ]] || continue
        name="${entry##*/}"
        [[ "$name" == "update-status.json" ]] && continue
        [[ -e "${new}/${name}" ]] && echo "${new}/${name}"
        [[ "$name" == "fullboard.db" && -e "${new}/we1ssboard.db" ]] && echo "${new}/we1ssboard.db"
    done
    return 0
}

_rename_legacy_db() {
    local db_file
    for db_file in /etc/we1ssboard/fullboard.db /etc/we1ssboard/fullboard.db-wal /etc/we1ssboard/fullboard.db-shm; do
        [[ -f "$db_file" && ! -e "${db_file/fullboard.db/we1ssboard.db}" ]] && mv "$db_file" "${db_file/fullboard.db/we1ssboard.db}"
    done
    return 0
}

# 1.7.0 left /etc/fullboard in place when /etc/we1ssboard already existed; the panel
# then found its database there, where the sandboxed unit cannot write.
check_split_legacy_paths() {
    local conflicts
    conflicts="$(_legacy_conflicts /etc/fullboard /etc/we1ssboard; _legacy_conflicts /var/log/fullboard /var/log/we1ssboard)"
    if [[ -n "$conflicts" ]]; then
        _fail "ERROR: these files exist under both the FullBoard and the We1ssBoard paths: $(echo $conflicts). Move or delete the We1ssBoard copies, then run the update again. The current installation is untouched."
    fi
}

merge_split_legacy_paths() {
    _move_legacy_path /etc/fullboard /etc/we1ssboard
    _rename_legacy_db
    _move_legacy_path /var/log/fullboard /var/log/we1ssboard
}

_move_legacy_path() {
    local old="$1" new="$2" entry
    [[ -e "$old" && ! -L "$old" ]] || return 0
    if [[ ! -e "$new" ]]; then
        mv "$old" "$new" || _fail "ERROR: could not move ${old} to ${new}; the FullBoard installation is still in place."
        ln -s "$new" "$old"
        return 0
    fi
    # An earlier, aborted run can leave the new folder behind, so merge into it.
    for entry in "$old"/* "$old"/.[!.]*; do
        [[ -e "$entry" || -L "$entry" ]] || continue
        if [[ -e "${new}/${entry##*/}" ]]; then
            rm -f "$entry"
            continue
        fi
        mv "$entry" "${new}/" || _fail "ERROR: could not move ${entry} into ${new}."
    done
    rmdir "$old" || _fail "ERROR: could not remove the emptied ${old}."
    ln -s "$new" "$old"
}

# Before 1.7.0 the panel was called FullBoard. Its install is moved to the new
# names once; the old paths stay as symlinks so absolute paths stored in the
# database (certificates, templates) and the old `fullboard` command keep working.
migrate_legacy_install() {
    local legacy_folder="${xui_folder%/*}/fullboard" dir
    [[ -d "$legacy_folder" && ! -L "$legacy_folder" && ! -e "$xui_folder" ]] || return 0
    check_split_legacy_paths
    echo -e "${green}Moving the FullBoard installation to We1ssBoard...${plain}"
    if [[ $release == "alpine" ]]; then
        rc-service fullboard stop > /dev/null 2>&1
        rc-update del fullboard > /dev/null 2>&1
        [[ -f /etc/init.d/fullboard ]] && mv -f /etc/init.d/fullboard /etc/init.d/we1ssboard
    else
        systemctl stop fullboard > /dev/null 2>&1
        systemctl disable fullboard > /dev/null 2>&1
        # The flow below expects an installed unit and replaces it with the new one.
        [[ -f "${xui_service}/fullboard.service" ]] && mv -f "${xui_service}/fullboard.service" "${xui_service}/we1ssboard.service"
        rm -rf "${xui_service}/fullboard.service.d"
        systemctl daemon-reload > /dev/null 2>&1
    fi
    merge_split_legacy_paths
    for dir in /etc/default /etc/conf.d /etc/sysconfig; do
        [[ -f "${dir}/fullboard" && ! -e "${dir}/we1ssboard" ]] || continue
        mv -f "${dir}/fullboard" "${dir}/we1ssboard"
        sed -i -e 's#/etc/fullboard#/etc/we1ssboard#g' -e 's#/var/log/fullboard#/var/log/we1ssboard#g' \
            -e 's#/usr/local/fullboard#/usr/local/we1ssboard#g' "${dir}/we1ssboard"
    done
    [[ -f "${legacy_folder}/fullboard" ]] && mv -f "${legacy_folder}/fullboard" "${legacy_folder}/we1ssboard"
    rm -f "${legacy_folder}/fullboard.sh" "${legacy_folder}"/fullboard.service*
    _move_legacy_path "$legacy_folder" "$xui_folder"
    [[ -e /usr/bin/fullboard && ! -L /usr/bin/fullboard ]] && rm -f /usr/bin/fullboard
    legacy_install_migrated=1
}

update_x-ui() {
    cd ${xui_folder%/we1ssboard}/

    load_xui_env

    local current_binary="${xui_folder}/we1ssboard"
    [[ -f "${current_binary}" ]] || current_binary="${xui_folder%/*}/fullboard/fullboard"
    if [ -f "${current_binary}" ]; then
        current_xui_version=$("${current_binary}" -v)
        echo -e "${green}Current we1ssboard version: ${current_xui_version}${plain}"
    else
        _fail "ERROR: Current we1ssboard version: unknown"
    fi

    _write_update_stage download
    echo -e "${green}Downloading new we1ssboard version...${plain}"

    # XUI_UPDATE_TAG lets the panel target a specific release tag (e.g. the
    # rolling dev-latest pre-release). Empty keeps the default latest-stable flow.
    if [[ -n "${XUI_UPDATE_TAG}" ]]; then
        tag_version="${XUI_UPDATE_TAG}"
        echo -e "${green}Using update tag: ${tag_version}${plain}"
        if [[ "${tag_version}" =~ ^v?[0-9]+.[0-9]+.[0-9]+$ && "$(printf "%s
" "1.7.0" "${tag_version#v}" | sort -V | head -n1)" != "1.7.0" ]]; then
            _fail "ERROR: ${tag_version} predates the We1ssBoard name (1.7.0) and cannot be installed over it. The current installation is untouched."
        fi
    else
        tag_version=$(${curl_bin} -Ls "https://api.github.com/repos/WeIbSchatten/We1ssBoard/releases/latest" 2> /dev/null | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
        if [[ ! -n "$tag_version" ]]; then
            _fail "ERROR: Failed to fetch we1ssboard version, it may be due to GitHub API restrictions, please try it later"
        fi
    fi
    echo -e "Got we1ssboard latest version: ${tag_version}, beginning the installation..."
    # we1ssboard.sh, we1ssboard.rc and the unit files must come from the same release as
    # the binary; only the rolling dev build tracks main.
    script_ref="${tag_version}"
    if [[ "${tag_version}" == "dev-latest" ]]; then
        script_ref="main"
    fi
    # The unit files are only fetched when the release tarball lacks them, so
    # they are checked at that point instead of here.
    local required_files=("we1ssboard.sh")
    [[ $release == "alpine" ]] && required_files+=("we1ssboard.rc")
    require_repo_files "${script_ref}" "${required_files[@]}"
    ${curl_bin} -fLRo ${xui_folder}-linux-$(arch).tar.gz https://github.com/WeIbSchatten/We1ssBoard/releases/download/${tag_version}/we1ssboard-linux-$(arch).tar.gz 2> /dev/null
    if [[ $? -ne 0 ]]; then
        _fail "ERROR: Failed to download we1ssboard, please be sure that your server can access GitHub"
    fi
    if [[ ! -s ${xui_folder}-linux-$(arch).tar.gz ]]; then
        rm ${xui_folder}-linux-$(arch).tar.gz -f > /dev/null 2>&1
        _fail "ERROR: Downloaded we1ssboard release archive is empty, please be sure that your server can access GitHub"
    fi
    _write_update_stage verify
    # Releases publish <asset>.sha256 next to each archive. A mismatch or a
    # failed sidecar download aborts the update; only a 404 (releases
    # predating the sidecar) is tolerated with a warning.
    archive="${xui_folder}-linux-$(arch).tar.gz"
    rm -f "${archive}.sha256"
    sidecar_code=$(${curl_bin} -sL --retry 3 --retry-delay 3 --connect-timeout 15 --max-time 60 -o "${archive}.sha256" -w '%{http_code}' "https://github.com/WeIbSchatten/We1ssBoard/releases/download/${tag_version}/we1ssboard-linux-$(arch).tar.gz.sha256" 2> /dev/null)
    if [[ "${sidecar_code}" == "200" ]]; then
        expected_sha256=$(awk 'NR == 1 {print $1}' "${archive}.sha256")
        actual_sha256=$(sha256sum "${archive}" | awk '{print $1}')
        rm -f "${archive}.sha256"
        if [[ ! "${expected_sha256}" =~ ^[0-9a-f]{64}$ || "${expected_sha256}" != "${actual_sha256}" ]]; then
            rm -f "${archive}"
            _fail "ERROR: Checksum mismatch for $(basename "${archive}"): expected ${expected_sha256:-<none>}, got ${actual_sha256}"
        fi
        echo -e "${green}Checksum verified: ${actual_sha256}${plain}"
    elif [[ "${sidecar_code}" == "404" ]]; then
        rm -f "${archive}.sha256"
        echo -e "${yellow}No checksum published for this release, skipping verification${plain}"
    else
        rm -f "${archive}.sha256" "${archive}"
        _fail "ERROR: Failed to download the checksum for we1ssboard-linux-$(arch).tar.gz (HTTP ${sidecar_code})"
    fi

    migrate_legacy_install
    check_split_legacy_paths
    load_xui_env

    if [[ -e ${xui_folder}/ ]]; then
        _write_update_stage stop
        echo -e "${green}Stopping we1ssboard...${plain}"
        if [[ $release == "alpine" ]]; then
            if [ -f "/etc/init.d/we1ssboard" ]; then
                rc-service we1ssboard stop > /dev/null 2>&1
                rc-update del we1ssboard > /dev/null 2>&1
                echo -e "${green}Removing old service unit version...${plain}"
                rm -f /etc/init.d/we1ssboard > /dev/null 2>&1
            else
                rm we1ssboard-linux-$(arch).tar.gz -f > /dev/null 2>&1
                _fail "ERROR: we1ssboard service unit not installed."
            fi
        else
            if [ -f "${xui_service}/we1ssboard.service" ]; then
                systemctl stop we1ssboard > /dev/null 2>&1
                systemctl disable we1ssboard > /dev/null 2>&1
                echo -e "${green}Removing old systemd unit version...${plain}"
                rm ${xui_service}/we1ssboard.service -f > /dev/null 2>&1
                systemctl daemon-reload > /dev/null 2>&1
            else
                rm we1ssboard-linux-$(arch).tar.gz -f > /dev/null 2>&1
                _fail "ERROR: we1ssboard systemd unit not installed."
            fi
        fi
        # Kill any leftover mtg (MTProto) sidecars. we1ssboard runs them outside its own
        # lifecycle, so on Linux a stale one can survive the stop and keep holding
        # an inbound port with an outdated secret, silently breaking new clients.
        # The new panel respawns a clean mtg per inbound on next start.
        pkill -f 'mtg-linux-[^ ]* run ' > /dev/null 2>&1 || true
        pkill -f 'tuic-server.*-c .*bin/tuic/tuic_[0-9]+\.json' > /dev/null 2>&1 || true
        echo -e "${green}Removing old we1ssboard version...${plain}"
        rm ${xui_folder} -f > /dev/null 2>&1
        rm ${xui_folder}/we1ssboard.service -f > /dev/null 2>&1
        rm ${xui_folder}/we1ssboard.service.debian -f > /dev/null 2>&1
        rm ${xui_folder}/we1ssboard.service.arch -f > /dev/null 2>&1
        rm ${xui_folder}/we1ssboard.service.rhel -f > /dev/null 2>&1
        rm ${xui_folder}/we1ssboard -f > /dev/null 2>&1
        rm ${xui_folder}/we1ssboard.sh -f > /dev/null 2>&1
        echo -e "${green}Removing old mtg version...${plain}"
        rm ${xui_folder}/bin/mtg-linux-$(arch) -f > /dev/null 2>&1
        echo -e "${green}Removing old xray version...${plain}"
        rm ${xui_folder}/bin/xray-linux-$(arch) -f > /dev/null 2>&1
        echo -e "${green}Removing old README and LICENSE file...${plain}"
        rm ${xui_folder}/bin/README.md -f > /dev/null 2>&1
        rm ${xui_folder}/bin/LICENSE -f > /dev/null 2>&1
        rm ${xui_folder}/bin/tuic-server -f > /dev/null 2>&1
        rm ${xui_folder}/bin/tuic -rf > /dev/null 2>&1
    else
        rm we1ssboard-linux-$(arch).tar.gz -f > /dev/null 2>&1
        _fail "ERROR: we1ssboard not installed."
    fi

    _write_update_stage install
    echo -e "${green}Installing new we1ssboard version...${plain}"
    tar zxvf we1ssboard-linux-$(arch).tar.gz > /dev/null 2>&1
    if [[ $? -ne 0 ]]; then
        rm we1ssboard-linux-$(arch).tar.gz -f > /dev/null 2>&1
        _fail "ERROR: Failed to extract the we1ssboard release archive -- the previous installation has already been removed, so the panel will not start until this is fixed; try running the update again"
    fi
    rm we1ssboard-linux-$(arch).tar.gz -f > /dev/null 2>&1
    cd we1ssboard > /dev/null 2>&1
    if [[ $? -ne 0 || ! -s we1ssboard ]]; then
        _fail "ERROR: Extracted we1ssboard archive is missing the we1ssboard binary -- the previous installation has already been removed, so the panel will not start until this is fixed; try running the update again"
    fi
    chmod +x we1ssboard > /dev/null 2>&1

    # Check the system's architecture and rename the file accordingly.
    # The panel binary maps GOARCH=arm to "arm32" (internal/xray/process.go),
    # so the Xray binary must be named xray-linux-arm32; mtg keeps plain "arm".
    if [[ $(arch) == "armv5" || $(arch) == "armv6" || $(arch) == "armv7" ]]; then
        mv bin/xray-linux-$(arch) bin/xray-linux-arm32 > /dev/null 2>&1
        chmod +x bin/xray-linux-arm32 > /dev/null 2>&1
        if [[ -f bin/mtg-linux-$(arch) ]]; then
            mv bin/mtg-linux-$(arch) bin/mtg-linux-arm > /dev/null 2>&1
            chmod +x bin/mtg-linux-arm > /dev/null 2>&1
        fi
    fi

    chmod +x we1ssboard bin/xray-linux-$(arch) > /dev/null 2>&1
    if [[ -f bin/mtg-linux-arm ]]; then
        chmod +x bin/mtg-linux-arm > /dev/null 2>&1
    elif [[ -f bin/mtg-linux-$(arch) ]]; then
        chmod +x bin/mtg-linux-$(arch) > /dev/null 2>&1
    fi

    echo -e "${green}Downloading and installing we1ssboard.sh script...${plain}"
    local xui_script_temp="/usr/bin/we1ssboard-temp.$$"
    rm -f "${xui_script_temp}"
    ${curl_bin} -fLRo "${xui_script_temp}" "https://raw.githubusercontent.com/WeIbSchatten/We1ssBoard/${script_ref}/we1ssboard.sh" > /dev/null 2>&1
    if [[ $? -ne 0 ]]; then
        rm -f "${xui_script_temp}"
        _fail "ERROR: Failed to download we1ssboard.sh script, please be sure that your server can access GitHub"
    fi
    if [[ ! -s "${xui_script_temp}" ]]; then
        rm -f "${xui_script_temp}"
        _fail "ERROR: Downloaded we1ssboard.sh script is empty, please be sure that your server can access GitHub"
    fi
    mv -f "${xui_script_temp}" /usr/bin/we1ssboard
    if [[ $? -ne 0 ]]; then
        rm -f "${xui_script_temp}"
        _fail "ERROR: Failed to install we1ssboard.sh script"
    fi

    chmod +x ${xui_folder}/we1ssboard.sh > /dev/null 2>&1
    chmod +x /usr/bin/we1ssboard > /dev/null 2>&1
    if [[ "${legacy_install_migrated:-0}" == "1" && ! -e /usr/bin/fullboard ]]; then
        ln -s /usr/bin/we1ssboard /usr/bin/fullboard
    fi
    mkdir -p /var/log/we1ssboard > /dev/null 2>&1

    _write_update_stage configure
    echo -e "${green}Changing owner...${plain}"
    chown -R root:root ${xui_folder} > /dev/null 2>&1

    if [ -f "${xui_folder}/bin/config.json" ]; then
        echo -e "${green}Changing on config file permissions...${plain}"
        chmod 640 ${xui_folder}/bin/config.json > /dev/null 2>&1
    fi

    # Finish the schema/data migrations before the service starts, so the service and
    # config_after_update's CLI calls never run them on the same database at once (#6728).
    merge_split_legacy_paths
    echo -e "${green}Migrating database...${plain}"
    "${xui_folder}/we1ssboard" migrate

    if [[ $release == "alpine" ]]; then
        echo -e "${green}Downloading and installing startup unit we1ssboard.rc...${plain}"
        xui_rc_temp="/etc/init.d/we1ssboard.tmp.$$"
        rm -f "${xui_rc_temp}"
        ${curl_bin} -fLRo "${xui_rc_temp}" "$(repo_file_url "${script_ref}" we1ssboard.rc)" > /dev/null 2>&1
        if [[ $? -ne 0 ]]; then
            rm -f "${xui_rc_temp}"
            _fail "ERROR: Failed to download startup unit we1ssboard.rc, please be sure that your server can access GitHub"
        fi
        if [[ ! -s "${xui_rc_temp}" ]]; then
            rm -f "${xui_rc_temp}"
            _fail "ERROR: Downloaded startup unit we1ssboard.rc is empty, please be sure that your server can access GitHub"
        fi
        mv -f "${xui_rc_temp}" /etc/init.d/we1ssboard
        if [[ $? -ne 0 ]]; then
            rm -f "${xui_rc_temp}"
            _fail "ERROR: Failed to install startup unit we1ssboard.rc"
        fi
        chmod +x /etc/init.d/we1ssboard > /dev/null 2>&1
        chown root:root /etc/init.d/we1ssboard > /dev/null 2>&1
        rc-update add we1ssboard > /dev/null 2>&1
        rc-service we1ssboard start > /dev/null 2>&1
    else
        if [ -f "we1ssboard.service" ]; then
            echo -e "${green}Installing systemd unit...${plain}"
            if ! _install_xui_service_unit "we1ssboard.service" "false"; then
                echo -e "${red}Failed to copy we1ssboard.service${plain}"
                exit 1
            fi
        else
            service_installed=false
            case "${release}" in
                ubuntu | debian | armbian)
                    if [ -f "we1ssboard.service.debian" ]; then
                        echo -e "${green}Installing debian-like systemd unit...${plain}"
                        if _install_xui_service_unit "we1ssboard.service.debian" "false"; then
                            service_installed=true
                        fi
                    fi
                    ;;
                arch | manjaro | parch)
                    if [ -f "we1ssboard.service.arch" ]; then
                        echo -e "${green}Installing arch-like systemd unit...${plain}"
                        if _install_xui_service_unit "we1ssboard.service.arch" "false"; then
                            service_installed=true
                        fi
                    fi
                    ;;
                *)
                    if [ -f "we1ssboard.service.rhel" ]; then
                        echo -e "${green}Installing rhel-like systemd unit...${plain}"
                        if _install_xui_service_unit "we1ssboard.service.rhel" "false"; then
                            service_installed=true
                        fi
                    fi
                    ;;
            esac

            # If service file not found in tar.gz, download from GitHub
            if [ "$service_installed" = false ]; then
                echo -e "${yellow}Service files not found in tar.gz, downloading from GitHub...${plain}"
                case "${release}" in
                    ubuntu | debian | armbian)
                        service_unit_url="$(repo_file_url "${script_ref}" we1ssboard.service.debian)"
                        ;;
                    arch | manjaro | parch)
                        service_unit_url="$(repo_file_url "${script_ref}" we1ssboard.service.arch)"
                        ;;
                    *)
                        service_unit_url="$(repo_file_url "${script_ref}" we1ssboard.service.rhel)"
                        ;;
                esac

                if ! _install_xui_service_unit "$service_unit_url" "true"; then
                    echo -e "${red}Failed to install we1ssboard.service from GitHub (${script_ref}) -- the release tarball did not ship one either${plain}"
                    exit 1
                fi
            fi
        fi
        chown root:root ${xui_service}/we1ssboard.service > /dev/null 2>&1
        chmod 644 ${xui_service}/we1ssboard.service > /dev/null 2>&1
        systemctl daemon-reload > /dev/null 2>&1
        _write_update_stage start
        systemctl enable we1ssboard > /dev/null 2>&1
        systemctl start we1ssboard > /dev/null 2>&1
    fi

    config_after_update

    # IP Limit relies on fail2ban; install + configure it now so the feature
    # works out of the box on update too (no-op when XUI_ENABLE_FAIL2BAN=false).
    # Never fatal.
    setup_fail2ban

    # Undo the 1.4.4 TCP profile; BBR + fq only with XUI_NET_TUNING=true. Never fatal.
    setup_network_tuning

    # Large UDP buffers (+ BBR when available) for QUIC inbounds, persisted. Never fatal.
    setup_quic_tuning

    echo -e "${green}we1ssboard ${tag_version}${plain} updating finished, it is running now..."
    echo -e ""
    echo -e "┌───────────────────────────────────────────────────────┐
│  ${blue}we1ssboard control menu usages (subcommands):${plain}              │
│                                                       │
│  ${blue}we1ssboard${plain}              - Admin Management Script          │
│  ${blue}we1ssboard start${plain}        - Start                            │
│  ${blue}we1ssboard stop${plain}         - Stop                             │
│  ${blue}we1ssboard restart${plain}      - Restart                          │
│  ${blue}we1ssboard status${plain}       - Current Status                   │
│  ${blue}we1ssboard settings${plain}     - Current Settings                 │
│  ${blue}we1ssboard enable${plain}       - Enable Autostart on OS Startup   │
│  ${blue}we1ssboard disable${plain}      - Disable Autostart on OS Startup  │
│  ${blue}we1ssboard log${plain}          - Check logs                       │
│  ${blue}we1ssboard banlog${plain}       - Check Fail2ban ban logs          │
│  ${blue}we1ssboard update${plain}       - Update                           │
│  ${blue}we1ssboard legacy${plain}       - Legacy version                   │
│  ${blue}we1ssboard install${plain}      - Install                          │
│  ${blue}we1ssboard uninstall${plain}    - Uninstall                        │
└───────────────────────────────────────────────────────┘"
}

echo -e "${green}Running...${plain}"
require_writable_update_paths
install_base
update_x-ui $1
