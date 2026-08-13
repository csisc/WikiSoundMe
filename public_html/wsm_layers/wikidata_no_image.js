/**
 * WikidataNoImageLayer - Wikidata items without an image.
 * Handles SPARQL loading for both Wikidata layers and distributes
 * entries to WikidataImageLayer or itself based on P18 presence.
 */
class WikidataNoImageLayer extends BaseLayer {
	constructor() {
		super({
			key: 'wikidata_no_image',
			name: 'Wikidata (no image, 3K max)',
			color: '#FF4848',
			radius: 10,
			// Issue #56: cluster overlapping/nearby red markers so the digit
			// count communicates how many items share a spot, with click-to-
			// spiderfy for disambiguation. Matches the green (with-image)
			// layer's behaviour.
			use_clustering: true,
			min_cluster_size: 10
		});
		this.imageLayer = null;
		this.noImageCopyrightColor = '#9A03FE';
		this.supportsIncremental = true;
	}

	setImageLayer(imageLayer) {
		this.imageLayer = imageLayer;
	}

	getWikidataEntry(q) {
		let entry = this.getEntry(q);
		if (!entry && this.imageLayer) entry = this.imageLayer.getEntry(q);
		return entry;
	}

	shouldLoad(showLayers) {
		return showLayers.indexOf('wikidata_image') !== -1 ||
			showLayers.indexOf('wikidata_no_image') !== -1;
	}

	load(app) {
		const me = this;
		const imageLayer = me.imageLayer;
		const b = app.map.getBounds();
		const ne = b.getNorthEast();
		const sw = b.getSouthWest();
		let sparql = "#TOOL: WikiShootMe\n";
		sparql += 'SELECT ?q ?qLabel ?location ?image ?reason ?desc ?commonscat ?street ?p31Label ?p31type ?adminLabel WHERE { ';
		if (app.worldwide) {
			if (!app.sparql_filter.match(/\?location\b/)) sparql += "?q wdt:P625 ?location . ";
		} else {
			if (!app.sparql_filter.match(/\?location\b/)) sparql += 'SERVICE wikibase:box { ?q wdt:P625 ?location . ';
			sparql += `bd:serviceParam wikibase:cornerSouthWest "Point(${sw.lng} ${sw.lat})"^^geo:wktLiteral . `;
			sparql += `bd:serviceParam wikibase:cornerNorthEast "Point(${ne.lng} ${ne.lat})"^^geo:wktLiteral } `;
		}
		sparql += app.sparql_filter;
		sparql += app.getP31SparqlFragment();
		sparql += app.getDestroyedSparqlFragment();
		sparql += ' OPTIONAL { ?q wdt:P31 ?p31type } ';
		sparql += ' OPTIONAL { ?q wdt:P18 ?image } ';
		sparql += ' OPTIONAL { ?q wdt:P373 ?commonscat } ';
		sparql += ' OPTIONAL { ?q wdt:P969 ?street } ';
		sparql += ' OPTIONAL { ?q wdt:P131 ?admin } ';
		if (app.check_reason_no_image) sparql += 'OPTIONAL { ?q p:P18 ?statement . ?statement pq:P828 ?reason } ';
		const labelLangs = app.getLabelLanguageChain();
		if (app.worldwide) {
			sparql += ` OPTIONAL { ?q rdfs:label ?qLabel . FILTER(LANG(?qLabel) = "${app.language}") } OPTIONAL { ?q schema:description ?desc . FILTER(LANG(?desc) = "${app.language}") } OPTIONAL { ?p31type rdfs:label ?p31Label . FILTER(LANG(?p31Label) = "${app.language}") } OPTIONAL { ?admin rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "${app.language}") } `;
		} else {
			sparql += ` SERVICE wikibase:label { bd:serviceParam wikibase:language "${labelLangs}" . ?q schema:description ?desc . ?q rdfs:label ?qLabel . ?p31type rdfs:label ?p31Label . ?admin rdfs:label ?adminLabel } `;
		}
		sparql += `} LIMIT ${app.worldwide ? 10000 : 3000}`;

		const isIncremental = Object.keys(me.entries).length > 0 ||
			(imageLayer && Object.keys(imageLayer.entries).length > 0);

		return app.loadCachedJSON(app.sparql_url, {
			query: sparql
		}).then((d) => {
			if (d === undefined || d.results === undefined || d.results.bindings === undefined) return;
			const bindings = d.results.bindings;
			const cap = app.worldwide ? 10000 : 3000;
			if (isIncremental && bindings.length >= cap) {
				me.clean();
				if (imageLayer) imageLayer.clean();
			}
			for (const item of bindings) {
				if (item.q.type != 'uri') continue;
				const q = item.q.value.replace(/^.+\//, '');
				if (me.getWikidataEntry(q)) continue;

				let col;
				let opacity = me.opacity;

				const entry = {
					page: q,
					label: q,
					mode: 'wikidata',
					url: `https://www.wikidata.org/wiki/${q}`,
					ns: 0
				};

				if (item.image !== undefined) {
					if (item.image.type == 'uri') {
						entry.image = decodeURIComponent(item.image.value.replace(/^.+\//, ''));
					}
				} else if (app.check_reason_no_image && item.reason !== undefined && item.reason.type == 'uri') {
					const reason = item.reason.value.replace(/^.+\//, '');
					if (reason == 'Q15687022') {
						col = me.noImageCopyrightColor;
						opacity = 1;
						entry.note = app.tt.t('no_image_copyright');
						entry.no_image = true;
					} else {
						continue;
					}
				}

				if (item.qLabel !== undefined && item.qLabel.type == 'literal') entry.label = item.qLabel.value;
				if (item.p31Label !== undefined && item.p31Label.type == 'literal') entry.p31label = item.p31Label.value;
				if (item.p31type !== undefined && item.p31type.type == 'uri') entry.p31 = item.p31type.value.replace(/^.+\//, '');
				if (item.adminLabel !== undefined && item.adminLabel.type == 'literal') entry.adminlabel = item.adminLabel.value;
				if (item.commonscat !== undefined && item.commonscat.type == 'literal') entry.commonscat = item.commonscat.value;
				if (item.street !== undefined && item.street.type == 'literal') entry.street = item.street.value;
				if (item.desc !== undefined && item.desc.type == 'literal') entry.description = item.desc.value;
				if (item.location !== undefined && item.location.type == 'literal' && item.location.datatype == "http://www.opengis.net/ont/geosparql#wktLiteral") {
					const m = item.location.value.match(/^Point\((.+?)\s(.+?)\)$/);
					if (m != null) entry.pos = [m[2] * 1, m[1] * 1];
				}

				if (entry.pos === undefined) continue;

				const has_image = (entry.image !== undefined);
				const targetLayer = has_image ? imageLayer : me;
				if (col === undefined) col = targetLayer.color;

				entry.layer_key = targetLayer.key;
				const marker = targetLayer.createMarker(entry.pos, { color: col, fillColor: col, opacity: opacity });
				marker.bindPopup(targetLayer.createPopup(entry, app));
				targetLayer.addMarker(marker);
				entry.marker = marker;
				targetLayer.storeEntry(q, entry);
			}
			if (isIncremental && bindings.length < cap) {
				const bbox = app.map.getBounds();
				me.pruneOutsideBbox(bbox);
				if (imageLayer) imageLayer.pruneOutsideBbox(bbox);
			}
			// Issue #52: flag items whose P18 image uses {{Thumbnail}} on
			// Commons. Opt-in (#enrich=1) to avoid hammering Commons on
			// every pan.
			if (app.enrich_commons) me.flagThumbnailImages(app);
		});
	}

	flagThumbnailImages(app) {
		const me = this;
		const imageLayer = me.imageLayer;
		if (!imageLayer) return;
		if (typeof fetch !== 'function') return;
		const titles = [];
		const titleToQ = {};
		for (const [q, entry] of Object.entries(imageLayer.entries)) {
			if (!entry.image || entry.is_thumbnail_checked) continue;
			const t = 'File:' + entry.image;
			titles.push(t);
			titleToQ[t.replace(/_/g, ' ')] = q;
			entry.is_thumbnail_checked = true;
		}
		if (titles.length === 0) return;
		const batchSize = 50;
		for (let i = 0; i < titles.length; i += batchSize) {
			const batch = titles.slice(i, i + batchSize);
			const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=templates&tltemplates=${encodeURIComponent('Template:Thumbnail')}&titles=${encodeURIComponent(batch.join('|'))}`;
			fetch(url).then(r => r.json()).then((d) => {
				if (!d || !d.query || !d.query.pages) return;
				for (const p of Object.values(d.query.pages)) {
					if (!p.templates || p.templates.length === 0) continue;
					const q = titleToQ[(p.title || '').replace(/_/g, ' ')];
					if (!q) continue;
					const entry = imageLayer.entries[q];
					if (!entry || !entry.marker) continue;
					entry.is_thumbnail_image = true;
					entry.marker.setStyle({ color: imageLayer.colorThumbnailImage, fillColor: imageLayer.colorThumbnailImage });
				}
			}).catch(() => { /* best-effort */ });
		}
	}

	popupContent(entry, app) {
		let h = '';
		h += `<div>${entry.page}</div>`;

		if (entry.no_image) {
			// nothing
		} else if (wsm_comm.isLoggedIn()) {
			const today = new Date().toISOString().split('T')[0];
			const desc = `== {{int:filedesc}} ==\n{{Information\n|Description=[[d:${entry.page}|${entry.label}]]\n|Source={{own}}\n|Date=${today}\n|Author=[[User:${wsm_comm.userinfo.name}|]]\n|Permission=\n|other_versions=\n}}\n` +
				`{{Object location|${entry.pos[0]}|${entry.pos[1]}}}\n<!--LOC-->\n\n` +
				`== {{int:license-header}} ==\n{{self|cc-by-sa-4.0}}`;

			h += "<div style='margin-top:15px'>";
			h += `<form method='post' enctype='multipart/form-data' action='${wsm_comm.api_v3}' class='form form-inline' target='_blank'>`;
			// Issues #23, #60: optional categories pre-filled from the item's
			// P373 (Commons category) so the upload is categorised on Commons.
			const defaultCat = entry.commonscat ? entry.commonscat : '';
			h += `<textarea name='categories' rows='2' style='width:100%;font-size:11px;margin-bottom:4px' placeholder='${escattr(app.tt.t('categories_placeholder') || 'Categories (one per line)')}'>${escattr(defaultCat)}</textarea>`;
			h += `<label class="btn btn-primary btn-file">${app.tt.t('upload_file')} <input name="file" type="file" accept="image/*;capture=camera" onchange="wikishootme.uploadFileHandler(this,event)" style="display: none;"></label>`;
			h += `<input type='hidden' name='action' value='${app.upload_mode}' />`;
			h += `<input type='hidden' name='q' value='${entry.page}' />`;
			const baseName = entry.label.replace(/\//g, '-');
			const wpDestFile = entry.adminlabel
				? `${baseName}, ${entry.adminlabel.replace(/\//g, '-')}.jpg`
				: `${baseName}.jpg`;
			h += `<input type='hidden' name='wpDestFile' value='${escattr(wpDestFile)}' />`;
			h += `<input type='hidden' name='wpUploadDescription' value='${escattr(desc)}' />`;
			h += `<input type='submit' style='display:none' name='wpUpload' value='${app.tt.t('upload_file')}' />`;
			h += "</form>";
			h += "</div>";

			h += "<div class='add_image2item'>";
			h += "<form class='form form-inline' onSubmit='return wikishootme.addImageToItemHandler(this)'>";
			h += `<input type='hidden' name='q' value='${escattr(entry.page)}' />`;
			h += `<input type='text' name='filename' placeholder='${escattr(app.tt.t('commons_file_name'))}' />`;
			h += `<input type='submit' value='${escattr(app.tt.t('add2item'))}' />`;
			h += "</form>";
			h += "</div>";

		} else {
			if (wsm_comm.is_app) {
				h += "<div><button class='btn btn-primary' onclick='wsm_comm.appLogin();return false'>Log in!</button></div>";
			} else {
				h += "<div>";
				h += `<form method='post' action='${wsm_comm.api_v3}'>`;
				h += "<input type='hidden' name='action' value='authorize' />";
				h += `<input type='submit' class='btn btn-primary' value='${app.tt.t('authorize_upload')}' />`;
				h += "</form>";
				h += "</div>";
			}
		}
		return h;
	}
}
