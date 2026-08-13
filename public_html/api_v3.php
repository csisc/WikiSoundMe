<?PHP

error_reporting(E_ERROR|E_CORE_ERROR|E_ALL|E_COMPILE_ERROR); #
ini_set('display_errors', 'On');

#require_once ( 'php/oauth.php' ) ;
#require_once ( 'php/common.php' ) ;
require_once ( 'php/wikidata.php' ) ;
require_once ( 'php/Widar.php' ) ;

$tfc = new ToolforgeCommon ( 'wikishootme' ) ;
$tool_hashtag = $tfc->getRequest ( 'tool_hashtag' , 'wikishootme' ) ;
$action = $tfc->getRequest ( 'action' , '' ) ;
$oa = new MW_OAuth ( 'wikishootme' , 'commons' , 'wikimedia' ) ;

// GPS converter from http://stackoverflow.com/questions/2526304/php-extract-gps-exif-data#2572991
function gps($coordinate, $hemisphere) {
  for ($i = 0; $i < 3; $i++) {
    $part = explode('/', $coordinate[$i]);
    if (count($part) == 1) {
      $coordinate[$i] = $part[0];
    } else if (count($part) == 2) {
      $coordinate[$i] = floatval($part[0])/floatval($part[1]);
    } else {
      $coordinate[$i] = 0;
    }
  }
  list($degrees, $minutes, $seconds) = $coordinate;
  $sign = ($hemisphere == 'W' || $hemisphere == 'S') ? -1 : 1;
  return $sign * ($degrees + $minutes/60 + $seconds/3600);
}

function mydie ( $msg ) {
	global $out ;
	$out['status'] = $msg ;
	header ( 'Content-Type: application/json' ) ;
	print json_encode($out) ;
	exit ( 0 ) ;
}

function redirect2url ( $url ) {
	header ( 'Content-Type: text/html' ) ;
	print '<html><head><meta http-equiv="refresh" content="0; url='.$url.'" /></head><body></body></html>' ;
	exit(0);
}

function fileExistsOnCommons ( $filename ) {
	$url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=File:" . urlencode(str_replace(' ','_',ucfirst(trim($filename)))) ;
	$j = json_decode ( file_get_contents ( $url ) ) ;
	$exists = false ;
	foreach ( $j->query->pages AS $k => $v ) {
		if ( $k != -1 ) $exists = true ;
	}
	return $exists ;
}

function setCoordinates ( $q , $coordinates ) {
	global $out ;
	if ( !preg_match ( '/^\s*(-?[0-9\.]+)\s*\/\s*(-?[0-9\.]+)\s*$/' , $coordinates , $m ) ) {
		$out['error'] = 'Bad coordinates' ;
		return ;
	}
	$lat = $m[1] * 1 ;
	$lon = $m[2] * 1 ;
	$q = 'Q' . preg_replace ( '/\D/' , '' , $q ) ;
	$oa = new MW_OAuth ( 'wikishootme' , 'wikidata' , 'wikidata' ) ;

	// Deprecate existing P625 claims
	$url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=' . $q ;
	$entity = json_decode ( file_get_contents ( $url ) ) ;
	if ( isset($entity->entities->$q->claims->P625) ) {
		foreach ( $entity->entities->$q->claims->P625 as $existing ) {
			if ( !isset($existing->id) ) continue ;
			if ( ($existing->rank ?? '') === 'deprecated' ) continue ;
			$existing->rank = 'deprecated' ;
			$ch = null ;
			$res = $oa->doApiQuery( [
				'format' => 'json',
				'action' => 'query',
				'meta' => 'tokens'
			], $ch ) ;
			if ( !isset($res->query->tokens->csrftoken) ) continue ;
			$oa->doApiQuery( [
				'format' => 'json',
				'action' => 'wbsetclaim',
				'claim' => json_encode($existing),
				'token' => $res->query->tokens->csrftoken,
				'bot' => 1,
				'summary' => 'Deprecating old coordinate value #wikishootme'
			], $ch ) ;
		}
	}

	// Create new P625 claim
	$claim = [
		"prop" => "P625" ,
		"lat" => $lat ,
		"lon" => $lon ,
		"q" => $q ,
		"type" => "location"
	] ;
	$out['claim'] = $claim ;
	if ( !$oa->setClaim ( $claim ) ) {
		$out['error'] = $oa->error ;
		$out['res'] = $oa->last_res ;
		return ;
	}

	// Add reference: P248 (stated in) = Q26964791 (WikiShootMe)
	$create_res = $oa->last_res ;
	if ( isset($create_res->claim->id) ) {
		$snaks = json_encode([
			'P248' => [[
				'snaktype' => 'value',
				'property' => 'P248',
				'datavalue' => [
					'value' => [
						'entity-type' => 'item',
						'numeric-id' => 26964791,
						'id' => 'Q26964791'
					],
					'type' => 'wikibase-entityid'
				]
			]]
		]) ;
		$oa->setSource ( $create_res->claim->id , $snaks ) ;
	}

	$out['res'] = $oa->last_res ;
}

function addImageToItem ( $q , $image ) {
	global $out ;
	$image = ucfirst ( trim ( str_replace ( '_' , ' ' , $image ) ) ) ;
	$oa = new MW_OAuth ( 'wikishootme' , 'wikidata' , 'wikidata' ) ;
	$claim = [
		"prop" => "P51" ,
		"text" => $image ,
		"q" => $q ,
		"type" => "string"
	] ;
	$out['claim'] = $claim ;
	if ( $oa->setClaim ( $claim ) ) {
	} else {
		$out['error'] = $oa->error ;
	}
	$out['res'] = $oa->last_res ;
}

if ( isset($_REQUEST['oauth_verifier']) ) redirect2url ( 'https://wikishootme.toolforge.org/' ) ;

$out = ['status'=>'OK'] ;

if ( $action == 'check' ) {
	$res = $oa->getConsumerRights() ;
	$out['result'] = $res ;
} else if ( $action == 'logout' ) {
	$oa->logout();
	exit(0);
} else if ( $action == 'authorize' ) {
	$oa->doAuthorizationRedirect('https://wikishootme.toolforge.org/api_v3.php');
	exit(0);

} else if ( $action == 'changeCoordinates' ) {

	$q = $tfc->getRequest ( 'q' , '' ) ;
	$coordinates = $tfc->getRequest ( 'coordinates' , '' ) ;
	if ( $q == '' or $coordinates == '' ) {
		$out['status'] = 'BAD PARAMETERS' ;
	} else {
		setCoordinates ( $q , $coordinates ) ;
	}

} else if ( $action == 'addImageToWikidata' ) {

	$image = $tfc->getRequest ( 'image' , '' ) ;
	$q = $tfc->getRequest ( 'q' , '' ) ;

	if ( !preg_match ( '/^Q\d+$/' , $q ) ) {
		$out['status'] = 'BAD Q NUMBER' ;
	} else if ( !fileExistsOnCommons($image) ) {
		$out['status'] = 'FILE DOES NOT EXIST ON COMMONS' ;
	} else {
		addImageToItem ( $q , $image ) ;
	}

} else if ( $action == 'new_item' ) {

	$lat = $tfc->getRequest ( 'lat' , '' ) ;
	$lng = $tfc->getRequest ( 'lng' , '' ) ;
	$label = $tfc->getRequest ( 'label' , '' ) ;
	$lang = $tfc->getRequest ( 'lang' , '' ) ;
	$p51 = $tfc->getRequest ( 'p51' , '' ) ;

	$prop_item = [];
	foreach ( ['p131','p17','p31'] AS $prop ) { // Can pass as Q1[,Q2,Q3...]
		$items = $tfc->getRequest ( $prop , '' ) ;
		$prop = strtoupper($prop);
		$items = explode(',',$items);
		foreach ( $items AS $item ) {
			$item = strtoupper(trim($item));
			if ( $item!='' ) $prop_item[] = [$prop,$item];
		}
	}

	$ext_id = $tfc->getRequest ( 'ext_id' , '' ) ;
	$ext_prop = $tfc->getRequest ( 'ext_prop' , '' ) ;

	if ( $lat=='' or $lng=='' or $label=='' or $lang=='' ) mydie ( "Missing param" ) ;

	$data = array (
		'labels' => array ( $lang => array ( 'language' => $lang , 'value' => $label ) ) ,
		'claims' => array (
			array (
				'mainsnak' => array (
					'snaktype' => 'value' ,
					'property' => 'P625' ,
					'datavalue' => array (
						'value' => array (
							'latitude' => $lat*1 ,
							'longitude' => $lng*1 ,
							'altitude' => null ,
							'precision' => 0.0000001 ,
							'globe' => 'http://www.wikidata.org/entity/Q2'
						) ,
						'type' => 'globecoordinate'
					) ,
					'datatype' => 'globe-coordinate'
				) ,
				'type' => 'statement' ,
				'rank' => 'normal'
			)
		)
	) ;

	foreach ( $prop_item as $pi ) {
		$property = $pi[0];
		$item = $pi[1];
		if ( $property=='' or $item=='' ) continue; # Paranoia
		$data['claims'][] = array (
			'mainsnak' => array (
				'snaktype' => 'value' ,
				'property' => $property ,
				'datavalue' => array (
					'value' => array (
						'entity-type' => 'item' ,
						'numeric-id' => preg_replace ( '/\D/' , '' , $item ) * 1 ,
						'id' => $item
					) ,
					'type' => 'wikibase-entityid'
				) ,
				'datatype' => 'wikibase-item'
			) ,
			'type' => 'statement' ,
			'rank' => 'normal'
		) ;
	}

	if ( $p51 != '' ) {
		$data['claims'][] = array (
			'mainsnak' => array (
				'snaktype' => 'value' ,
				'property' => 'P51' ,
				'datavalue' => array (
					'value' => $p51 ,
					'type' => 'string'
				) ,
				'datatype' => 'commonsMedia'
			) ,
			'type' => 'statement' ,
			'rank' => 'normal'
		) ;
	}

	if ( $ext_id!='' and $ext_prop!='' ) {
		$data['claims'][] = array (
			'mainsnak' => array (
				'snaktype' => 'value' ,
				'property' => $ext_prop ,
				'datavalue' => array (
					'value' => $ext_id ,
					'type' => 'string'
				) ,
				'datatype' => 'external-id'
			) ,
			'type' => 'statement' ,
			'rank' => 'normal'
		) ;
	}

	$oa = new MW_OAuth ( 'wikishootme' , 'wikidata' , 'wikidata' ) ;
	if ( !$oa->createItem ( $data ) ) {
		$out['status'] = 'ERROR' ;
		$out['res'] = $oa->last_res ;
	} else {
		$out['q'] = $oa->last_res->entity->id ;
	}

	$out['data'] = $data ;

} else if ( $action == 'upload' or $action == 'upload_background' ) {

	// Get parameters
	$q = trim($tfc->getRequest('q','')) ;
	$new_file_name = trim($tfc->getRequest('wpDestFile','')) ;
	$desc = trim($tfc->getRequest('wpUploadDescription','')) ;
	if ( $q == '' or $new_file_name == '' or $desc == '' ) mydie ( 'Missing q/target/description') ;
	$comment = "New image for [[d:$q]]" ;

	// Check if item already has an image
	$wil = new WikidataItemList ;
	$wil->loadItem ( $q ) ;
	if ( $wil->hasItem($q) ) {
		$item = $wil->getItem($q) ;
		if ( $item->hasClaims('P51') ) mydie ( 'Already has an image' ) ;
	}

	// Get uploaded file
	$fo = $_FILES["file"] ;
	if ( !isset($fo["name"]) or $fo["name"] == '' or $fo['error']==1 or $fo['size']==0 ) mydie ( "No file" ) ;
	$local_file = $fo["tmp_name"] ;

	// Check EXIF coordinates
	$exif = exif_read_data ( $local_file , 'EXIF' ) ;
	if ( $exif == null or $exif == false ) {}
	else if ( isset ( $exif['GPSLatitudeRef'] ) ) {
		$e = $exif ;
		$coords = array ( 'lat' => gps($e["GPSLatitude"], $e['GPSLatitudeRef']) , 'lon' => gps($e["GPSLongitude"], $e['GPSLongitudeRef']) ) ;
	} else if ( isset ( $exif['GPS'] ) and isset ( $exif['GPS']['GPSLatitudeRef'] ) ) {
		$e = $exif['GPS'] ;
		$coords = array ( 'lat' => gps($e["GPSLatitude"], $e['GPSLatitudeRef']) , 'lon' => gps($e["GPSLongitude"], $e['GPSLongitudeRef']) ) ;
	}

	if ( isset ( $coords ) ) { // Add {{Location}}
		$location = '{{Location|'.$coords['lat'].'|'.$coords['lon']."}}\n" ;
		$desc = str_replace ( "<!--LOC-->\n" , $location , $desc ) ;
	} else { // No GPS
		$desc = str_replace ( "<!--LOC-->\n" , '' , $desc ) ;
	}

	// Issue #46: prefer the photo's EXIF capture date over today's date in the
	// {{Information}} Date field, so the wikitext reflects when the picture
	// was actually taken.
	$exif_date_raw = '' ;
	if ( $exif ) {
		if ( isset($exif['DateTimeOriginal']) ) $exif_date_raw = $exif['DateTimeOriginal'] ;
		else if ( isset($exif['EXIF']['DateTimeOriginal']) ) $exif_date_raw = $exif['EXIF']['DateTimeOriginal'] ;
		else if ( isset($exif['DateTime']) ) $exif_date_raw = $exif['DateTime'] ;
	}
	if ( $exif_date_raw != '' ) {
		// EXIF date format: "YYYY:MM:DD HH:MM:SS" -> ISO "YYYY-MM-DD HH:MM:SS"
		$exif_date = preg_replace('/^(\d{4}):(\d{2}):(\d{2})/', '$1-$2-$3', trim($exif_date_raw)) ;
		// Replace only the Date= line inside the {{Information}} template (line-based).
		$desc = preg_replace('/(\n\|Date\s*=\s*)[^\n]*/', '${1}' . $exif_date, $desc, 1) ;
	}

	// Issues #23, #60: append user-supplied categories (one per line) as
	// [[Category:X]] wikitext. Tolerate input with or without the brackets.
	$cats_raw = trim($tfc->getRequest('categories', '')) ;
	if ( $cats_raw != '' ) {
		$cat_lines = preg_split('/[\r\n,]+/', $cats_raw) ;
		$seen = [] ;
		foreach ( $cat_lines as $cat ) {
			$cat = trim($cat) ;
			if ( $cat == '' ) continue ;
			if ( preg_match('/^\[\[\s*Category\s*:\s*(.+?)\s*\]\]$/i', $cat, $m) ) $cat = $m[1] ;
			$cat = ltrim($cat, ':') ;
			$key = strtolower(str_replace('_', ' ', $cat)) ;
			if ( isset($seen[$key]) ) continue ;
			$seen[$key] = true ;
			$desc .= "\n[[Category:" . $cat . "]]" ;
		}
	}


	// Sanitize and check target file name
	$cnt = 0 ;
	$new_file_name = str_replace ( '/' , '-' , $new_file_name ) ; // Commons replaces / with -
	$new_file_name = str_replace ( ' ' , '_' , ucfirst ( trim ( $new_file_name ) ) ) ;
	while ( 1 ) {
		$exists = fileExistsOnCommons ( $new_file_name ) ;
		if ( !$exists ) break ; // $new_file_name does not exist
		if ( $cnt == 0 ) preg_match ( '/^(.+)\.([a-z]+)$/' , $new_file_name , $m ) ;
		else preg_match ( '/^(.+)_\(\d+\)\.([a-z]+)$/' , $new_file_name , $m ) ;
		$cnt++ ;
		$new_file_name = $m[1] . '_(' . $cnt . ').' . $m[2] ;
	}
	$out['new_file_name'] = $new_file_name ;

	// Upload file
	$ignorewarnings = true ;
	if ( !$oa->doUploadFromFile ( $local_file , $new_file_name , $desc , $comment , $ignorewarnings ) ) mydie ( json_encode($oa->error) ) ;
	unlink ( $local_file ) ;

	// Add image to item
	addImageToItem ( $q , $new_file_name ) ;

	// Issues #31, #66: also add a P180 "depicts" statement on the Commons file
	// pointing back to the Wikidata item, using SDC (MediaInfo M-id).
	$pageid = null ;
	$ch_pid = null ;
	$res_pid = $oa->doApiQuery([
		'format' => 'json',
		'action' => 'query',
		'titles' => 'File:' . $new_file_name,
	], $ch_pid) ;
	if ( isset($res_pid->query->pages) ) {
		foreach ( (array)$res_pid->query->pages as $p ) {
			if ( isset($p->pageid) ) $pageid = $p->pageid ;
		}
	}
	$out['pageid'] = $pageid ;
	if ( $pageid !== null && preg_match('/^Q\d+$/', $q) ) {
		$depicts_claim = [
			'prop' => 'P180',
			'target' => $q,
			'q' => 'M' . $pageid,
			'type' => 'item',
		] ;
		$oa->setClaim($depicts_claim, "Depicts $q via #wikishootme") ;
		$out['depicts_res'] = $oa->last_res ;
	}

	// Fin
	$url = "https://commons.wikimedia.org/wiki/File:".$tfc->urlEncode($new_file_name) ;
	if ( $action == 'upload' ) {
		// Load new file page on Commons
		redirect2url ( $url ) ;
	} else if ( $action == 'upload_background' ) {
		// Experimental!
		$out['data'] = array ( 'file' => $new_file_name , 'file_url' => $url , 'q' => $q ) ;
	}

} else {
	$widar = new \Widar ( 'wikishootme' ) ;
	$widar->attempt_verification_auto_forward ( '/picturethis' ) ;
	$widar->authorization_callback = 'https://wikishootme.toolforge.org/api_v3.php' ;
	if ( $widar->render_reponse(true) ) exit(0);

	$out['status'] = "UNKNOWN ACTION '{$action}'" ;
	$out['REQUEST'] = $_REQUEST ;
}

// $out['php_version'] = phpversion();

header ( 'application/json' ) ; // text/plain
if ( isset($_REQUEST['callback']) ) print $_REQUEST['callback'].'(' ;
print json_encode($out) ;
if ( isset($_REQUEST['callback']) ) print ');' ;

?>
