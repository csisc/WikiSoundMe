/**
 * WikiShootMe - Search, SPARQL, admin units, GeoNames, position methods
 * Methods added to the global wikishootme object.
 */

wikishootme.loadGeoNames = function () {
	const me = this;
	let sparql = "#TOOL: WikiShootMe\n";
	sparql += 'SELECT ?code (group_concat(?q) AS ?item) { ?q wdt:P2452 ?code } GROUP BY ?code HAVING (count(?q)=1)';
	return wsm_comm.getWithRetry(me.sparql_url, {
		query: sparql,
		format: 'json'
	}, 'json').then((d) => {
		if (!d || !d.results || !d.results.bindings) return;
		for (const v of d.results.bindings) {
			if (v.code === undefined || v.code.type != 'literal') continue;
			if (v.item === undefined || v.item.type != 'literal') continue;
			let m = v.item.value.match(/^.+\/(Q\d+)$/);
			if (m != null) me.geonames_feature_codes[v.code.value] = m[1];
		}
	}).catch(() => {
		// GeoNames loading failed, non-critical
	});
};

wikishootme.setPositionFromQ = function (q) {
	const me = this;
	const m = ('' + q).match(/^Q?(\d+)$/i);
	if (m == null) return me.setPositionFromCurrentLocation();
	q = 'Q' + m[1];
	let sparql = "#TOOL: WikiShootMe\n";
	sparql += `SELECT ?qc ?qcau { wd:${q} wdt:P625 ?qc OPTIONAL { wd:${q} wdt:P131 ?au . ?au wdt:P625 ?qcau } }`;
	return wsm_comm.getWithRetry(me.sparql_url, {
		query: sparql,
		format: 'json'
	}, 'json').then((d) => {
		let found = false;
		if (!d || !d.results || !d.results.bindings) return me.setPositionFromCurrentLocation();
		for (const v of d.results.bindings) {
			let m = v.qc.value.match(/^Point\((.+?)\s(.+?)\)$/);
			if (m == null && v.qcau !== undefined) m = v.qcau.value.match(/^Point\((.+?)\s(.+?)\)$/);
			if (m == null) continue;
			me.pos = { lat: m[2] * 1, lng: m[1] * 1 };
			found = true;
			break;
		}
		if (found) me.setMap();
		else me.setPositionFromCurrentLocation();
	}).catch(() => {
		me.setPositionFromCurrentLocation();
	});
};

wikishootme.setPositionToMyLocation = function () {
	const me = this;
	if (me.marker_me === undefined) return;
	me.pos = me.marker_me.getLatLng();
	me.map.setView([me.pos.lat, me.pos.lng], me.zoom_level, { animate: false });
	me.updateLayers();
};

wikishootme.setPositionFromCurrentLocation = function () {
	const me = this;
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition((p) => {
			me.pos = me.gps2leaflet(p.coords);
			me.setMap();
		}, (error) => {
			let msg;
			switch (error.code) {
				case error.PERMISSION_DENIED:
					msg = "User denied the request for Geolocation."
					break;
				case error.POSITION_UNAVAILABLE:
					msg = "Location information is unavailable."
					break;
				case error.TIMEOUT:
					msg = "The request to get user location timed out."
					break;
				case error.UNKNOWN_ERROR:
					msg = "An unknown error occurred."
					break;
			}
			document.getElementById('geo_error').textContent = msg;
			me.setMap();
		}, { timeout: 10000, maximumAge: 60000 });
	} else {
		me.setMap();
	}
};

wikishootme._prefixSearchTimer = null;
wikishootme._prefixSearchCounter = 0;

wikishootme.onSearchInput = function () {
	const me = this;
	const query = document.getElementById('search_query').value.trim();
	clearTimeout(me._prefixSearchTimer);

	const suggestionsEl = document.getElementById('search_suggestions');
	if (!suggestionsEl) return;

	if (query.length < 2) {
		suggestionsEl.style.display = 'none';
		suggestionsEl.innerHTML = '';
		return;
	}

	me._prefixSearchTimer = setTimeout(() => {
		const counter = ++me._prefixSearchCounter;
		wsm_comm.prefixSearchWikidata(query, me.language).then((d) => {
			if (counter !== me._prefixSearchCounter) return; // stale
			if (!d.search || d.search.length === 0) {
				suggestionsEl.style.display = 'none';
				suggestionsEl.innerHTML = '';
				return;
			}
			let h = '';
			for (const item of d.search) {
				const desc = item.description ? ` <small class="text-muted">- ${item.description}</small>` : '';
				h += `<a href="#" class="list-group-item list-group-item-action ps_suggestion" data-q="${item.id}"><strong>${item.label || item.id}</strong>${desc}</a>`;
			}
			suggestionsEl.innerHTML = h;
			suggestionsEl.style.display = '';
			suggestionsEl.querySelectorAll('.ps_suggestion').forEach((el) => {
				el.addEventListener('click', (evt) => {
					evt.preventDefault();
					const q = el.getAttribute('data-q');
					suggestionsEl.style.display = 'none';
					suggestionsEl.innerHTML = '';
					me.hideModal('search_dialog');
					me.setPositionFromQ(q);
				});
			});
		}).catch(() => { });
	}, 300);
};

wikishootme.doSearch = function () {
	const me = this;
	const query = document.getElementById('search_query').value.trim();
	document.getElementById('search_results_list').innerHTML = '';
	const suggestionsEl = document.getElementById('search_suggestions');
	if (suggestionsEl) { suggestionsEl.style.display = 'none'; suggestionsEl.innerHTML = ''; }

	// Check if query looks like coordinates (e.g. "51.5, -0.1" or "51.5 -0.1" or "51.5/-0.1")
	const coordMatch = query.match(/^\s*(-?\d+\.?\d*)\s*[,\s\/]\s*(-?\d+\.?\d*)\s*$/);
	if (coordMatch) {
		const lat = parseFloat(coordMatch[1]);
		const lng = parseFloat(coordMatch[2]);
		if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
			me.hideModal('search_dialog');
			me.pos = { lat: lat, lng: lng };
			me.setMap();
			return;
		}
	}

	wsm_comm.searchWikidata({
		action: 'query',
		list: 'search',
		srsearch: query,
		srlimit: 25,
		srprop: '',
		format: 'json'
	}).then((d) => {
		const qs_all = [];
		for (const v of d.query.search) { qs_all.push(v.title) }

		me.wd.getItemBatch(qs_all, () => {
			const qs = [];
			for (const q of qs_all) {
				const i = me.wd.getItem(q);
				if (i === undefined) continue;
				if (!i.hasClaims('P625') && !i.hasClaims('P131')) continue;
				const p31 = i.getClaimItemsForProperty('P31', true);
				if (p31.includes('Q13406463')) continue;
				qs.push(q);
			}

			let h = '';
			for (const q of qs) {
				h += `<li class="list-group-item sr_result" q="${q}" id="sr_${q}">`;
				h += "<div class='sr_title'></div>";
				h += "<div class='sr_auto'></div>";
				h += "<div class='sr_manual'></div>";
				h += '</li>';
			}

			document.getElementById('search_results_list').innerHTML = h;
			document.getElementById('search_results').style.display = '';

			document.querySelectorAll('#search_results_list li.sr_result').forEach(function (li) {
				li.addEventListener('click', function () {
					const q = this.getAttribute('q');
					wikishootme.hideModal('search_dialog');
					me.setPositionFromQ(q);
				});
			});

			for (const q of qs) {
				wsm_comm.getAutodesc({
					q: q,
					lang: me.language,
					mode: 'short',
					links: 'text',
					format: 'json'
				}).then((d) => {
					const el = document.getElementById(`sr_${q}`);
					if (!el) return;
					if (d.result === undefined) {
						const titleEl = el.querySelector('div.sr_title');
						if (titleEl) titleEl.textContent = q;
					} else {
						const titleEl = el.querySelector('div.sr_title');
						if (titleEl) titleEl.textContent = d.label;
						const manualEl = el.querySelector('div.sr_manual');
						if (manualEl) manualEl.textContent = d.manual_description;
						const autoEl = el.querySelector('div.sr_auto');
						if (autoEl) autoEl.textContent = d.result;
					}
				});
			}
		});

	});
};

wikishootme.getAdminUnit = function (lat, lng) {
	const me = this;
	let p131 = '';
	let country = '';
	const url = `https://wd-infernal.toolforge.org/P131/${lat}/${lng}`;
	return wsm_comm.getWithRetry(url, null, 'json').then((d) => {
		if (typeof d == 'string') d = JSON.parse(d);
		if (Array.isArray(d) && d.length > 0 && d[0].mainsnak && d[0].mainsnak.datavalue) {
			p131 = d[0].mainsnak.datavalue.value.id;
		}
	}).catch((e) => {
		console.log('wd-infernal P131 error', e);
	}).then(() => {
		if (p131 == '') return { p131: p131, country: country };
		const sparql = `SELECT ?country { wd:${p131} wdt:P17 ?country } LIMIT 1`;
		return wsm_comm.getWithRetry(me.sparql_url, { query: sparql, format: 'json' }, 'json').then((d) => {
			if (d && d.results && d.results.bindings && d.results.bindings.length > 0) {
				const m = d.results.bindings[0].country.value.match(/^.+\/(Q\d+)$/);
				if (m) country = m[1];
			}
			return { p131: p131, country: country };
		}).catch(() => {
			return { p131: p131, country: country };
		});
	});
};

wikishootme.promptLabel = function (message, defaultValue) {
	return new Promise((resolve) => {
		const titleEl = document.getElementById('new_item_dialog_title');
		const inputEl = document.getElementById('new_item_label');
		const okBtn = document.getElementById('new_item_ok');
		if (!titleEl || !inputEl || !okBtn) {
			// Fallback for environments where the modal is unavailable
			resolve(prompt(message, defaultValue));
			return;
		}
		titleEl.textContent = message;
		inputEl.value = defaultValue || '';

		const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('new_item_dialog'));

		const cleanup = () => {
			okBtn.removeEventListener('click', onOk);
			document.getElementById('new_item_dialog').removeEventListener('hidden.bs.modal', onCancel);
		};
		const onOk = () => {
			cleanup();
			modal.hide();
			resolve(inputEl.value.trim());
		};
		const onCancel = () => {
			cleanup();
			resolve('');
		};

		okBtn.addEventListener('click', onOk);
		document.getElementById('new_item_dialog').addEventListener('hidden.bs.modal', onCancel, { once: true });

		modal.show();
		// Focus the input after the modal has opened
		document.getElementById('new_item_dialog').addEventListener('shown.bs.modal', () => {
			inputEl.focus();
			inputEl.select();
		}, { once: true });
	});
};

wikishootme.createNewItem = function (o) {
	const me = this;
	if (o.label_default === undefined) o.label_default = '';
	if (o.image === undefined) o.image = '';
	const rlat = Math.round(o.pos.lat * 10000) / 10000;
	const rlng = Math.round(o.pos.lng * 10000) / 10000;

	me.promptLabel(me.tt.t('create_new_item', { params: [rlat, rlng] }), o.label_default).then((label) => {
		if (!label) return;

		me.getAdminUnit(o.pos.lat, o.pos.lng).then((result) => {
			return wsm_comm.getWSM({
				action: 'new_item',
				lat: o.pos.lat,
				lng: o.pos.lng,
				p131: result.p131,
				p31: o.p31,
				p17: result.country,
				p18: o.image,
				ext_id: o.ext_id ?? '',
				ext_prop: o.ext_prop ?? '',
				label: label,
				lang: me.language
			});
		}).then((d) => {
			if (d.status != 'OK') {
				wikishootme.showToast(`ERROR: ${d.status}`, 'danger');
				return;
			}
			const marker = me.addNewWikidataItem(d.q, label, o.pos, o.image);
			marker.openPopup();
		}).catch((e) => {
			console.log('createNewItem error', e);
		});
	});
};

wikishootme.update_entries_commons_main_category = function () {
	const me = this;
	for (const [entry_id, entry] of Object.entries(me.entries.commons)) {
		const filename = entry.page;
		if (me.files_in_main_commons_category[filename] === undefined) {
			entry.marker.setStyle({ color: me.getLayer('commons').color, weight: 1 });
		} else {
			entry.marker.setStyle({ color: me.color_commons_in_category, weight: 3 });
		}
	}
};

wikishootme.clear_commons_main_category = function () {
	const me = this;
	if (me.main_commons_category == '') return false;
	me.files_in_main_commons_category = {};
	me.main_commons_category = '';
	me.updatePermalink();
	me.update_entries_commons_main_category();
	return false;
};

wikishootme.set_commons_main_category = function (category) {
	const me = this;
	me.files_in_main_commons_category = {};
	me.main_commons_category = category;
	if (me.main_commons_category == '') return false;
	let url = "https://petscan.wmcloud.org/?callback=?&sparse=on&ns%5B6%5D=1&cb_labels_no_l=1&interface_language=en&depth=3&output_compatability=quick-intersection&search_max_results=500&since_rev0=&project=wikimedia&cb_labels_any_l=1&edits%5Banons%5D=both&edits%5Bflagged%5D=both&cb_labels_yes_l=1&edits%5Bbots%5D=both&language=commons&format=json&doit=&categories=";
	url += encodeURIComponent(me.main_commons_category);
	$.getJSON(url, (d) => {
		if (d === undefined || d.pages === undefined) {
			me.update_entries_commons_main_category();
			me.updatePermalink();
			return;
		}
		for (const [k, v_orig] of Object.entries(d.pages)) {
			const v = v_orig.replace(/_/g, ' ');
			me.files_in_main_commons_category[v] = 1;
		}
		me.update_entries_commons_main_category();
		me.updatePermalink();
	});
	return false;
};
