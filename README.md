# Start page

My browser start page, and the Firefox extension that shows it on every new tab.

## Layout

```
docs/          Served by GitHub Pages - this folder is the site root
  index.html     the tiles
  icon/          tile images
  script.js      clock + Local/Internet toggle   (also bundled, see below)
  styles.css     theme                           (also bundled, see below)
  fonts/         SwedenSans                      (also bundled, see below)

extension/     The Firefox add-on
  manifest.json
  local-index.html   new-tab page
  injector.js        fetches docs/index.html and renders it
  icon.png           add-on icon

build-extension.ps1  builds the zip for addons.mozilla.org
dist/                build output (gitignored)
```

## Changing things

**Adding or editing a tile** — edit `docs/index.html`, drop the image in
`docs/icon/`, push. The installed extension picks it up on the next new tab. No
re-release.

Each tile needs `data-local`. Add `data-internet` only when it should point
somewhere else while away from the LAN; otherwise `data-local` is used for both.

```html
<a href="#" data-local="https://example.com" class="icon">
  <img src="icon/example.png" alt="Example" />
  <span>Example</span>
</a>
```

**Changing the extension** — anything in `extension/`, plus `script.js`,
`styles.css` and the font, ships inside the package. Those need a version bump
and a new upload:

```powershell
.\build-extension.ps1 -Bump      # bumps version, writes dist\my-startpage-<v>.zip
```

Then upload the zip at
[AMO](https://addons.mozilla.org/developers/addon/my-startpage/versions/submit/).

To check it before uploading: `about:debugging` → Load Temporary Add-on → pick
the zip, then open a new tab.

## Why script.js and styles.css are in docs/ but also packaged

Manifest V3 forbids extensions from running remote code, so the extension cannot
load `script.js` off GitHub Pages the way it used to. Both files are therefore
bundled into the package at build time — but there is still only one copy in the
repo, and `build-extension.ps1` reaches into `docs/` for them.

Keeping them in `docs/` also means `https://psmyles.github.io/start-page/` works
as a normal web page, which is handy for previewing a change before packaging.

The extension fetches only the *markup* of `docs/index.html`; `injector.js`
strips every `<script>` and stylesheet link before rendering, so nothing served
from Pages is ever executed.
