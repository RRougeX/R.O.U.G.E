# Writing a R.O.U.G.E module

A custom module is a folder with two files:

```
my-module/
  module.json     name, icon and description
  index.html      the page (plus any other files it needs)
```

R.O.U.G.E shows it under **Tools**, opens `index.html` in a full-height frame, and lets people turn it on or off in **Settings → Modules**. Modules work offline like everything else: don't load anything from the internet.

## module.json

```json
{
  "name": "Ham Log",
  "desc": "Log radio contacts.",
  "icon": "radio",
  "version": "1.0.0",
  "entry": "index.html",
  "guest": false
}
```

| Field | Meaning |
|---|---|
| `name` | Shown in Tools and Settings. |
| `desc` | One sentence about what it does. |
| `icon` | One of R.O.U.G.E's icon names, such as `radio`, `map`, `book`, `cross`, `droplet`, `flame`, `tent`, `compass`, `ruler`, `gauge`, `heart`, `users`, `calendar`, `box` or `puzzle` (the default). See `ICONS` in `server/web/app.js` for the full list. |
| `version` | Optional, shown in the page header. |
| `entry` | The page to open. Defaults to `index.html`. |
| `guest` | `true` lets phones on the hotspot use it. Defaults to `false`, meaning the device only. |

The folder name becomes the module's id. Use lowercase letters, numbers and dashes, and don't reuse a built-in id such as `gps` or `guide`.

## Looking built in

Your page is served from the same address as R.O.U.G.E, so it can use the same stylesheet and follow light and dark mode:

```html
<link rel="stylesheet" href="/app.css">
<script>
  const sync = () => { try { document.documentElement.classList.toggle("dark",
    parent.document.documentElement.classList.contains("dark")); } catch (e) {} };
  sync(); try { parent.addEventListener("themechange", sync); } catch (e) {}
</script>
```

These classes are available:

- layout: `page`, `card card-pad`, `grid grid-2` / `grid-3`, `row`, `stack`;
- form: `btn` (plus `btn-outline`, `btn-ghost`, `btn-sm`), `input`, `select`, `field`;
- display: `chip`, `badge`, `table`, `muted`, `small`, `big-num`, `alert alert-warn`.

The example in [`modules/converter`](modules/converter) uses them.

## Using R.O.U.G.E's data

Pages can call the same local API the app uses. Everything is JSON.

| Call | Returns |
|---|---|
| `GET /api/status` | Device status: temperature, storage, power warnings. |
| `GET /api/config` | Household size, units (`imperial`/`metric`), home location. |
| `GET /api/places?q=rochester` | Offline place search, or coordinates. |
| `GET /api/suggest?q=water` | Article titles across all books (`url` opens in `/kiwix/...`). |
| `GET /api/notes`, `POST /api/notes`, `PUT /api/notes/{id}` | Notes. |
| `GET /api/pins` | Saved map pins. |
| `GET /api/supplies` | Supplies inventory. |
| `GET /api/gps` | Current GPS fix, when the GPS module is on. |
| `GET /api/weather` | Barometer readings, when that module is on. |

To keep your module's own data, save it as notes with a recognisable title, or use `localStorage` (per browser) for small things. To open another page of R.O.U.G.E, set `parent.location.hash`, for example `parent.location.hash = "#/maps?lat=43.1&lon=-77.6&z=13"`.

## Adding your own Field Guide cards

You don't need a module for this. Drop a JSON file into `~/rouge/guide/`, for example `~/rouge/guide/family.json`:

```json
[
  {
    "id": "family-meeting-point",
    "cat": "Plans",
    "title": "Family meeting point",
    "summary": "Where we meet if we're separated and phones don't work.",
    "steps": ["First choice: the library steps on Main St.", "If that's unsafe: Grandma's house, 14 Oak Rd."],
    "source": "Our family plan"
  }
]
```

Cards can also have `warn` (a warning box), `table` (`{"head": [...], "rows": [[...]]}`) and `tags` (extra search words).

## Installing and sharing

```sh
rouge-setup add ./my-module                             # a folder
rouge-setup add my-module.zip                           # a zip file
rouge-setup add https://github.com/someone/rouge-ham-log   # a git repository
rouge-setup remove my-module
```

You can also copy the folder into `~/rouge/modules/` and reload the page.

To share a module, put the folder in its own git repository, or zip it. Remember that a module runs inside R.O.U.G.E with access to its data: only install modules from people you trust, and read the code first.

## Built-in modules

The built-in modules (Field Guide, Supplies, GPS and the others) live in `server/web/mod/*.js` with their server parts in `server/*.go`. Each registers a page in `routes`, can add a status line to Tools (`toolStatus`) and cards or alerts to Home (`homeHooks`). To add a new built-in module, follow `sos.js` (no server part) or `weather.js` (with `baro.go`). Also add an entry to `builtinModules` in `server/config.go`, and its setup steps to `install.sh`.
