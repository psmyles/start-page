// Retires the service worker this site had for a few days in early 2026.
//
// That worker cached the whole page (tiles and all, as of January 2026) and
// answered from its cache before trying the network. Deleting sw.js did not
// uninstall it: a browser keeps the worker it has and treats the 404 as a
// failed update, so it went on showing the January tiles indefinitely.
//
// The browser re-fetches this URL to check the old worker for updates, which
// Firefox does after every page load the worker answers. Serving this file
// gives it an update to install, and this update deletes the old caches,
// unregisters itself, and reloads any page the old worker was serving, which
// then comes from the network.
//
// The page itself can't remove the old worker: while it is in control, it
// serves its own January copy of script.js too. Nothing registers this file.
// Leave it here; it costs nothing.

const OLD_CACHES = ['startpage-v1', 'startpage-extension-v1'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all(OLD_CACHES.map(name => caches.delete(name)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: 'window' });
    for (const page of pages) {
      page.navigate(page.url);
    }
  })());
});
