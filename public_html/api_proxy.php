<?PHP
/**
 * WikiShootMe - API proxy for external services with server-side keys.
 * Keys are stored in /data/project/wikishootme/api_keys.json
 * Format: {"mapillary": "MLY|...", ...}
 */

error_reporting(E_ERROR|E_CORE_ERROR|E_COMPILE_ERROR);
ini_set('display_errors', 'Off');

header('Content-Type: application/json');

function proxy_die($msg) {
	echo json_encode(['error' => $msg]);
	exit(0);
}

function proxy_fetch($url) {
	$ctx = stream_context_create(['http' => [
		'header' => "User-Agent: WikiShootMe/3.0\r\n",
		'timeout' => 15,
	]]);
	$result = @file_get_contents($url, false, $ctx);
	if ($result === false) proxy_die('Upstream request failed');
	return $result;
}

$service = $_GET['service'] ?? '';

// Load API keys
$keys = [];
$keys_file = '/data/project/wikishootme/api_keys.json';
if (file_exists($keys_file)) {
	$keys = json_decode(file_get_contents($keys_file), true) ?: [];
}

if ($service == 'mapillary') {

	$token = $keys['mapillary'] ?? '';
	if ($token == '') proxy_die('Mapillary token not configured');

	$bbox = preg_replace('/[^0-9.,\-]/', '', $_GET['bbox'] ?? '');
	$limit = max(1, min(500, intval($_GET['limit'] ?? 100)));

	$url = 'https://graph.mapillary.com/images?' . http_build_query([
		'access_token' => $token,
		'fields' => 'id,captured_at,compass_angle,geometry,thumb_256_url,thumb_1024_url',
		'bbox' => $bbox,
		'limit' => $limit,
	]);
	echo proxy_fetch($url);

} else {
	proxy_die("Unknown service: $service");
}

?>
