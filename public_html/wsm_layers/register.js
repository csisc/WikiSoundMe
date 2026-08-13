/**
 * Layer registration and shared layer operations.
 * Loaded last after all layer classes are defined.
 *
 * To add a new layer:
 * 1. Create a new class file in this directory extending BaseLayer
 * 2. Add a <script> tag for it in index.html (before this file)
 * 3. Instantiate it in the layers array below
 */
(function () {
	const imageLayer = new WikidataImageLayer();
	const noImageLayer = new WikidataNoImageLayer();
	noImageLayer.setImageLayer(imageLayer);

	const layers = [
		new WikipediaLayer(),
		new CommonsLayer(),
		imageLayer,
		noImageLayer,
		new FlickrLayer(),
		new MixNMatchLayer(),
		new MixNMatchLCLayer(),
		new GeoJSONLayer(),
		new OverpassLayer(),
		new MapillaryLayer(),
		new OpenPlaquesLayer(),
		new INaturalistLayer(),
		new PanoramaxLayer(),
		new BildwunschLayer()
	];

	wikishootme.registered_layers = {};
	for (const layer of layers) {
		wikishootme.registered_layers[layer.key] = layer;
	}

	wikishootme.getLayer = function (key) {
		return this.registered_layers[key];
	};

	wikishootme.forEachLayer = function (fn) {
		for (const [key, layer] of Object.entries(this.registered_layers)) {
			fn(layer);
		}
	};

	// --- Layer operations ---

	wikishootme.loadCachedJSON = function (url, params) {
		const me = this;
		me.setBusy(1);
		const key = JSON.stringify(params);
		const staleCache = me.json_cache[url];
		if (staleCache !== undefined && staleCache.key == key && staleCache.result) {
			me.setBusy(-1);
			return Promise.resolve(staleCache.result);
		}
		// Skip network request if offline and we have any cached data for this URL
		if (!me.is_online && staleCache !== undefined && staleCache.result) {
			me.setBusy(-1);
			return Promise.resolve(staleCache.result);
		}
		return wsm_comm.getWithRetry(url, params, 'json').then((d) => {
			me.json_cache[url] = { key: key, result: d };
			return d;
		}).catch((err) => {
			// On network error, serve stale cache if available
			if (staleCache !== undefined && staleCache.result) {
				console.log('Network error, serving stale cache for', url);
				return staleCache.result;
			}
			throw err;
		}).finally(() => {
			me.setBusy(-1);
		});
	};

	wikishootme.cleanLayers = function () {
		this.forEachLayer((layer) => {
			layer.clean();
		});
	};

	wikishootme.loadLayer = function (key) {
		const me = this;
		const layer = me.getLayer(key);
		if (!layer) return;

		let isVisible;
		if (typeof layer.shouldLoad == 'function') {
			isVisible = layer.shouldLoad(me.show_layers);
		} else {
			isVisible = layer.isVisible(me.show_layers);
		}

		if (!isVisible) {
			me.setBusy(1);
			setTimeout(() => { me.setBusy(-1); }, 10);
			return;
		}

		// Wikidata: only the no_image layer does loading
		if (key == 'wikidata_image') return;

		layer.load(me);
		me.updatePermalink();
	};

	wikishootme.updateLayers = function () {
		const me = this;
		$('#update').hide();
		me.cleanLayers();
		me.forEachLayer((layer) => {
			me.loadLayer(layer.key);
		});
	};

	wikishootme.updateLayersIncremental = function () {
		const me = this;
		$('#update').hide();
		me.forEachLayer((layer) => {
			if (!layer.supportsIncremental) layer.clean();
			me.loadLayer(layer.key);
		});
	};

	wikishootme.updateToCurrent = function () {
		const me = this;
		const b = me.map.getBounds();
		me.pos = b.getCenter();
		me.updateLayersIncremental();
	};

	wikishootme.updateMaybe = function () {
		const me = this;
		const z = me.map.getZoom();
		if (z > 12) me.updateToCurrent();
		else $('#update').show();
	};

	// Backward-compat getters for entries.wikidata/commons/wikipedia
	Object.defineProperty(wikishootme.entries, 'wikidata', {
		get: function () {
			const merged = {};
			const il = wikishootme.getLayer('wikidata_image');
			const nl = wikishootme.getLayer('wikidata_no_image');
			if (il) { for (const k in il.entries) merged[k] = il.entries[k]; }
			if (nl) { for (const k in nl.entries) merged[k] = nl.entries[k]; }
			return merged;
		},
		configurable: true
	});
	Object.defineProperty(wikishootme.entries, 'commons', {
		get: function () {
			const cl = wikishootme.getLayer('commons');
			return cl ? cl.entries : {};
		},
		configurable: true
	});
	Object.defineProperty(wikishootme.entries, 'wikipedia', {
		get: function () {
			const wl = wikishootme.getLayer('wikipedia');
			return wl ? wl.entries : {};
		},
		configurable: true
	});
})();
