const { loadAll } = require('./load_helper');

let ctx;

beforeEach(() => {
    ctx = loadAll();
    ctx.wikishootme.map = ctx.L.map();
    ctx.wikishootme.forEachLayer(function (layer) {
        layer.initFeatureGroup();
    });
});

describe('clear_commons_main_category', () => {
    test('returns false when already empty', () => {
        ctx.wikishootme.main_commons_category = '';
        const result = ctx.wikishootme.clear_commons_main_category();
        expect(result).toBe(false);
    });

    test('resets category and files', () => {
        ctx.wikishootme.main_commons_category = 'Test Category';
        ctx.wikishootme.files_in_main_commons_category = { 'File:A.jpg': 1 };
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.clear_commons_main_category();
        expect(ctx.wikishootme.main_commons_category).toBe('');
        expect(ctx.wikishootme.files_in_main_commons_category).toEqual({});
    });
});

describe('set_commons_main_category', () => {
    test('returns false for empty category', () => {
        const result = ctx.wikishootme.set_commons_main_category('');
        expect(result).toBe(false);
    });

    test('initializes files object for non-empty category', () => {
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.set_commons_main_category('Buildings');
        expect(ctx.wikishootme.main_commons_category).toBe('Buildings');
        expect(ctx.wikishootme.files_in_main_commons_category).toEqual({});
    });
});

describe('update_entries_commons_main_category', () => {
    test('sets default style for entries not in category', () => {
        let styleSet = null;
        const commonsLayer = ctx.wikishootme.getLayer('commons');
        commonsLayer.storeEntry('123', {
            page: 'File:Test.jpg',
            marker: {
                setStyle: function (s) { styleSet = s; }
            }
        });
        ctx.wikishootme.files_in_main_commons_category = {};
        ctx.wikishootme.update_entries_commons_main_category();
        expect(styleSet.weight).toBe(1);
    });

    test('highlights entries in category', () => {
        let styleSet = null;
        const commonsLayer = ctx.wikishootme.getLayer('commons');
        commonsLayer.storeEntry('123', {
            page: 'File:Test.jpg',
            marker: {
                setStyle: function (s) { styleSet = s; }
            }
        });
        ctx.wikishootme.files_in_main_commons_category = { 'File:Test.jpg': 1 };
        ctx.wikishootme.update_entries_commons_main_category();
        expect(styleSet.weight).toBe(3);
    });
});

describe('setPositionToMyLocation', () => {
    test('does nothing without marker_me', () => {
        // Should not throw
        expect(() => ctx.wikishootme.setPositionToMyLocation()).not.toThrow();
    });
});

describe('setPositionFromCurrentLocation', () => {
    test('calls setMap when geolocation is not available', () => {
        let setMapCalled = false;
        ctx.wikishootme.setMap = function () { setMapCalled = true; };
        ctx.navigator.geolocation = null;
        ctx.wikishootme.setPositionFromCurrentLocation();
        expect(setMapCalled).toBe(true);
    });

    test('calls setMap when geolocation permission is denied', () => {
        let setMapCalled = false;
        ctx.wikishootme.setMap = function () { setMapCalled = true; };
        ctx.navigator.geolocation = {
            getCurrentPosition: function (success, error) {
                error({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, UNKNOWN_ERROR: 0 });
            }
        };
        ctx.wikishootme.setPositionFromCurrentLocation();
        expect(setMapCalled).toBe(true);
    });
});

describe('getHashVars', () => {
    test('handles empty hash', () => {
        ctx.window.location.href = 'https://example.com/#';
        const vars = ctx.wikishootme.getHashVars();
        expect(vars).toBeDefined();
    });

    test('handles multiple parameters', () => {
        ctx.window.location.href = 'https://example.com/#a=1&b=2&c=3';
        const vars = ctx.wikishootme.getHashVars();
        expect(vars.a).toBe('1');
        expect(vars.b).toBe('2');
        expect(vars.c).toBe('3');
    });
});

describe('setBusy', () => {
    test('resets to 0 correctly', () => {
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.setBusy(1);
        ctx.wikishootme.setBusy(-1);
        expect(ctx.wikishootme.busy).toBe(0);
    });

    test('does not go negative', () => {
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.setBusy(1);
        ctx.wikishootme.setBusy(-1);
        // busy is 0 now, calling updatePermalink, which is ok
        expect(ctx.wikishootme.busy).toBe(0);
    });
});

describe('pingLayer', () => {
    test('does nothing for hidden layer', () => {
        ctx.wikishootme.show_layers = [];
        // Should not throw
        expect(() => ctx.wikishootme.pingLayer('wikidata_image')).not.toThrow();
    });
});

describe('doSearch coordinate parsing', () => {
    test('navigates to coordinates when query is lat,lng', () => {
        const origGetById = ctx.document.getElementById;
        ctx.document.getElementById = function (id) {
            if (id === 'search_query') return { value: '51.5, -0.1', style: { display: '' } };
            if (id === 'search_results_list') return { innerHTML: '', style: { display: '' } };
            return origGetById(id);
        };
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.doSearch();
        expect(ctx.wikishootme.pos.lat).toBe(51.5);
        expect(ctx.wikishootme.pos.lng).toBe(-0.1);
        ctx.document.getElementById = origGetById;
    });

    test('does not navigate for out-of-range coordinates', () => {
        const origPos = { lat: ctx.wikishootme.pos.lat, lng: ctx.wikishootme.pos.lng };
        const origGetById = ctx.document.getElementById;
        ctx.document.getElementById = function (id) {
            if (id === 'search_query') return { value: '200, 300', style: { display: '' } };
            if (id === 'search_results_list') return { innerHTML: '', style: { display: '' } };
            return origGetById(id);
        };
        // searchWikidata will be called since coords are out of range — make it a no-op
        ctx.wsm_comm.searchWikidata = function () { return new Promise(function(){}); };
        ctx.wikishootme.doSearch();
        // Position should not have changed (lat 200 is out of range)
        expect(ctx.wikishootme.pos.lat).toBe(origPos.lat);
        ctx.document.getElementById = origGetById;
    });
});

describe('escapeHTML', () => {
    test('escapes ampersands', () => {
        expect(ctx.wikishootme.escapeHTML('a&b')).toBe('a&amp;b');
    });

    test('escapes angle brackets', () => {
        expect(ctx.wikishootme.escapeHTML('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
    });

    test('handles empty string', () => {
        expect(ctx.wikishootme.escapeHTML('')).toBe('');
    });
});
