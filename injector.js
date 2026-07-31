// Renders the startpage inside the extension's new-tab override.
//
// Manifest V3 forbids executing remote code, so the document fetched from
// GitHub Pages is treated as DATA ONLY: every <script> is stripped and the page
// is driven by script.js, which ships inside the extension. Stylesheet and font
// are bundled too. The only things still coming off the network are the markup
// itself and the tile images - which is exactly the part that changes often.

const PAGES_BASE_URL = 'https://psmyles.github.io/start-page/';
const CACHE_KEY = 'startpage_markup_v2';

// Turn a fetched document into the body markup we are willing to render.
function extractBody(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // No remote code, ever. script.js is supplied by the extension.
  doc.querySelectorAll('script').forEach(el => el.remove());

  // styles.css is bundled; loading the Pages copy as well would only add a
  // network round-trip and a flash of unstyled content.
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.remove());

  // Tile images do still live on Pages, so relative paths need resolving.
  doc.querySelectorAll('img[src]').forEach(el => {
    const src = el.getAttribute('src');
    if (src && !/^(?:https?:)?\/\//.test(src) && !src.startsWith('data:')) {
      el.setAttribute('src', PAGES_BASE_URL + src.replace(/^\.?\//, ''));
    }
  });

  return doc.body.innerHTML.trim();
}

function render(markup) {
  // Built through DOMParser and node adoption rather than an innerHTML
  // assignment: parsed documents are inert, so nothing in the fetched markup can
  // run, and AMO review does not have to take that on trust.
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  document.body.replaceChildren(...doc.body.childNodes);

  // Defined in script.js. Safe to call repeatedly - see initStartpage().
  initStartpage();
}

function renderOfflineNotice() {
  const wrapper = document.createElement('div');
  wrapper.className = 'offline';

  const heading = document.createElement('h1');
  heading.textContent = 'Offline';

  const detail = document.createElement('p');
  detail.textContent = 'Could not load startpage.';

  wrapper.append(heading, detail);
  document.body.replaceChildren(wrapper);
  document.body.classList.add('ready');
}

async function loadStartpage() {
  // Phase 1: paint instantly from the last known good copy.
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    render(cached);
  }

  // Phase 2: check GitHub Pages for newer markup.
  try {
    // 'no-cache' revalidates instead of sitting on the Cache-Control: max-age=600
    // that Pages sends, so an edit shows up on the next new tab rather than up
    // to ten minutes later.
    const response = await fetch(PAGES_BASE_URL + 'index.html', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markup = extractBody(await response.text());
    if (!markup) {
      throw new Error('Fetched page had an empty body');
    }

    if (markup !== cached) {
      localStorage.setItem(CACHE_KEY, markup);
      // Re-render immediately. Previously the fresh copy was only stored and
      // you saw it on the *next* new tab.
      render(markup);
    }
  } catch (error) {
    console.error('Startpage update failed:', error);
    if (!cached) {
      renderOfflineNotice();
    }
  }
}

loadStartpage();
