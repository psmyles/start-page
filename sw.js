const CACHE_NAME = 'startpage-extension-v1';
const GITHUB_BASE = 'https://psmyles.github.io/start-page/'; // Ensure this matches your repo URL exactly

const ASSETS_TO_CACHE = [
  // We must cache the absolute URLs from GitHub
  GITHUB_BASE + 'index.html',
  GITHUB_BASE + 'styles.css',
  GITHUB_BASE + 'script.js',
  GITHUB_BASE + 'fonts/SwedenSansRegular.ttf',
  
  // Icons
  GITHUB_BASE + 'icons/feedly.png',
  GITHUB_BASE + 'icons/reddit.png',
  GITHUB_BASE + 'icons/hackernews.png',
  GITHUB_BASE + 'icons/gamedev.png',
  GITHUB_BASE + 'icons/youtube.png',
  GITHUB_BASE + 'icons/twitch.png',
  GITHUB_BASE + 'icons/netflix.png',
  GITHUB_BASE + 'icons/Liquipedia.png',
  GITHUB_BASE + 'icons/ourgroceries.png',
  GITHUB_BASE + 'icons/swiggy.png',
  GITHUB_BASE + 'icons/blinkit.png',
  GITHUB_BASE + 'icons/amazon.png',
  GITHUB_BASE + 'icons/remote.png',
  GITHUB_BASE + 'icons/fold.png',
  GITHUB_BASE + 'icons/keep.png',
  GITHUB_BASE + 'icons/reminders.png',
  GITHUB_BASE + 'icons/udemy.png',
  GITHUB_BASE + 'icons/gemini.png',
  GITHUB_BASE + 'icons/github.png',
  GITHUB_BASE + 'icons/ente.png',
  GITHUB_BASE + 'icons/google-photos.png',
  GITHUB_BASE + 'icons/maps.png',
  GITHUB_BASE + 'icons/controld.png',
  GITHUB_BASE + 'icons/tailscale.png',
  GITHUB_BASE + 'icons/unifi-network.png',
  GITHUB_BASE + 'icons/home-assistant.png',
  GITHUB_BASE + 'icons/proxmox.png',
  GITHUB_BASE + 'icons/paperless-ngx.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Extension SW: Caching GitHub assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Only intervene if the request is for our GitHub assets
  if (event.request.url.startsWith(GITHUB_BASE)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).catch(() => {
             // Optional: Return a fallback if both cache and network fail
             return new Response("Offline and not cached");
        });
      })
    );
  }
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});