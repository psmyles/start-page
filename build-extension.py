#!/usr/bin/env python3
"""Packages the Firefox extension into a zip ready for upload to addons.mozilla.org.

Runs on macOS, Windows and Linux with Python 3.8+ and nothing but the standard
library:

    python3 build-extension.py            # macOS / Linux
    py build-extension.py                 # Windows (or: python build-extension.py)

Repo layout:

  docs/       Served by GitHub Pages (Settings > Pages > main, /docs folder).
              docs/ is the site root, so docs/links.json is
              https://psmyles.github.io/start-page/links.json.
              Edit links.json or icon/ and just push - the installed
              extension picks it up on the next new tab, no re-release.

  extension/  The add-on manifest and icon. Changing anything in here
              means a version bump and a fresh upload to AMO.

Manifest V3 forbids remote code, so the page itself - index.html, script.js,
styles.css and the font - is bundled into the package as well as being served
from docs/. There is still only ONE copy of each in the repo - this script
reaches into docs/ for them at build time. The trade-off: editing those four
does require a new version upload, unlike links.json and the tile icons.
"""

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# --- What goes in the package -----------------------------------------------
# source path in the repo  ->  path inside the zip
# Entries must land at the archive root; Firefox rejects a nested manifest.json.
PACKAGE_MAP = {
    'extension/manifest.json': 'manifest.json',
    'docs/index.html': 'index.html',
    'docs/script.js': 'script.js',
    'docs/styles.css': 'styles.css',
    'docs/fonts/SwedenSansRegular.ttf': 'fonts/SwedenSansRegular.ttf',
}

MANIFEST_SOURCE = 'extension/manifest.json'
VERSION_RE = re.compile(r'("version"\s*:\s*")([^"]+)(")')

AMO_SUBMIT_URL = 'https://addons.mozilla.org/developers/addon/my-startpage/versions/submit/'


def fail(message):
    print(f'error: {message}', file=sys.stderr)
    sys.exit(1)


def bump_version(version):
    segments = version.split('.')
    if not segments[-1].isdigit():
        fail(f'cannot bump version "{version}": last segment is not a number')
    segments[-1] = str(int(segments[-1]) + 1)
    return '.'.join(segments)


def main():
    parser = argparse.ArgumentParser(
        description='Package the Firefox extension into a zip for addons.mozilla.org.')
    parser.add_argument(
        '--bump', action='store_true',
        help='increment the last segment of the manifest version before packaging '
             '(e.g. 4.0 -> 4.1) and write it back to extension/manifest.json')
    parser.add_argument(
        '--output-dir', type=Path, default=ROOT / 'dist',
        help='where to write the zip (default: ./dist, gitignored)')
    args = parser.parse_args()

    package_map = dict(PACKAGE_MAP)
    manifest_path = ROOT / MANIFEST_SOURCE

    if not manifest_path.is_file():
        fail(f'manifest.json not found at {manifest_path}')

    # --- Read + validate the manifest ---------------------------------------
    # newline='' keeps the file's own line endings when it is written back.
    # utf-8-sig tolerates a BOM, which Windows editors like to add.
    with manifest_path.open(encoding='utf-8-sig', newline='') as f:
        raw_manifest = f.read()

    try:
        manifest = json.loads(raw_manifest)
    except json.JSONDecodeError as error:
        fail(f'extension/manifest.json is not valid JSON: {error}')

    match = VERSION_RE.search(raw_manifest)
    if not match:
        fail('could not find a "version" field in extension/manifest.json')
    version = match.group(2)

    # --- Optionally bump the version ----------------------------------------
    if args.bump:
        new_version = bump_version(version)
        # Rewrite only the version value so the rest of the file keeps its formatting.
        raw_manifest = VERSION_RE.sub(
            lambda m: m.group(1) + new_version + m.group(3), raw_manifest, count=1)
        with manifest_path.open('w', encoding='utf-8', newline='') as f:
            f.write(raw_manifest)
        print(f'Version bumped: {version} -> {new_version}')
        version = new_version

    # --- Pull in any icons the manifest declares ----------------------------
    # Manifest icon paths are relative to the extension folder, and keep that
    # same path inside the package.
    for icon_path in (manifest.get('icons') or {}).values():
        source = f'extension/{icon_path}'
        if icon_path and source not in package_map:
            package_map[source] = icon_path

    # --- Verify every source file exists before building anything -----------
    missing = [source for source in package_map if not (ROOT / source).is_file()]
    if missing:
        fail(f'missing source file(s): {", ".join(missing)}')

    # --- Work out the output path -------------------------------------------
    slug = re.sub(r'\s+', '-', re.sub(r'[^\w\s-]', '', manifest.get('name', ''))).lower()
    if not slug:
        slug = 'extension'

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    zip_path = output_dir / f'{slug}-{version}.zip'
    if zip_path.exists():
        zip_path.unlink()
        print(f'Replaced existing {zip_path.name}')

    # --- Build the zip ------------------------------------------------------
    # Entry names are set explicitly: forward slashes, rooted at the archive
    # top level, whatever the host OS uses as a path separator.
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source, entry in package_map.items():
            archive.write(ROOT / source, arcname=entry.replace('\\', '/'))

    # --- Report -------------------------------------------------------------
    print()
    print(f'Packaged {manifest.get("name")} v{version}')
    print()

    rows = [(source, entry, str((ROOT / source).stat().st_size)) for source, entry in package_map.items()]
    headers = ('Source', 'InPackage', 'Bytes')
    widths = [max(len(row[i]) for row in rows + [headers]) for i in range(3)]
    print(f'{headers[0]:<{widths[0]}}  {headers[1]:<{widths[1]}}  {headers[2]:>{widths[2]}}')
    print(f'{"-" * widths[0]}  {"-" * widths[1]}  {"-" * widths[2]}')
    for source, entry, size in rows:
        print(f'{source:<{widths[0]}}  {entry:<{widths[1]}}  {size:>{widths[2]}}')

    zip_kb = round(zip_path.stat().st_size / 1024, 1)
    print()
    print(f'-> {zip_path} ({zip_kb} KB)')
    print()
    print(f'Upload at: {AMO_SUBMIT_URL}')
    print('AMO rejects a version number it has already seen - use --bump if this one is taken.')


if __name__ == '__main__':
    main()
