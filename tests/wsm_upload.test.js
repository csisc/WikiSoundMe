const { loadAll } = require('./load_helper');

let ctx;

beforeEach(() => {
    ctx = loadAll();
});

describe('addImageToItemHandler', () => {
    test('reads q and image from native form element', () => {
        let capturedParams = null;
        ctx.wsm_comm.getWSM = function (params) {
            capturedParams = params;
            return Promise.resolve({ status: 'OK' });
        };
        const form = {
            querySelector: function (sel) {
                if (sel === 'input[name="q"]') return { value: 'Q42' };
                if (sel === 'input[name="filename"]') return { value: 'My photo.jpg' };
                return null;
            },
            replaceWith: function () {},
            closest: function () { return null; }
        };
        ctx.wikishootme.addImageToItemHandler(form);
        expect(capturedParams).not.toBeNull();
        expect(capturedParams.q).toBe('Q42');
        expect(capturedParams.image).toBe('My photo.jpg');
    });

    // Issue #13: accept pasted Commons URLs and File: prefixes
    test('normalizeCommonsFilename strips https://commons.wikimedia.org/wiki/File: URL', () => {
        const out = ctx.wikishootme.normalizeCommonsFilename(
            'https://commons.wikimedia.org/wiki/File:2_Bridge_Street,_Pembridge_-_geograph.org.uk_-_1105508.jpg'
        );
        expect(out).toBe('2 Bridge Street, Pembridge - geograph.org.uk - 1105508.jpg');
    });

    test('normalizeCommonsFilename strips File: prefix', () => {
        expect(ctx.wikishootme.normalizeCommonsFilename('File:Foo bar.jpg')).toBe('Foo bar.jpg');
    });

    test('normalizeCommonsFilename converts underscores to spaces', () => {
        expect(ctx.wikishootme.normalizeCommonsFilename('Foo_bar.jpg')).toBe('Foo bar.jpg');
    });

    test('normalizeCommonsFilename leaves a plain filename alone', () => {
        expect(ctx.wikishootme.normalizeCommonsFilename('Foo bar.jpg')).toBe('Foo bar.jpg');
    });

    test('normalizeCommonsFilename handles empty/undefined input', () => {
        expect(ctx.wikishootme.normalizeCommonsFilename('')).toBe('');
        expect(ctx.wikishootme.normalizeCommonsFilename(undefined)).toBe('');
    });

    test('CommonsLayer.formatLabel keeps the file extension (issue #13)', () => {
        const layer = ctx.wikishootme.getLayer('commons');
        const label = layer.formatLabel('File:My_great_photo.jpg');
        expect(label).toBe('My great photo.jpg');
    });

    test('addImageToItemHandler normalises a pasted Commons URL', () => {
        let capturedParams = null;
        ctx.wsm_comm.getWSM = function (params) {
            capturedParams = params;
            return Promise.resolve({ status: 'OK' });
        };
        const form = {
            querySelector: function (sel) {
                if (sel === 'input[name="q"]') return { value: 'Q26357386' };
                if (sel === 'input[name="filename"]') return {
                    value: 'https://commons.wikimedia.org/wiki/File:Test_image.jpg'
                };
                return null;
            },
            replaceWith: function () {},
            closest: function () { return null; }
        };
        ctx.wikishootme.addImageToItemHandler(form);
        expect(capturedParams.image).toBe('Test image.jpg');
    });
});

describe('clearUploads', () => {
    test('clears the upload queue', () => {
        ctx.wikishootme.upload_queue = [
            { is_uploading: false, is_uploaded: true },
            { is_uploading: true, is_uploaded: false }
        ];
        ctx.wikishootme.clearUploads();
        expect(ctx.wikishootme.upload_queue).toEqual([]);
    });

    test('returns false', () => {
        const result = ctx.wikishootme.clearUploads();
        expect(result).toBe(false);
    });
});

describe('uploadNext', () => {
    test('does nothing with empty queue', () => {
        ctx.wikishootme.upload_queue = [];
        expect(() => ctx.wikishootme.uploadNext()).not.toThrow();
    });

    test('respects max_concurrent_uploads limit', () => {
        // With 2 already uploading and max=2, should not start a 3rd
        ctx.wikishootme.max_concurrent_uploads = 2;
        ctx.wikishootme.upload_queue = [
            { is_uploading: true, is_uploaded: false },
            { is_uploading: true, is_uploaded: false },
            { is_uploading: false, is_uploaded: false }
        ];
        ctx.wikishootme.uploadNext();
        // Third item should still not be uploading
        expect(ctx.wikishootme.upload_queue[2].is_uploading).toBe(false);
    });
});

describe('upload error handling', () => {
    test('failed uploads have retry_count', () => {
        const item = { is_uploading: false, is_uploaded: false, failed: true, retry_count: 1 };
        ctx.wikishootme.upload_queue = [item];
        // Should not throw
        expect(() => ctx.wikishootme.showUploadStatus()).not.toThrow();
    });

    test('getNextUploadIndex skips items over max retries', () => {
        ctx.wikishootme.upload_queue = [
            { is_uploading: false, is_uploaded: false, failed: true, retry_count: 4 }
        ];
        const idx = ctx.wikishootme.getNextUploadIndex();
        expect(idx).toBe(-1);
    });

    test('getNextUploadIndex finds pending items', () => {
        ctx.wikishootme.upload_queue = [
            { is_uploading: false, is_uploaded: true },
            { is_uploading: false, is_uploaded: false, failed: false, retry_count: 0 }
        ];
        const idx = ctx.wikishootme.getNextUploadIndex();
        expect(idx).toBe(1);
    });

    test('getNextUploadIndex finds retryable failed items', () => {
        ctx.wikishootme.upload_queue = [
            { is_uploading: false, is_uploaded: false, failed: true, retry_count: 1 }
        ];
        const idx = ctx.wikishootme.getNextUploadIndex();
        expect(idx).toBe(0);
    });

    test('getNextUploadIndex returns -1 for empty queue', () => {
        ctx.wikishootme.upload_queue = [];
        const idx = ctx.wikishootme.getNextUploadIndex();
        expect(idx).toBe(-1);
    });

    test('countUploading counts active uploads', () => {
        ctx.wikishootme.upload_queue = [
            { is_uploading: true, is_uploaded: false },
            { is_uploading: false, is_uploaded: true },
            { is_uploading: true, is_uploaded: false }
        ];
        expect(ctx.wikishootme.countUploading()).toBe(2);
    });
});

describe('showUploadStatus', () => {
    test('handles empty queue', () => {
        ctx.wikishootme.upload_queue = [];
        expect(() => ctx.wikishootme.showUploadStatus()).not.toThrow();
    });

    test('handles mixed status queue', () => {
        ctx.wikishootme.upload_queue = [
            { is_uploading: false, is_uploaded: true, data: { file: 'test.jpg', file_url: 'https://example.com/test.jpg' } },
            { is_uploading: true, is_uploaded: false },
            { is_uploading: false, is_uploaded: false, failed: true, retry_count: 1 }
        ];
        expect(() => ctx.wikishootme.showUploadStatus()).not.toThrow();
    });
});

describe('switchItemToImageLayer', () => {
    test('handles missing entry gracefully', () => {
        ctx.wikishootme.entries.wikidata = {};
        expect(() => ctx.wikishootme.switchItemToImageLayer('Q99999', 'test.jpg')).not.toThrow();
    });

    test('moves entry from no_image to image layer', () => {
        ctx.wikishootme.map = ctx.L.map();
        ctx.wikishootme.forEachLayer(function (layer) {
            layer.initFeatureGroup();
        });
        ctx.wikishootme.show_layers = [];
        ctx.wikishootme.addNewWikidataItem('Q42', 'Test', { lat: 51.5, lng: -0.1 });
        ctx.wikishootme.switchItemToImageLayer('Q42', 'test.jpg');
        expect(ctx.wikishootme.entries.wikidata['Q42'].image).toBe('test.jpg');
    });
});

describe('addImageToItemHandler', () => {
    test('returns false', () => {
        const mockForm = {
            querySelector: function () {
                return { value: 'test' };
            }
        };
        const result = ctx.wikishootme.addImageToItemHandler(mockForm);
        expect(result).toBe(false);
    });
});

describe('initialize_uppy', () => {
    test('creates uppy instance', () => {
        ctx.uppy = undefined;
        ctx.wikishootme.initialize_uppy();
        expect(ctx.uppy).toBeDefined();
    });

    test('does not recreate if already initialized', () => {
        const firstUppy = { marker: 'first' };
        ctx.uppy = firstUppy;
        ctx.wikishootme.initialize_uppy();
        expect(ctx.uppy).toBe(firstUppy);
    });
});
