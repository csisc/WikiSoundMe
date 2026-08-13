/**
 * WikidataAudioLayer - Wikidata items that have an audio (P51).
 * Loading is handled by WikidataNoAudioLayer which distributes entries here.
 */
class WikidataImageLayer extends BaseLayer {
	constructor() {
		super({
			key: 'wikidata_image',
			name: 'Wikidata (with image, 3K max)',
			color: '#2DC800',
			radius: 10,
			use_clustering: true,
			min_cluster_size: 10
		});
		this.supportsIncremental = true;
		// Issue #52: items whose P51 image is tagged {{Thumbnail}} on Commons
		// are candidates for a real-photo upload — coloured orange.
		this.colorThumbnailImage = '#FF9F1C';
	}

	load(app) {
		// no-op: loaded by wikidata_no_image layer
	}

	shouldLoad(showLayers) {
		return showLayers.indexOf('wikidata_image') !== -1 ||
			showLayers.indexOf('wikidata_no_image') !== -1;
	}

	popupContent(entry, app) {
		let h = '';
		if (entry.image !== undefined) {
			h += this.createImageThumbnail(entry.image, app);
			if (entry.is_thumbnail_image) {
				h += `<div class='popup_section' style='color:#b15c00;font-style:italic'>Image is tagged {{Thumbnail}} on Commons — a higher-quality photo would be welcome.</div>`;
			}
		}
		return h;
	}
}
