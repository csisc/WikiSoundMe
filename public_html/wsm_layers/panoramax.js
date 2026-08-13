/**
 * PanoramaxLayer - Open street-level imagery from Panoramax.
 * Uses the STAC-based API; no API key required.
 */
class PanoramaxLayer extends BaseLayer {
	constructor() {
		super({
			key: 'panoramax',
			name: 'Panoramax',
			color: '#FF6F61',
			radius: 4,
			opacity: 0.6,
			defaultVisible: false
		});
	}

	load(app) {
		const me = this;
		const z = app.map.getZoom();
		if (z < 15) return; // Street-level photos need high zoom

		const b = app.map.getBounds();
		const sw = b.getSouthWest();
		const ne = b.getNorthEast();
		const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

		const url = `https://api.panoramax.xyz/api/search?bbox=${encodeURIComponent(bbox)}&limit=200`;

		app.setBusy(1);
		return wsm_comm.fetchWithRetry(url).then(r => r.json()).then((d) => {
			if (!d || !d.features) return;
			for (const f of d.features) {
				me.addFeature(f, app);
			}
		}).catch((e) => {
			console.log('Panoramax error', e);
		}).finally(() => {
			app.setBusy(-1);
		});
	}

	addFeature(f, app) {
		if (!f.geometry || !f.geometry.coordinates) return;
		const lng = f.geometry.coordinates[0];
		const lat = f.geometry.coordinates[1];

		const props = f.properties || {};
		const captured = props.datetime ? new Date(props.datetime).toLocaleDateString() : '';

		// Extract thumbnail and SD image URLs from assets
		let thumbUrl = '';
		let sdUrl = '';
		if (f.assets) {
			if (f.assets.thumb) thumbUrl = f.assets.thumb.href || '';
			if (f.assets.sd) sdUrl = f.assets.sd.href || '';
		}

		const entry = {
			page: f.id,
			label: `Panoramax ${f.id.substring(0, 8)}`,
			mode: 'panoramax',
			layer_key: 'panoramax',
			pos: [lat, lng],
			url: `https://panoramax.xyz/#focus=pic&pic=${f.id}`,
			thumb_url: thumbUrl,
			sd_url: sdUrl,
			captured: captured
		};

		const marker = this.createMarker(entry.pos);
		marker.bindPopup(this.createPopup(entry, app));
		this.addMarker(marker);
		entry.marker = marker;
		this.storeEntry(f.id, entry);
	}

	popupContent(entry, app) {
		let h = '';
		if (entry.captured) {
			h += `<div><small>${app.escapeHTML(entry.captured)}</small></div>`;
		}
		if (entry.thumb_url) {
			h += `<div class='popup_section'><a href='${escattr(entry.url)}' target='_blank'>`;
			h += `<img src='${escattr(entry.thumb_url)}' loading='lazy' style='max-width:200px;max-height:150px' alt='Panoramax photo' />`;
			h += `</a></div>`;
		}
		h += `<div><a href='${escattr(entry.url)}' target='_blank'>View on Panoramax</a></div>`;
		return h;
	}
}
