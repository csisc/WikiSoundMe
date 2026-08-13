/**
 * WikiShootMe Service Worker
 * Caches static assets and map tiles for offline use.
 */

const CACHE_NAME = 'wsm-cache-v1';
const TILE_CACHE = 'wsm-tiles-v1';
const MAX_TILE_CACHE = 500; // limit tile cache size

// Static assets to pre-cache on install
const PRECACHE_URLS = [
	'./',
	'./index.html',
	'./main_v3.css',
	'./main_v3.js',
	'./wsm_comm.js',
	'./wsm_layer_base.js',
	'./wsm_popup.js',
	'./wsm_upload.js',
	'./wsm_map.js',
	'./wsm_search.js',
	'./wsm_layers/wikimedia.js',
	'./wsm_layers/wikipedia.js',
	'./wsm_layers/commons.js',
	'./wsm_layers/wikidata_image.js',
	'./wsm_layers/wikidata_no_image.js',
	'./wsm_layers/flickr.js',
	'./wsm_layers/mixnmatch.js',
	'./wsm_layers/mixnmatch_lc.js',
	'./wsm_layers/geojson.js',
	'./wsm_layers/register.js'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.addAll(PRECACHE_URLS).catch(() => {
				// Pre-cache failures are non-fatal
				console.log('SW: some precache URLs failed, continuing');
			});
		})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	// Clean up old caches
	event.waitUntil(
		caches.keys().then((names) => {
			return Promise.all(
				names.filter((name) => name !== CACHE_NAME && name !== TILE_CACHE)
					.map((name) => caches.delete(name))
			);
		})
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Map tile requests: cache-first with network fallback
	if (isTileRequest(url)) {
		event.respondWith(tileCacheFirst(event.request));
		return;
	}

	// CDN libraries: cache-first (they're versioned, immutable)
	if (url.hostname === 'tools-static.wmflabs.org') {
		event.respondWith(cacheFirst(event.request, CACHE_NAME));
		return;
	}

	// API calls: network-first (data freshness matters)
	if (url.pathname.includes('api') || url.hostname === 'query.wikidata.org') {
		event.respondWith(networkFirst(event.request, CACHE_NAME));
		return;
	}

	// Our own static files: network-first (we want latest code)
	if (url.hostname === 'wikishootme.toolforge.org') {
		event.respondWith(networkFirst(event.request, CACHE_NAME));
		return;
	}

	// Everything else: network only
});

function isTileRequest(url) {
	return url.pathname.includes('/osm-intl/') ||
		url.hostname === 'server.arcgisonline.com' ||
		url.hostname.includes('stamen-tiles');
}

async function cacheFirst(request, cacheName) {
	const cached = await caches.match(request);
	if (cached) return cached;
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(cacheName);
			cache.put(request, response.clone());
		}
		return response;
	} catch (err) {
		return new Response('Offline', { status: 503 });
	}
}

async function networkFirst(request, cacheName) {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(cacheName);
			cache.put(request, response.clone());
		}
		return response;
	} catch (err) {
		const cached = await caches.match(request);
		if (cached) return cached;
		return new Response('Offline', { status: 503 });
	}
}

async function tileCacheFirst(request) {
	const cached = await caches.match(request);
	if (cached) return cached;
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(TILE_CACHE);
			// Trim tile cache if too large
			const keys = await cache.keys();
			if (keys.length > MAX_TILE_CACHE) {
				// Delete oldest 20%
				const toDelete = keys.slice(0, Math.floor(MAX_TILE_CACHE * 0.2));
				await Promise.all(toDelete.map((k) => cache.delete(k)));
			}
			cache.put(request, response.clone());
		}
		return response;
	} catch (err) {
		// Return a transparent 1x1 PNG for missing tiles when offline
		return new Response(
			Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)),
			{ headers: { 'Content-Type': 'image/png' } }
		);
	}
}
