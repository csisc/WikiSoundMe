/**
 * MixNMatchLayer - Mix'n'Match catalog entries with geolocation.
 */
class MixNMatchLayer extends BaseLayer {
	constructor() {
		super({
			key: 'mixnmatch',
			name: "Mix'n'match (5000 max)",
			color: '#AE70ED',
			radius: 5,
			defaultVisible: false
		});
		this.mixnmatch_entries = [];
	}

	clean() {
		super.clean();
		this.mixnmatch_entries = [];
	}

	load(app) {
		const b = app.map.getBounds();
		const params = {
			query: 'locations',
			bbox: b.toBBoxString()
		};

		return app.loadCachedJSON('https://mix-n-match.toolforge.org/api.php?callback=?', params).then((d) => {
			this.mixnmatch_entries = [];
			for (const v of d.data) {
				const entryId = v.entry_id || v.id ;
				const entry = {
					entry: entryId,
					catalog: v.catalog,
					label: v.ext_name,
					layer_key: 'mixnmatch',
					description: v.ext_desc,
					pos: [v.lat, v.lon],
					mode: 'mixnmatch',
					mixnmatch: { q: v.q, user: v.user, ext_url: v.ext_url || '' },
					url: `https://mix-n-match.toolforge.org/#/entry/${entryId}`
				};
				const marker = this.createMarker([v.lat * 1, v.lon * 1]);
				marker.bindPopup(this.createPopup(entry, app));
				this.addMarker(marker);
				entry.marker = marker;
				this.mixnmatch_entries.push(entry);
			}
		});
	}

	popupContent(entry, app) {
		return "<div class='popup_section' style='text-align:center'>MnM1</div>";
	}
}
