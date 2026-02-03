const CACHE_NAME = 'startpage-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './fonts/SwedenSansRegular.ttf',
  
  // Add all your icons here to ensure they work offline
  './icon/feedly.png',
  './icon/reddit.png',
  './icon/hackernews.png',
  './icon/gamedev.png',
  './icon/youtube.png',
  './icon/twitch.png',
  './icon/netflix.png',
  './icon/liquipedia.png',
  './icon/ourgroceries.png',
  './icon/swiggy.png',
  './icon/blinkit.png',
  './icon/amazon.png',
  './icon/remote.png',
  './icon/fold.png',
  './icon/keep.png',
  './icon/reminders.png',
  './icon/udemy.png',
  './icon/gemini.png',
  './icon/github.png',
  './icon/ente.png',
  './icon/google-photos.png',
  './icon/maps.png',
  './icon/controld.png',
  './icon/tailscale.png',
  './icon/unifi-network.png',
  './icon/home-assistant.png',
  './icon/proxmox.png',
  './icon/paperless-ngx.png'
];

// Install Event: Cache all files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch Event: Serve from Cache First
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cache if found, otherwise fetch from network
      return response || fetch(event.request);
    })
  );
});

// Activate Event: Clean up old caches if you change CACHE_NAME
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});