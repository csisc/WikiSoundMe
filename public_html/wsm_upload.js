/**
 * WikiShootMe - Upload handling methods (Uppy, background upload, Flickr transfer)
 * Methods added to the global wikishootme object.
 */

wikishootme.initialize_uppy = function () {
	if (uppy !== undefined) return;
	uppy = new Uppy.Uppy();
	uppy.use(XHRUpload, { endpoint: wsm_comm.api_v3 });
};

wikishootme.upload_via_uppy = function (event) {
	this.initialize_uppy();
	const files = Array.from(event.target.files)

	files.forEach((file) => {
		try {
			uppy.addFile({
				source: 'file input',
				name: file.name,
				type: file.type,
				data: file,
			})
		} catch (err) {
			if (err.isRestriction) {
				console.log('Restriction error:', err)
			} else {
				console.error(err)
			}
		}
	})
};

wikishootme.uploadFileHandler = function (o, event) {
	const me = wikishootme;
	const form = o.closest('form');

	if (me.upload_mode == 'uppy') {
		me.upload_via_uppy(event);
		return false;
	}

	// Upload as separate tab; fallback for older browsers
	if (me.upload_mode == 'upload') {
		form.submit();
		return false;
	}

	// Upload in background
	const uploadingText = document.createTextNode(me.tt.t('uploading'));
	form.parentNode.appendChild(uploadingText);
	const upload_obj = {
		data: new FormData(form),
		is_uploading: false,
		is_uploaded: false,
		failed: false,
		retry_count: 0
	}
	console.log("Appending object for upload", upload_obj);
	me.upload_queue.push(upload_obj);
	me.uploadNext();
};

wikishootme.clearUploads = function () {
	const me = this;
	me.upload_queue = [];
	if (me.upload_resume_timer) {
		clearInterval(me.upload_resume_timer);
		me.upload_resume_timer = null;
	}
	document.getElementById('dropdownUploadsLi').style.display = 'none';
	return false;
};

wikishootme.showUploadStatus = function () {
	const me = this;

	let cnt_uploaded = 0;
	for (const v of me.upload_queue) {
		if (v.is_uploaded) cnt_uploaded++;
	}

	let h = '';
	if (cnt_uploaded == me.upload_queue.length) {
		h += "<a class='dropdown-item clear_uploads' href='#' style='color:blue' tt='clear_upload_list'>clear</a>";
	}
	for (const v of me.upload_queue) {
		h += "<div class='dropdown-item'>";
		if (v.is_uploaded) {
			h += `<a href='${escattr(v.data.file_url)}' target='_blank'>${me.escapeHTML(v.data.file)}</a> &#10003;`;
		} else if (v.is_uploading) h += "<span style='color:blue' tt='uploading'>uploading</span>";
		else if (v.failed && v.retry_count >= me.max_upload_retries) h += "<span style='color:red'>failed</span>";
		else if (v.failed) h += `<span style='color:orange'>retrying (${v.retry_count}/${me.max_upload_retries})</span>`;
		else h += "<span tt='queueing'>queue</span>";
		h += "</div>";
	}
	document.getElementById('upload_list').innerHTML = h;
	document.querySelectorAll('#upload_list a.clear_uploads').forEach((el) => {
		el.addEventListener('click', () => { me.clearUploads(); });
	});

	h = `${cnt_uploaded}/${me.upload_queue.length}`;
	document.getElementById('dropdownUploads').innerHTML = h;
	document.getElementById('dropdownUploadsLi').style.display = '';
};

// Count how many uploads are currently in-flight
wikishootme.countUploading = function () {
	let count = 0;
	for (const v of this.upload_queue) {
		if (v.is_uploading) count++;
	}
	return count;
};

// Find the next item to upload: pending first, then retryable failed items
// Returns index or -1 if nothing to do
wikishootme.getNextUploadIndex = function () {
	const me = this;
	let pending_idx = -1;
	let retry_idx = -1;

	for (let k = 0; k < me.upload_queue.length; k++) {
		const v = me.upload_queue[k];
		if (v.is_uploading || v.is_uploaded) continue;
		if (!v.failed && pending_idx == -1) {
			pending_idx = k;
			break; // prefer pending over retry
		}
		if (v.failed && v.retry_count < me.max_upload_retries && retry_idx == -1) {
			retry_idx = k;
		}
	}

	return pending_idx != -1 ? pending_idx : retry_idx;
};

// Max simultaneous uploads (keep low for mobile bandwidth)
wikishootme.max_concurrent_uploads = 2;
// Max retry attempts per file
wikishootme.max_upload_retries = 3;
// Auto-resume interval in ms
wikishootme.upload_resume_interval = 15000;
// Reference to the auto-resume timer
wikishootme.upload_resume_timer = null;

wikishootme.uploadNext = function () {
	const me = this;
	if (me.upload_queue.length == 0) return;

	me.showUploadStatus();

	// Start auto-resume timer if not running
	if (!me.upload_resume_timer) {
		me.upload_resume_timer = setInterval(() => {
			me.uploadResume();
		}, me.upload_resume_interval);
	}

	// Check how many are currently uploading
	const uploading_count = me.countUploading();
	if (uploading_count >= me.max_concurrent_uploads) return;

	// Find next item to upload
	const i = me.getNextUploadIndex();
	if (i == -1) {
		// Nothing left to start — check if everything is done
		if (uploading_count == 0 && me.upload_resume_timer) {
			clearInterval(me.upload_resume_timer);
			me.upload_resume_timer = null;
		}
		return;
	}

	// Prepare upload
	const o = me.upload_queue[i];
	o.is_uploading = true;
	o.failed = false;

	// Uploading new file
	const opts = {
		url: wsm_comm.api_v3,
		data: o.data,
		cache: false,
		contentType: false,
		processData: false,
		dataType: 'json',
		type: 'POST',
		timeout: 120000, // 2 minute timeout to detect stalled uploads
		success: function (d) {
			me.upload_delay = 100; // Reset delay
			o.is_uploading = false;
			if (d.status == 'OK') {
				o.is_uploaded = true;
				o.data = d.data;
				me.switchItemToImageLayer(d.data.q, d.data.file.replace(/_/g, ' '));
			} else {
				o.failed = true;
				o.retry_count++;
				console.log('Upload failed (server):', d.status, 'retry', o.retry_count);
			}
			me.showUploadStatus();
			setTimeout(() => { me.uploadNext() }, me.upload_delay);
		},
		error: function (xhr, status, error) {
			o.is_uploading = false;
			o.failed = true;
			o.retry_count++;
			if (xhr.status === 429) {
				const retryAfter = xhr.getResponseHeader && xhr.getResponseHeader('Retry-After');
				me.upload_delay = retryAfter ? (parseFloat(retryAfter) * 1000) : Math.min(me.upload_delay + 10000, 60000);
				console.log('Upload 429 rate limited, retry', o.retry_count, 'delay', me.upload_delay);
			} else {
				me.upload_delay = Math.min(me.upload_delay + 2000, 30000); // Back off, max 30s
				console.log('Upload error:', status, error, 'retry', o.retry_count, 'delay', me.upload_delay);
			}
			me.showUploadStatus();
			setTimeout(() => { me.uploadNext() }, me.upload_delay);
		}
	};
	if (o.data.fake) {
		opts.xhr = function () { const xhr = jQuery.ajaxSettings.xhr(); xhr.send = xhr.sendAsBinary; return xhr; }
		opts.contentType = `multipart/form-data; boundary=${o.data.boundary}`;
		opts.data = o.data.toString();
	}

	$.ajax(opts);

	me.showUploadStatus();

	// Logging
	$.getJSON('https://magnustools.toolforge.org/logger.php?tool=wikishootme&method=file uploaded&callback=?', function (j) { });

	// Try to fill more upload slots
	if (me.countUploading() < me.max_concurrent_uploads) {
		setTimeout(() => { me.uploadNext() }, 50);
	}
};

// Auto-resume: periodically checks for stalled uploads and retries
wikishootme.uploadResume = function () {
	const me = this;

	// Detect stalled uploads: marked as uploading but no AJAX activity
	// (safety net — the error handler should normally catch these)
	let has_pending = false;
	for (const v of me.upload_queue) {
		if (v.is_uploading) {
			// If it's been uploading for over 2.5 minutes, consider it stalled
			if (v.upload_started && (Date.now() - v.upload_started) > 150000) {
				console.log('Upload stall detected - resetting');
				v.is_uploading = false;
				v.failed = true;
				v.retry_count++;
			}
		}
		if (!v.is_uploaded && !v.is_uploading && (!v.failed || v.retry_count < me.max_upload_retries)) {
			has_pending = true;
		}
	}

	if (has_pending && me.countUploading() < me.max_concurrent_uploads) {
		console.log('Auto-resume: restarting uploads');
		me.uploadNext();
	}
};

wikishootme.switchItemToImageLayer = function (q, image, form) {
	const me = this;
	const noImgLayer = me.getLayer('wikidata_no_image');
	const imgLayer = me.getLayer('wikidata_image');
	const i = noImgLayer ? noImgLayer.getWikidataEntry(q) : undefined;
	if (i === undefined) { // Paranoia
		if (form !== undefined) {
			const span = document.createElement('span');
			span.textContent = me.tt.t('image_added');
			form.replaceWith(span);
			const popupContent = form.closest ? form.closest('div.leaflet-popup-content') : null;
			if (popupContent) {
				popupContent.querySelectorAll('div.add_image2item').forEach((el) => el.remove());
			}
		}
		return;
	}
	i.image = image;
	i.layer_key = 'wikidata_image';
	const marker = i.marker;
	let was_open = true; // Default
	if (marker.getPopup().isOpen !== undefined) was_open = marker.getPopup().isOpen();
	// Move from no_image to image layer
	if (noImgLayer) { noImgLayer.removeMarker(marker); delete noImgLayer.entries[q]; }
	if (imgLayer) { imgLayer.addMarker(marker); imgLayer.storeEntry(q, i); }
	marker.setStyle({ color: imgLayer.color, fillColor: imgLayer.color });
	me.pingLayer('wikidata_image');
	marker.closePopup();
	marker.unbindPopup();
	marker.bindPopup(imgLayer.createPopup(i, me));
	if (was_open) marker.openPopup();
};

// Issue #13: accept pasted Commons URLs (e.g.
// https://commons.wikimedia.org/wiki/File:Foo.jpg) in addition to plain
// filenames, and tolerate the "File:" prefix.
wikishootme.normalizeCommonsFilename = function (raw) {
	let s = (raw || '').trim();
	const m = s.match(/^https?:\/\/[^/]*commons\.wikimedia\.org\/(?:wiki|w\/index\.php\?title=)\/?(.+?)(?:[?#].*)?$/i);
	if (m) s = decodeURIComponent(m[1]);
	s = s.replace(/^File:/i, '').replace(/_/g, ' ').trim();
	return s;
};

wikishootme.addImageToItemHandler = function (form) {
	const me = this;
	const q = form.querySelector('input[name="q"]').value;
	const image = wikishootme.normalizeCommonsFilename(form.querySelector('input[name="filename"]').value);
	wsm_comm.getWSM({
		action: 'addImageToWikidata',
		image: image,
		q: q
	}).then((d) => {
		if (d.status != 'OK') {
			wikishootme.showToast(`ERROR: ${d.status}`, 'danger');
		} else {
			me.switchItemToImageLayer(q, image, form);
		}
	});
	return false;
};

wikishootme.uploadURL2Commons = function (url, title, desc, comment, pic) {
	const me = this;
	const params = {
		action: 'upload',
		newfile: title,
		url: url,
		desc: desc,
		comment: comment,
		botmode: 1
	};

	$.post(`/magnustools/oauth_uploader.php?rand=${Math.random()}`, params, function (d) {
		wikishootme.hideModal('pleaseWaitDialog');

		if (d.error == 'OK') {

			// Remove marker from original layer
			pic.marker.closePopup();
			pic.marker.unbindPopup();
			me.layers[pic.layer_key].removeLayer(pic.marker);

			// Add marker to Commons layer
			const new_file_name = d.res.upload.filename;
			const new_pic = me.addWikimediaEntry('commons', 'commons.wikimedia.org', {
				lat: pic.pos[0],
				lon: pic.pos[1],
				title: new_file_name,
				ns: 6,
				pageid: `dummy_${new_file_name}`
			});
			new_pic.marker.openPopup();

		} else {
			const s = [d.error];
			for (const [k3, v3] of Object.entries((((d.res || {}).upload || {}).warnings || {}))) {
				if (Array.isArray(v3)) {
					s.push(`${k3}: ${v3.join('; ')}`);
				} else {
					s.push(`${k3}: ${v3}`);
				}
			}
			if ((((d.res || {}).error || {}).info) !== undefined) s.push(d.res.error.info);

			wikishootme.showToast(`Transfer failed: ${s.join('; ')}`, 'danger');
			console.log(s);
		}

	}, 'json')

		.fail(function (x) {
			wikishootme.showToast("Transfer failed", 'danger');
			console.log(x);
		});

};

wikishootme.transferFlickr2Commons = function (popup, flickr_id) {
	const me = this;
	let pic_num;
	for (let k = 0; k < me.flickr_pics.length; k++) {
		if (me.flickr_pics[k].flickr_id != flickr_id) continue;
		pic_num = k;
		break;
	}
	if (pic_num === undefined) {
		console.log(`Flickr pic ${flickr_id} not in cache`);
		return false;
	}
	const pic = me.flickr_pics[pic_num];

	const params = {
		id: flickr_id,
		raw: 'on',
		format: 'json'
	};

	params.categories = ' '; // No auto categories

	wikishootme.showModal('pleaseWaitDialog');

	wsm_comm.getFlinfo(params).then(function (d) {
		if (undefined === d.wiki || d.wiki.status != 0) {
			const err = `Flinfo: ${d.wiki.status}`;
			console.log(err);
			wikishootme.hideModal('pleaseWaitDialog');
			return;
		}

		const final_desc = (d.wiki.info.desc || '');

		let w = "== {{int:filedesc}} ==\n";
		w += "{{Information\n";
		w += `| Description = ${final_desc}\n`;
		w += `| Source      = ${d.wiki.info.source || ''}\n`;
		w += `| Date        = ${d.wiki.info.date || ''}\n`;
		w += `| Author      = ${d.wiki.info.author || ''}\n`;
		w += `| Permission  = ${d.wiki.info.permission || ''}\n`;
		w += "| other_versions=\n";
		w += "}}\n";

		if (undefined !== d.wiki.geolocation && undefined !== d.wiki.geolocation.latitude) {
			w += `{{Location dec|${d.wiki.geolocation.latitude}|${d.wiki.geolocation.longitude}|source:${d.wiki.geolocation.source}}}\n`;
		} else {
			w += `{{Location dec|${pic.pos[0]}|${pic.pos[1]}|source:Flickr}}\n`;
		}

		w += "\n=={{int:license-header}}==\n";
		for (const v of (d.wiki.licenses || [])) {
			w += `{{${v}}}\n`;
		}

		w += "\n";
		for (const v of (d.wiki.categories || [])) {
			w += `[[${v}]]\n`;
		}

		w = w.trim();

		let title = pic.label.trim();
		if (title == '' || title.match(/^(IMG|DSC){0,1}[0-9 _]*$/)) title = 'Flickr image';
		title += ` ${flickr_id}`;
		title += '.jpg';

		const comment = 'Transferred from Flickr via [https://wikishootme.toolforge.org WikiShootMe] #wikishootme';

		me.uploadURL2Commons(pic.url_best, title, w, comment, pic);

	}, 'json');

	return false;
};
