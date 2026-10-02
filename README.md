# Start page

My browser start page, and the Firefox extension that shows it on every new tab.

## Layout

```
docs/          Served by GitHub Pages - this folder is the site root
  links.json     the tiles - edit this
  icon/          tile images
  index.html     page shell (toggle, clock, empty grid)   (also bundled, see below)
  script.js      builds the grid, clock, toggle, updates  (also bundled, see below)
  styles.css     theme                                    (also bundled, see below)
  fonts/         SwedenSans                               (also bundled, see below)

extension/     The Firefox add-on
  manifest.json
  icon.png           add-on icon

build-extension.py   builds the zip for addons.mozilla.org (macOS + Windows)
dist/                build output (gitignored)
```

## Changing things

**Adding or editing a tile** — edit `docs/links.json`, drop the image in
`docs/icon/`, push. No re-release needed.

```json
{ "name": "Example", "icon": "icon/example.png", "local": "https://example.com" }
```

`local` is required. Add `internet` only when the tile should point somewhere
else while away from the LAN; otherwise `local` is used for both. Tiles appear
in file order.

If `links.json` is malformed (a missing comma, a missing `name` or `local`), the
extension rejects it and keeps showing the last good links. The reason is logged
in the new tab's console.

**Changing the extension** — anything in `extension/`, plus `index.html`,
`script.js`, `styles.css` and the font, ships inside the package. Those need a
version bump and a new upload:

```sh
python3 build-extension.py --bump    # macOS: bumps version, writes dist/my-startpage-<v>.zip
py build-extension.py --bump         # Windows (or: python build-extension.py --bump)
```

Needs Python 3.8 or newer, standard library only. Leave off `--bump` to repackage
the current version.

Then upload the zip at
[AMO](https://addons.mozilla.org/developers/addon/my-startpage/versions/submit/).

To check it before uploading: `about:debugging` → Load Temporary Add-on → pick
the zip, then open a new tab.

To preview a `links.json` edit before pushing, serve `docs/` locally
(`python3 -m http.server -d docs`) and open `http://localhost:8000`. Opening
`index.html` as a file does not work, because the browser won't fetch
`links.json` from `file://`.

## How updates reach the new tab

1. The page paints straight away from the links cached on the last visit.
2. It then fetches `links.json` from Pages. Allow a minute or so for Pages to
   deploy after a push, and up to ten minutes more for the Pages CDN to let go of
   its old copy. The CDN ignores query strings, so this can't be skipped.
3. If the links differ from what's on screen, the new copy is cached and the
   page reloads once to show it.
4. If the fetch fails, for example straight after the laptop wakes and the
   network isn't up yet, it retries after 2, 5, 15 and 30 seconds, and again
   when Firefox reports it's back online.
5. A new tab left open checks again when you switch back to it, at most once a
   minute.

After an update-triggered reload, the tab won't reload again even if yet another
version turns up straight away. That copy is cached and shows on the next check.
This means a flaky CDN can never trap the tab in a reload loop.

## Why index.html, script.js and styles.css are in docs/ but also packaged

Manifest V3 forbids extensions from running remote code, so the extension
cannot load `script.js` off GitHub Pages. The page is therefore bundled into the
package at build time — but there is still only one copy in the repo, and
`build-extension.py` reaches into `docs/` for them.

Keeping them in `docs/` also means `https://psmyles.github.io/start-page/` works
as a normal web page, running the same code as the extension.

The only things the extension fetches from Pages are `links.json` and the tile
images. `links.json` is parsed as data and validated: only `http(s)` URLs are
accepted, and tiles are built with DOM calls, never from markup. So nothing
served from Pages is ever executed.
