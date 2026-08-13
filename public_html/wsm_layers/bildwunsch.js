/**
 * BildwunschLayer - German Wikipedia "Bilderwünsche" (image wishes).
 * Single static GeoJSON file from bldrwnsch.toolforge.org, fetched once
 * and filtered by bbox client-side.
 *
 * Each feature represents a dewiki article whose subject lacks a photo.
 *   properties.description = article title (slug)
 *   properties.name        = image-wish template / category
 */
class BildwunschLayer extends BaseLayer {
	constructor() {
		super({
			key: 'bildwunsch',
			name: 'Bilderwünsche (de)',
			color: '#FF6600',
			radius: 6,
			defaultVisible: false,
			use_clustering: true,
			min_cluster_size: 20
		});
		this.supportsIncremental = true;
		this.dataUrl = 'https://bldrwnsch.toolforge.org/Bilderwuensche.geojson.gz';
		this.maxVisible = 3000;
		this._allFeatures = null;
		this._loadPromise = null;
	}

	fetchAll(app) {
		const me = this;
		if (me._allFeatures) return Promise.resolve(me._allFeatures);
		if (me._loadPromise) return me._loadPromise;
		if (app && typeof app.showToast === 'function') {
			app.showToast('Loading Bilderwünsche dataset…', 'info');
		}
		me._loadPromise = fetch(me.dataUrl).then(r => r.json()).then((j) => {
			me._allFeatures = (j && Array.isArray(j.features)) ? j.features : [];
			return me._allFeatures;
		}).catch((err) => {
			console.log('Bildwunsch load failed:', err);
			me._loadPromise = null;
			return [];
		});
		return me._loadPromise;
	}

	load(app) {
		const me = this;
		app.setBusy(1);
		return me.fetchAll(app).then((features) => {
			if (!features || features.length === 0) return;
			const b = app.map.getBounds();
			const isIncremental = Object.keys(me.entries).length > 0;
			let totalCount = Object.keys(me.entries).length;

			for (const f of features) {
				if (totalCount >= me.maxVisible) break;
				if (!f.geometry || !Array.isArray(f.geometry.coordinates)) continue;
				const lng = f.geometry.coordinates[0];
				const lat = f.geometry.coordinates[1];
				if (!b.contains([lat, lng])) continue;

				const props = f.properties || {};
				const article = props.description || props.title || '';
				if (!article) continue;
				const id = `${lat},${lng},${article}`;
				if (me.getEntry(id)) continue;

				const entry = {
					page: article,
					label: article.replace(/_/g, ' '),
					note: props.name ? props.name.replace(/_/g, ' ') : '',
					url: `https://de.wikipedia.org/wiki/${encodeURIComponent(article)}`,
					pos: [lat, lng],
					mode: 'bildwunsch',
					layer_key: me.key
				};
				const marker = me.createMarker(entry.pos);
				marker.bindPopup(me.createPopup(entry, app));
				me.addMarker(marker);
				entry.marker = marker;
				me.storeEntry(id, entry);
				totalCount++;
			}

			if (isIncremental) me.pruneOutsideBbox(b);
		}).finally(() => {
			app.setBusy(-1);
		});
	}

	popupContent(entry, app) {
		return '';
	}

	popupFooter(entry, app) {
		let h = '';
		h += `<div class='popup_coords'><span class='coordinates'>${entry.pos[0]}, ${entry.pos[1]}</span>`;
		h += ` <a href='#' style='user-select:none' onclick='navigator.clipboard.writeText("${entry.pos[0]}, ${entry.pos[1]}");this.textContent="\\u2714";setTimeout(()=>this.textContent="\\ud83d\\udccb",1000);return false' title='Copy coordinates'>&#128203;</a>`;
		h += ` <a style='user-select:none' href='http://www.instantstreetview.com/@${entry.pos[0]},${entry.pos[1]},0h,0p,1z' tt_title='streetview' target='_blank'>&#127968;</a>`;
		h += "</div>";
		if (app.marker_me !== undefined) {
			const pos = app.marker_me.getLatLng();
			h += "<div style='font-size:10pt'>";
			h += `<a target='_blank' href='https://maps.google.co.uk/maps?dirflg=w&saddr=${pos.lat},${pos.lng}&daddr=${entry.pos[0]},${entry.pos[1]}'>${app.tt.t('route')}</a>`;
			h += "</div>";
		}
		return h;
	}
}
