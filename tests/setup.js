const fs = require('fs');
const vm = require('vm');
const path = require('path');

function createTestEnv() {
    // Mock localStorage
    const store = {};
    const localStorage = {
        getItem: function (key) { return store[key] !== undefined ? store[key] : null; },
        setItem: function (key, val) { store[key] = String(val); },
        removeItem: function (key) { delete store[key]; }
    };

    // Minimal jQuery mock
    const $ = function (selector) {
        if (typeof selector === 'function') {
            selector();
            return;
        }
        const el = {
            _selector: selector,
            show: function () { return el; },
            hide: function () { return el; },
            html: function (h) { if (typeof h === 'undefined') return ''; el._html = h; return el; },
            text: function (t) { if (typeof t === 'undefined') return el._text || ''; el._text = t; return el; },
            val: function () { return ''; },
            attr: function () { return el; },
            click: function () { return el; },
            submit: function () { return el; },
            focus: function () { return el; },
            on: function () { return el; },
            find: function () { return el; },
            each: function () { return el; },
            parents: function () { return el; },
            get: function () { return null; },
            replaceWith: function () { return el; },
            remove: function () { return el; },
            append: function () { return el; },
            modal: function () { return el; },
            prop: function () { return el; },
            change: function () { return el; },
        };
        return el;
    };
    $.fn = {};
    $.each = function (obj, fn) {
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                if (fn.call(obj[i], i, obj[i]) === false) break;
            }
        } else if (obj && typeof obj === 'object') {
            for (const k in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, k)) {
                    if (fn.call(obj[k], k, obj[k]) === false) break;
                }
            }
        }
    };
    $.inArray = function (val, arr) {
        return arr.indexOf(val);
    };
    $.grep = function (arr, fn) {
        return arr.filter(fn);
    };
    $.trim = function (s) {
        return (s || '').trim();
    };
    // jQuery AJAX mocks — return deferred-like objects compatible with Promise.resolve()
    function mockDeferred() {
        var obj = {
            then: function (fn) { if (fn) try { fn({}); } catch(e) {} return mockDeferred(); },
            catch: function (fn) { return mockDeferred(); },
            finally: function (fn) { if (fn) try { fn(); } catch(e) {} return mockDeferred(); },
            fail: function () { return obj; },
            always: function (fn) { if (fn) try { fn(); } catch(e) {} return obj; }
        };
        return obj;
    }
    $.getJSON = function () { return mockDeferred(); };
    $.get = function () { return mockDeferred(); };
    $.post = function () { return mockDeferred(); };
    $.ajax = function () { return mockDeferred(); };

    // Minimal L (Leaflet) mock
    const L = {
        map: function () {
            return {
                setView: function () { return this; },
                on: function () { return this; },
                getCenter: function () { return { lat: 52, lng: 0 }; },
                getZoom: function () { return 15; },
                getBounds: function () {
                    return {
                        getCenter: function () { return { lat: 52, lng: 0 }; },
                        getNorthEast: function () { return { lat: 53, lng: 1, distanceTo: function () { return 100000; } }; },
                        getSouthWest: function () { return { lat: 51, lng: -1 }; },
                        getNorthWest: function () { return { lat: 53, lng: -1 }; },
                        getSouthEast: function () { return { lat: 51, lng: 1 }; }
                    };
                },
                getZoom: function () { return 15; },
                addLayer: function () { return this; },
                removeLayer: function () { return this; }
            };
        },
        tileLayer: function () { return { addTo: function () {} }; },
        circleMarker: function () {
            return {
                setRadius: function () {},
                bindPopup: function () { return this; },
                addTo: function () {},
                setLatLng: function () {},
                getLatLng: function () { return { lat: 52, lng: 0 }; },
                setStyle: function () {},
                openPopup: function () {},
                closePopup: function () {},
                unbindPopup: function () {},
                getPopup: function () { return { isOpen: function () { return false; } }; }
            };
        },
        point: function (x, y) { return { x: x, y: y }; },
        popup: function () { return { setContent: function () { return this; } }; },
        featureGroup: function () {
            return {
                addLayer: function () {},
                removeLayer: function () {},
                clearLayers: function () {},
                bringToFront: function () {},
                bringToBack: function () {},
                addTo: function () { return this; }
            };
        },
        markerClusterGroup: function () {
            return {
                _isCluster: true,
                addLayer: function () {},
                removeLayer: function () {},
                clearLayers: function () {},
                bringToFront: function () {},
                bringToBack: function () {},
                addTo: function () { return this; },
                removeLayer: function () {}
            };
        },
        control: { layers: function () { return { addTo: function () { return this; }, removeLayer: function () {}, addOverlay: function () {} }; } },
        geoJSON: function () { return { addData: function () {} }; }
    };

    // Build the sandbox context
    const sandbox = {
        window: {
            location: { href: 'https://wikishootme.toolforge.org/#lat=52&lng=0&zoom=15', hash: '#lat=52&lng=0&zoom=15' },
            addEventListener: function () {},
            localStorage: localStorage,
            FormData: function () {}
        },
        document: {
            getElementById: function () {
                return {
                    style: { display: '' },
                    innerHTML: '',
                    textContent: '',
                    value: '',
                    checked: false,
                    href: '',
                    title: '',
                    className: '',
                    classList: { add: function(){}, remove: function(){}, toggle: function(){} },
                    setAttribute: function(){},
                    getAttribute: function(){ return ''; },
                    addEventListener: function(){},
                    focus: function(){},
                    submit: function(){},
                    remove: function(){},
                    closest: function(){ return null; },
                    querySelector: function(){ return { textContent: '', innerHTML: '', value: '' }; },
                    querySelectorAll: function(){ return []; },
                    parentNode: { appendChild: function(){} },
                    appendChild: function(){},
                    replaceWith: function(){}
                };
            },
            createElement: function (tag) {
                return {
                    style: { display: '' },
                    innerHTML: '',
                    textContent: '',
                    className: '',
                    setAttribute: function(){},
                    getAttribute: function(){ return ''; },
                    addEventListener: function(){},
                    querySelector: function(){ return null; },
                    querySelectorAll: function(){ return []; },
                    appendChild: function(){},
                    remove: function(){},
                    outerHTML: ''
                };
            },
            querySelectorAll: function () { return []; },
            querySelector: function () { return null; },
            documentElement: { setAttribute: function(){} }
        },
        navigator: { onLine: true, geolocation: { getCurrentPosition: function () {}, watchPosition: function () {} } },
        location: { href: 'https://wikishootme.toolforge.org/#lat=52&lng=0&zoom=15', hash: '#lat=52&lng=0&zoom=15', reload: function () {} },
        $: $,
        jQuery: $,
        L: L,
        console: console,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        Date: Date,
        alert: function () {},
        prompt: function () { return null; },
        Math: Math,
        JSON: JSON,
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        RegExp: RegExp,
        parseInt: parseInt,
        parseFloat: parseFloat,
        decodeURIComponent: decodeURIComponent,
        encodeURIComponent: encodeURIComponent,
        Error: Error,
        TypeError: TypeError,
        bootstrap: {
            Modal: {
                getOrCreateInstance: function () {
                    return { show: function () {}, hide: function () {} };
                },
                getInstance: function () {
                    return { show: function () {}, hide: function () {} };
                }
            },
            Toast: function () { return { show: function () {} }; }
        },
        localStorage: localStorage,
        escattr: function (s) {
            if (typeof s !== 'string') return '' + s;
            return s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
        isMobile: function () { return false; },
        WikiData: function () {
            this.getItemBatch = function (items, callback) { callback(); };
            this.getItem = function () { return undefined; };
        },
        ToolTranslation: function (opts) {
            this.t = function (key) { return key; };
            this.addILdropdown = function () {};
            if (opts && opts.callback) setTimeout(opts.callback, 0);
        },
        Uppy: {
            XHRUpload: {},
            Uppy: function () {
                return { use: function () {}, addFile: function () {} };
            }
        },
        XHRUpload: {},
        GoldenRetriever: {},
        undefined: undefined,
        isNaN: isNaN,
        isFinite: isFinite
    };

    return { sandbox, localStorage, $, L };
}

function loadScript(sandbox, filename) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'public_html', filename), 'utf8');
    const ctx = vm.createContext(sandbox);
    vm.runInContext(code, ctx, { filename });
    return ctx;
}

module.exports = { createTestEnv, loadScript };
