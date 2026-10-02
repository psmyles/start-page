// Drives the startpage: clock, Local/Internet toggle, and the tile grid built
// from links.json. The same file runs as the extension's new-tab page and when
// docs/index.html is opened straight from GitHub Pages.
//
// Manifest V3 forbids remote code, so this ships inside the extension. The only
// things that come off the network are links.json - parsed and validated as
// data, never executed - and the tile images.
//
// Every load paints from the cached links first, then fetches links.json. If it
// differs from what is on screen, the new copy is cached and the page reloads
// to show it.

const PAGES_BASE_URL = 'https://psmyles.github.io/start-page/';

// Inside the extension the page is served from moz-extension://, so links.json
// and the icons have to come from Pages. Anywhere else relative paths work,
// which also lets a local server on docs/ preview uncommitted edits.
const REMOTE_BASE = location.protocol.endsWith('-extension:') ? PAGES_BASE_URL : '';

const CACHE_KEY = 'startpage_links_v1';
const LEGACY_CACHE_KEY = 'startpage_markup_v2'; // v4.0 cached scraped HTML
const RELOADED_FLAG = 'startpage_reloaded';

// Switching back to an open tab re-checks, but not more often than this.
const RECHECK_AFTER_MS = 60 * 1000;
// A laptop that has just woken up often has no network for the first few
// seconds, so a failed check is retried on this schedule. After that it waits
// for the 'online' event or for the tab to be shown again.
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

// The canonical JSON of the links currently on screen, or null if none are.
let shownJson = null;
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

function iconUrl(icon) {
  if (/^https?:\/\//.test(icon)) {
    return icon;
  }
  return REMOTE_BASE + icon.replace(/^\.?\//, '');
}

// Built with DOM calls rather than markup, so nothing in links.json can inject
// elements or script.
function buildTile(link) {
  const tile = document.createElement('a');
  tile.className = 'icon';
  tile.dataset.local = link.local;
  if (link.internet) {
    tile.dataset.internet = link.internet;
  }

  const img = document.createElement('img');
  img.src = iconUrl(link.icon);
  img.alt = link.name;

  const label = document.createElement('span');
  label.textContent = link.name;

  tile.append(img, label);
  return tile;
}

function showLinks(json) {
  const { links } = JSON.parse(json);
  document.querySelector('.icon-grid').replaceChildren(...links.map(buildTile));
  applyMode(isInternetMode());
  shownJson = json;
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
    return parseLinks(cached);
  } catch (error) {
    console.warn('Discarding unreadable link cache:', error);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

function applyUpdate(fresh) {
  localStorage.setItem(CACHE_KEY, fresh);

  // First run: nothing on screen to replace, so no reload needed.
  if (shownJson === null) {
    showLinks(fresh);
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
  if (retryIndex < RETRY_DELAYS_MS.length) {
    retryTimer = setTimeout(checkForUpdate, RETRY_DELAYS_MS[retryIndex]);
    retryIndex += 1;
  }
}

async function checkForUpdate() {
  if (checking) {
    return;
  }
  checking = true;
  clearTimeout(retryTimer);

  try {
    // 'no-cache' makes Firefox revalidate rather than reuse its own copy. The
    // GitHub Pages CDN can still hand back its copy for up to ten minutes
    // after a push - it ignores query strings, so that cannot be busted.
    const response = await fetch(`${REMOTE_BASE}links.json`, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const fresh = parseLinks(await response.text());
    lastCheckedAt = Date.now();
    retryIndex = 0;

    if (fresh !== shownJson) {
      applyUpdate(fresh);
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
    showLinks(cached);
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
