/**
 * MixNMatchLCLayer - Mix'n'Match large catalog entries.
 */
class MixNMatchLCLayer extends BaseLayer {
	constructor() {
		super({
			key: 'mnm_lc',
			name: "Mix'n'match large catalogs (5000 max)",
			color: '#D291BC',
			radius: 4,
			defaultVisible: false
		});
		this.mnm_lc_entries = [];
	}

	clean() {
		super.clean();
		this.mnm_lc_entries = [];
	}

	load(app) {
		const b = app.map.getBounds();
		const params = {
			query: 'lc_bbox',
			slim: 1,
			bbox: b.toBBoxString(),
			ignore_catalogs: '7'
		};

		return app.loadCachedJSON('https://mix-n-match.toolforge.org/api.php?callback=?', params).then((d) => {
			this.mnm_lc_entries = [];
			for (const v of d.data) {
				const catalog = d.catalogs[v.catalog];
				let fc = `${v.feature_class || ''}.${v.feature_code || ''}`;
				if (fc == '.') fc = '';
				let html = "";
				html += `<div>ID: <tt>${v.ext_id}</tt></div>`;
				if (fc != '') {
					html += `<div>Feature class: <tt>${fc}</tt></div>`;
				}
				if (v.q !== undefined && v.q != null) {
					const qlink = `<a href='https://www.wikidata.org/wiki/Q${v.q}' target='_blank'>Q${v.q}</a>`;
					html += `<div>Matched to ${qlink}</div>`;
				}
				const entry = {
					entry: v.ext_id,
					catalog: v.catalog,
					q: v.q,
					property: catalog.property,
					label: (v.name || v.title || `Entry ${v.ext_id}`),
					layer_key: 'mnm_lc',
					description: catalog.name,
					mode: 'mnm_lc',
					html: html,
					pos: [v.latitude, v.longitude],
					url: catalog.formatter_url.replace(/\$1/, v.ext_id),
					geonames_feature_code: fc
				};
				const marker = this.createMarker([v.latitude * 1, v.longitude * 1]);
				marker.bindPopup(this.createPopup(entry, app));
				this.addMarker(marker);
				entry.marker = marker;
				this.mnm_lc_entries.push(entry);
			}
		});
	}

	popupContent(entry, app) {
		let h = '';
		h += `<div>${entry.html}</div>`;

		let property = '';
		if (entry.property !== undefined) property = `P${entry.property}`;
		const ext_id = entry.entry;
		const latitude = entry.pos[0] * 1;
		const longitude = entry.pos[1] * 1;
		const label = entry.label;
		let p31 = [];
		if (app.geonames_feature_codes[entry.geonames_feature_code] !== undefined) {
			p31.push(app.geonames_feature_codes[entry.geonames_feature_code]);
		}
		p31 = p31.join(',');

		if (entry.q === undefined || entry.q == null) {
			h += "<div class='popup_section'>";
			h += `<a href='#' p31='${p31}' label='${escattr(label)}' property='${property}' ext_id='${escattr(ext_id)}' lat='${latitude}' lng='${longitude}' class='create_item_from_image' onclick='return wikishootme.createItemFromEntry($(this));return false'>${app.tt.t('create_wd_from_entry')}</a>`;
			h += "</div>";
		}
		return h;
	}
}
