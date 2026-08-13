/**
 * WikiShootMe - Core object with properties, utility methods, and init.
 * Additional methods are loaded from wsm_popup.js, wsm_upload.js,
 * wsm_layers.js, wsm_map.js, and wsm_search.js.
 */

var { XHRUpload } = Uppy;
var uppy;

var wikishootme = {

	sparql_url: 'https://query.wikidata.org/bigdata/namespace/wdq/sparql',
	check_reason_no_image: false,
	// use_clustering is now per-layer (see BaseLayer config)
	zoom_level: 15,
	opacity: 0.5,
	marker_radius_me: 10,
	color_me: '#888888',
	color_commons_in_category: '#FFFF99',
	geonames_feature_codes: {},
	main_commons_category: '',
	files_in_main_commons_category: {},
	thumb_size: 200,
	sparql_filter: '',
	p31_include: [],
	p31_exclude: [],
	clustering_enabled: true,
	hide_destroyed: false,
	// Issues #52, #55: secondary Commons-API enrichment passes (orphan-image
	// recolouring, {{Thumbnail}} flagging). Off by default to keep the API
	// budget low; users can opt in with the URL hash `enrich=1`.
	enrich_commons: false,
	language: 'en',
	max_items: 1000,
	upload_mode: 'uppy', // upload
	current_tile_layer: 'osm',
	tile_layers: {
		osm: { name: 'OSM (WMF)', url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png', maxZoom: 19, attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors' },
		esri_wm: { name: 'ESRI WorldMap', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 20, attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community' },
		esri_topo: { name: 'ESRI TopoMap', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', maxZoom: 20, attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community' },
		stamen_terrain: { name: 'Stamen Terrain', url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.png', subdomains: 'abcd', attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
	},
	map_is_set: false,
	pos: { lat: 52, lng: 0 },
	entries: {},
	upload_queue: [],
	upload_delay: 100,
	worldwide: 0,
	json_cache: {},

	// Layer stuff (populated by wsm_layers.js registration)
	registered_layers: {},
	show_layers: [],
	overlays: {},
	layer_info: { name2key: {} },
	layers: {},

	busy: 0,

	escapeHTML: function (s) {
		return escattr(s);
	},

	getHashVars: function () {
		const vars = {};
		const hashes = window.location.href.slice(window.location.href.indexOf('#') + 1).split('&');
		for (const j of hashes) {
			const hash = j.split('=');
			hash[1] += '';
			vars[hash[0]] = decodeURIComponent(hash[1]).replace(/_/g, ' ');
		}
		return vars;
	},

	updatePermalink: function () {
		const me = this;
		let h = [];
		h.push(`lat=${me.pos.lat}`);
		h.push(`lng=${me.pos.lng}`);
		h.push(`zoom=${me.map.getZoom()}`);
		if (me.language != 'en') h.push(`interface_language=${me.language}`);
		if (me.current_tile_layer != 'osm') h.push(`tiles=${me.current_tile_layer}`);

		if (me.main_commons_category != '') h.push(`main_commons_category=${encodeURIComponent(me.main_commons_category)}`);

		const layers = me.show_layers.join(',');
		if (layers != me.full_layers) h.push(`layers=${layers}`);

		if (me.sparql_filter == '') {
			document.getElementById('is_using_filter').style.display = 'none';
		} else {
			h.push(`sparql_filter=${encodeURIComponent(me.sparql_filter)}`);
			document.getElementById('is_using_filter').style.display = '';
		}

		const p31Active = me.p31_include.length > 0 || me.p31_exclude.length > 0;
		if (p31Active) {
			const parts = [
				...me.p31_include,
				...me.p31_exclude.map(q => '!' + q)
			];
			h.push(`P31=${encodeURIComponent(parts.join(','))}`);
		}
		const p31El = document.getElementById('is_using_p31_filter');
		if (p31El) p31El.style.display = p31Active ? '' : 'none';

		if (!me.clustering_enabled) h.push('cluster=0');

		if (me.worldwide) h.push('worldwide=1');
		if (me.hide_destroyed) h.push('hide_destroyed=1');

		wsm_comm.storeCurrentView(h);

		h = '#' + h.join('&');
		location.hash = h;
		me.updateSearchLinks();
	},

	updateSearchLinks: function () {
		const me = this;

		// Get area
		const b = me.map.getBounds();
		const ne = b.getNorthEast();
		const sw = b.getSouthWest();

		// Update WD-FIST link
		let sparql = '';
		sparql += 'SELECT ?q {';
		if (!me.worldwide) {
			sparql += ` SERVICE wikibase:box { ?q wdt:P625 ?location . `;
			sparql += `bd:serviceParam wikibase:cornerSouthWest "Point(${sw.lng} ${sw.lat})"^^geo:wktLiteral . `;
			sparql += `bd:serviceParam wikibase:cornerNorthEast "Point(${ne.lng} ${ne.lat})"^^geo:wktLiteral }`;
		}
		sparql += ` ${me.sparql_filter} }`;
		let url = "https://fist.toolforge.org/wdfist/index.html?sparql=";
		url += encodeURIComponent(sparql);
		url += '&no_images_only=1&search_by_coordinates=1&remove_multiple=1&prefilled=1';
		const wdfistEl = document.getElementById('wdfist');
		if (wdfistEl) { wdfistEl.style.display = ''; wdfistEl.href = url; }

		const distance = ne.distanceTo(sw);
		let radius_km = Math.round((distance / 2) / 1000);
		if (radius_km <= 0) radius_km = 1;
		const center = me.map.getCenter();
		url = `https://fist.toolforge.org/check_flickr_geo.php?lat=${center.lat}&lon=${center.lng}&radius=${radius_km}&doit=1`;
		const flickrEl = document.getElementById('flickr');
		if (flickrEl) { flickrEl.style.display = ''; flickrEl.href = url; }
	},

	setBusy: function (d) {
		const me = this;
		me.busy += d;
		if (me.busy == 0) { // All done
			document.getElementById('busy').style.display = 'none';
			// Z-order: wikipedia behind, then green (with-image), red (no-image) on top
			try { me.layers.wikipedia.bringToFront(); } catch (e) { }
			try { me.layers.wikidata_image.bringToFront(); } catch (e) { }
			try { me.layers.wikidata_no_image.bringToFront(); } catch (e) { }
			me.updatePermalink();
			me.updateItemCount();
		} else if (d == 1 && me.busy == 1) { // Starting to be busy...
			document.getElementById('busy').style.display = 'inline';
			document.getElementById('item_count').style.display = 'none';
		}
	},

	updateItemCount: function () {
		let count = 0;
		this.forEachLayer((layer) => {
			count += Object.keys(layer.entries).length;
		});
		const el = document.getElementById('item_count');
		if (el) {
			if (count > 0) {
				el.textContent = count + ' items';
				el.style.display = '';
			} else {
				el.style.display = 'none';
			}
		}
	},

	cleanLayers: function () {
		const me = this;
		for (const [k, v] of Object.entries(me.layers)) {
			v.clearLayers();
		}
		for (const mode of Object.keys(me.entries)) {
			me.entries[mode] = {};
		}
	},

	pingLayer: function (key) {
		const me = this;
		if (!me.show_layers.includes(key)) return;
		me.map.removeLayer(me.layers[key]);
		me.map.addLayer(me.layers[key]);
	},

	gps2leaflet: function (gps) {
		return { lat: gps.latitude, lng: gps.longitude };
	},

	// --- User status UI ---

	updateUserStatusUI: function () {
		const icon = document.getElementById('user_status_icon');
		const menuItem = document.getElementById('user_menu_item');
		if (!icon || !menuItem) return;

		if (wsm_comm.isLoggedIn()) {
			const name = wsm_comm.userinfo.name || '';
			icon.innerHTML = '<i class="fa fa-unlock fa-lg" style="color:#28a745" aria-hidden="true"></i>';
			icon.title = name;
			menuItem.innerHTML = `<i class="fa fa-user"></i> ${this.escapeHTML(name)} &mdash; <a href="./api_v3.php?action=logout" id="logout_link">Logout</a>`;
		} else {
			icon.innerHTML = '<i class="fa fa-lock fa-lg" style="color:#dc3545" aria-hidden="true"></i>';
			icon.title = 'Not logged in';
			menuItem.innerHTML = '<a href="./api_v3.php?action=authorize"><i class="fa fa-sign-in"></i> Log in to upload</a>';
		}
	},

	// --- Network state management ---

	is_online: true,

	initNetworkHandlers: function () {
		const me = this;
		const banner = document.getElementById('offline_banner');

		const goOffline = () => {
			if (!me.is_online) return;
			me.is_online = false;
			if (banner) {
				banner.textContent = '\u26A0 No internet connection';
				banner.className = '';
				banner.style.display = 'block';
			}
			console.log('WikiShootMe: went offline');
		};

		const goOnline = () => {
			if (me.is_online) return;
			me.is_online = true;
			if (banner) {
				banner.textContent = '\u2714 Connection restored';
				banner.className = 'online_restored';
				banner.style.display = 'block';
				setTimeout(() => { banner.style.display = 'none'; }, 3000);
			}
			console.log('WikiShootMe: back online, refreshing layers');
			// Auto-refresh map data when connection restored
			if (me.map) {
				setTimeout(() => { me.updateLayers(); }, 500);
			}
		};

		window.addEventListener('offline', goOffline);
		window.addEventListener('online', goOnline);

		// Set initial state
		if (!navigator.onLine) goOffline();
	},

	showModal: function (id) {
		const el = document.getElementById(id);
		if (!el) return;
		if (bootstrap !== undefined && bootstrap.Modal) {
			bootstrap.Modal.getOrCreateInstance(el).show();
		}
	},

	hideModal: function (id) {
		const el = document.getElementById(id);
		if (!el) return;
		if (bootstrap !== undefined && bootstrap.Modal) {
			const instance = bootstrap.Modal.getInstance(el);
			if (instance) instance.hide();
		}
	},

	showToast: function (message, type) {
		type = type || 'danger';
		const container = document.getElementById('toast_container');
		if (!container || typeof bootstrap === 'undefined' || !bootstrap.Toast) {
			console.log(`[${type}] ${message}`);
			return;
		}
		const toastEl = document.createElement('div');
		toastEl.className = `toast align-items-center bg-${type} text-white border-0`;
		toastEl.setAttribute('role', 'alert');
		toastEl.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
		container.appendChild(toastEl);
		const toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 5000 });
		toast.show();
		toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
	},

	getP31SparqlFragment: function () {
		let sparql = '';
		if (this.p31_include.length > 0) {
			const vals = this.p31_include.map(q => `wd:${q}`).join(' ');
			sparql += ` VALUES ?_p31inc { ${vals} } ?q wdt:P31/wdt:P279* ?_p31inc .`;
		}
		for (const q of this.p31_exclude) {
			sparql += ` FILTER NOT EXISTS { ?q wdt:P31/wdt:P279* wd:${q} }`;
		}
		return sparql;
	},

	// Issue #19: optional filter that excludes items with a date of dissolution
	// (P576) or end time (P582), i.e. things that no longer exist.
	getDestroyedSparqlFragment: function () {
		if (!this.hide_destroyed) return '';
		return ' FILTER NOT EXISTS { ?q wdt:P576 [] } FILTER NOT EXISTS { ?q wdt:P582 [] } ';
	},

	// Issues #2, #16, #73: build a comma-separated language fallback chain for
	// wikibase:label so that items without a user-language label still display
	// SOMETHING readable. Includes: user language, common regional variants
	// (en-gb, pt-br, …), the base language if user-lang is a variant, and a
	// broad fallback list. `mul` (multilingual) is a Wikidata catch-all.
	getLabelLanguageChain: function () {
		const variants = {
			en: ['en-gb', 'en-us', 'en-ca', 'en-au'],
			es: ['es-mx', 'es-es', 'es-419'],
			pt: ['pt-br', 'pt-pt'],
			zh: ['zh-hans', 'zh-hant', 'zh-cn', 'zh-tw', 'zh-hk'],
			fr: ['fr-ca'],
			de: ['de-at', 'de-ch'],
		};
		const fallback = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'ja', 'zh', 'ru', 'ar', 'mul'];
		const chain = [];
		const push = (l) => { if (l && !chain.includes(l)) chain.push(l); };
		const lang = (this.language || 'en').toLowerCase();
		push(lang);
		if (variants[lang]) variants[lang].forEach(push);
		const base = lang.split('-')[0];
		if (base !== lang) {
			push(base);
			if (variants[base]) variants[base].forEach(push);
		}
		fallback.forEach(push);
		return chain.join(',');
	},

	addP31Filter: function (qid, mode) {
		if (mode === 1) {
			if (!this.p31_include.includes(qid)) this.p31_include.push(qid);
			this.p31_exclude = this.p31_exclude.filter(q => q !== qid);
		} else {
			if (!this.p31_exclude.includes(qid)) this.p31_exclude.push(qid);
			this.p31_include = this.p31_include.filter(q => q !== qid);
		}
		this.updateLayers();
	},

	init: function () {
		const me = this;
		me.wd = new WikiData;
		me.initNetworkHandlers();

		if (window.FormData !== undefined) me.upload_mode = 'upload_background';

		// Logging
		$.getJSON('https://magnustools.toolforge.org/logger.php?tool=wikishootme&method=loaded&callback=?', function (j) { });

		const params = me.getHashVars();
		if (params.worldwide == '1') me.worldwide = true;
		if (params.hide_destroyed == '1') me.hide_destroyed = true;
		if (params.enrich == '1') me.enrich_commons = true;

		// ---- Keyboard shortcuts ----
		document.addEventListener('keydown', (e) => {
			// Ignore when typing in input/textarea/select
			const tag = (e.target.tagName || '').toLowerCase();
			if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
			if (e.ctrlKey || e.altKey || e.metaKey) return;
			switch (e.key.toLowerCase()) {
				case 's': me.showModal('search_dialog'); e.preventDefault(); break;
				case 'l': me.setPositionToMyLocation(); e.preventDefault(); break;
				case 'u': me.updateLayers(); e.preventDefault(); break;
			}
		});

		// ---- Wire up UI handlers immediately (no async dependency) ----

		document.getElementById('user_status_icon').addEventListener('click', () => {
			if (!wsm_comm.isLoggedIn()) {
				window.location.href = './api_v3.php?action=authorize';
			}
		});

		if (navigator.geolocation) {
			document.getElementById('center_on_me').addEventListener('click', () => { me.setPositionToMyLocation() });
		} else {
			document.getElementById('center_on_me').style.display = 'none';
		}

		document.getElementById('update').addEventListener('click', () => { me.updateLayers(); });

		// Search dialog
		document.getElementById('search').addEventListener('click', () => {
			me.showModal('search_dialog');
		});
		document.getElementById('search_form').addEventListener('submit', (evt) => {
			evt.preventDefault();
			me.doSearch();
			return false;
		});
		document.getElementById('search_query').addEventListener('input', () => {
			me.onSearchInput();
		});
		const searchEl = document.getElementById('search_dialog');
		if (searchEl) {
			searchEl.addEventListener('shown.bs.modal', () => {
				document.getElementById('search_query').focus();
			});
		}

		// Load GeoJSON
		document.getElementById('upload_geojson_button').addEventListener('click', () => {
			me.showModal('upload_geojson_dialog');
		});
		document.getElementById('load_geojson').addEventListener('click', () => {
			const input = document.getElementById('geojson_file');
			if (!input) wikishootme.showToast("Um, couldn't find the fileinput element.", 'danger');
			else if (!input.files) wikishootme.showToast("This browser doesn't seem to support the `files` property of file inputs.", 'danger');
			else if (!input.files[0]) wikishootme.showToast("Please select a file before clicking 'Load'", 'danger');
			else {
				const file = input.files[0];
				const fr = new FileReader();
				fr.onload = function () {
					const j = JSON.parse(this.result);

					const pointLayer = L.geoJSON(null, {
						pointToLayer: function (feature, latlng) {
							const label = String(feature.properties.name)
							let label_html = label;
							if (label.match(/^\/.*\.(jpg|jpeg|tif|tiff)$/i)) {
								label_html = `<a target='_blank' href='file://${label.replace(/'/g, '%27')}'>${label}</a> (copy&paste URL)`;
							}
							if (feature.properties.thumbnail !== undefined) {
								label_html = `<img src="data:image/jpeg;base64,${feature.properties.thumbnail}" /><br/>` + label_html;
							}
							label_html = `<div>${label_html}</div>`;
							return new L.CircleMarker(latlng, {
								radius: 5,
							})
								.bindPopup(label_html)
						}
					});
					pointLayer.addData(j);
					me.map.addLayer(pointLayer);
				};
				fr.readAsText(file);
			}
		});

		// SPARQL filter
		document.getElementById('sparql_filter_button').addEventListener('click', () => {
			me.showModal('sparql_filter_dialog');
			document.getElementById('worldwide').checked = me.worldwide ? true : false;
			const hideDestEl = document.getElementById('hide_destroyed');
			if (hideDestEl) hideDestEl.checked = me.hide_destroyed ? true : false;
			document.getElementById('sparql_filter_p31').value = '';
			document.getElementById('sparql_filter_query').value = me.sparql_filter;
		});
		document.getElementById('sparql_simple_form').addEventListener('submit', (evt) => {
			evt.preventDefault();
			const p31 = document.getElementById('sparql_filter_p31').value.toUpperCase();
			if (!p31.match(/^Q\d+$/)) {
				wikishootme.showToast(me.tt.t('bad_q_number'), 'danger');
				return;
			}
			const sparql = `?q wdt:P31/wdt:P279* wd:${p31}`;
			document.getElementById('sparql_filter_query').value = sparql;
			return false;
		});
		document.getElementById('sparql_filter_use').addEventListener('click', () => {
			me.sparql_filter = document.getElementById('sparql_filter_query').value.trim();
			me.worldwide = document.getElementById('worldwide').checked && me.sparql_filter.trim() != '';
			const hideDestEl = document.getElementById('hide_destroyed');
			me.hide_destroyed = !!(hideDestEl && hideDestEl.checked);
			me.hideModal('sparql_filter_dialog');
			me.updateLayers();
		});
		document.getElementById('sparql_filter_clear').addEventListener('click', () => {
			me.sparql_filter = '';
			me.p31_include = [];
			me.p31_exclude = [];
			me.hideModal('sparql_filter_dialog');
			me.updateLayers();
		});

		// ---- Dark mode ----
		const darkToggle = document.getElementById('dark_mode_toggle');
		if (darkToggle) {
			const savedDark = localStorage.getItem('dark_mode') === '1';
			darkToggle.checked = savedDark;
			if (savedDark) {
				document.documentElement.setAttribute('data-bs-theme', 'dark');
				document.getElementById('map').classList.add('dark-tiles');
			}
			darkToggle.addEventListener('change', function () {
				const on = this.checked;
				document.documentElement.setAttribute('data-bs-theme', on ? 'dark' : 'light');
				const mapEl = document.getElementById('map');
				if (on) mapEl.classList.add('dark-tiles');
				else mapEl.classList.remove('dark-tiles');
				localStorage.setItem('dark_mode', on ? '1' : '0');
			});
		}

		// ---- Init layers from registered layer classes ----

		me.forEachLayer(function (layer) {
			if (layer.defaultVisible) me.show_layers.push(layer.key);
		});
		if (wsm_comm.is_app) {
			me.show_layers = me.show_layers.filter((value) => value != 'wikipedia' && value != 'commons');
		}
		me.show_layers = me.show_layers.sort();
		me.full_layers = me.show_layers.join(',');

		// Check URL parameters
		const rewrite_v2_parameters = {
			lon: 'lng',
			item: 'q',
			lang: 'interface_language',
			language: 'interface_language'
		};
		for (const [k, v] of Object.entries(rewrite_v2_parameters)) {
			if (params[k] !== undefined && params[v] === undefined) params[v] = params[k];
		}

		if (params.tiles !== undefined) me.current_tile_layer = params.tiles.replace(/ /g, '_');
		let h = '';
		h += "<select class='form-control' id='tiles'>";
		for (const [k, v] of Object.entries(me.tile_layers)) {
			h += "<option";
			h += ` value='${k}'`;
			if (me.current_tile_layer == k) h += " selected";
			h += `>${v.name}</option>`;
		}
		h += "</select>";
		document.getElementById('tile_wrapper').innerHTML = h;
		document.getElementById('tiles').addEventListener('change', function () {
			me.current_tile_layer = this.value;
			me.updatePermalink();
			location.reload();
		});

		if (params.layers !== undefined) {
			me.show_layers = params.layers.replace(/ /g, '_').split(',');
			if (me.show_layers.length == 1 && me.show_layers[0] == '') me.show_layers = [];
			me.show_layers = me.show_layers.sort();
		}
		if (params.zoom !== undefined) me.zoom_level = params.zoom * 1;
		if (params.sparql_filter !== undefined) me.sparql_filter = params.sparql_filter;
		if (localStorage.getItem('wsm_clustering_enabled') === '0') me.clustering_enabled = false;
		if (params.cluster === '0') me.clustering_enabled = false;
		if (params.P31 !== undefined) {
			for (const v of params.P31.split(',')) {
				const s = v.trim();
				if (s.startsWith('!')) {
					const q = s.slice(1).toUpperCase();
					if (q.match(/^Q\d+$/)) me.p31_exclude.push(q);
				} else {
					const q = s.toUpperCase();
					if (q.match(/^Q\d+$/)) me.p31_include.push(q);
				}
			}
		}

		// ---- Async init: wait for user status, geonames, translation ----

		const userStatusPromise = wsm_comm.checkUserStatus().then(() => {
			me.updateUserStatusUI();
		}).catch(() => { });

		const geoNamesPromise = (typeof me.loadGeoNames == 'function')
			? me.loadGeoNames()
			: Promise.resolve();

		const translationPromise = new Promise((resolve) => {
			me.tt = new ToolTranslation({
				tool: 'wikishootme', fallback: 'en', callback: () => {
					resolve();
				}, onLanguageChange: (new_language) => {
					me.language = new_language;
					me.updateToCurrent();
					document.getElementById('busy').style.display = 'none';
				}
			});
		});

		// Resolve a starting position synchronously when possible, so the
		// basemap can render before slow async work (translations, user
		// status, SPARQL) completes.
		let earlyPosResolved = false;
		// Accept `q=Q12345`, `q=12345`, or lowercase; normalize to `Q12345`.
		const qMatch = params.q !== undefined && ('' + params.q).match(/^Q?(\d+)$/i);
		const hasQ = !!qMatch;
		if (hasQ) params.q = 'Q' + qMatch[1];
		if (params.lat !== undefined && params.lng !== undefined) {
			me.pos.lat = params.lat * 1;
			me.pos.lng = params.lng * 1;
			earlyPosResolved = true;
		} else if (!hasQ) {
			// A `q` link must center on that item, so don't let a saved
			// last view short-circuit the position resolution below.
			const saved = wsm_comm.getValue('last_view_params');
			if (saved) {
				try {
					const parts = {};
					for (const s of JSON.parse(saved)) {
						const kv = s.split('=');
						if (kv.length === 2) parts[kv[0]] = kv[1];
					}
					if (parts.lat && parts.lng) {
						me.pos.lat = parseFloat(parts.lat);
						me.pos.lng = parseFloat(parts.lng);
						if (parts.zoom) me.zoom_level = parseInt(parts.zoom);
						earlyPosResolved = true;
					}
				} catch (e) { }
			}
		}

		// As soon as translations are ready, render the basemap (tiles +
		// controls). SPARQL still waits for the rest of init to finish.
		translationPromise.then(() => {
			me.tt.addILdropdown($('#interface_language_wrapper'));
			if (earlyPosResolved) me.createMap();
		});

		Promise.all([userStatusPromise, geoNamesPromise, translationPromise]).then(() => {
			if (isMobile()) {
				me.forEachLayer(function (layer) {
					layer.radius = Math.round(layer.radius * 3 / 2);
				});
				me.marker_radius_me = Math.round(me.marker_radius_me * 3 / 2);
			}

			me.set_commons_main_category(params.main_commons_category || '');

			if (earlyPosResolved) {
				// Map was already rendered by translationPromise.then();
				// just fire the data layers and the user marker.
				me.setMap();
				me.addMarkerMe();
			} else if (hasQ) {
				me.setPositionFromQ(params.q);
			} else {
				me.setPositionFromCurrentLocation();
			}
		}).catch((e) => {
			console.log('Init error:', e);
			// Try to show the map anyway
			me.setPositionFromCurrentLocation();
		});
	}

};
