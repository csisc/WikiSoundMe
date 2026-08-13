/**
 * MapillaryLayer - Street-level photos from Mapillary.
 * Uses server-side proxy to keep the API token private.
 */
class MapillaryLayer extends BaseLayer {
	constructor() {
		super({
			key: 'mapillary',
			name: 'Mapillary',
			color: '#05CB63',
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

		app.setBusy(1);
		return wsm_comm.getProxy({
			service: 'mapillary',
			bbox: bbox,
			limit: 200
		}).then((d) => {
			if (!d || !d.data) return;
			for (const img of d.data) {
				me.addImage(img, app);
			}
		}).catch((e) => {
			console.log('Mapillary error', e);
		}).finally(() => {
			app.setBusy(-1);
		});
	}

	addImage(img, app) {
		if (!img.geometry || !img.geometry.coordinates) return;
		const lng = img.geometry.coordinates[0];
		const lat = img.geometry.coordinates[1];

		const captured = img.captured_at ? new Date(img.captured_at).toLocaleDateString() : '';

		const entry = {
			page: img.id,
			label: `Mapillary ${img.id}`,
			mode: 'mapillary',
			layer_key: 'mapillary',
			pos: [lat, lng],
			url: `https://www.mapillary.com/app/?pKey=${img.id}`,
			thumb_url: img.thumb_256_url || '',
			full_url: img.thumb_1024_url || '',
			captured: captured,
			compass: img.compass_angle
		};

		const marker = this.createMarker(entry.pos);
		marker.bindPopup(this.createPopup(entry, app));
		this.addMarker(marker);
		entry.marker = marker;
		this.storeEntry(img.id, entry);
	}

	popupContent(entry, app) {
		let h = '';
		if (entry.captured) {
			h += `<div><small>${app.escapeHTML(entry.captured)}</small></div>`;
		}
		if (entry.thumb_url) {
			h += `<div class='popup_section'><a href='${escattr(entry.url)}' target='_blank'>`;
			h += `<img src='${escattr(entry.thumb_url)}' loading='lazy' style='max-width:200px;max-height:150px' alt='Mapillary photo' />`;
			h += `</a></div>`;
		}
		h += `<div><a href='${escattr(entry.url)}' target='_blank'>View on Mapillary</a></div>`;
		return h;
	}
}
