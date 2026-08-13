/**
 * INaturalistLayer - Research-grade CC-licensed observations from iNaturalist.
 * Shows biodiversity observations with photos; useful for identifying
 * natural sites worth documenting.
 */
class INaturalistLayer extends BaseLayer {
	constructor() {
		super({
			key: 'inaturalist',
			name: 'iNaturalist',
			color: '#E6A817',
			radius: 5,
			defaultVisible: false,
			use_clustering: true,
			min_cluster_size: 8
		});
	}

	load(app) {
		const me = this;
		const z = app.map.getZoom();
		if (z < 13) return;

		const b = app.map.getBounds();
		const sw = b.getSouthWest();
		const ne = b.getNorthEast();

		const params = new URLSearchParams({
			nelat: ne.lat,
			nelng: ne.lng,
			swlat: sw.lat,
			swlng: sw.lng,
			quality_grade: 'research',
			photos: 'true',
			photo_license: 'cc-by,cc-by-sa,cc0',
			per_page: '200',
			order: 'desc',
			order_by: 'votes'
		});

		const url = `https://api.inaturalist.org/v1/observations?${params}`;

		app.setBusy(1);
		return wsm_comm.fetchWithRetry(url).then(r => r.json()).then((d) => {
			if (!d || !d.results) return;
			for (const obs of d.results) {
				me.addObservation(obs, app);
			}
		}).catch((e) => {
			console.log('iNaturalist error', e);
		}).finally(() => {
			app.setBusy(-1);
		});
	}

	addObservation(obs, app) {
		if (!obs.location) return;
		const parts = obs.location.split(',');
		if (parts.length < 2) return;
		const lat = parseFloat(parts[0]);
		const lng = parseFloat(parts[1]);
		if (isNaN(lat) || isNaN(lng)) return;

		const commonName = (obs.taxon && obs.taxon.preferred_common_name) || obs.species_guess || '';
		const sciName = (obs.taxon && obs.taxon.name) || '';
		const label = commonName || sciName || `Observation #${obs.id}`;
		const taxonId = obs.taxon ? obs.taxon.id : null;

		// Get best CC photo
		let photoUrl = '';
		let photoSmall = '';
		if (obs.photos && obs.photos.length > 0) {
			const photo = obs.photos[0];
			photoUrl = (photo.url || '').replace('/square.', '/medium.');
			photoSmall = (photo.url || '').replace('/square.', '/small.');
		}

		const entry = {
			page: '' + obs.id,
			label: label,
			mode: 'inaturalist',
			layer_key: 'inaturalist',
			pos: [lat, lng],
			url: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`,
			sci_name: sciName,
			common_name: commonName,
			photo_url: photoUrl,
			photo_small: photoSmall,
			taxon_id: taxonId,
			observed_on: obs.observed_on_string || ''
		};

		const marker = this.createMarker(entry.pos);
		marker.bindPopup(this.createPopup(entry, app));
		this.addMarker(marker);
		entry.marker = marker;
		this.storeEntry(obs.id, entry);
	}

	popupContent(entry, app) {
		let h = '';

		if (entry.sci_name) {
			h += `<div><i>${app.escapeHTML(entry.sci_name)}</i></div>`;
		}
		if (entry.observed_on) {
			h += `<div><small>${app.escapeHTML(entry.observed_on)}</small></div>`;
		}

		if (entry.photo_small) {
			h += `<div class='popup_section'><a href='${escattr(entry.url)}' target='_blank'>`;
			h += `<img src='${escattr(entry.photo_small)}' loading='lazy' style='max-width:200px;max-height:150px' alt='Observation photo' />`;
			h += `</a></div>`;
		}

		// Link to Wikidata taxon if available
		if (entry.taxon_id) {
			h += `<div><a href='https://www.inaturalist.org/taxa/${entry.taxon_id}' target='_blank'>iNaturalist taxon</a></div>`;
		}

		return h;
	}
}
