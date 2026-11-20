#!/usr/bin/env bash
# R.O.U.G.E installer and setup tool, for Raspberry Pi OS (Bookworm or newer).
#
#   ./install.sh              first install: choose Full or Custom
#   ./install.sh --full       install every module, ask nothing
#   rouge-setup               after installing: change which modules are on
#   rouge-setup add PATH      add a custom module (folder, .zip, or git URL)
#   rouge-setup remove ID     remove a custom module
#   rouge-setup list          show modules
#   rouge-setup uninstall     remove R.O.U.G.E (keeps your data)
#
# Run as your normal user; it asks for sudo when it needs it.
set -euo pipefail

HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
LIB=/usr/local/lib/rouge
ME="${SUDO_USER:-$USER}"
HOME_DIR="$(getent passwd "$ME" | cut -d: -f6)"
DATA="${ROUGE_DATA:-}"
[ -z "$DATA" ] && [ -r /etc/default/rouge ] && DATA="$(sed -n 's/^ROUGE_DATA=//p' /etc/default/rouge)"
DATA="${DATA:-$HOME_DIR/rouge}"
PORT=8080
MAPLIBRE_VERSIONS="4.7.1 4.5.0"
PMTILES_VERSIONS="3.2.1 3.2.0 3.0.7"
NEED_REBOOT=0
MODE="${1:-}"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
ask()  { [ "$MODE" = --full ] && return 1; local a; read -r -p "  $1 [y/N] " a || true; [[ "$a" =~ ^[Yy] ]]; }
ask_yes() { local a; read -r -p "  $1 [Y/n] " a || true; [[ ! "$a" =~ ^[Nn] ]]; }
as_user() { if [ "$(id -u)" = 0 ] && [ "$ME" != root ]; then sudo -u "$ME" "$@"; else "$@"; fi; }
have() { command -v "$1" >/dev/null 2>&1; }

if [ "$(id -u)" = 0 ] && [ -z "${SUDO_USER:-}" ]; then
  warn "Run this as your normal user (it asks for sudo when needed), not as root."
  exit 1
fi

case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64 ;;
  armv6l|armv7l|armhf) ARCH=armv6 ;;
  x86_64|amd64) ARCH=amd64 ;;
  *) warn "Unsupported CPU: $(uname -m)"; exit 1 ;;
esac

rouge_bin() { if [ -x /usr/local/bin/rouge ]; then echo /usr/local/bin/rouge; else echo "$HERE/bin/rouge-linux-$ARCH"; fi; }

# ================================================================ subcommands
module_add() {
  local src="${1:-}" tmp dir id
  [ -n "$src" ] || { warn "usage: rouge-setup add FOLDER | FILE.zip | https://git-url"; exit 2; }
  tmp="$(mktemp -d)"
  case "$src" in
    http*://*.zip) curl -fsSL "$src" -o "$tmp/m.zip" && unzip -q "$tmp/m.zip" -d "$tmp/x" ;;
    http*://*|git@*) git clone -q --depth 1 "$src" "$tmp/x" ;;
    *.zip) unzip -q "$src" -d "$tmp/x" ;;
    *) [ -d "$src" ] || { warn "$src is not a folder"; exit 1; }; cp -r "$src" "$tmp/x" ;;
  esac
  dir="$(dirname "$(find "$tmp/x" -maxdepth 3 -name module.json | head -1)")"
  [ -f "$dir/module.json" ] || { warn "No module.json found: that isn't a R.O.U.G.E module."; rm -rf "$tmp"; exit 1; }
  id="$(basename "$src" .zip)"; id="${id%.git}"
  [ "$dir" != "$tmp/x" ] && id="$(basename "$dir")"
  id="$(printf '%s' "$id" | tr 'A-Z_ ' 'a-z--' | tr -cd 'a-z0-9-' | sed 's/^-*//' | cut -c1-40)"
  [ -n "$id" ] || id="module-$(date +%s)"
  echo "  Module: $(grep -o '"name"[^,}]*' "$dir/module.json" | head -1 | cut -d'"' -f4) (id: $id)"
  warn "Custom modules run inside R.O.U.G.E with access to your notes and data. Only add modules from people you trust."
  if [ "$MODE" != --yes ]; then local a; read -r -p "  Install it? [y/N] " a || true; [[ "$a" =~ ^[Yy] ]] || { rm -rf "$tmp"; exit 0; }; fi
  mkdir -p "$DATA/modules"
  rm -rf "${DATA:?}/modules/$id"
  cp -r "$dir" "$DATA/modules/$id"
  rm -rf "$DATA/modules/$id/.git" "$tmp"
  as_user "$(rouge_bin)" modules enable "$id" -data "$DATA" >/dev/null
  ok "Installed. Reload R.O.U.G.E and find it under Tools."
}

module_remove() {
  local id="${1:-}"
  [[ "$id" =~ ^[a-z0-9][a-z0-9-]*$ ]] && [ -d "$DATA/modules/$id" ] || { warn "No custom module called '$id'. See: rouge-setup list"; exit 1; }
  local a; read -r -p "  Remove the custom module $id? [y/N] " a || true
  [[ "$a" =~ ^[Yy] ]] || exit 0
  rm -rf "${DATA:?}/modules/$id"
  ok "Removed $id"
}

uninstall() {
  say "Removing R.O.U.G.E (your data in $DATA stays)"
  sudo systemctl disable --now rouge rouge-mesh 2>/dev/null || true
  sudo rm -f /etc/systemd/system/rouge.service /etc/systemd/system/rouge-mesh.service /etc/sudoers.d/rouge \
    /usr/local/bin/rouge /usr/local/bin/rouge-get /usr/local/bin/rouge-setup /usr/local/bin/rouge-open
  sudo rm -rf "$LIB" /opt/rouge-mesh
  sudo systemctl daemon-reload || true
  rm -f "$HOME_DIR/.local/share/applications/rouge.desktop" "$HOME_DIR/Desktop/rouge.desktop" "$HOME_DIR/.config/autostart/rouge.desktop"
  ok "Uninstalled. Delete $DATA yourself if you want your books, maps and notes gone too."
  exit 0
}

case "$MODE" in
  add) shift; MODE="${2:-}"; module_add "$1"; exit ;;
  remove) module_remove "${2:-}"; exit ;;
  list) "$(rouge_bin)" modules list -data "$DATA"; exit ;;
  uninstall) uninstall ;;
  -h|--help|help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit ;;
  ""|--full|--custom) ;;
  *) warn "Unknown option $MODE (try: rouge-setup help)"; exit 2 ;;
esac

# ================================================================ choose modules
BIN="$HERE/bin/rouge-linux-$ARCH"
if [ ! -f "$BIN" ]; then
  if have go; then
    say "Building R.O.U.G.E from source"
    mkdir -p "$HERE/bin"
    (cd "$HERE/server" && go build -trimpath -ldflags "-s -w" -o "$BIN" .)
  else
    warn "Missing $BIN. Download a release from GitHub, or install Go to build it."
    exit 1
  fi
fi
[ -x "$BIN" ] || chmod +x "$BIN"

mkdir -p "$DATA"
IDS=(); NAMES=(); DESCS=(); STATES=()
while IFS='|' read -r id name group desc on; do
  IDS+=("$id"); NAMES+=("$name"); DESCS+=("$desc"); STATES+=("$on")
done < <(as_user "$BIN" modules ids -data "$DATA")

FIRST=0; [ -x /usr/local/bin/rouge ] || FIRST=1
if [ -z "$MODE" ] && [ -t 0 ]; then
  if have whiptail; then
    if [ $FIRST = 1 ]; then
      # (whiptail would read tags starting with "--" as its own options, so use plain words)
      CHOICE=$(whiptail --title "R.O.U.G.E setup" --menu "How do you want to install?" 13 70 2 \
        "full" "Full install: everything (recommended)" \
        "custom" "Custom: choose which modules to install" 3>&1 1>&2 2>&3) || { warn "Setup cancelled."; exit 1; }
      MODE="--$CHOICE"
    else
      MODE=--custom
    fi
  else
    echo; echo "  1) Full install: everything (recommended)"; echo "  2) Custom: choose modules"
    read -r -p "  Choose [1]: " c || true; [ "$c" = 2 ] && MODE=--custom || MODE=--full
  fi
fi

SELECTED=()
if [ "$MODE" = --custom ]; then
  if have whiptail; then
    args=()
    for i in "${!IDS[@]}"; do
      st=ON; [ "${STATES[$i]}" = false ] && st=OFF
      args+=("${IDS[$i]}" "${NAMES[$i]}: ${DESCS[$i]:0:60}…" "$st")
    done
    out=$(whiptail --title "R.O.U.G.E modules" --separate-output --checklist \
      "Space to tick or untick, Enter to continue.\nHome, Library, Maps, Notes and Settings are always included." \
      22 100 13 "${args[@]}" 3>&1 1>&2 2>&3) || { warn "Setup cancelled."; exit 1; }
    mapfile -t SELECTED <<<"$out"
  else
    for i in "${!IDS[@]}"; do
      def=Y; [ "${STATES[$i]}" = false ] && def=n
      read -r -p "  ${NAMES[$i]} (${DESCS[$i]:0:70}…) [${def}]: " a || true
      a="${a:-$def}"; [[ "$a" =~ ^[Yy] ]] && SELECTED+=("${IDS[$i]}")
    done
  fi
elif [ -z "$MODE" ] && [ $FIRST = 0 ]; then
  for i in "${!IDS[@]}"; do [ "${STATES[$i]}" = true ] && SELECTED+=("${IDS[$i]}"); done   # keep current choices
else
  SELECTED=("${IDS[@]}")
fi
[ "${#SELECTED[@]}" = 1 ] && [ -z "${SELECTED[0]}" ] && SELECTED=()
on() { local x; for x in "${SELECTED[@]}"; do [ "$x" = "$1" ] && return 0; done; return 1; }
echo; echo "  Modules: ${SELECTED[*]:-none (core only)}"

# ================================================================ base install
if ! curl -fsS -m 10 -o /dev/null https://github.com 2>/dev/null; then
  warn "No internet connection. The installer needs internet once to download packages and the map engine."
  warn "R.O.U.G.E will still install, but some parts won't work until you run rouge-setup again online."
fi
say "Installing system packages"
PKGS="kiwix-tools curl wget unzip git ca-certificates whiptail"
on gps     && PKGS="$PKGS gpsd gpsd-clients chrony"
on mesh    && PKGS="$PKGS python3-venv python3-pip"
on radio   && PKGS="$PKGS rtl-sdr alsa-utils"
on weather && PKGS="$PKGS i2c-tools"
sudo apt-get update -qq || warn "apt update failed; continuing with what is installed"
# shellcheck disable=SC2086
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $PKGS >/dev/null || warn "Some packages failed to install: $PKGS"

if ! have kiwix-serve; then
  say "kiwix-tools isn't in apt here; downloading the official build"
  case "$ARCH" in arm64) K=aarch64 ;; armv6) K=armhf ;; amd64) K=x86_64 ;; esac
  TMP="$(mktemp -d)"
  if curl -fL --progress-bar "https://download.kiwix.org/release/kiwix-tools/kiwix-tools_linux-$K.tar.gz" -o "$TMP/k.tgz"; then
    tar -xzf "$TMP/k.tgz" -C "$TMP"
    sudo install -m 755 "$(find "$TMP" -type f -name kiwix-serve | head -1)" /usr/local/bin/kiwix-serve
  fi
  rm -rf "$TMP"
fi
have kiwix-serve && ok "kiwix-serve ready" || warn "kiwix-serve not installed. Books won't open until it is."

say "Installing R.O.U.G.E"
if [ "$HERE" != "$LIB" ]; then
  sudo rm -rf "$LIB.new"
  sudo mkdir -p "$LIB.new/bin"
  sudo cp "$BIN" "$LIB.new/bin/"
  sudo cp -r "$HERE/system" "$HERE/modules" "$HERE/install.sh" "$HERE/rouge-get" "$LIB.new/"
  sudo rm -rf "$LIB" && sudo mv "$LIB.new" "$LIB"
fi
sudo chown -R root:root "$LIB"
sudo chmod 755 "$LIB/install.sh" "$LIB/rouge-get" "$LIB/system/rouge-helper"
sudo install -m 755 "$BIN" /usr/local/bin/rouge
sudo ln -sf "$LIB/rouge-get" /usr/local/bin/rouge-get
sudo ln -sf "$LIB/install.sh" /usr/local/bin/rouge-setup
ok "rouge $(/usr/local/bin/rouge version), rouge-get and rouge-setup installed"

as_user mkdir -p "$DATA"/{zim,maps,places,assets/fonts,notes,pins,supplies,modules,bin}
# example custom module, only on first install
[ $FIRST = 1 ] && [ ! -d "$DATA/modules/converter" ] && as_user cp -r "$LIB/modules/converter" "$DATA/modules/" || true

# ---------------------------------------------------------------- map engine
fetch_js() { # dest, check-string, urls...
  local dest="$1" check="$2"; shift 2
  for u in "$@"; do
    if curl -fsSL "$u" -o "$dest.tmp" 2>/dev/null && grep -q "$check" "$dest.tmp"; then
      mv "$dest.tmp" "$dest"; ok "$(basename "$dest") from $u"; return 0
    fi
  done
  rm -f "$dest.tmp"; return 1
}
A="$DATA/assets"
if [ ! -s "$A/maplibre-gl.js" ] || [ ! -s "$A/pmtiles.js" ]; then
  say "Downloading the map engine (MapLibre GL + PMTiles) for offline use"
  got=0
  for v in $MAPLIBRE_VERSIONS; do
    if fetch_js "$A/maplibre-gl.js" "maplibregl" "https://unpkg.com/maplibre-gl@$v/dist/maplibre-gl.js" "https://cdn.jsdelivr.net/npm/maplibre-gl@$v/dist/maplibre-gl.js"; then
      fetch_js "$A/maplibre-gl.css" "maplibregl" "https://unpkg.com/maplibre-gl@$v/dist/maplibre-gl.css" "https://cdn.jsdelivr.net/npm/maplibre-gl@$v/dist/maplibre-gl.css" && got=1 && break
    fi
  done
  [ $got = 1 ] || warn "Could not download MapLibre. Run rouge-setup again later."
  urls=()
  for v in $PMTILES_VERSIONS; do for f in dist/pmtiles.js dist/index.js; do
    urls+=("https://unpkg.com/pmtiles@$v/$f" "https://cdn.jsdelivr.net/npm/pmtiles@$v/$f")
  done; done
  fetch_js "$A/pmtiles.js" "Protocol" "${urls[@]}" || warn "Could not download pmtiles.js. Run rouge-setup again later."
fi
FONTS="$A/fonts"
if [ ! -f "$FONTS/Noto Sans Regular/0-255.pbf" ]; then
  say "Downloading map fonts (Noto Sans)"
  TMP="$(mktemp -d)"
  if ! { git clone -q --depth 1 --filter=blob:none --sparse https://github.com/protomaps/basemaps-assets "$TMP/ba" 2>/dev/null \
       && git -C "$TMP/ba" sparse-checkout set "fonts/Noto Sans Regular" "fonts/Noto Sans Medium" "fonts/Noto Sans Italic" 2>/dev/null; }; then
    rm -rf "$TMP/ba"; git clone -q --depth 1 https://github.com/protomaps/basemaps-assets "$TMP/ba" || true
  fi
  for f in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
    [ -d "$TMP/ba/fonts/$f" ] && { rm -rf "${FONTS:?}/$f"; cp -r "$TMP/ba/fonts/$f" "$FONTS/"; }
  done
  [ -d "$FONTS/Noto Sans Italic" ] || { [ -d "$FONTS/Noto Sans Regular" ] && cp -r "$FONTS/Noto Sans Regular" "$FONTS/Noto Sans Italic"; }
  [ -d "$FONTS/Noto Sans Medium" ]  || { [ -d "$FONTS/Noto Sans Regular" ] && cp -r "$FONTS/Noto Sans Regular" "$FONTS/Noto Sans Medium"; }
  rm -rf "$TMP"
fi
[ -f "$FONTS/Noto Sans Regular/0-255.pbf" ] && ok "map engine and fonts ready" || warn "Map fonts missing: labels won't show. Run rouge-setup again later."

# ================================================================ module setup
add_group() { getent group "$1" >/dev/null && ! id -nG "$ME" | grep -qw "$1" && sudo usermod -aG "$1" "$ME" && NEED_REBOOT=1 || true; }

if on power || on share; then
  say "System helper (power saver, Wi-Fi, hotspot, clock)"
  sudo install -o root -g root -m 755 "$LIB/system/rouge-helper" "$LIB/rouge-helper"
  echo "$ME ALL=(root) NOPASSWD: $LIB/rouge-helper" | sudo tee /etc/sudoers.d/rouge.tmp >/dev/null
  if sudo visudo -cf /etc/sudoers.d/rouge.tmp >/dev/null; then
    sudo chmod 440 /etc/sudoers.d/rouge.tmp && sudo mv /etc/sudoers.d/rouge.tmp /etc/sudoers.d/rouge
    ok "helper allowed for $ME only"
  else
    sudo rm -f /etc/sudoers.d/rouge.tmp; warn "Could not set up the helper"
  fi
  on share && ! have nmcli && warn "NetworkManager (nmcli) not found. The hotspot needs Raspberry Pi OS Bookworm or newer."
else
  sudo rm -f /etc/sudoers.d/rouge "$LIB/rouge-helper"
fi

if on gps; then
  say "GPS (gpsd, and the clock from satellites)"
  sudo tee /etc/default/gpsd >/dev/null <<'EOF'
# Written by R.O.U.G.E: find USB GPS receivers automatically, and read them
# even with no program connected so the clock can be set from GPS time.
START_DAEMON="true"
USBAUTO="true"
DEVICES=""
GPSD_OPTIONS="-n"
EOF
  if [ -d /etc/chrony/conf.d ] || [ -d /etc/chrony ]; then
    sudo mkdir -p /etc/chrony/conf.d
    sudo tee /etc/chrony/conf.d/rouge-gps.conf >/dev/null <<'EOF'
# Written by R.O.U.G.E: use GPS time when there is no internet.
refclock SHM 0 refid GPS precision 1e-1 offset 0.5 delay 0.2
makestep 1 -1
EOF
    grep -q '^confdir /etc/chrony/conf.d' /etc/chrony/chrony.conf 2>/dev/null || echo 'confdir /etc/chrony/conf.d' | sudo tee -a /etc/chrony/chrony.conf >/dev/null
    sudo systemctl restart chrony 2>/dev/null || true
  fi
  sudo systemctl enable --now gpsd.socket gpsd 2>/dev/null || true
  add_group dialout
  ok "GPS ready: plug in a USB GPS receiver"
fi

if on mesh; then
  say "Mesh radio (Meshtastic)"
  sudo mkdir -p /opt/rouge-mesh && sudo chown "$ME": /opt/rouge-mesh
  [ -x /opt/rouge-mesh/venv/bin/python ] || as_user python3 -m venv /opt/rouge-mesh/venv
  MESH_OK=1
  if as_user /opt/rouge-mesh/venv/bin/pip install -q --upgrade meshtastic; then ok "meshtastic library installed"
  else MESH_OK=0; warn "Could not install the meshtastic library. Run rouge-setup again with internet."; fi
  sudo tee /etc/systemd/system/rouge-mesh.service >/dev/null <<EOF
[Unit]
Description=R.O.U.G.E Meshtastic bridge
After=network.target

[Service]
User=$ME
Environment=ROUGE_DATA=$DATA
ExecStart=/opt/rouge-mesh/venv/bin/python $LIB/system/rouge-mesh.py
Restart=always
RestartSec=10
Nice=10

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload || true
  sudo systemctl enable --now rouge-mesh >/dev/null 2>&1 || true
  add_group dialout
  [ $MESH_OK = 1 ] && ok "mesh bridge running: plug in a Meshtastic radio by USB"
else
  sudo systemctl disable --now rouge-mesh 2>/dev/null || true
fi

if on radio; then
  say "Weather radio (RTL-SDR)"
  sudo mkdir -p /etc/modprobe.d
  echo "blacklist dvb_usb_rtl28xxu" | sudo tee /etc/modprobe.d/rouge-rtlsdr.conf >/dev/null
  sudo modprobe -r dvb_usb_rtl28xxu 2>/dev/null || true
  add_group plugdev; add_group audio
  ok "radio ready: plug in an RTL-SDR dongle (unplug and replug it once if it was already in)"
fi

if on weather; then
  say "Barometer (I2C sensor)"
  if [ ! -e /dev/i2c-1 ]; then
    if have raspi-config; then sudo raspi-config nonint do_i2c 0 && NEED_REBOOT=1
    else
      CFG=/boot/firmware/config.txt; [ -f "$CFG" ] || CFG=/boot/config.txt
      grep -q '^dtparam=i2c_arm=on' "$CFG" 2>/dev/null || { echo 'dtparam=i2c_arm=on' | sudo tee -a "$CFG" >/dev/null; NEED_REBOOT=1; }
    fi
  fi
  add_group i2c
  ok "I2C on: wire a BME280/BMP280 to pins 1 (3.3V), 3 (SDA), 5 (SCL), 6 (GND)"
fi

# remember the choice
as_user "$BIN" modules set "$(IFS=,; echo "${SELECTED[*]}")" -data "$DATA"
ok "module choices saved (change any time with rouge-setup, or in Settings)"

# ================================================================ service
say "Background service"
ADDR="127.0.0.1:$PORT"
if [ -f /etc/default/rouge ]; then
  ADDR="$(sed -n 's/^ROUGE_ADDR=//p' /etc/default/rouge)"; ADDR="${ADDR:-127.0.0.1:$PORT}"
elif ask "Let phones and laptops on your home Wi-Fi open it too? (The hotspot works either way.)"; then
  ADDR="0.0.0.0:$PORT"
fi
sudo tee /etc/default/rouge >/dev/null <<EOF
# Where R.O.U.G.E listens. 127.0.0.1 = this Pi only (the hotspot still works).
# 0.0.0.0 = also other devices on your home network.
ROUGE_ADDR=$ADDR
ROUGE_DATA=$DATA
ROUGE_QUIET=1
EOF
sudo tee /etc/systemd/system/rouge.service >/dev/null <<EOF
[Unit]
Description=R.O.U.G.E offline knowledge and survival server
After=local-fs.target network.target
StartLimitIntervalSec=0

[Service]
User=$ME
EnvironmentFile=-/etc/default/rouge
ExecStart=/usr/local/bin/rouge -addr \${ROUGE_ADDR} -data \${ROUGE_DATA}
Restart=always
RestartSec=3
Nice=5
IOSchedulingClass=idle

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload || true
sudo systemctl enable rouge >/dev/null 2>&1 || true
sudo systemctl restart rouge 2>/dev/null || warn "Couldn't start the background service (no systemd?). Start it by hand: rouge -data $DATA"
sleep 1
systemctl is-active --quiet rouge && ok "running on http://$ADDR" || warn "service didn't start; see: journalctl -u rouge -n 50"

# ================================================================ launcher
sudo install -m 755 "$LIB/system/rouge-open" /usr/local/bin/rouge-open
DESK="[Desktop Entry]
Type=Application
Name=R.O.U.G.E
Comment=Offline Wikipedia, maps, survival guide and tools
Exec=/usr/local/bin/rouge-open
Icon=accessories-dictionary
Categories=Education;Utility;
Terminal=false"
as_user mkdir -p "$HOME_DIR/.local/share/applications"
printf '%s\n' "$DESK" | as_user tee "$HOME_DIR/.local/share/applications/rouge.desktop" >/dev/null
if [ -d "$HOME_DIR/Desktop" ]; then
  printf '%s\n' "$DESK" | as_user tee "$HOME_DIR/Desktop/rouge.desktop" >/dev/null
  chmod +x "$HOME_DIR/Desktop/rouge.desktop" 2>/dev/null || true
fi
# ---------------------------------------------------------------- power on, ready
# Log in to the desktop automatically and open R.O.U.G.E full screen, so the
# cyberdeck is ready as soon as it's switched on. Change later in Settings
# (Start at power-on) or Raspberry Pi Configuration (Auto login).
if [ $FIRST = 1 ]; then
  if [ "$MODE" = --full ] || ask_yes "Start R.O.U.G.E full screen every time the Pi is switched on?"; then
    as_user mkdir -p "$HOME_DIR/.config/autostart"
    printf '%s\n' "[Desktop Entry]" "Type=Application" "Name=R.O.U.G.E" "Comment=Open R.O.U.G.E when the desktop starts" \
      "Exec=/usr/local/bin/rouge-open --fullscreen" "Icon=accessories-dictionary" "Terminal=false" "X-GNOME-Autostart-enabled=true" \
      | as_user tee "$HOME_DIR/.config/autostart/rouge.desktop" >/dev/null
    ok "R.O.U.G.E opens full screen at power-on (press F11 to leave full screen)"
    if have raspi-config; then
      if sudo raspi-config nonint do_boot_behaviour B4 2>/dev/null; then ok "desktop logs in automatically"
      else warn "Couldn't turn on automatic login. Turn it on in Raspberry Pi Configuration, System, Auto login."; fi
    fi
  fi
fi

say "Done"
cat <<EOF
  Open it:        R.O.U.G.E in the menu (Education), or http://127.0.0.1:$PORT
  Get content:    open R.O.U.G.E, then Get content (needs internet)
  Change modules: rouge-setup      (or Settings inside R.O.U.G.E)
  Add a module:   rouge-setup add /path/to/module
  Your files:     $DATA
EOF
if [ $FIRST = 1 ] && have raspi-config; then
  echo
  echo "  Restarting finishes the setup. After that, switching the Pi on opens R.O.U.G.E by itself."
  if ask_yes "Restart the Pi now?"; then sudo reboot; exit 0; fi
elif [ $NEED_REBOOT = 1 ]; then
  warn "Restart the Pi once (sudo reboot) so new permissions and I2C take effect."
fi
# open it now if we're on the desktop
if [ -n "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]; then (nohup /usr/local/bin/rouge-open >/dev/null 2>&1 &); fi
exit 0
