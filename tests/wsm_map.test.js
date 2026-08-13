const { loadAll } = require('./load_helper');

let ctx;

beforeEach(() => {
    ctx = loadAll();
    ctx.wikishootme.map = ctx.L.map();
    ctx.wikishootme.forEachLayer(function (layer) {
        layer.initFeatureGroup();
    });
});

describe('addNewWikidataItem', () => {
    test('adds item without image to no_image layer', () => {
        const marker = ctx.wikishootme.addNewWikidataItem('Q42', 'Test', { lat: 51.5, lng: -0.1 });
        expect(marker).toBeDefined();
        expect(ctx.wikishootme.entries.wikidata['Q42']).toBeDefined();
        expect(ctx.wikishootme.entries.wikidata['Q42'].label).toBe('Test');
    });

    test('adds item with image to image layer', () => {
        const marker = ctx.wikishootme.addNewWikidataItem('Q42', 'Test', { lat: 51.5, lng: -0.1 }, 'Test.jpg');
        expect(marker).toBeDefined();
        expect(ctx.wikishootme.entries.wikidata['Q42'].image).toBe('Test.jpg');
    });

    test('creates correct Wikidata URL', () => {
        ctx.wikishootme.addNewWikidataItem('Q42', 'Test', { lat: 51.5, lng: -0.1 });
        expect(ctx.wikishootme.entries.wikidata['Q42'].url).toBe('https://www.wikidata.org/wiki/Q42');
    });
});

describe('createMap', () => {
    test('creates map on first call', () => {
        ctx.wikishootme.show_layers = [];
        const result = ctx.wikishootme.createMap();
        expect(result).toBe(true);
        expect(ctx.wikishootme.map_is_set).toBe(true);
    });

    test('returns false on second call', () => {
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.createMap();
        const result = ctx.wikishootme.createMap();
        expect(result).toBe(false);
    });
});

describe('onOverlayAdd', () => {
    test('adds layer key to show_layers', () => {
        ctx.wikishootme.show_layers = ['commons'];
        ctx.wikishootme.layer_info.name2key = { 'Wikipedia': 'wikipedia' };
        ctx.wikishootme.onOverlayAdd({ name: 'Wikipedia' });
        expect(ctx.wikishootme.show_layers).toContain('wikipedia');
    });
});

describe('onOverlayRemove', () => {
    test('removes layer key from show_layers', () => {
        ctx.wikishootme.show_layers = ['commons', 'wikipedia'];
        ctx.wikishootme.layer_info.name2key = { 'Wikipedia': 'wikipedia' };
        ctx.wikishootme.onOverlayRemove({ name: 'Wikipedia' });
        expect(ctx.wikishootme.show_layers).not.toContain('wikipedia');
        expect(ctx.wikishootme.show_layers).toContain('commons');
    });
});

describe('clustering toggle (P3)', () => {
    test('clustering_enabled defaults to true', () => {
        expect(ctx.wikishootme.clustering_enabled).toBe(true);
    });

    test('initFeatureGroup with clustering disabled creates plain featureGroup for clustering layer', () => {
        const layer = ctx.wikishootme.getLayer('wikidata_image');
        expect(layer.use_clustering).toBe(true);
        const fg = layer.initFeatureGroup(false);
        expect(fg._isCluster).toBeUndefined();
    });

    test('initFeatureGroup with clustering enabled creates cluster group for clustering layer', () => {
        const layer = ctx.wikishootme.getLayer('wikidata_image');
        const fg = layer.initFeatureGroup(true);
        expect(fg._isCluster).toBe(true);
    });

    test('toggleClustering flips clustering_enabled', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.layers = {};
        ctx.wikishootme.overlays = {};
        ctx.wikishootme.layer_info = { name2key: {} };
        ctx.wikishootme.forEachLayer(l => { l.initFeatureGroup(); });
        ctx.wikishootme.clustering_enabled = true;
        ctx.wikishootme.toggleClustering();
        expect(ctx.wikishootme.clustering_enabled).toBe(false);
        ctx.wikishootme.toggleClustering();
        expect(ctx.wikishootme.clustering_enabled).toBe(true);
    });

    test('toggleClustering persists value to localStorage', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.layers = {};
        ctx.wikishootme.overlays = {};
        ctx.wikishootme.layer_info = { name2key: {} };
        ctx.wikishootme.forEachLayer(l => { l.initFeatureGroup(); });
        ctx.wikishootme.clustering_enabled = true;
        ctx.wikishootme.toggleClustering();
        expect(ctx.localStorage.getItem('wsm_clustering_enabled')).toBe('0');
    });
});

describe('gps2leaflet', () => {
    test('converts GPS to leaflet format', () => {
        const result = ctx.wikishootme.gps2leaflet({ latitude: 48.8566, longitude: 2.3522 });
        expect(result.lat).toBe(48.8566);
        expect(result.lng).toBe(2.3522);
    });

    test('handles negative coordinates', () => {
        const result = ctx.wikishootme.gps2leaflet({ latitude: -33.8688, longitude: 151.2093 });
        expect(result.lat).toBe(-33.8688);
        expect(result.lng).toBe(151.2093);
    });
});
