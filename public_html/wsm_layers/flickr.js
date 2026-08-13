/**
 * FlickrLayer - Flickr geolocated photos with CC licenses.
 */
class FlickrLayer extends BaseLayer {
	constructor() {
		super({
			key: 'flickr',
			name: 'Flickr',
			color: '#FF800D',
			radius: 6,
			defaultVisible: false
		});
		this.flickr_api_key = undefined;
		this.flickr_pics = [];
	}

	clean() {
		super.clean();
		this.flickr_pics = [];
	}

	load(app) {
		const keyPromise = (this.flickr_api_key === undefined)
			? wsm_comm.getFlickrKey().then((d) => { this.flickr_api_key = d.trim(); })
			: Promise.resolve();
		return keyPromise.then(() => this.loadData(app));
	}

	loadData(app) {
		const b = app.map.getBounds();
		const params = {
			method: 'flickr.photos.search',
			api_key: this.flickr_api_key,
			license: '4,5,7,8,9,10',
			sort: 'interestingness-desc',
			bbox: b.toBBoxString(),
			nojsoncallback: 1,
			per_page: 250,
			extras: 'description,geo,url_s,url_o,url_l,url_m',
			format: 'json'
		};

		return app.loadCachedJSON('https://api.flickr.com/services/rest/', params).then((d) => {
			this.flickr_pics = [];
			for (const v of d.photos.photo) {
				if (v.ispublic != 1) continue;
				const entry = {
					flickr_id: v.id,
					mode: 'flickr',
					label: v.title,
					description: v.description['_content'],
					thumburl: v.url_s,
					layer_key: 'flickr',
					pos: [v.latitude, v.longitude],
					url: `https://www.flickr.com/photos/${v.owner}/${v.id}`
				};
				if (undefined !== v.url_o) entry.url_best = v.url_o;
				else if (undefined !== v.url_l) entry.url_best = v.url_l;
				else if (undefined !== v.url_m) entry.url_best = v.url_m;
				else continue;
				const marker = this.createMarker([v.latitude * 1, v.longitude * 1]);
				marker.bindPopup(this.createPopup(entry, app));
				this.addMarker(marker);
				entry.marker = marker;
				this.flickr_pics.push(entry);
			}
		});
	}

	popupContent(entry, app) {
		let h = '';
		h += "<div class='popup_section' style='text-align:center'>";
		h += `<a href='${entry.url}' target='_blank'><img src='${entry.thumburl}' border=0 style='max-width:100%' /></a>`;
		h += "</div>";
		h += `<div flickr_id='${entry.flickr_id}' class='popup_section transfer2flickr'></div>`;
		return h;
	}
}
