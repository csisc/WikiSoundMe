/**
 * CommonsLayer - Wikimedia Commons geolocated images.
 */
class CommonsLayer extends WikimediaLayer {
	constructor() {
		super({
			key: 'commons',
			name: 'Commons images (500 max)',
			color: '#62A9FF',
			radius: 7,
			server: 'commons.wikimedia.org',
			gsnamespace: 6
		});
		// Issue #55: orphan images (no P180 "depicts" SDC statement) get a
		// distinct lighter colour to highlight that someone could improve them.
		this.colorOrphan = '#B6E0FF';
	}

	formatLabel(title) {
		// Issue #13: keep the file extension in the displayed label so users
		// can copy-paste it into the "Commons file name" field of an item popup.
		return title.replace(/^File:/, '').replace(/_/g, ' ');
	}

	decorateEntry(entry, v) {
		entry.image = v.title.replace(/^File:/, '');
	}

	afterLoad(app) {
		try { this.featureGroup.bringToBack(); } catch (e) { }
		app.update_entries_commons_main_category();
		if (app.enrich_commons) this.markOrphanImages(app);
	}

	// Issue #55: query Commons SDC for the loaded files and recolour those
	// without a P180 "depicts" statement so they stand out. Opt-in
	// (#enrich=1) to avoid hammering the Commons API on every pan.
	markOrphanImages(app) {
		const me = this;
		if (typeof fetch !== 'function') return;
		const ids = Object.keys(me.entries);
		if (ids.length === 0) return;
		const batchSize = 50;
		for (let i = 0; i < ids.length; i += batchSize) {
			const batch = ids.slice(i, i + batchSize);
			const mIds = batch.map(id => 'M' + id).join('|');
			const url = `https://commons.wikimedia.org/w/api.php?action=wbgetentities&ids=${mIds}&props=claims&format=json&origin=*`;
			fetch(url).then(r => r.json()).then((d) => {
				if (!d || !d.entities) return;
				for (const id of batch) {
					const entry = me.entries[id];
					if (!entry || !entry.marker) continue;
					const ent = d.entities['M' + id];
					const hasDepicts = ent && ent.claims && Array.isArray(ent.claims.P180) && ent.claims.P180.length > 0;
					if (!hasDepicts) {
						entry.marker.setStyle({ color: me.colorOrphan, fillColor: me.colorOrphan });
						entry.is_orphan = true;
					}
				}
			}).catch(() => { /* SDC lookup is best-effort */ });
		}
	}

	popupContent(entry, app) {
		let h = '';
		if (entry.image !== undefined) {
			h += this.createImageThumbnail(entry.image, app);
			if (entry.is_orphan) {
				h += `<div class='popup_section' style='color:#888;font-style:italic'><span tt='no_depicts_yet'>No "depicts" (P180) statement yet</span></div>`;
			}
			h += "<div class='popup_section'>";
			h += `<a href='#' image='${escattr(entry.image)}' lat='${entry.pos[0]}' lng='${entry.pos[1]}' class='create_item_from_image' onclick='return wikishootme.createItemFromImage($(this));return false'>${app.tt.t('create_wd_from_image')}</a>`;
			h += "</div>";
		}
		return h;
	}
}
