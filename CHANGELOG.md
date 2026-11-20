# Changelog

## 2.1.0

- **Power on and it's ready:**
  - The installer sets up automatic desktop login and opens R.O.U.G.E full screen at power-on (toggle in Settings).
  - The window waits for R.O.U.G.E to be ready.
  - Chromium's "restore pages" and keyring prompts are suppressed after power loss.
- **Get content page:** download Wikipedia, books, maps and place names from inside the app, with progress, cancel, resume and automatic replacement of older versions. Includes Quick start sets for 32, 64 and 128 GB.
- **The map engine heals itself:** it downloads automatically when it's missing and the Pi is online.
- **Library fixes:**
  - When kiwix-serve fails, the Library page now shows the real reason.
  - If its port is busy, it uses another one.
  - It can no longer hang when restarting.
- **Installer fixes:**
  - The Full/Custom menu now opens (it exited silently before).
  - It reports when no internet is available.
  - It works without systemd.
  - It offers to restart at the end.
  - The service always restarts if it stops.
- **Book list fixes:**
  - Corrected the tiny test Wikipedia name.
  - Removed wikiHow, which is no longer on the Kiwix server.
  - Added `scripts/check-books.sh` to verify the list.


## 2.0.0

- New name: R.O.U.G.E.
- Module system. Every feature can be switched on or off in Settings or with `rouge-setup`, and custom modules can be added from a folder, zip or git repository.
- Installer with Full and Custom modes (whiptail checklist). It is installed as `rouge-setup` for later changes, adding modules and uninstalling.
- New modules:
  - Field Guide: 26 sourced cards;
  - Supplies tracker and kit checklist;
  - encrypted Documents vault;
  - Power (power saver, radios, brightness, battery-run log);
  - Share & Board: Wi-Fi hotspot, guest access, message board;
  - Sun & Moon;
  - SOS Light.
- Hardware modules:
  - GPS (gpsd, trails, GPX, clock from satellites);
  - Mesh Radio (Meshtastic);
  - Weather Radio (RTL-SDR);
  - Barometer (BME280/BMP280 with storm warning).
- Map tools: nearest medical, water, shelter, police/fire and fuel/food; distance measuring; coordinates as decimal, DMS, UTM or MGRS; "Set as home".
- Phones on the hotspot or network are guests. They get read-only access to shareable features only.
- Home alerts for a wrong clock, expired supplies and falling pressure.
- Example custom module: Unit Converter.

## 1.0.0

- First version: offline Wikipedia and other books (Kiwix), offline vector maps (PMTiles) with place search and pins, notes, system status, and `rouge-get` for downloading content.
