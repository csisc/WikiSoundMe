const { loadAll } = require('./load_helper');

let ctx;

beforeEach(() => {
    ctx = loadAll();
});

describe('createImageThumbnail', () => {
    test('generates correct Commons redirect URL', () => {
        const html = ctx.wikishootme.createImageThumbnail('My Photo.jpg');
        expect(html).toContain('Special:Redirect/file/');
        expect(html).toContain('width=200px');
        expect(html).toContain('max-width:200px');
        expect(html).toContain('max-height:200px');
    });

    test('uses configured thumb_size', () => {
        ctx.wikishootme.thumb_size = 300;
        const html = ctx.wikishootme.createImageThumbnail('Test.jpg');
        expect(html).toContain('width=300px');
        expect(html).toContain('max-width:300px');
        expect(html).toContain('max-height:300px');
    });

    test('preserves aspect ratio (no fixed width/height attributes)', () => {
        const html = ctx.wikishootme.createImageThumbnail('Panorama.jpg');
        expect(html).not.toMatch(/\bwidth='[^']*'\s+height='/);
    });

    test('escapes special characters in filename', () => {
        const html = ctx.wikishootme.createImageThumbnail("It's a <test>.jpg");
        expect(html).not.toContain("<test>");
        expect(html).toContain('&lt;test&gt;');
    });

    test('links to Commons file page', () => {
        const html = ctx.wikishootme.createImageThumbnail('Photo.jpg');
        expect(html).toContain("commons.wikimedia.org/wiki/File:");
    });
});

describe('createPopup', () => {
    test('creates popup for wikidata entry with image', () => {
        const layer = ctx.wikishootme.getLayer('wikidata_image');
        const entry = {
            url: 'https://www.wikidata.org/wiki/Q42',
            label: 'Douglas Adams',
            pos: [51.5, -0.1],
            mode: 'wikidata',
            page: 'Q42',
            image: 'Douglas_Adams.jpg'
        };
        const popup = layer.createPopup(entry, ctx.wikishootme);
        expect(popup).toBeDefined();
    });

    test('creates popup for commons entry', () => {
        const layer = ctx.wikishootme.getLayer('commons');
        const entry = {
            url: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
            label: 'Test',
            pos: [51.5, -0.1],
            mode: 'commons',
            page: 'File:Test.jpg',
            image: 'Test.jpg'
        };
        const popup = layer.createPopup(entry, ctx.wikishootme);
        expect(popup).toBeDefined();
    });

    test('creates popup for flickr entry', () => {
        const layer = ctx.wikishootme.getLayer('flickr');
        const entry = {
            url: 'https://www.flickr.com/photos/user/123',
            label: 'Nice Photo',
            pos: [51.5, -0.1],
            mode: 'flickr',
            flickr_id: '123',
            thumburl: 'https://example.com/thumb.jpg'
        };
        const popup = layer.createPopup(entry, ctx.wikishootme);
        expect(popup).toBeDefined();
    });

    test('shows commonscat link when present', () => {
        const layer = ctx.wikishootme.getLayer('wikidata_image');
        const entry = {
            url: 'https://www.wikidata.org/wiki/Q42',
            label: 'Test',
            pos: [51.5, -0.1],
            mode: 'wikidata',
            page: 'Q42',
            image: 'Test.jpg',
            commonscat: 'Test Category'
        };
        expect(() => layer.createPopup(entry, ctx.wikishootme)).not.toThrow();
    });

    test('shows description when present', () => {
        const layer = ctx.wikishootme.getLayer('wikidata_image');
        const entry = {
            url: 'https://www.wikidata.org/wiki/Q42',
            label: 'Test',
            description: 'A test item',
            pos: [51.5, -0.1],
            mode: 'wikidata',
            page: 'Q42',
            image: 'Test.jpg'
        };
        expect(() => layer.createPopup(entry, ctx.wikishootme)).not.toThrow();
    });

    test('shows mixnmatch info when present', () => {
        const layer = ctx.wikishootme.getLayer('mixnmatch');
        const entry = {
            url: 'https://mix-n-match.toolforge.org/#/entry/1',
            label: 'MnM Entry',
            pos: [51.5, -0.1],
            mode: 'mixnmatch',
            page: 'entry_1',
            mixnmatch: { q: 42, user: 1, ext_url: 'https://example.com/item/1' }
        };
        expect(() => layer.createPopup(entry, ctx.wikishootme)).not.toThrow();
    });

    test('shows unmatched mixnmatch info', () => {
        const layer = ctx.wikishootme.getLayer('mixnmatch');
        const entry = {
            url: 'https://mix-n-match.toolforge.org/#/entry/1',
            label: 'MnM Entry',
            pos: [51.5, -0.1],
            mode: 'mixnmatch',
            page: 'entry_1',
            mixnmatch: { q: null, user: 0, ext_url: '' }
        };
        expect(() => layer.createPopup(entry, ctx.wikishootme)).not.toThrow();
    });
});

describe('editCoordinates', () => {
    test('returns false on cancel', () => {
        ctx.prompt = function () { return null; };
        const result = ctx.wikishootme.editCoordinates(null, 'Q42', 51.5, -0.1);
        expect(result).toBe(false);
    });

    test('rejects bad format', () => {
        let toastMsg = null;
        ctx.prompt = function () { return 'bad format'; };
        ctx.wikishootme.showToast = function (msg) { toastMsg = msg; };
        const result = ctx.wikishootme.editCoordinates(null, 'Q42', 51.5, -0.1);
        expect(result).toBe(false);
        expect(toastMsg).toContain('Bad format');
    });

    test('rejects unchanged coordinates (slash format)', () => {
        let toastMsg = null;
        ctx.prompt = function () { return '51.5/-0.1'; };
        ctx.wikishootme.showToast = function (msg) { toastMsg = msg; };
        const result = ctx.wikishootme.editCoordinates(null, 'Q42', 51.5, -0.1);
        expect(result).toBe(false);
        expect(toastMsg).toContain('same as the old');
    });

    test('accepts comma-separated coordinates', () => {
        let toastMsg = null;
        let capturedParams = null;
        const mockA = { closest: function () { return null; } };
        ctx.prompt = function () { return '52.0, 13.4'; };
        ctx.wikishootme.showToast = function (msg) { toastMsg = msg; };
        ctx.wsm_comm.getWSM = function (params) { capturedParams = params; return Promise.resolve({ status: 'OK' }); };
        ctx.wikishootme.editCoordinates(mockA, 'Q42', 51.5, -0.1);
        expect(toastMsg).toBeNull();
        expect(capturedParams).not.toBeNull();
        expect(capturedParams.coordinates).toBe('52.0/13.4');
    });

    test('rejects unchanged coordinates (comma format)', () => {
        let toastMsg = null;
        ctx.prompt = function () { return '51.5, -0.1'; };
        ctx.wikishootme.showToast = function (msg) { toastMsg = msg; };
        const result = ctx.wikishootme.editCoordinates(null, 'Q42', 51.5, -0.1);
        expect(result).toBe(false);
        expect(toastMsg).toContain('same as the old');
    });

    test('accepts slash-separated coordinates with spaces', () => {
        let toastMsg = null;
        let capturedParams = null;
        const mockA = { closest: function () { return null; } };
        ctx.prompt = function () { return '52.0 / 13.4'; };
        ctx.wikishootme.showToast = function (msg) { toastMsg = msg; };
        ctx.wsm_comm.getWSM = function (params) { capturedParams = params; return Promise.resolve({ status: 'OK' }); };
        ctx.wikishootme.editCoordinates(mockA, 'Q42', 51.5, -0.1);
        expect(toastMsg).toBeNull();
        expect(capturedParams.coordinates).toBe('52.0/13.4');
    });
});
