'use strict';

let router;
let app;
const wd = new WikiData();

$(document).ready(() => {
	vue_components.toolname = 'picturethis';
	Promise.all([
		vue_components.loadComponents(['wd-link', 'widar', 'tool-translate', 'tool-navbar', 'main.html'])
	]).then(() => {
		widar_api_url = 'https://wikishootme.toolforge.org/api_v3.php';
		wd_link_wd = wd;
		const routes = [
			{ path: '/', component: MainPage, props: true },
			{ path: '/:query', component: MainPage, props: true },
		];
		router = new VueRouter({ routes });
		app = new Vue({ router }).$mount('#app');
	});

	// Logging
	$.getJSON('https://magnustools.toolforge.org/logger.php?tool=picturethis&method=loaded&callback=?', () => { });
});
