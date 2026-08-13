/**
 * WikimediaLayer - shared base for Wikipedia and Commons layers.
 * Handles geosearch API loading and entry creation.
 */
class WikimediaLayer extends BaseLayer {
	constructor(config) {
		super(config);
		this.server = config.server || '';
		this.gsnamespace = config.gsnamespace || 0;
	}

	addEntry(server, v, app) {
		const mode = this.key;
		const label = this.formatLabel(v.title);
		const entry = {
			pos: [v.lat, v.lon],
			label: label,
			page: v.title,
			mode: mode,
			layer_key: this.key,
			url: `https://${server}/wiki/${encodeURIComponent(v.title)}`,
			server: server,
			ns: v.ns
		};
		this.decorateEntry(entry, v);
		const marker = this.createMarker(entry.pos, { strokeColor: this.strokeColor || this.color });
		marker.bindPopup(this.createPopup(entry, app));
		this.addMarker(marker);
		entry.marker = marker;
		this.storeEntry(v.pageid, entry);
		return entry;
	}

	formatLabel(title) {
		return title;
	}

	decorateEntry(entry, v) {
	}

	load(app) {
		const server = this.getServer(app);
		const api = `https://${server}/w/api.php`;
		const b = app.map.getBounds();
		const nw = b.getNorthWest();
		const se = b.getSouthEast();

		return app.loadCachedJSON(`${api}?callback=?`, {
			action: 'query',
			list: 'geosearch',
			gsbbox: `${nw.lat}|${nw.lng}|${se.lat}|${se.lng}`,
			gsnamespace: this.gsnamespace,
			gslimit: 500,
			format: 'json'
		}).then((d) => {
			for (const v of ((d.query || {}).geosearch || [])) {
				this.addEntry(server, v, app);
			}
			this.afterLoad(app);
		});
	}

	getServer(app) {
		return this.server;
	}

	afterLoad(app) {
	}
}
