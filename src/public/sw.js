// Version variable for cache busting
const CACHE_VERSION = 'v8.9.4';
const CACHE_NAME = 'browserbox-' + CACHE_VERSION;
const ETAG_CACHE_NAME = 'etag-cache-' + CACHE_VERSION;

// Define the patterns to cache as strings
const patternsToCache = [
  '.*',
];
const excludedPaths = new Set([
  "/voodoo/src/common.js",
  "/integrity",
  "/file",
  "/local_cookie.js", 
  "/", "/login", "/SPLlogin", "/pptr", "/SPLgenerate", 
  "/register_sw.js",
  "/image.html",
  "/isTor",
  "/torca/rootCA.pem", "/settings_modal", "/restart_app", 
  "/stop_app", "/stop_browser", "/start_browser", "/integrity"
]);
const excludedPrefixes = [
  '/api/',
];
// Convert string patterns to RegExp objects
const regexPatternsToCache = patternsToCache.map(pattern => new RegExp(pattern));

//if ( globalThis?.location?.hostname != 'localhost' ) {
  // Service Worker Install Event
  self.addEventListener('install', event => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => {
          // Your initial cache population can go here if needed
        })
        .then(() => self.skipWaiting())
    );
  });

  // Service Worker Activate Event
  self.addEventListener('activate', event => {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== ETAG_CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      }).then(() => self.clients.claim())
    );
  });

  // Service Worker Fetch Event
  self.addEventListener('fetch', event => {
    if (shouldCache(event.request)) {
      event.respondWith(
        caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              // Here we add the request to the revalidation process with ETag checking
              checkETagAndRevalidate(event.request, cachedResponse);
              console.log('Returning cached response for', event.request);
              return cachedResponse;
            }
            console.log('Returning and caching new response for', event.request);
            return fetchAndCache(event.request);
          })
      );
    }
  });

  function shouldCache(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (excludedPaths.has(pathname) || excludedPrefixes.some(prefix => pathname.startsWith(prefix))) {
      return false;
    }
    return regexPatternsToCache.some(regex => regex.test(request.url));
  }

  async function fetchAndCache(request) {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      const etag = response.headers.get('ETag');
      if (etag) {
        caches.open(ETAG_CACHE_NAME).then(cache => cache.put(request, new Response(etag)));
      }
      caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
    }
    return response;
  }

  async function checkETagAndRevalidate(request, cachedResponse) {
    const etagResponse = await caches.open(ETAG_CACHE_NAME).then(cache => cache.match(request));
    const etag = etagResponse ? await etagResponse.text() : null;
    fetch(request, {
      headers: etag ? { 'If-None-Match': etag } : {},
      signal: (new AbortController()).signal
    }).then(response => {
      if (response.status === 304) {
        console.log('Content not modified');
        return false;
      } else if (response.ok) {
        const newEtag = response.headers.get('ETag');
        if ( newEtag !== etag ) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          if (newEtag) {
            caches.open(ETAG_CACHE_NAME).then(cache => cache.put(request, new Response(newEtag)));
          }
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                message: 'content-updated',
                url: request.url
              });
            });
          });
        }
        return true;
      }
    }).catch(error => {
      console.error('Revalidation failed:', error);
    });
  }
//}

