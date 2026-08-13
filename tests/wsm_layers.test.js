const { loadAll } = require('./load_helper');

let ctx;

beforeEach(() => {
    ctx = loadAll();
    ctx.wikishootme.map = ctx.L.map();
    ctx.wikishootme.forEachLayer(function (layer) {
        layer.initFeatureGroup();
    });
});

describe('addWikimediaEntry', () => {
    test('creates a Wikipedia entry', () => {
        const layer = ctx.wikishootme.getLayer('wikipedia');
        const v = { lat: 51.5, lon: -0.1, title: 'London', ns: 0, pageid: 123 };
        const entry = layer.addEntry('en.wikipedia.org', v, ctx.wikishootme);
        expect(entry.label).toBe('London');
        expect(entry.mode).toBe('wikipedia');
        expect(entry.pos).toEqual([51.5, -0.1]);
    });

    test('creates a Commons entry with image', () => {
        const layer = ctx.wikishootme.getLayer('commons');
        const v = { lat: 51.5, lon: -0.1, title: 'File:London.jpg', ns: 6, pageid: 456 };
        const entry = layer.addEntry('commons.wikimedia.org', v, ctx.wikishootme);
        expect(entry.image).toBe('London.jpg');
        // Issue #13: label keeps the file extension so users can copy-paste it
        expect(entry.label).toBe('London.jpg');
        expect(entry.mode).toBe('commons');
    });

    test('stores entry by pageid', () => {
        const layer = ctx.wikishootme.getLayer('wikipedia');
        const v = { lat: 51.5, lon: -0.1, title: 'London', ns: 0, pageid: 789 };
        layer.addEntry('en.wikipedia.org', v, ctx.wikishootme);
        expect(layer.getEntry('789')).toBeDefined();
    });

    test('generates correct URL', () => {
        const layer = ctx.wikishootme.getLayer('wikipedia');
        const v = { lat: 51.5, lon: -0.1, title: 'Test Page', ns: 0, pageid: 100 };
        const entry = layer.addEntry('en.wikipedia.org', v, ctx.wikishootme);
        expect(entry.url).toContain('en.wikipedia.org/wiki/');
    });
});

describe('loadLayer', () => {
    test('does not load invisible layers', () => {
        ctx.wikishootme.show_layers = [];
        // Should not throw since it detects layer not visible and returns early
        expect(() => ctx.wikishootme.loadLayer('commons')).not.toThrow();
    });

    test('treats wikidata_ prefix as wikidata', () => {
        ctx.wikishootme.show_layers = ['wikidata_image'];
        // Should not throw
        expect(() => ctx.wikishootme.loadLayer('wikidata_image')).not.toThrow();
    });
});

describe('incremental marker updates (P2)', () => {
    test('updateToCurrent preserves wikidata_no_image entries (incremental mode)', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        const noImgLayer = ctx.wikishootme.getLayer('wikidata_no_image');
        noImgLayer.entries = { 'Q42': { label: 'test', pos: [52, 0] } };
        ctx.wikishootme.updateToCurrent();
        expect(noImgLayer.entries['Q42']).toBeDefined();
    });

    test('updateToCurrent preserves wikidata_image entries (incremental mode)', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        const imgLayer = ctx.wikishootme.getLayer('wikidata_image');
        imgLayer.entries = { 'Q99': { label: 'has image', pos: [52, 0] } };
        ctx.wikishootme.updateToCurrent();
        expect(imgLayer.entries['Q99']).toBeDefined();
    });

    test('updateToCurrent clears non-incremental layer entries', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        const wpLayer = ctx.wikishootme.getLayer('wikipedia');
        wpLayer.initFeatureGroup();
        wpLayer.entries = { '123': { label: 'test', pos: [52, 0] } };
        ctx.wikishootme.updateToCurrent();
        expect(wpLayer.entries['123']).toBeUndefined();
    });

    test('updateLayers (full refresh) clears wikidata entries', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        const noImgLayer = ctx.wikishootme.getLayer('wikidata_no_image');
        noImgLayer.initFeatureGroup();
        noImgLayer.entries = { 'Q42': { label: 'test', pos: [52, 0] } };
        ctx.wikishootme.updateLayers();
        expect(noImgLayer.entries['Q42']).toBeUndefined();
    });
});

describe('pruneOutsideBbox', () => {
    test('removes entries outside bbox, keeps entries inside', () => {
        const layer = ctx.wikishootme.getLayer('wikipedia');
        layer.initFeatureGroup();
        const bbox = {
            contains: function (pos) {
                const lat = Array.isArray(pos) ? pos[0] : pos.lat;
                const lng = Array.isArray(pos) ? pos[1] : pos.lng;
                return lat >= 51 && lat <= 53 && lng >= -1 && lng <= 1;
            }
        };
        const markerIn = layer.createMarker([52, 0]);
        const markerOut = layer.createMarker([60, 0]);
        layer.entries = {
            'Q1': { pos: [52, 0], marker: markerIn },
            'Q2': { pos: [60, 0], marker: markerOut }
        };
        layer.addMarker(markerIn);
        layer.addMarker(markerOut);
        layer.pruneOutsideBbox(bbox);
        expect(layer.entries['Q1']).toBeDefined();
        expect(layer.entries['Q2']).toBeUndefined();
    });

    test('does nothing when all entries are inside bbox', () => {
        const layer = ctx.wikishootme.getLayer('commons');
        layer.initFeatureGroup();
        const bbox = {
            contains: function () { return true; }
        };
        layer.entries = {
            'A': { pos: [52, 0], marker: layer.createMarker([52, 0]) }
        };
        layer.pruneOutsideBbox(bbox);
        expect(layer.entries['A']).toBeDefined();
    });
});

describe('cleanLayers', () => {
    test('resets entries', () => {
        const layer = ctx.wikishootme.getLayer('wikipedia');
        layer.entries = { test: 'data' };
        ctx.wikishootme.cleanLayers();
        expect(ctx.wikishootme.entries.wikipedia).toEqual({});
        expect(ctx.wikishootme.entries.wikidata).toEqual({});
        expect(ctx.wikishootme.entries.commons).toEqual({});
    });
});

describe('loadCachedJSON', () => {
    test('uses cache on second call with same params', async () => {
        const url = 'https://test.example.com/api';
        const params = { key: 'value' };

        // Populate cache
        ctx.wikishootme.json_cache[url] = {
            key: JSON.stringify(params),
            result: { data: 'cached' }
        };

        const d = await ctx.wikishootme.loadCachedJSON(url, params);
        expect(d.data).toBe('cached');
    });

    test('keeps stale cache as fallback when params change', () => {
        const url = 'https://test.example.com/api';
        ctx.wikishootme.json_cache[url] = {
            key: JSON.stringify({ old: 'params' }),
            result: { data: 'old' }
        };

        // Call with different params — stale cache is kept for offline fallback
        ctx.wikishootme.loadCachedJSON(url, { new: 'params' });
        expect(ctx.wikishootme.json_cache[url].result).toEqual({ data: 'old' });
    });

    test('serves stale cache when offline', async () => {
        const url = 'https://test.example.com/api';
        const params = { key: 'value' };
        ctx.wikishootme.json_cache[url] = {
            key: JSON.stringify({ other: 'params' }),
            result: { data: 'stale' }
        };
        ctx.wikishootme.is_online = false;
        const d = await ctx.wikishootme.loadCachedJSON(url, params);
        expect(d.data).toBe('stale');
    });
});

describe('updateMaybe', () => {
    test('shows update button when zoomed out', () => {
        // Mock getZoom to return low zoom
        ctx.wikishootme.map = {
            getZoom: function () { return 10; },
            getBounds: function () {
                return {
                    getCenter: function () { return { lat: 52, lng: 0 }; },
                    getNorthEast: function () { return { lat: 53, lng: 1, distanceTo: function () { return 100000; } }; },
                    getSouthWest: function () { return { lat: 51, lng: -1 }; },
                    getNorthWest: function () { return { lat: 53, lng: -1 }; },
                    getSouthEast: function () { return { lat: 51, lng: 1 }; }
                };
            },
            getCenter: function () { return { lat: 52, lng: 0 }; }
        };
        // Should not throw
        expect(() => ctx.wikishootme.updateMaybe()).not.toThrow();
    });
});
