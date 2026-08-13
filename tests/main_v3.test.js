const { loadAll } = require('./load_helper');

let ctx;

beforeEach(() => {
    ctx = loadAll();
});

describe('P31 filter', () => {
    test('p31_include and p31_exclude start empty', () => {
        expect(ctx.wikishootme.p31_include).toEqual([]);
        expect(ctx.wikishootme.p31_exclude).toEqual([]);
    });

    test('getP31SparqlFragment returns empty string with no filters', () => {
        expect(ctx.wikishootme.getP31SparqlFragment()).toBe('');
    });

    test('getP31SparqlFragment produces VALUES clause for includes', () => {
        ctx.wikishootme.p31_include = ['Q408847', 'Q5'];
        const frag = ctx.wikishootme.getP31SparqlFragment();
        expect(frag).toContain('VALUES ?_p31inc');
        expect(frag).toContain('wd:Q408847');
        expect(frag).toContain('wd:Q5');
    });

    test('getP31SparqlFragment produces FILTER NOT EXISTS for excludes', () => {
        ctx.wikishootme.p31_exclude = ['Q79007'];
        const frag = ctx.wikishootme.getP31SparqlFragment();
        expect(frag).toContain('FILTER NOT EXISTS');
        expect(frag).toContain('wd:Q79007');
    });

    test('getP31SparqlFragment handles mixed includes and excludes', () => {
        ctx.wikishootme.p31_include = ['Q408847'];
        ctx.wikishootme.p31_exclude = ['Q79007'];
        const frag = ctx.wikishootme.getP31SparqlFragment();
        expect(frag).toContain('wd:Q408847');
        expect(frag).toContain('FILTER NOT EXISTS');
        expect(frag).toContain('wd:Q79007');
    });

    test('addP31Filter adds qid to include array', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.addP31Filter('Q408847', 1);
        expect(ctx.wikishootme.p31_include).toContain('Q408847');
        expect(ctx.wikishootme.p31_exclude).not.toContain('Q408847');
    });

    test('addP31Filter adds qid to exclude array', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.addP31Filter('Q79007', -1);
        expect(ctx.wikishootme.p31_exclude).toContain('Q79007');
        expect(ctx.wikishootme.p31_include).not.toContain('Q79007');
    });

    test('addP31Filter moves qid from exclude to include', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.p31_exclude = ['Q123'];
        ctx.wikishootme.addP31Filter('Q123', 1);
        expect(ctx.wikishootme.p31_include).toContain('Q123');
        expect(ctx.wikishootme.p31_exclude).not.toContain('Q123');
    });

    test('addP31Filter does not duplicate entries', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.addP31Filter('Q408847', 1);
        ctx.wikishootme.addP31Filter('Q408847', 1);
        expect(ctx.wikishootme.p31_include.filter(q => q === 'Q408847').length).toBe(1);
    });
});

describe('label language fallback chain (issues #2, #16, #73)', () => {
    test('chain starts with user language', () => {
        ctx.wikishootme.language = 'ru';
        expect(ctx.wikishootme.getLabelLanguageChain().split(',')[0]).toBe('ru');
    });

    test('English variants like en-gb fall back to en and other variants', () => {
        ctx.wikishootme.language = 'en-gb';
        const parts = ctx.wikishootme.getLabelLanguageChain().split(',');
        expect(parts[0]).toBe('en-gb');
        expect(parts).toContain('en');
        expect(parts).toContain('en-us');
    });

    test('English-base user gets regional variants', () => {
        ctx.wikishootme.language = 'en';
        const parts = ctx.wikishootme.getLabelLanguageChain().split(',');
        expect(parts).toContain('en-gb');
        expect(parts).toContain('en-us');
    });

    test('Portuguese pt-br falls back to pt', () => {
        ctx.wikishootme.language = 'pt-br';
        const parts = ctx.wikishootme.getLabelLanguageChain().split(',');
        expect(parts[0]).toBe('pt-br');
        expect(parts).toContain('pt');
    });

    test('chain includes mul (multilingual catch-all)', () => {
        ctx.wikishootme.language = 'ja';
        expect(ctx.wikishootme.getLabelLanguageChain().split(',')).toContain('mul');
    });

    test('chain has no duplicates', () => {
        ctx.wikishootme.language = 'en';
        const parts = ctx.wikishootme.getLabelLanguageChain().split(',');
        expect(parts.length).toBe(new Set(parts).size);
    });
});

describe('hide_destroyed filter (issue #19)', () => {
    test('hide_destroyed defaults to false', () => {
        expect(ctx.wikishootme.hide_destroyed).toBe(false);
    });

    test('getDestroyedSparqlFragment returns empty when disabled', () => {
        ctx.wikishootme.hide_destroyed = false;
        expect(ctx.wikishootme.getDestroyedSparqlFragment()).toBe('');
    });

    test('getDestroyedSparqlFragment excludes P576 and P582 when enabled', () => {
        ctx.wikishootme.hide_destroyed = true;
        const frag = ctx.wikishootme.getDestroyedSparqlFragment();
        expect(frag).toContain('FILTER NOT EXISTS');
        expect(frag).toContain('wdt:P576');
        expect(frag).toContain('wdt:P582');
    });

    test('hide_destroyed=1 hash param turns filter on (init reads it)', () => {
        // The init() flow is integration-tested via the actual hash; here we
        // assert the parsing helper sees the param.
        ctx.window.location.href = 'https://example.com/#lat=52&lng=0&zoom=15&hide_destroyed=1';
        const vars = ctx.wikishootme.getHashVars();
        expect(vars.hide_destroyed).toBe('1');
    });
});

describe('wikishootme core', () => {
    test('wikishootme object exists', () => {
        expect(ctx.wikishootme).toBeDefined();
    });

    test('escapeHTML escapes special characters', () => {
        expect(ctx.wikishootme.escapeHTML('<script>')).toBe('&lt;script&gt;');
        expect(ctx.wikishootme.escapeHTML('"hello"')).toBe('&quot;hello&quot;');
        expect(ctx.wikishootme.escapeHTML("it's")).toBe("it&#39;s");
    });

    test('getHashVars parses hash parameters', () => {
        ctx.window.location.href = 'https://example.com/#lat=52&lng=0&zoom=15';
        const vars = ctx.wikishootme.getHashVars();
        expect(vars.lat).toBe('52');
        expect(vars.lng).toBe('0');
        expect(vars.zoom).toBe('15');
    });

    test('getHashVars decodes URI components', () => {
        ctx.window.location.href = 'https://example.com/#name=hello%20world';
        const vars = ctx.wikishootme.getHashVars();
        expect(vars.name).toBe('hello world');
    });

    test('getHashVars replaces underscores with spaces', () => {
        ctx.window.location.href = 'https://example.com/#name=hello_world';
        const vars = ctx.wikishootme.getHashVars();
        expect(vars.name).toBe('hello world');
    });

    test('gps2leaflet converts coords', () => {
        const result = ctx.wikishootme.gps2leaflet({ latitude: 51.5, longitude: -0.1 });
        expect(result.lat).toBe(51.5);
        expect(result.lng).toBe(-0.1);
    });

    test('setBusy increments and decrements', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.setBusy(1);
        expect(ctx.wikishootme.busy).toBe(1);
        ctx.wikishootme.setBusy(1);
        expect(ctx.wikishootme.busy).toBe(2);
        ctx.wikishootme.setBusy(-1);
        expect(ctx.wikishootme.busy).toBe(1);
    });

    test('setBusy(0) brings red (no-image) layer to front above green (image)', () => {
        // Issue #33: red pins must render above green pins so reds are not hidden
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        const calls = [];
        const make = (name) => ({ bringToFront: () => calls.push(name) });
        ctx.wikishootme.layers = {
            wikipedia: make('wikipedia'),
            wikidata_image: make('wikidata_image'),
            wikidata_no_image: make('wikidata_no_image'),
        };
        ctx.wikishootme.busy = 1;
        ctx.wikishootme.setBusy(-1);
        // wikidata_no_image (red) must be raised AFTER wikidata_image (green)
        const noImgIdx = calls.lastIndexOf('wikidata_no_image');
        const imgIdx = calls.lastIndexOf('wikidata_image');
        expect(noImgIdx).toBeGreaterThan(-1);
        expect(imgIdx).toBeGreaterThan(-1);
        expect(noImgIdx).toBeGreaterThan(imgIdx);
    });

    test('registered_layers has expected layer keys', () => {
        const keys = Object.keys(ctx.wikishootme.registered_layers);
        expect(keys).toContain('wikidata_image');
        expect(keys).toContain('wikidata_no_image');
        expect(keys).toContain('wikipedia');
        expect(keys).toContain('commons');
        expect(keys).toContain('flickr');
    });

    test('layer colors are defined', () => {
        expect(ctx.wikishootme.getLayer('wikidata_image').color).toBeDefined();
        expect(ctx.wikishootme.getLayer('wikidata_no_image').color).toBeDefined();
        expect(ctx.wikishootme.getLayer('commons').color).toBeDefined();
        expect(ctx.wikishootme.getLayer('flickr').color).toBeDefined();
    });

    test('wikidata_no_image layer uses clustering (issue #56)', () => {
        const layer = ctx.wikishootme.getLayer('wikidata_no_image');
        expect(layer.use_clustering).toBe(true);
    });

    test('wikidata_image layer has a distinct colour for {{Thumbnail}} (issue #52)', () => {
        const layer = ctx.wikishootme.getLayer('wikidata_image');
        expect(typeof layer.colorThumbnailImage).toBe('string');
        expect(layer.colorThumbnailImage).not.toBe(layer.color);
    });

    test('wikidata_image popupContent shows hint when entry.is_thumbnail_image (issue #52)', () => {
        const layer = ctx.wikishootme.getLayer('wikidata_image');
        const hOk = layer.popupContent({ image: 'Foo.jpg', is_thumbnail_image: true }, ctx.wikishootme);
        const hNo = layer.popupContent({ image: 'Foo.jpg' }, ctx.wikishootme);
        expect(hOk).toContain('Thumbnail');
        expect(hNo).not.toContain('Thumbnail');
    });

    test('default position is set', () => {
        expect(ctx.wikishootme.pos.lat).toBe(52);
        expect(ctx.wikishootme.pos.lng).toBe(0);
    });

    test('upload_queue starts empty', () => {
        expect(ctx.wikishootme.upload_queue).toEqual([]);
    });

    test('entries has expected structure', () => {
        expect(ctx.wikishootme.entries.wikipedia).toEqual({});
        expect(ctx.wikishootme.entries.wikidata).toEqual({});
        expect(ctx.wikishootme.entries.commons).toEqual({});
    });

    test('registered_layers is populated', () => {
        expect(ctx.wikishootme.registered_layers).toBeDefined();
        expect(Object.keys(ctx.wikishootme.registered_layers).length).toBeGreaterThan(0);
    });

    test('tile_layers has osm default', () => {
        expect(ctx.wikishootme.tile_layers.osm).toBeDefined();
        expect(ctx.wikishootme.tile_layers.osm.name).toContain('OSM');
    });

    test('sparql_filter starts empty', () => {
        expect(ctx.wikishootme.sparql_filter).toBe('');
    });

    test('language defaults to en', () => {
        expect(ctx.wikishootme.language).toBe('en');
    });
});

describe('wikishootme popup methods (wsm_popup.js)', () => {
    test('createImageThumbnail returns HTML with image tag', () => {
        const html = ctx.wikishootme.createImageThumbnail('Test.jpg');
        expect(html).toContain('<img');
        expect(html).toContain('Test.jpg');
        expect(html).toContain('commons.wikimedia.org');
    });

    test('layer createPopup is defined', () => {
        const layer = ctx.wikishootme.getLayer('commons');
        expect(typeof layer.createPopup).toBe('function');
    });

    test('editCoordinates is defined', () => {
        expect(typeof ctx.wikishootme.editCoordinates).toBe('function');
    });
});

describe('wikishootme upload methods (wsm_upload.js)', () => {
    test('uploadFileHandler is defined', () => {
        expect(typeof ctx.wikishootme.uploadFileHandler).toBe('function');
    });

    test('clearUploads resets queue', () => {
        ctx.wikishootme.upload_queue = [{ is_uploaded: true }];
        ctx.wikishootme.clearUploads();
        expect(ctx.wikishootme.upload_queue).toEqual([]);
    });

    test('showUploadStatus is defined', () => {
        expect(typeof ctx.wikishootme.showUploadStatus).toBe('function');
    });

    test('switchItemToImageLayer is defined', () => {
        expect(typeof ctx.wikishootme.switchItemToImageLayer).toBe('function');
    });
});

describe('wikishootme layer methods (wsm_layers.js)', () => {
    test('loadLayer is defined', () => {
        expect(typeof ctx.wikishootme.loadLayer).toBe('function');
    });

    test('updateLayers is defined', () => {
        expect(typeof ctx.wikishootme.updateLayers).toBe('function');
    });

    test('loadCachedJSON is defined', () => {
        expect(typeof ctx.wikishootme.loadCachedJSON).toBe('function');
    });

    test('getLayer returns layer objects', () => {
        expect(ctx.wikishootme.getLayer('wikipedia')).toBeDefined();
        expect(ctx.wikishootme.getLayer('commons')).toBeDefined();
        expect(ctx.wikishootme.getLayer('flickr')).toBeDefined();
        expect(ctx.wikishootme.getLayer('mixnmatch')).toBeDefined();
    });

    test('forEachLayer iterates all layers', () => {
        const keys = [];
        ctx.wikishootme.forEachLayer(function (layer) {
            keys.push(layer.key);
        });
        expect(keys.length).toBeGreaterThan(0);
    });
});

describe('wikishootme map methods (wsm_map.js)', () => {
    test('createMap is defined', () => {
        expect(typeof ctx.wikishootme.createMap).toBe('function');
    });

    test('setMap is defined', () => {
        expect(typeof ctx.wikishootme.setMap).toBe('function');
    });

    test('addNewWikidataItem is defined', () => {
        expect(typeof ctx.wikishootme.addNewWikidataItem).toBe('function');
    });

    test('addMarkerMe is defined', () => {
        expect(typeof ctx.wikishootme.addMarkerMe).toBe('function');
    });
});

describe('wikishootme search methods (wsm_search.js)', () => {
    test('doSearch is defined', () => {
        expect(typeof ctx.wikishootme.doSearch).toBe('function');
    });

    test('getAdminUnit is defined', () => {
        expect(typeof ctx.wikishootme.getAdminUnit).toBe('function');
    });

    test('setPositionFromQ is defined', () => {
        expect(typeof ctx.wikishootme.setPositionFromQ).toBe('function');
    });

    test('createNewItem is defined', () => {
        expect(typeof ctx.wikishootme.createNewItem).toBe('function');
    });

    test('clear_commons_main_category resets to empty object', () => {
        ctx.wikishootme.main_commons_category = 'Test';
        ctx.wikishootme.files_in_main_commons_category = { 'File:Test.jpg': 1 };
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.clear_commons_main_category();
        expect(typeof ctx.wikishootme.files_in_main_commons_category).toBe('object');
        expect(ctx.wikishootme.main_commons_category).toBe('');
    });

    test('set_commons_main_category is defined', () => {
        expect(typeof ctx.wikishootme.set_commons_main_category).toBe('function');
    });
});
