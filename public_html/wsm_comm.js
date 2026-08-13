var wsm_comm = {
	is_app: false,
	api_v3: 'https://wikishootme.toolforge.org/api_v3.php',
	api_autodesc: 'https://autodesc.toolforge.org/',
	api_wikidata: 'https://www.wikidata.org/w/api.php',
	url_flinfo: 'https://flickr2commons.toolforge.org//flinfo_proxy.php',
	url_flickr_key: 'https://wikishootme.toolforge.org/flickr.key',
	url_proxy: 'https://wikishootme.toolforge.org/api_proxy.php',

	userinfo: {},
	is_logged_in: false,
	oauth_uploader_login: false,

	// Retry a fetch() call on 429 with exponential backoff.
	// Respects Retry-After header if present.
	fetchWithRetry: async function (url, options, maxRetries) {
		maxRetries = maxRetries !== undefined ? maxRetries : 5;
		let delay = 5000;
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			const response = await fetch(url, options);
			if (response.status !== 429 || attempt === maxRetries) return response;
			const retryAfter = response.headers.get('Retry-After');
			const waitMs = retryAfter ? (parseFloat(retryAfter) * 1000) : delay;
			console.log(`429 rate limited on ${url}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
			await new Promise(resolve => setTimeout(resolve, waitMs));
			delay = Math.min(delay * 2, 60000);
		}
	},

	// Retry a $.get() call on 429 with exponential backoff.
	getWithRetry: function (url, params, dataType, maxRetries) {
		maxRetries = maxRetries !== undefined ? maxRetries : 5;
		let delay = 5000;
		const attempt = (retriesLeft) => {
			return Promise.resolve($.get(url, params, null, dataType || 'json')).catch((err) => {
				if (err.status === 429 && retriesLeft > 0) {
					const retryAfter = err.getResponseHeader && err.getResponseHeader('Retry-After');
					const waitMs = retryAfter ? (parseFloat(retryAfter) * 1000) : delay;
					console.log(`429 rate limited on ${url}, retrying in ${waitMs}ms (${retriesLeft} retries left)`);
					delay = Math.min(delay * 2, 60000);
					return new Promise(resolve => setTimeout(resolve, waitMs)).then(() => attempt(retriesLeft - 1));
				}
				throw err;
			});
		};
		return attempt(maxRetries);
	},

	getWSM: function (params) {
		console.log("Calling API", params);
		return this.getWithRetry(this.api_v3, params, 'json');
	},

	getFlinfo: function (params) {
		return this.getWithRetry(this.url_flinfo, params, 'json');
	},

	getFlickrKey: function () {
		return this.getWithRetry(this.url_flickr_key, null, 'text');
	},

	getProxy: function (params) {
		return this.getWithRetry(this.url_proxy, params, 'json');
	},

	getAutodesc: function (params) {
		const url = this.api_autodesc + '?' + new URLSearchParams(params).toString();
		return this.fetchWithRetry(url).then(r => r.json()).catch((d) => {
			console.log('autodesc failed', d);
			return {};
		});
	},

	searchWikidata: function (params) {
		params.origin = '*';
		const url = this.api_wikidata + '?' + new URLSearchParams(params).toString();
		return this.fetchWithRetry(url).then(r => r.json());
	},

	prefixSearchWikidata: function (search, language) {
		const params = {
			action: 'wbsearchentities',
			search: search,
			limit: 10,
			language: language || 'en',
			uselang: language || 'en',
			type: 'item',
			format: 'json',
			origin: '*'
		};
		const url = this.api_wikidata + '?' + new URLSearchParams(params).toString();
		return this.fetchWithRetry(url).then(r => r.json());
	},

	checkUserStatus: function () {
		if (this.is_app) {
			this.is_logged_in = false;
			return Promise.resolve();
		}
		return this.getWSM({ action: 'check' }).then((d) => {
			if (d.result.error !== undefined) {
				this.is_logged_in = false;
			} else {
				this.is_logged_in = true;
				this.userinfo = d.result.query.userinfo;
			}
		}).catch(() => {
			this.is_logged_in = false;
		});
	},

	storeKey: function (key, value) {
		const storage = window.localStorage;
		storage.setItem(key, value);
	},

	removeKey: function (key) {
		const storage = window.localStorage;
		storage.removeItem(key);
	},

	getValue: function (key) {
		const storage = window.localStorage;
		return storage.getItem(key);
	},

	hasKey: function (key) {
		const value = this.getValue(key);
		return value !== null;
	},

	storeCurrentView: function (arr) {
		const s = JSON.stringify(arr);
		this.storeKey('last_view_params', s);
	},

	isLoggedIn: function (callback) {
		var me = this;
		if (callback === undefined) return me.is_logged_in; // Just checking
		if (!me.is_app) return me.is_logged_in; // Web browsed: We've already checked
		if (me.is_logged_in) return true; // Yes we are!

		if (callback !== undefined) {
			// open dialog and ask for/check login
			wikishootme.showModal('app_login_dialog');
			$('#user_login').submit(function (evt) {
				evt.preventDefault();
				var name = $('#user_name').val();
				var pass = $('#user_pass').val();

				// TODO verify
				me.userinfo = { // TODO
					name: name,
					groups: [],
					id: 0,
					rights: []
				};
				me.is_logged_in = true;
				alert(name + " pseudo-logged in!");
				callback(me.is_logged_in);

				wikishootme.hideModal('app_login_dialog');
				return false;
			});
		}

		return false;
	},

	appLogin: function () {
		this.isLoggedIn((is_logged_in) => {
			if (is_logged_in) wikishootme.updateLayers();
		});
		return false;
	},


	fin: true
}
