/**
 * GeoJSONLayer - User-uploaded GeoJSON data.
 */
class GeoJSONLayer extends BaseLayer {
	constructor() {
		super({
			key: 'geo_json',
			name: 'GeoJSON',
			color: '#0000FF',
			radius: 5
		});
	}

	popupContent(entry, app) {
		return "<div>GeoJSON</div>";
	}
}
