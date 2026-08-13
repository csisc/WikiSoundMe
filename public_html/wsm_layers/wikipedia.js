/**
 * WikipediaLayer - Wikipedia articles with geolocation.
 */
class WikipediaLayer extends WikimediaLayer {
	constructor() {
		super({
			key: 'wikipedia',
			name: 'Wikipedia (500 max)',
			color: '#FFFFAA',
			radius: 5,
			gsnamespace: 0
		});
		this.strokeColor = '#000';
	}

	getServer(app) {
		return `${app.language}.wikipedia.org`;
	}

	popupContent(entry, app) {
		if (entry.server !== undefined) {
			return `<div class='pageimage_toload' server='${entry.server}' page='${escattr(entry.page)}'></div>`;
		}
		return '';
	}
}
