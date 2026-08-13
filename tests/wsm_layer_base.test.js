const { loadAll } = require('./load_helper');

let ctx;

beforeEach(() => {
    ctx = loadAll();
});

// Helper: get a registered layer by key to test its class behavior
function getLayer(key) {
    return ctx.wikishootme.getLayer(key);
}

describe('BaseLayer via registered layers', () => {
    test('registered layers have expected properties', () => {
        var layer = getLayer('commons');
        expect(layer.key).toBe('commons');
        expect(layer.displayName).toContain('Commons');
        expect(layer.color).toBe('#62A9FF');
        expect(layer.radius).toBe(7);
        expect(layer.opacity).toBe(0.5);
        expect(layer.defaultVisible).toBe(true);
    });

    test('non-default-visible layers', () => {
        expect(getLayer('flickr').defaultVisible).toBe(false);
        expect(getLayer('mixnmatch').defaultVisible).toBe(false);
        expect(getLayer('mnm_lc').defaultVisible).toBe(false);
    });

    test('initFeatureGroup creates a featureGroup', () => {
        var layer = getLayer('wikipedia');
        var fg = layer.initFeatureGroup();
        expect(fg).toBeDefined();
        expect(layer.featureGroup).toBe(fg);
    });

    test('clean resets entries', () => {
        var layer = getLayer('commons');
        layer.initFeatureGroup();
        layer.entries = { 'a': 1 };
        layer.clean();
        expect(layer.entries).toEqual({});
    });

    test('storeEntry and getEntry', () => {
        var layer = getLayer('commons');
        layer.storeEntry('Q42', { label: 'test' });
        expect(layer.getEntry('Q42')).toEqual({ label: 'test' });
        expect(layer.getEntry('Q99')).toBeUndefined();
    });

    test('isVisible checks showLayers', () => {
        var layer = getLayer('commons');
        expect(layer.isVisible(['commons', 'wikipedia'])).toBe(true);
        expect(layer.isVisible(['wikipedia'])).toBe(false);
    });

    test('getOverlayLabel includes color and name', () => {
        var layer = getLayer('flickr');
        var label = layer.getOverlayLabel();
        expect(label).toContain(layer.color);
        expect(label).toContain('Flickr');
    });

    test('createMarker returns a marker', () => {
        var layer = getLayer('commons');
        var marker = layer.createMarker([51.5, -0.1]);
        expect(marker).toBeDefined();
    });

    test('createMarker accepts overrides', () => {
        var layer = getLayer('commons');
        var marker = layer.createMarker([51.5, -0.1], { color: '#FF0000', radius: 20 });
        expect(marker).toBeDefined();
    });

    test('addMarker and removeMarker work', () => {
        var layer = getLayer('commons');
        layer.initFeatureGroup();
        var marker = layer.createMarker([51.5, -0.1]);
        expect(() => layer.addMarker(marker)).not.toThrow();
        expect(() => layer.removeMarker(marker)).not.toThrow();
    });
});

describe('Popup generation', () => {
    test('popupHeader generates label link', () => {
        var layer = getLayer('commons');
        var entry = { url: 'https://example.com', label: 'Test', pos: [51.5, -0.1] };
        var h = layer.popupHeader(entry, ctx.wikishootme);
        expect(h).toContain('Test');
        expect(h).toContain('https://example.com');
    });

    test('popupHeader includes description if present', () => {
        var layer = getLayer('commons');
        var entry = { url: '#', label: 'X', pos: [0, 0], description: 'A desc' };
        var h = layer.popupHeader(entry, ctx.wikishootme);
        expect(h).toContain('A desc');
    });

    test('popupHeader includes street if present', () => {
        var layer = getLayer('commons');
        var entry = { url: '#', label: 'X', pos: [0, 0], street: '123 Main St' };
        var h = layer.popupHeader(entry, ctx.wikishootme);
        expect(h).toContain('123 Main St');
    });

    test('popupHeader shows mixnmatch match info', () => {
        var layer = getLayer('mixnmatch');
        var entry = { url: '#', label: 'X', pos: [0, 0], mixnmatch: { q: 42, user: 1, ext_url: 'https://example.com/item/1' } };
        var h = layer.popupHeader(entry, ctx.wikishootme);
        expect(h).toContain('Q42');
    });

    test('popupHeader includes P31 filter buttons when entry.p31 is set', () => {
        var layer = getLayer('wikidata_no_image');
        var entry = { url: 'https://www.wikidata.org/wiki/Q123', label: 'Test', p31label: 'church', p31: 'Q16970', pos: [51.5, -0.1] };
        var h = layer.popupHeader(entry, ctx.wikishootme);
        expect(h).toContain('addP31Filter');
        expect(h).toContain('Q16970');
    });

    test('popupHeader shows + button with mode 1', () => {
        var layer = getLayer('wikidata_no_image');
        var entry = { url: '#', label: 'Test', p31label: 'church', p31: 'Q16970', pos: [0, 0] };
        var h = layer.popupHeader(entry, ctx.wikishootme);
        expect(h).toContain('addP31Filter("Q16970",1)');
    });

    test('popupHeader shows - button with mode -1', () => {
        var layer = getLayer('wikidata_no_image');
        var entry = { url: '#', label: 'Test', p31label: 'church', p31: 'Q16970', pos: [0, 0] };
        var h = layer.popupHeader(entry, ctx.wikishootme);
        expect(h).toContain('addP31Filter("Q16970",-1)');
    });

    test('popupHeader does not show P31 buttons when p31 qid is absent', () => {
        var layer = getLayer('commons');
        var entry = { url: '#', label: 'X', pos: [0, 0], p31label: 'building' };
        var h = layer.popupHeader(entry, ctx.wikishootme);
        expect(h).not.toContain('addP31Filter');
    });

    test('popupFooter includes coordinates', () => {
        var layer = getLayer('commons');
        var entry = { url: '#', label: 'X', pos: [51.5, -0.1], page: 'Q42' };
        var h = layer.popupFooter(entry, ctx.wikishootme);
        expect(h).toContain('51.5');
        expect(h).toContain('-0.1');
        expect(h).toContain('streetview');
    });

    test('popupFooter includes commonscat', () => {
        var layer = getLayer('commons');
        var entry = { url: '#', label: 'X', pos: [0, 0], page: 'Q1', commonscat: 'Test Category' };
        var h = layer.popupFooter(entry, ctx.wikishootme);
        expect(h).toContain('Test Category');
    });
});

describe('WikipediaLayer', () => {
    test('has correct config', () => {
        var layer = getLayer('wikipedia');
        expect(layer.key).toBe('wikipedia');
        expect(layer.color).toBe('#FFFFAA');
    });

    test('popupContent returns pageimage div', () => {
        var layer = getLayer('wikipedia');
        var entry = { server: 'en.wikipedia.org', page: 'London', pos: [51.5, -0.1] };
        var h = layer.popupContent(entry, ctx.wikishootme);
        expect(h).toContain('pageimage_toload');
        expect(h).toContain('en.wikipedia.org');
    });

    test('addEntry creates and stores entry', () => {
        var layer = getLayer('wikipedia');
        layer.initFeatureGroup();
        var v = { lat: 51.5, lon: -0.1, title: 'London', ns: 0, pageid: 123 };
        var entry = layer.addEntry('en.wikipedia.org', v, ctx.wikishootme);
        expect(entry.label).toBe('London');
        expect(entry.mode).toBe('wikipedia');
        expect(layer.getEntry('123')).toBe(entry);
    });
});

describe('CommonsLayer', () => {
    test('has correct config', () => {
        var layer = getLayer('commons');
        expect(layer.key).toBe('commons');
        expect(layer.color).toBe('#62A9FF');
    });

    test('addEntry strips File: prefix but keeps extension (issue #13)', () => {
        var layer = getLayer('commons');
        layer.initFeatureGroup();
        var v = { lat: 51.5, lon: -0.1, title: 'File:London.jpg', ns: 6, pageid: 456 };
        var entry = layer.addEntry('commons.wikimedia.org', v, ctx.wikishootme);
        expect(entry.label).toBe('London.jpg');
        expect(entry.image).toBe('London.jpg');
    });

    test('popupContent includes create item from image', () => {
        var layer = getLayer('commons');
        var entry = { image: 'Test.jpg', pos: [51.5, -0.1], mode: 'commons' };
        var h = layer.popupContent(entry, ctx.wikishootme);
        expect(h).toContain('create_wd_from_image');
    });
});

describe('WikidataImageLayer', () => {
    test('has correct config', () => {
        var layer = getLayer('wikidata_image');
        expect(layer.color).toBe('#2DC800');
        expect(layer.radius).toBe(10);
    });

    test('popupContent shows image thumbnail', () => {
        var layer = getLayer('wikidata_image');
        var entry = { image: 'Photo.jpg', pos: [51.5, -0.1], page: 'Q42', mode: 'wikidata' };
        var h = layer.popupContent(entry, ctx.wikishootme);
        expect(h).toContain('Photo.jpg');
    });
});

describe('WikidataNoImageLayer upload filename (P4a)', () => {
    test('popupContent uses adminlabel in filename when present', () => {
        const layer = getLayer('wikidata_no_image');
        ctx.wsm_comm.is_logged_in = true;
        ctx.wsm_comm.userinfo = { name: 'TestUser' };
        const entry = { page: 'Q42', label: 'My Building', adminlabel: 'Vienna', pos: [48.2, 16.4] };
        const html = layer.popupContent(entry, ctx.wikishootme);
        expect(html).toContain('My Building, Vienna.jpg');
    });

    test('popupContent falls back to label-only filename without adminlabel', () => {
        const layer = getLayer('wikidata_no_image');
        ctx.wsm_comm.is_logged_in = true;
        ctx.wsm_comm.userinfo = { name: 'TestUser' };
        const entry = { page: 'Q42', label: 'My Building', pos: [48.2, 16.4] };
        const html = layer.popupContent(entry, ctx.wikishootme);
        expect(html).toContain('My Building.jpg');
        expect(html).not.toContain(', .jpg');
    });

    test('adminlabel sanitises slashes in filename', () => {
        const layer = getLayer('wikidata_no_image');
        ctx.wsm_comm.is_logged_in = true;
        ctx.wsm_comm.userinfo = { name: 'TestUser' };
        const entry = { page: 'Q42', label: 'A/B', adminlabel: 'C/D', pos: [48.2, 16.4] };
        const html = layer.popupContent(entry, ctx.wikishootme);
        expect(html).toContain('A-B, C-D.jpg');
    });
});

describe('WikidataNoImageLayer', () => {
    test('has correct config', () => {
        var layer = getLayer('wikidata_no_image');
        expect(layer.color).toBe('#FF4848');
    });

    test('popupContent shows authorize when not logged in', () => {
        var layer = getLayer('wikidata_no_image');
        ctx.wsm_comm.is_logged_in = false;
        var entry = { pos: [51.5, -0.1], page: 'Q42', mode: 'wikidata', label: 'Test' };
        var h = layer.popupContent(entry, ctx.wikishootme);
        expect(h).toContain('authorize_upload');
    });

    test('imageLayer reference is set', () => {
        var layer = getLayer('wikidata_no_image');
        expect(layer.imageLayer).toBeDefined();
        expect(layer.imageLayer.key).toBe('wikidata_image');
    });

    test('getWikidataEntry checks both layers', () => {
        var imgLayer = getLayer('wikidata_image');
        var noImgLayer = getLayer('wikidata_no_image');
        imgLayer.storeEntry('Q1', { label: 'with image' });
        noImgLayer.storeEntry('Q2', { label: 'no image' });
        expect(noImgLayer.getWikidataEntry('Q1').label).toBe('with image');
        expect(noImgLayer.getWikidataEntry('Q2').label).toBe('no image');
        expect(noImgLayer.getWikidataEntry('Q99')).toBeUndefined();
    });
});

describe('BildwunschLayer', () => {
    test('has correct config', () => {
        var layer = getLayer('bildwunsch');
        expect(layer.key).toBe('bildwunsch');
        expect(layer.defaultVisible).toBe(false);
        expect(layer.supportsIncremental).toBe(true);
        expect(layer.dataUrl).toContain('bldrwnsch.toolforge.org');
    });

    test('starts with no cached features', () => {
        var layer = getLayer('bildwunsch');
        expect(layer._allFeatures).toBeNull();
    });

    test('popupContent returns empty string', () => {
        var layer = getLayer('bildwunsch');
        var entry = { page: 'Foo', label: 'Foo', pos: [0, 0] };
        expect(layer.popupContent(entry, ctx.wikishootme)).toBe('');
    });

    test('popupFooter shows coordinates without edit link', () => {
        var layer = getLayer('bildwunsch');
        var entry = { page: 'Foo', label: 'Foo', pos: [51.5, -0.1] };
        var h = layer.popupFooter(entry, ctx.wikishootme);
        expect(h).toContain('51.5');
        expect(h).toContain('-0.1');
        expect(h).not.toContain('editCoordinates');
    });
});

describe('FlickrLayer', () => {
    test('has correct config', () => {
        var layer = getLayer('flickr');
        expect(layer.key).toBe('flickr');
        expect(layer.defaultVisible).toBe(false);
    });

    test('popupContent shows flickr image and transfer div', () => {
        var layer = getLayer('flickr');
        var entry = { url: 'https://flickr.com/1', thumburl: 'https://img.com/t.jpg', flickr_id: '1', pos: [0, 0] };
        var h = layer.popupContent(entry, ctx.wikishootme);
        expect(h).toContain('t.jpg');
        expect(h).toContain('transfer2flickr');
    });
});

describe('MixNMatchLayer', () => {
    test('has correct config', () => {
        var layer = getLayer('mixnmatch');
        expect(layer.key).toBe('mixnmatch');
        expect(layer.defaultVisible).toBe(false);
    });
});

describe('MixNMatchLCLayer', () => {
    test('has correct config', () => {
        var layer = getLayer('mnm_lc');
        expect(layer.key).toBe('mnm_lc');
        expect(layer.defaultVisible).toBe(false);
    });
});

describe('GeoJSONLayer', () => {
    test('has correct config', () => {
        var layer = getLayer('geo_json');
        expect(layer.key).toBe('geo_json');
    });

    test('popupContent shows GeoJSON text', () => {
        var layer = getLayer('geo_json');
        var h = layer.popupContent({ pos: [0, 0] }, ctx.wikishootme);
        expect(h).toContain('GeoJSON');
    });
});

describe('Layer registration', () => {
    test('all expected layer keys are registered', () => {
        var keys = Object.keys(ctx.wikishootme.registered_layers);
        expect(keys).toContain('wikipedia');
        expect(keys).toContain('commons');
        expect(keys).toContain('wikidata_image');
        expect(keys).toContain('wikidata_no_image');
        expect(keys).toContain('flickr');
        expect(keys).toContain('mixnmatch');
        expect(keys).toContain('mnm_lc');
        expect(keys).toContain('geo_json');
    });

    test('getLayer returns correct layer', () => {
        expect(ctx.wikishootme.getLayer('commons').key).toBe('commons');
    });

    test('getLayer returns undefined for unknown key', () => {
        expect(ctx.wikishootme.getLayer('nonexistent')).toBeUndefined();
    });

    test('forEachLayer iterates all layers', () => {
        var keys = [];
        ctx.wikishootme.forEachLayer(function (layer) {
            keys.push(layer.key);
        });
        expect(keys.length).toBe(14);
    });
});
