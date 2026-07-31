// Drives the startpage. Bundled inside the extension (Manifest V3 does not allow
// loading this from GitHub Pages), and also loaded directly by index.html when
// the page is opened standalone on Pages.

let clockTimer = null;

function updateDateTime() {
  const dateElement = document.getElementById('date');
  const timeElement = document.getElementById('time');
  if (!dateElement || !timeElement) {
    return;
  }

  const now = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric' };

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  dateElement.textContent = now.toLocaleDateString(undefined, options);
  timeElement.textContent = `${hours}:${minutes} ${ampm}`;
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

function initStartpage() {
  // Deliberately idempotent: injector.js re-renders the body whenever GitHub
  // Pages has newer markup, and calls this again. Every element referenced here
  // is replaced by that re-render, so the only thing needing explicit cleanup is
  // the interval.
  if (clockTimer !== null) {
    clearInterval(clockTimer);
  }
  updateDateTime();
  clockTimer = setInterval(updateDateTime, 10000);

  const isInternet = localStorage.getItem('mode') === 'internet';
  const toggle = document.getElementById('url-toggle');

  if (toggle) {
    toggle.checked = isInternet;
    toggle.addEventListener('change', event => {
      applyMode(event.target.checked);
      localStorage.setItem('mode', event.target.checked ? 'internet' : 'local');
    });
  }

  applyMode(isInternet);
  document.body.classList.add('ready');
}

// Opened straight from GitHub Pages the grid is already in the DOM, so start
// now. Inside the extension the body is still empty at this point and
// injector.js calls initStartpage() once it has rendered the markup.
if (document.querySelector('.icon-grid')) {
  initStartpage();
}
