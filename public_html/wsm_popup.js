/**
 * WikiShootMe - Popup interaction methods (item creation, coordinate editing).
 * Popup content generation is now handled by layer classes in wsm_layers.js.
 * createImageThumbnail is in BaseLayer (wsm_layer_base.js).
 */

// Keep backward compat for createImageThumbnail (used by wsm_map.js popupopen handler)
wikishootme.createImageThumbnail = function ( image ) {
	const base = new BaseLayer({});
	return base.createImageThumbnail(image, this);
} ;

wikishootme.createItemFromImage = function ( a ) {
	const image = a.getAttribute ( 'image' ) ;
	const image_pos = { lat:a.getAttribute('lat') , lng:a.getAttribute('lng') } ;

	wikishootme.createNewItem ( {
		pos:image_pos,
		label_default:image.replace(/\.[^.]+$/,'').replace(/ - geograph.org.uk.*$/,''),
		image:image
	} ) ;

	return false ;
} ;

wikishootme.createItemFromEntry = function ( a ) {
	if (a && typeof a.get === 'function') a = a.get(0); // unwrap jQuery
	const label = a.getAttribute ( 'label' ) ;
	const pos = { lat:a.getAttribute('lat') , lng:a.getAttribute('lng') } ;
	const ext_id = a.getAttribute ( 'ext_id' ) ;
	const ext_prop = a.getAttribute ( 'property' ) ;
	const p31 = a.getAttribute ( 'p31' )??'' ;

	wikishootme.createNewItem ( {
		pos:pos,
		label_default:label,
		ext_id: ext_id,
		ext_prop: ext_prop,
		p31: p31,
	} ) ;

	return false ;
} ;

wikishootme.editCoordinates = function ( a , q , lat , lon ) {
	const ret = prompt ( "Edit coordinates" , `${lat}/${lon}` ) ;
	if ( ret == null ) return false ; // Cancel
	if ( !ret.match ( /^\s*-?[0-9.]+\s*[\/,]\s*-?[0-9.]+\s*$/ ) ) {
		wikishootme.showToast ( "Bad format, not changing coordinates" , 'danger' ) ;
		return false ;
	}
	const normalized = ret.trim().replace ( /\s*[\/,]\s*/ , '/' ) ;
	if ( normalized == `${lat}/${lon}` ) {
		wikishootme.showToast ( "New coordinates are the same as the old ones, not changed" , 'info' ) ;
		return false ;
	}

	wsm_comm.getWSM ( {
		action:'changeCoordinates',
		coordinates:normalized,
		q:q
	} ).then( ( d ) => {
		if ( d.status != 'OK' ) {
			wikishootme.showToast ( `ERROR: ${d.status}` , 'danger' ) ;
		} else {
			const coordsDiv = a.closest('div.popup_coords') ;
			if ( coordsDiv ) {
				const cs = coordsDiv.querySelector('span.coordinates') ;
				if ( cs ) cs.textContent = ret ;
			}
		}
	} ) ;
	return false ;
} ;
