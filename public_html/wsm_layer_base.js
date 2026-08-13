/**
 * WikiShootMe - Base layer class.
 * All map data layers extend this class.
 */

class BaseLayer {
	constructor(config) {
		config = config || {};
		this.key = config.key || '';
		this.displayName = config.name || '';
		this.color = config.color || '#000000';
		this.radius = config.radius || 5;
		this.opacity = config.opacity !== undefined ? config.opacity : 0.5;
		this.defaultVisible = config.defaultVisible !== undefined ? config.defaultVisible : true;
		this.use_clustering = config.use_clustering !== undefined ? config.use_clustering : false;
		this.min_cluster_size = config.min_cluster_size || 2;
		this.featureGroup = null;
		this.entries = {};
	}

	initFeatureGroup(clusteringEnabled) {
		if (clusteringEnabled === undefined) clusteringEnabled = true;
		if ( this.use_clustering && clusteringEnabled && typeof L.markerClusterGroup === 'function' ) {
			this.featureGroup = L.markerClusterGroup({
				maxClusterRadius: 40,
				minimumClusterSize: this.min_cluster_size,
				spiderfyOnMaxZoom: true,
				showCoverageOnHover: false,
				zoomToBoundsOnClick: true
			});
		} else {
			this.featureGroup = L.featureGroup();
		}
		return this.featureGroup;
	}

	clean() {
		if (this.featureGroup) this.featureGroup.clearLayers();
		this.entries = {};
	}

	createMarker(pos, overrides) {
		overrides = overrides || {};
		const col = overrides.color || this.color;
		const strokeCol = overrides.strokeColor || col;
		const fillCol = overrides.fillColor || col;
		const opacity = overrides.opacity !== undefined ? overrides.opacity : this.opacity;
		const marker = L.circleMarker(pos, {
			stroke: true, color: strokeCol, weight: 1,
			fill: true, fillColor: fillCol, fillOpacity: opacity
		});
		marker.setRadius(overrides.radius || this.radius);
		return marker;
	}

	addMarker(marker) {
		if (this.featureGroup) this.featureGroup.addLayer(marker);
	}

	removeMarker(marker) {
		if (this.featureGroup) this.featureGroup.removeLayer(marker);
	}

	pruneOutsideBbox(bbox) {
		for (const [id, entry] of Object.entries(this.entries)) {
			if (entry.pos && !bbox.contains(entry.pos)) {
				this.removeMarker(entry.marker);
				delete this.entries[id];
			}
		}
	}

	storeEntry(id, entry) {
		this.entries['' + id] = entry;
	}

	getEntry(id) {
		return this.entries['' + id];
	}

	isVisible(showLayers) {
		return showLayers.indexOf(this.key) !== -1;
	}

	getOverlayLabel() {
		return `<div style='display:inline-block;background-color:${this.color};border:1px solid ${this.color};width:12px;height:12px;padding-top:3px;padding-right:3px;opacity:${this.opacity};'></div> ${this.displayName}`;
	}

	// --- Popup generation ---

	createPopup(entry, app) {
		let h = "<div><div style='text-align:center'>";
		h += this.popupHeader(entry, app);
		h += this.popupContent(entry, app);
		h += this.popupFooter(entry, app);
		h += "</div></div>";
		return L.popup({
			autoPan: true,
			autoPanPaddingTopLeft: L.point(10, 50),
			autoPanPaddingBottomRight: L.point(10, 10),
			maxHeight: 300
		}).setContent(h);
	}

	popupHeader(entry, app) {
		let h = '';
		h += `<div><a href='${escattr(entry.url)}' target='_blank'><b>${app.escapeHTML(entry.label)}</b></a>`;
		if (entry.p31label !== undefined) {
			h += `<span class='badge bg-secondary ms-1' style='font-size:9px'>${app.escapeHTML(entry.p31label)}</span>`;
			if (entry.p31 !== undefined) {
				h += `<a href='#' onclick='wikishootme.addP31Filter("${escattr(entry.p31)}",1);return false' title='Show only this type' style='margin-left:3px;text-decoration:none'>+</a>`;
				h += `<a href='#' onclick='wikishootme.addP31Filter("${escattr(entry.p31)}",-1);return false' title='Exclude this type' style='margin-left:2px;text-decoration:none'>−</a>`;
			}
		}
		if (entry.mixnmatch !== undefined && entry.mixnmatch.ext_url != '') {
			const server = app.escapeHTML(entry.mixnmatch.ext_url.replace(/^[a-z]+?:\/\/(.+?)\/.*$/, '$1'));
			h += ` [<a href='${app.escapeHTML(entry.mixnmatch.ext_url)}' target='_blank'>${server}</a>]`;
		}
		h += "</div>";
		if (entry.description !== undefined) h += `<div>${app.escapeHTML(entry.description)}</div>`;
		if (entry.note !== undefined) h += `<div><i>${app.escapeHTML(entry.note)}</i></div>`;
		if (entry.street !== undefined) {
			h += `<div>&#127968; <i>${app.escapeHTML(entry.street)}</i></div>`;
		}
		if (entry.mixnmatch !== undefined) {
			if (entry.mixnmatch.q != null) {
				const q = entry.mixnmatch.q;
				const qlink = `<a href='https://www.wikidata.org/wiki/Q${q}' target='_blank'>Q${q}</a>`;
				if (entry.mixnmatch.user == 0) h += `<div><i>Preliminarily</i> matched to ${qlink}</div>`;
				else h += `<div>Matched to ${qlink}</div>`;
			} else {
				h += "<div><i>Not matched to Wikidata</i></div>";
			}
		}
		return h;
	}

	popupContent(entry, app) {
		return '';
	}

	popupFooter(entry, app) {
		let h = '';
		if (entry.commonscat !== undefined) {
			h += "<div class='popup_section'>";
			h += `<a href='//commons.wikimedia.org/wiki/Category:${escattr(encodeURIComponent(entry.commonscat.replace(/ /g, '_')))}' target='_blank' title='${escattr('' + app.tt.t('commons_category'))}'>${app.escapeHTML(entry.commonscat)}</a>`;
			h += " | ";
			h += `<a href='#' onclick='wikishootme.set_commons_main_category("${escattr(entry.commonscat)}")'>${app.tt.t('highlight_images_from_category')}</a>`;
			h += "</div>";
		}
		h += `<div class='popup_coords'><span class='coordinates'>${entry.pos[0]}, ${entry.pos[1]}</span>`;
		h += ` <a href='#' style='user-select:none' onclick='navigator.clipboard.writeText("${entry.pos[0]}, ${entry.pos[1]}");this.textContent="\\u2714";setTimeout(()=>this.textContent="\\ud83d\\udccb",1000);return false' title='Copy coordinates'>&#128203;</a>`;
		h += ` <a style='user-select:none' href='http://www.instantstreetview.com/@${entry.pos[0]},${entry.pos[1]},0h,0p,1z' tt_title='streetview' target='_blank'>&#127968;</a>`;
		if (wsm_comm.isLoggedIn() && entry.mixnmatch === undefined) {
			h += ` [<a href='#' style='user-select:none' onclick='wikishootme.editCoordinates(this,"${entry.page}",${entry.pos[0]},${entry.pos[1]});return false' title='edit coordinates'>e</a>]`;
		}
		h += "</div>";
		if (app.marker_me !== undefined) {
			const pos = app.marker_me.getLatLng();
			h += "<div style='font-size:10pt'>";
			h += `<a target='_blank' href='https://maps.google.co.uk/maps?dirflg=w&saddr=${pos.lat},${pos.lng}&daddr=${entry.pos[0]},${entry.pos[1]}'>${app.tt.t('route')}</a>`;
			h += "</div>";
		}
		return h;
	}

	// --- Loading (override in subclasses) ---

	load(app) {
		// no-op by default
	}

	// --- Helpers for Wikimedia-style layers ---

	createImageThumbnail(image, app) {
		const url = `https://commons.wikimedia.org/wiki/Special:Redirect/file/${escattr(encodeURIComponent(image))}?width=${app.thumb_size}px`;
		let h = '';
		h += "<div class='thumb'>";
		h += `<a target='_blank' href='https://commons.wikimedia.org/wiki/File:${escattr(encodeURIComponent(image))}'>`;
		h += `<img src='${url}' loading='lazy' style='max-width:${app.thumb_size}px;max-height:${app.thumb_size}px' alt='Loading image...' />`;
		h += "</a></div>";
		h += `<div class='smallimgname'>${app.escapeHTML(image)}</div>`;
		return h;
	}
}
