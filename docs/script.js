// Drives the startpage: clock, Local/Internet toggle, and the tile grid built
// from links.json. The same file runs as the extension's new-tab page and when
// docs/index.html is opened straight from GitHub Pages.
//
// Manifest V3 forbids remote code, so this ships inside the extension. The only
// things that come off the network are links.json - parsed and validated as
// data, never executed - and the tile images.
//
// Every load paints from the cached links first, then fetches links.json. If it
// comes from a newer deploy than what is on screen, the new copy is cached and
// the page reloads to show it.

const PAGES_BASE_URL = 'https://psmyles.github.io/start-page/';

// Inside the extension the page is served from moz-extension://, so links.json
// and the icons have to come from Pages. Anywhere else relative paths work,
// which also lets a local server on docs/ preview uncommitted edits.
const REMOTE_BASE = location.protocol.endsWith('-extension:') ? PAGES_BASE_URL : '';

const CACHE_KEY = 'startpage_links_v1';
const VERSION_KEY = 'startpage_links_version'; // deploy time of the cached copy
const LEGACY_CACHE_KEY = 'startpage_markup_v2'; // v4.0 cached scraped HTML
const RELOADED_FLAG = 'startpage_reloaded';

// Switching back to an open tab re-checks, but not more often than this.
const RECHECK_AFTER_MS = 60 * 1000;
// A laptop that has just woken up often has no network for the first few
// seconds, so a failed check is retried on this schedule, and then once a
// minute (the last delay repeats) until one gets through. A network that is up
// but not yet working never fires 'online', so that alone can't be relied on.
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];

// The canonical JSON of the links currently on screen, or null if none are,
// and the deploy time of that copy (0 if unknown).
let shownJson = null;
let shownVersion = 0;
let checking = false;
let lastCheckedAt = 0;
let retryIndex = 0;
let retryTimer = null;

// Set by the reload this script triggered. While set, a check that finds yet
// another version caches it but does not reload again, so a CDN serving
// alternating copies cannot put the tab in a reload loop.
let reloadGuard = sessionStorage.getItem(RELOADED_FLAG) === '1';
sessionStorage.removeItem(RELOADED_FLAG);

function updateDateTime() {
  const now = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric' };

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  document.getElementById('date').textContent = now.toLocaleDateString(undefined, options);
  document.getElementById('time').textContent = `${hours}:${minutes} ${ampm}`;
}

function isInternetMode() {
  return localStorage.getItem('mode') === 'internet';
}

// data-internet is optional. Tiles that point at the same place on and off the
// LAN only carry data-local; the handful of self-hosted services that differ
// (Home Assistant, Proxmox, Unifi, Paperless) declare both.
function targetUrl(icon, isInternet) {
  if (isInternet && icon.dataset.internet) {
    return icon.dataset.internet;
  }
  return icon.dataset.local;
}

function applyMode(isInternet) {
  document.querySelectorAll('.icon').forEach(icon => {
    icon.href = targetUrl(icon, isInternet);
  });
}

function isWebUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Everything from links.json passes through here, whether it came from the
// network or the cache. A typo in the file throws, and the caller carries on
// showing the last good set of links rather than a broken grid.
function parseLinks(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.links) || data.links.length === 0) {
    throw new Error('links.json needs a non-empty "links" array');
  }

  const links = data.links.map((link, index) => {
    const where = `links.json entry ${index + 1}`;
    if (!link || typeof link.name !== 'string' || !link.name.trim()) {
      throw new Error(`${where} needs a "name"`);
    }
    if (typeof link.icon !== 'string' || !link.icon.trim()) {
      throw new Error(`${where} (${link.name}) needs an "icon"`);
    }
    if (!isWebUrl(link.local)) {
      throw new Error(`${where} (${link.name}) needs an http(s) "local" URL`);
    }
    if (link.internet !== undefined && !isWebUrl(link.internet)) {
      throw new Error(`${where} (${link.name}) has an "internet" URL that is not http(s)`);
    }

    const clean = { name: link.name, icon: link.icon, local: link.local };
    if (link.internet) {
      clean.internet = link.internet;
    }
    return clean;
  });

  // Re-serialised, so formatting changes to links.json alone never count as
  // an update.
  return JSON.stringify({ links });
}

// GitHub Pages stamps every file with the time of the deploy that published it,
// so this orders copies of links.json, and it changes on any push to docs/,
// including one that only replaces an icon. 0 if the header is missing.
function deployVersion(response) {
  const time = Date.parse(response.headers.get('Last-Modified'));
  return Number.isNaN(time) ? 0 : time;
}

function storedVersion() {
  return Number(localStorage.getItem(VERSION_KEY)) || 0;
}

// The deploy time goes in the URL of Pages-hosted icons, so an icon replaced
// under the same name is fetched afresh after the next deploy. Otherwise a tab
// Firefox restores at startup shows whatever image it cached, however old,
// because restored pages load their images without revalidating. The Pages CDN
// ignores query strings, so this makes no difference on its side.
function iconUrl(icon, version) {
  if (/^https?:\/\//.test(icon)) {
    return icon;
  }
  const url = REMOTE_BASE + icon.replace(/^\.?\//, '');
  if (!version) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
}

// Built with DOM calls rather than markup, so nothing in links.json can inject
// elements or script.
function buildTile(link, version) {
  const tile = document.createElement('a');
  tile.className = 'icon';
  tile.dataset.local = link.local;
  if (link.internet) {
    tile.dataset.internet = link.internet;
  }

  const img = document.createElement('img');
  img.src = iconUrl(link.icon, version);
  img.alt = link.name;

  const label = document.createElement('span');
  label.textContent = link.name;

  tile.append(img, label);
  return tile;
}

function showLinks(json, version) {
  const { links } = JSON.parse(json);
  document.querySelector('.icon-grid').replaceChildren(...links.map(link => buildTile(link, version)));
  applyMode(isInternetMode());
  shownJson = json;
  shownVersion = version;
  document.body.classList.add('ready');
}

// Shown only when there is no cached copy and links.json could not be loaded.
function showOfflineNotice() {
  const notice = document.createElement('p');
  notice.className = 'offline';
  notice.textContent = 'Offline - could not load links.';
  document.querySelector('.icon-grid').replaceChildren(notice);
  document.body.classList.add('ready');
}

function readCache() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) {
    return null;
  }
  try {
    return { json: parseLinks(cached), version: storedVersion() };
  } catch (error) {
    console.warn('Discarding unreadable link cache:', error);
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(VERSION_KEY);
    return null;
  }
}

function applyUpdate(fresh, version) {
  localStorage.setItem(CACHE_KEY, fresh);
  localStorage.setItem(VERSION_KEY, String(version));

  // First run: nothing on screen to replace, so no reload needed.
  if (shownJson === null) {
    showLinks(fresh, version);
    return;
  }

  if (reloadGuard) {
    console.warn('Links changed again straight after reloading; cached, will show next time.');
    return;
  }

  sessionStorage.setItem(RELOADED_FLAG, '1');
  location.reload();
}

function scheduleRetry() {
  const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
  retryTimer = setTimeout(checkForUpdate, delay);
  retryIndex += 1;
}

async function checkForUpdate() {
  if (checking) {
    return;
  }
  checking = true;
  clearTimeout(retryTimer);

  try {
    // A new URL every time, so Firefox's HTTP cache can never answer this.
    // 'no-cache' alone is not enough: while Firefox considers itself offline
    // (common just after launch on a laptop) it serves cached copies without
    // revalidating, and the page's own cache flags can override the request's.
    // The stale copy then looked like a successful check, so the tab stopped
    // trying and kept showing old links. Now that case fails and is retried.
    // The Pages CDN ignores the query string, so it can still hand back its
    // copy of the previous deploy for up to ten minutes after a push; the
    // version check below stops that from replacing a newer one.
    const response = await fetch(`${REMOTE_BASE}links.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const fresh = parseLinks(await response.text());
    const version = deployVersion(response);
    lastCheckedAt = Date.now();
    retryIndex = 0;

    if (version && version < Math.max(shownVersion, storedVersion())) {
      console.warn('Ignoring links.json from an older deploy; the Pages CDN has not caught up yet.');
    } else if (fresh !== shownJson || version !== shownVersion) {
      applyUpdate(fresh, version);
    }
    reloadGuard = false;
  } catch (error) {
    console.error('Startpage update check failed:', error);
    if (shownJson === null) {
      showOfflineNotice();
    }
    scheduleRetry();
  } finally {
    checking = false;
  }
}

function initToggle() {
  const toggle = document.getElementById('url-toggle');
  toggle.checked = isInternetMode();
  toggle.addEventListener('change', event => {
    applyMode(event.target.checked);
    localStorage.setItem('mode', event.target.checked ? 'internet' : 'local');
  });
}

function start() {
  updateDateTime();
  setInterval(updateDateTime, 10000);
  initToggle();

  localStorage.removeItem(LEGACY_CACHE_KEY);

  const cached = readCache();
  if (cached) {
    showLinks(cached.json, cached.version);
  }
  checkForUpdate();

  window.addEventListener('online', () => {
    retryIndex = 0;
    checkForUpdate();
  });

  // A new-tab page left open never reloads on its own, so check again when it
  // is brought back into view.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheckedAt > RECHECK_AFTER_MS) {
      checkForUpdate();
    }
  });
}

start();
