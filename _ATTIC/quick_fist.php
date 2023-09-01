<?PHP

/*
error_reporting(E_ERROR|E_CORE_ERROR|E_ALL|E_COMPILE_ERROR);
ini_set('display_errors', 'On');
*/

include_once ( "php/wikiquery.php") ;
include_once ( "php/common_images.php" ) ;
ini_set("memory_limit","128M");


function load_hard_ignore_images () {
	global $hard_ignore_images ;
	$ig = file_get_contents ( 'http://meta.wikimedia.org/w/index.php?title=FIST/Ignored_images&action=raw' ) ;
	$ig = explode ( "\n" , $ig ) ;
	foreach ( $ig AS $i ) {
		if ( '*' != substr ( $i , 0 , 1 ) ) continue ;
		$i = ucfirst ( trim ( substr ( $i , 1 ) ) ) ;
		$i = str_replace ( ' ' , '_' , $i ) ;
		$hard_ignore_images['all'][] = $i ;
	}
}

function add_article ( $title , $images ) {
	global $result , $requested_articles , $language , $project ;
	$a = array () ;
	$a['a'] = array () ;
	$a['a']['title'] = str_replace ( '_' , ' ' , $title ) ;
	$a['a']['has_images'] = isset ( $images ) ? count ( $images ) : 0 ;
	if ( isset ( $requested_articles[$title] ) ) {
		$a['a']['request_url'] = $requested_articles[$title][1] ;
	} else $a['a']['request_url'] = '' ;
	$result['*'][] = $a ;
}

function get_requested_articles ( $titles , $language , $project ) {
	global $requested_articles , $debug , $db ;
	$ret = array () ;
#	$db = get_db_name ( $language , $project ) ;

	$t_safe = array () ;
	foreach ( $titles AS $t ) {
		if ( $t == '' ) continue ;
		make_db_safe ( $t ) ;
		$t_safe[] = $t ;
	}
	$titles2 = '"' . implode ( '","' , $t_safe ) . '"' ;

	if ( $language == 'de' && $project == 'wikipedia' ) {
		// {{Bilderwunsch}}
		$sql = "SELECT /* SLOW_OK */ page_title FROM page,templatelinks WHERE page_id=tl_from AND page_title IN ( $titles2 ) AND page_namespace=0 AND tl_title='Bilderwunsch'" ;
#		$res = my_mysql_db_query ( $db , $sql , $mysql_con ) ;
#		if ( mysql_errno() != 0 ) return $ret ;
#		while ( $o = mysql_fetch_object ( $res ) ) {
		if(!$result = $db->query($sql)) die('There was an error running the query [' . $db->error . ']');
		while($o = $result->fetch_object()){
			$p = $o->page_title ;
			$ret[$o->page_title] = array ( $p , "http://$language.$project.org/wiki/$p" ) ;
		}

		// {{Bilderwunsch}} via cl_sortkey
		$titles3 = array () ;
		foreach ( $t_safe AS $t ) {
			$titles3[] = 'cl_sortkey_prefix LIKE "%#' . str_replace ( '_' , ' ' , $t ) . '"' ;
		}
		$titles3 = '(' . implode ( ' OR ' , $titles3 ) . ')' ;
		$sql = "SELECT /* SLOW_OK */ * FROM categorylinks WHERE cl_to='Wikipedia:Bilderwunsch_an_bestimmtem_Ort' AND $titles3" ;
#		$res = my_mysql_db_query ( $db , $sql , $mysql_con ) ;
#		if ( mysql_errno() != 0 ) return $ret ;
#		while ( $o = mysql_fetch_object ( $res ) ) {
		if(!$result = $db->query($sql)) die('There was an error running the query [' . $db->error . ']');
		while($o = $result->fetch_object()){
			$p = explode ( '#' , $o->cl_sortkey_prefix ) ;
			$ret[$p[1]] = array ( $p[1] , 'http://de.wikipedia.org/wiki/' . myurlencode ( $p[0] ) ) ;
		}

		// [[Wikipedia:Bilderwünsche]]
		$sql = "SELECT /* SLOW_OK */ DISTINCT pl_title FROM pagelinks WHERE pl_from=12220 AND pl_namespace=0 AND pl_title IN ( $titles2 ) " ; // page_id for [[Wikipedia:Bilderwünsche]]
#		$res = my_mysql_db_query ( $db , $sql , $mysql_con ) ;
#		if ( mysql_errno() != 0 ) return $ret ;
#		while ( $o = mysql_fetch_object ( $res ) ) {
		if(!$result = $db->query($sql)) die('There was an error running the query [' . $db->error . ']');
		while($o = $result->fetch_object()){
			$p = $o->pl_title ;
			$ret[$p] = array ( $p , 'http://de.wikipedia.org/wiki/Wikipedia:Bilderw%C3%BCnsche/Listen#'.$p ) ;
		}
	}

	return $ret ;
}

function db_get_images_list ( $titles , $language , $project ) {
	global $requested_articles , $db ;
#	$db = get_db_name ( $language , $project ) ;
	$t_safe = array () ;
	foreach ( $titles AS $t ) {
		if ( $t == '' ) continue ;
		make_db_safe ( $t ) ;
		$t_safe[] = $t ;
	}
	$titles = '"' . implode ( '","' , $t_safe ) . '"' ;

	$ret = array () ;
	$sql = "SELECT /* SLOW_OK */  * FROM imagelinks,page WHERE il_from=page_id AND page_title IN ( $titles ) AND page_namespace=0" ;
#	$res = my_mysql_db_query ( $db , $sql , $mysql_con ) ;
#	if ( mysql_errno() != 0 ) return $ret ;
#	while ( $o = mysql_fetch_object ( $res ) ) {
	if(!$result = $db->query($sql)) die('There was an error running the query [' . $db->error . ']');
	while($o = $result->fetch_object()){
		if ( is_image_ignored ( $o->il_to , $language , $project ) ) continue ;
		$ret[$o->page_title][] = $o->il_to ;
	}
	return $ret ;
}


function show_mt ( $msg ) {
	global $mt , $debug ;
	$omt = $mt ;
	$mt = microtime(true) ;
	$diff = $mt - $omt ;
	if ( $debug ) print "$msg : $diff\n" ;
}

function db_get_existing_pages ( $titles , $db , $namespace = 0 , $remove_redirects = 0 ) {
#	$mysql_con = db_get_con_new($language,$project) ;
#	$db = $language . 'wiki_p' ;
	foreach ( $titles AS $k => $v ) make_db_safe ( $titles[$k] ) ;
	$ret = array () ;
	
	while ( count ( $titles ) > 0 ) {
		$t2 = array () ;
		while ( count ( $t2 ) < 100 && count ( $titles ) > 0 ) $t2[] = array_pop ( $titles ) ;
		$sql = "SELECT DISTINCT page_title FROM page WHERE page_namespace=$namespace AND page_title IN (\"" . implode ( "\",\"" , $t2 ) . "\")" ;
		if ( $remove_redirects ) $sql .= " AND page_is_redirect=0" ;

#		$res = my_mysql_db_query ( $db , $sql , $mysql_con ) ;
#		if ( mysql_errno() != 0 ) return $ret ;#{ print 'Line 171:' . mysql_error() . "<br/>" ; return $ret ; } # Some error has occurred
#		while ( $o = mysql_fetch_object ( $res ) ) {
		if(!$result = $db->query($sql)) die('There was an error running the query [' . $db->error . ']');
		while($o = $result->fetch_object()){
			$ret[$o->page_title] = $o->page_title ;
		}
	}
	return $ret ;	
}


//________________________________________________________________________________________________________________________

$debug = 0 ;
$mt = microtime(true) ;
if ( $debug ) header('Content-type: text/plain; charset=utf-8'); // TESTING

$language = get_request ( 'language' , 'en' ) ;
$project = get_request ( 'project' , 'wikipedia' ) ;
if ( $language == 'species' ) $project = 'wikipedia' ;
$db = openDB ( $language , $project ) ;

load_hard_ignore_images() ;
show_mt ( 'load_hard_ignore_images' ) ;

$imagetypes = array () ;
$imagetypes['jpg'] = 1 ;
$imagetypes['jpeg'] = 1 ;

$data = trim ( get_request ( 'data' , '' ) ) ;
$callback = get_request ( 'callback' , '' ) ;

$result = array () ;
$result['*'] = array () ;

$data = explode ( "\n" , $data ) ;

$data = db_get_existing_pages ( $data , $db , 0 , 1 ) ;
show_mt ( 'db_get_existing_pages' ) ;

$requested_articles = get_requested_articles ( $data , $language , $project ) ;
show_mt ( 'get_requested_articles' ) ;

$iip = db_get_images_list ( $data , $language , $project ) ;
show_mt ( 'db_get_images_list' ) ;

foreach ( $data AS $d ) {
	if ( $d == '' ) continue ;
	if ( preg_match ( '/Liste{0,1}[ _]/' , $d ) ) continue ;
	make_db_safe ( $d ) ;
	if ( isset ( $requested_articles[$d] ) || !isset ( $iip[$d] ) || isset ( $wishes[$d] ) ) add_article ( $d , $iip[$d] ) ;
}

if ( !$debug ) header('Content-type: application/x-json; charset=utf-8');

if ( $callback != '' ) print $callback . "(" ;
print json_encode ( $result ) ;
if ( $callback != '' ) print ");" ;


?>