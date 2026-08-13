/**
 * WikiShootMe - Map creation, marker management, and layer control
 * Methods added to the global wikishootme object.
 */

wikishootme.updateMarkerMe = function ( p ) {
	const me = this ;
	if ( !navigator.geolocation ) return ;
	if ( me.marker_me === undefined ) {
		me.marker_me = L.circleMarker ( [p.lat,p.lng] , {  stroke:true,color:me.color_me,weight:1,fill:true,fillColor:me.color_me,fillOpacity:me.opacity } ) ;
		me.marker_me.setRadius ( me.marker_radius_me ) ;
		me.marker_me.bindPopup ( L.popup({ autoPan: true, autoPanPaddingTopLeft: L.point(10, 50) }).setContent(me.tt.t('we_know')) ) ;
		me.marker_me.addTo ( me.map ) ;
		return ;
	}
	me.marker_me.setLatLng ( [ p.lat , p.lng ] ) ;
} ;

wikishootme.addMarkerMe = function () {
	const me = this ;
	if ( navigator.geolocation ) {
		// Issue #9: do NOT seed marker_me with the URL/default coordinates —
		// otherwise the "we know where you are" message appears at the URL
		// location (e.g. when opening a shared link) before any real GPS lock.
		// Only the watchPosition callback should create/update the marker.
		navigator.geolocation.watchPosition((position) => { me.updateMarkerMe ( me.gps2leaflet(position.coords) ) } ) ;
	}
} ;

wikishootme.addNewWikidataItem = function ( q , label , pos , image ) {
	const me = this ;
	let layerKey = 'wikidata_no_image' ;
	const entry = {
		page:q ,
		label:label ,
		mode:'wikidata' ,
		url:`https://www.wikidata.org/wiki/${q}` ,
		pos:[pos.lat,pos.lng],
		ns:0
	} ;

	if ( image !== undefined && image != '' ) {
		layerKey = 'wikidata_image' ;
		entry.image = image ;
	}

	const layer = me.getLayer(layerKey) ;
	entry.layer_key = layerKey ;
	const marker = layer.createMarker ( entry.pos ) ;
	marker.bindPopup ( layer.createPopup ( entry , me ) ) ;
	layer.addMarker(marker) ;

	entry.marker = marker ;
	layer.storeEntry(q, entry) ;
	return marker ;
} ;

wikishootme.createMap = function () {
	const me = this ;
	if ( me.map_is_set ) return false ; // No map created

	// Create the map
	me.map_is_set = true ;
	me.map = L.map('map', {
		contextmenu: true,
		contextmenuWidth: 250,
		contextmenuItems: [{
			text:me.tt.t('create_new_item_from_coordinate'),
			callback: ( ev ) => { me.createNewItem ( { pos:ev.latlng, label_default:''} ) }
		},{
			text:me.tt.t('show_coordinates'),
			callback: ( ev ) => { wikishootme.showToast(ev.latlng, 'info'); }
		}]
	}).setView ( [ me.pos.lat , me.pos.lng ] , me.zoom_level ) ;

	let tl = me.tile_layers[me.current_tile_layer] ;
	if ( tl === undefined ) tl = me.tile_layers['osm'] ; // Default fallback
	const tlo = {attribution: tl.attribution} ;
	for ( const v of ['subdomains', 'maxZoom'] ) {
		if ( tl[v] === undefined ) continue ;
		tlo[v] = tl[v] ;
	}
	L.tileLayer(tl.url, tlo).addTo(me.map);
	me.map.on ( 'viewreset' , () => { me.updateMaybe() } ) ;
	// Debounce rapid pan/zoom events (especially on mobile touch)
	let moveTimer = null ;
	const debouncedUpdate = () => {
		clearTimeout(moveTimer) ;
		moveTimer = setTimeout(() => { me.updateToCurrent() }, 300) ;
	} ;
	me.map.on ( 'zoomend' , () => {
		const z = me.map.getZoom() ;
		if ( z > me.zoom_level ) {
			me.zoom_level = z ; // No need to reload data
			me.updatePermalink() ;
		} else {
			me.updateMaybe() ;
		}
	} ) ;
	me.map.on ( 'dragend' , debouncedUpdate ) ;


	// Pop-up open handler, loads pageimage for Wikipedia
	me.map.on ( 'popupopen' , ( pe ) => {
		const popup = pe.popup ;
		let c = popup.getContent() ;
		if ( c == me.tt.t('we_know') ) return ;
		const tmp = document.createElement('div') ;
		tmp.innerHTML = c ;

		tmp.querySelectorAll('div.transfer2flickr').forEach ( function (divEl) { // Flickr transfer function
			const html_do_upload = `<a href='#' onclick='wikishootme.transferFlickr2Commons(this,"${divEl.getAttribute('flickr_id')}");return false'>Transfer from Flickr to Commons</a>` ;
			if ( wsm_comm.oauth_uploader_login ) {
				divEl.innerHTML = html_do_upload ;
				popup.setContent ( tmp.innerHTML ) ;
			} else {
				$.get ( '/magnustools/oauth_uploader.php?action=checkauth&botmode=1' , ( d ) => {
					if ( d.error == 'OK' ) {
						wsm_comm.oauth_uploader_login = true ;
						divEl.innerHTML = html_do_upload ;
					} else {
						divEl.innerHTML = d.error ;
					}
					popup.setContent ( tmp.innerHTML ) ;
				} , 'json' ) ;
			}
		} ) ;


		tmp.querySelectorAll('div.pageimage_toload').forEach ( function (divEl) { // Lazy-load Commons image
			const server = divEl.getAttribute ( 'server' ) ;
			const page = divEl.getAttribute ( 'page' ) ;
			const url = `https://${server}/w/api.php?callback=?` ;
			$.getJSON ( url , {
				action:'mobileview',
				page:page,
				prop:'image',
				thumbsize:me.thumb_size,
				format:'json'
			} , ( d ) => {
				if ( d.mobileview === undefined || d.mobileview.image === undefined ) return ;
				const h = me.createImageThumbnail ( d.mobileview.image.file ) ;
				divEl.outerHTML = h ;
				popup.setContent ( tmp.innerHTML ) ;
			} ) ;
		} ) ;
	} ) ;


	// Create layers from registered layer classes
	me.layer_info.name2key = {} ;
	me.forEachLayer((layer) => {
		const fg = layer.initFeatureGroup(me.clustering_enabled) ;
		const overlayLabel = layer.getOverlayLabel() ;
		me.layer_info.name2key[overlayLabel] = layer.key ;
		me.layers[layer.key] = fg ;
		me.overlays[overlayLabel] = fg ;
		if ( me.show_layers.includes ( layer.key ) ) {
			fg.addTo ( me.map ) ;
		}
	}) ;
	me.layer_control = L.control.layers(null, me.overlays).addTo(me.map);

	me.map.on('overlayadd', (e) => {me.onOverlayAdd(e)});
	me.map.on('overlayremove', (e) => {me.onOverlayRemove(e)});

	me.addMarkerMe() ;
	return true ;
} ;

wikishootme.onOverlayAdd = function ( ev ) {
	const me = this ;
	const key = me.layer_info.name2key[ev.name] ;
	me.show_layers.push ( key ) ;
	me.show_layers = me.show_layers.sort() ;
	me.updatePermalink() ;
	me.loadLayer ( key ) ;
} ;

wikishootme.onOverlayRemove = function ( ev ) {
	const me = this ;
	const key = me.layer_info.name2key[ev.name] ;
	me.show_layers = me.show_layers.filter ( (value) => value != key );
	me.show_layers = me.show_layers.sort() ;
	me.updatePermalink() ;
} ;

wikishootme.toggleClustering = function () {
	const me = this ;
	me.clustering_enabled = !me.clustering_enabled ;
	localStorage.setItem('wsm_clustering_enabled', me.clustering_enabled ? '1' : '0') ;
	me.updatePermalink() ;

	me.forEachLayer((layer) => {
		if (!layer.use_clustering) return ;
		const wasVisible = me.show_layers.includes(layer.key) ;
		const label = layer.getOverlayLabel() ;
		if (layer.featureGroup) {
			if (me.layer_control) me.layer_control.removeLayer(layer.featureGroup) ;
			if (me.map) me.map.removeLayer(layer.featureGroup) ;
		}
		const newFg = layer.initFeatureGroup(me.clustering_enabled) ;
		me.layers[layer.key] = newFg ;
		me.overlays[label] = newFg ;
		if (me.layer_control) me.layer_control.addOverlay(newFg, label) ;
		if (wasVisible && me.map) newFg.addTo(me.map) ;
	}) ;

	const btn = document.getElementById('clustering_toggle') ;
	if (btn) btn.classList.toggle('active', me.clustering_enabled) ;

	me.updateLayers() ;
} ;

wikishootme.setMap = function () {
	const me = this ;
	if ( !me.createMap() ) {
		me.map.setView ( [ me.pos.lat , me.pos.lng ] , me.zoom_level ) ;
	}
	me.updateLayers() ;
} ;
