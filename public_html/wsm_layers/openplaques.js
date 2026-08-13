/**
 * OpenPlaquesLayer - Historical commemorative plaques from OpenPlaques.org.
 * Offers "Create Wikidata item" with P1893 (OpenPlaques plaque ID) and
 * P31=Q721747 (commemorative plaque).
 */
class OpenPlaquesLayer extends BaseLayer {
	constructor() {
		super({
			key: 'openplaques',
			name: 'OpenPlaques',
			color: '#9370DB',
			radius: 6,
			defaultVisible: false
		});
	}

	load(app) {
		const me = this;
		const z = app.map.getZoom();
		if (z < 13) return;

		const b = app.map.getBounds();
		const sw = b.getSouthWest();
		const ne = b.getNorthEast();
		const url = `https://openplaques.org/plaques.json?box=[${sw.lat}],[${sw.lng}],[${ne.lat}],[${ne.lng}]&limit=200`;

		app.setBusy(1);
		return wsm_comm.fetchWithRetry(url).then(r => r.json()).then((d) => {
			if (!Array.isArray(d)) return;
			for (const p of d) {
				me.addPlaque(p, app);
			}
		}).catch((e) => {
			console.log('OpenPlaques error', e);
		}).finally(() => {
			app.setBusy(-1);
		});
	}

	addPlaque(p, app) {
		if (!p.latitude || !p.longitude) return;
		const lat = p.latitude * 1;
		const lng = p.longitude * 1;

		// Check if any subject has a wikidata ID
		let wikidataId = '';
		const subjects = [];
		if (Array.isArray(p.subjects)) {
			for (const s of p.subjects) {
				if (s.name) subjects.push(s.name);
				if (s.wikidata_id && !wikidataId) wikidataId = s.wikidata_id;
			}
		}

		const entry = {
			page: '' + p.id,
			label: p.title || subjects.join(', ') || `Plaque #${p.id}`,
			mode: 'openplaques',
			layer_key: 'openplaques',
			pos: [lat, lng],
			url: `https://openplaques.org/plaques/${p.id}`,
			inscription: p.inscription || '',
			colour: p.colour_name || '',
			thumbnail: p.thumbnail_url || '',
			wikidata_id: wikidataId,
			plaque_id: '' + p.id,
			subjects: subjects
		};

		const marker = this.createMarker(entry.pos);
		marker.bindPopup(this.createPopup(entry, app));
		this.addMarker(marker);
		entry.marker = marker;
		this.storeEntry(p.id, entry);
	}

	popupContent(entry, app) {
		let h = '';

		if (entry.inscription) {
			const short = entry.inscription.length > 200
				? entry.inscription.substring(0, 200) + '...'
				: entry.inscription;
			h += `<div style='font-style:italic;font-size:11px;max-width:250px'>"${app.escapeHTML(short)}"</div>`;
		}

		if (entry.colour) {
			h += `<div><span class='badge bg-secondary'>${app.escapeHTML(entry.colour)} plaque</span></div>`;
		}

		if (entry.thumbnail) {
			h += `<div class='popup_section'><a href='${escattr(entry.url)}' target='_blank'>`;
			h += `<img src='${escattr(entry.thumbnail)}' loading='lazy' style='max-width:200px;max-height:150px' alt='Plaque photo' />`;
			h += `</a></div>`;
		}

		if (entry.wikidata_id) {
			h += `<div><a href='https://www.wikidata.org/wiki/${entry.wikidata_id}' target='_blank'>${entry.wikidata_id}</a> (subject)</div>`;
		}

		// Create Wikidata item for the plaque itself (P1893 = OpenPlaques ID, P31 = Q721747 commemorative plaque)
		if (wsm_comm.isLoggedIn()) {
			h += `<div style='margin-top:8px'><a href='#' class='btn btn-sm btn-primary' `
				+ `onclick='return wikishootme.createItemFromEntry(this)' `
				+ `label='${escattr(entry.label)}' `
				+ `lat='${entry.pos[0]}' lng='${entry.pos[1]}' `
				+ `ext_id='${escattr(entry.plaque_id)}' property='P1893' `
				+ `p31='Q721747'>Create Wikidata item</a></div>`;
		}

		return h;
	}
}
