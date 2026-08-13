/**
 * OverpassLayer - OpenStreetMap POIs via Overpass API.
 * Shows historic sites, museums, places of worship, artwork, etc.
 * Items with a wikidata tag are shown in green; those without in brown.
 */
class OverpassLayer extends BaseLayer {
	constructor() {
		super({
			key: 'overpass',
			name: 'OSM POIs',
			color: '#8B4513',
			radius: 7,
			defaultVisible: false,
		});
		this.colorLinked = '#4CAF50';
		this.colorUnlinked = '#8B4513';
		this.p31Map = {
			'monument': 'Q4989906',
			'memorial': 'Q5003624',
			'castle': 'Q23413',
			'ruins': 'Q109607',
			'archaeological_site': 'Q839954',
			'wayside_cross': 'Q2309609',
			'wayside_shrine': 'Q1549511',
			'tomb': 'Q381885',
			'boundary_stone': 'Q863454',
			'artwork': 'Q838948',
			'museum': 'Q33506',
			'attraction': 'Q570116',
			'viewpoint': 'Q182060',
			'gallery': 'Q1007870',
			'place_of_worship': 'Q1370598',
			'church': 'Q16970',
			'cathedral': 'Q2977',
			'mosque': 'Q32815',
			'temple': 'Q44539',
			'synagogue': 'Q34627',
			'chapel': 'Q108325',
		};
	}

	load(app) {
		const me = this;
		const z = app.map.getZoom();
		if (z < 13) return;

		const b = app.map.getBounds();
		const sw = b.getSouthWest();
		const ne = b.getNorthEast();
		const bbox = `${sw.lat},${sw.lng},${ne.lat},${ne.lng}`;

		let query = '[out:json][timeout:25];\n(\n';
		query += `  nwr["historic"]["name"](${bbox});\n`;
		query += `  nwr["tourism"~"^(artwork|museum|attraction|viewpoint|gallery)$"]["name"](${bbox});\n`;
		query += `  nwr["amenity"="place_of_worship"]["name"](${bbox});\n`;
		query += ');\nout center 500;\n';

		app.setBusy(1);
		return wsm_comm.fetchWithRetry('https://overpass-api.de/api/interpreter', {
			method: 'POST',
			body: 'data=' + encodeURIComponent(query),
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
		}).then(r => r.json()).then((d) => {
			if (!d || !d.elements) return;
			for (const el of d.elements) {
				me.addElement(el, app);
			}
		}).catch((e) => {
			console.log('Overpass error', e);
		}).finally(() => {
			app.setBusy(-1);
		});
	}

	addElement(el, app) {
		const tags = el.tags || {};
		const name = tags.name;
		if (!name) return;

		const lat = el.center ? el.center.lat : el.lat;
		const lng = el.center ? el.center.lon : el.lon;
		if (lat === undefined || lng === undefined) return;

		const osmType = el.type;
		const osmId = el.id;
		const wikidataId = tags.wikidata || '';
		const hasWikidata = /^Q\d+$/.test(wikidataId);
		const col = hasWikidata ? this.colorLinked : this.colorUnlinked;
		const typeTag = this.getTypeTag(tags);

		const entry = {
			page: hasWikidata ? wikidataId : `${osmType}/${osmId}`,
			label: name,
			mode: 'overpass',
			layer_key: 'overpass',
			pos: [lat, lng],
			url: hasWikidata
				? `https://www.wikidata.org/wiki/${wikidataId}`
				: `https://www.openstreetmap.org/${osmType}/${osmId}`,
			osm_type: osmType,
			osm_id: osmId,
			wikidata_id: wikidataId,
			type_tag: typeTag,
			tags: tags
		};

		const marker = this.createMarker(entry.pos, { color: col, fillColor: col });
		marker.bindPopup(this.createPopup(entry, app));
		this.addMarker(marker);
		entry.marker = marker;
		this.storeEntry(`${osmType}_${osmId}`, entry);
	}

	getTypeTag(tags) {
		if (tags.historic) return tags.historic;
		if (tags.tourism) return tags.tourism;
		if (tags.amenity) return tags.amenity;
		if (tags.building) return tags.building;
		return '';
	}

	getP31(tags) {
		for (const key of ['historic', 'tourism', 'amenity', 'building']) {
			const val = tags[key];
			if (val && this.p31Map[val]) return this.p31Map[val];
		}
		return '';
	}

	popupContent(entry, app) {
		let h = '';
		if (entry.type_tag) {
			h += `<div><span class='badge bg-secondary'>${app.escapeHTML(entry.type_tag)}</span></div>`;
		}

		h += `<div><a href='https://www.openstreetmap.org/${entry.osm_type}/${entry.osm_id}' target='_blank'>OSM ${entry.osm_type}/${entry.osm_id}</a></div>`;

		if (entry.wikidata_id) {
			h += `<div><a href='https://www.wikidata.org/wiki/${entry.wikidata_id}' target='_blank'>${entry.wikidata_id}</a></div>`;
		} else if (wsm_comm.isLoggedIn()) {
			const p31 = this.getP31(entry.tags);
			h += `<div style='margin-top:8px'><a href='#' class='btn btn-sm btn-primary' `
				+ `onclick='return wikishootme.createItemFromEntry(this)' `
				+ `label='${escattr(entry.label)}' `
				+ `lat='${entry.pos[0]}' lng='${entry.pos[1]}' `
				+ `ext_id='' property='' `
				+ `p31='${p31}'>Create Wikidata item</a></div>`;
		}

		return h;
	}

	getOverlayLabel() {
		return `<div style='display:inline-block;width:14px;height:12px;padding-top:3px;padding-right:3px;'>`
			+ `<div style='display:inline-block;background-color:${this.colorUnlinked};width:7px;height:12px;opacity:${this.opacity}'></div>`
			+ `<div style='display:inline-block;background-color:${this.colorLinked};width:7px;height:12px;opacity:${this.opacity}'></div>`
			+ `</div> ${this.displayName}`;
	}
}
