/**
 * Tests for picturethis sub-tool logic.
 * Since picturethis uses Vue which we can't easily load in Node,
 * we test the pure business logic functions extracted here.
 */

describe('picturethis business logic', () => {

    // Simulate the upload queue logic from the mixin
    function createUploadQueue() {
        return {
            queue: [],
            to_upload: 0,
            upload_delay: 100,
            max_upload_retries: 3,

            addUpload(u) {
                u.r.retry_count = 0;
                this.queue.push(u);
                this.to_upload++;
            },

            getNextIndex() {
                let nextIdx = -1;
                let isUploading = false;
                for (let k = 0; k < this.queue.length; k++) {
                    const v = this.queue[k];
                    if (v.r.status === 'uploading') { isUploading = true; }
                    else if (v.r.status !== 'uploaded' && v.r.status !== 'failed' && nextIdx === -1) { nextIdx = k; }
                }
                return { nextIdx, isUploading };
            },

            handleError(o) {
                o.r.retry_count = (o.r.retry_count || 0) + 1;
                if (o.r.retry_count >= this.max_upload_retries) {
                    o.r.status = 'failed';
                    this.to_upload--;
                } else {
                    o.r.status = 'waiting';
                }
                this.upload_delay = Math.min(this.upload_delay + 2000, 15000);
            },

            handleSuccess(o, status) {
                this.upload_delay = 100;
                o.r.status = (status === 'OK') ? 'uploaded' : 'failed';
                this.to_upload--;
            }
        };
    }

    test('addUpload increments to_upload', () => {
        const q = createUploadQueue();
        q.addUpload({ r: { status: '' }, data: {} });
        expect(q.to_upload).toBe(1);
        expect(q.queue.length).toBe(1);
        expect(q.queue[0].r.retry_count).toBe(0);
    });

    test('getNextIndex finds waiting item', () => {
        const q = createUploadQueue();
        q.addUpload({ r: { status: 'waiting' }, data: {} });
        const { nextIdx, isUploading } = q.getNextIndex();
        expect(nextIdx).toBe(0);
        expect(isUploading).toBe(false);
    });

    test('getNextIndex detects uploading item', () => {
        const q = createUploadQueue();
        q.queue.push({ r: { status: 'uploading' }, data: {} });
        q.queue.push({ r: { status: 'waiting' }, data: {} });
        const { nextIdx, isUploading } = q.getNextIndex();
        expect(isUploading).toBe(true);
        expect(nextIdx).toBe(1);
    });

    test('getNextIndex skips uploaded and failed items', () => {
        const q = createUploadQueue();
        q.queue.push({ r: { status: 'uploaded' }, data: {} });
        q.queue.push({ r: { status: 'failed' }, data: {} });
        q.queue.push({ r: { status: 'waiting' }, data: {} });
        const { nextIdx } = q.getNextIndex();
        expect(nextIdx).toBe(2);
    });

    test('getNextIndex returns -1 when all done', () => {
        const q = createUploadQueue();
        q.queue.push({ r: { status: 'uploaded' }, data: {} });
        q.queue.push({ r: { status: 'failed' }, data: {} });
        const { nextIdx } = q.getNextIndex();
        expect(nextIdx).toBe(-1);
    });

    test('handleError retries when under max', () => {
        const q = createUploadQueue();
        const o = { r: { status: 'uploading', retry_count: 0 }, data: {} };
        q.to_upload = 1;
        q.handleError(o);
        expect(o.r.status).toBe('waiting');
        expect(o.r.retry_count).toBe(1);
        expect(q.to_upload).toBe(1); // not decremented
    });

    test('handleError marks failed at max retries', () => {
        const q = createUploadQueue();
        const o = { r: { status: 'uploading', retry_count: 2 }, data: {} };
        q.to_upload = 1;
        q.handleError(o);
        expect(o.r.status).toBe('failed');
        expect(o.r.retry_count).toBe(3);
        expect(q.to_upload).toBe(0); // decremented
    });

    test('handleError backs off delay with cap', () => {
        const q = createUploadQueue();
        q.upload_delay = 14000;
        const o = { r: { status: 'uploading', retry_count: 0 }, data: {} };
        q.to_upload = 1;
        q.handleError(o);
        expect(q.upload_delay).toBe(15000); // capped
    });

    test('handleSuccess sets uploaded on OK', () => {
        const q = createUploadQueue();
        const o = { r: { status: 'uploading' }, data: {} };
        q.to_upload = 1;
        q.handleSuccess(o, 'OK');
        expect(o.r.status).toBe('uploaded');
        expect(q.to_upload).toBe(0);
    });

    test('handleSuccess sets failed on non-OK', () => {
        const q = createUploadQueue();
        const o = { r: { status: 'uploading' }, data: {} };
        q.to_upload = 1;
        q.handleSuccess(o, 'ERROR');
        expect(o.r.status).toBe('failed');
    });

    test('handleSuccess resets delay', () => {
        const q = createUploadQueue();
        q.upload_delay = 5000;
        const o = { r: { status: 'uploading' }, data: {} };
        q.to_upload = 1;
        q.handleSuccess(o, 'OK');
        expect(q.upload_delay).toBe(100);
    });
});

describe('picturethis file description', () => {
    test('generates CC-BY-SA-4.0 license', () => {
        // Simulates getNewFileDescription
        const desc = (label) => `{{Information\n|description=${label}\n|source={{self-made}}\n|author=~~~\n}}\n{{CC-BY-SA-4.0}}`;
        const result = desc('Test building');
        expect(result).toContain('CC-BY-SA-4.0');
        expect(result).toContain('Test building');
        expect(result).not.toContain('CC-BY-SA-3.0');
    });

    test('filename replaces slashes with hyphens', () => {
        const getNewFileName = (label) => `${label.replace(/\//g, '-')}.jpg`;
        expect(getNewFileName('Church of St. Mary/Main')).toBe('Church of St. Mary-Main.jpg');
        expect(getNewFileName('Normal name')).toBe('Normal name.jpg');
        expect(getNewFileName('a/b/c')).toBe('a-b-c.jpg');
    });

    test('icon URL uses width-only scaling', () => {
        // Simulates getIconURL
        const getIconURL = (file) => `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(file)}?width=64`;
        const url = getIconURL('Test photo.jpg');
        expect(url).toContain('width=64');
        expect(url).not.toContain('height=');
        expect(url).toContain('Test%20photo.jpg');
    });
});
