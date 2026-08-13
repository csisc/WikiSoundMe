const { createTestEnv, loadScript } = require('./setup');

let ctx;

beforeEach(() => {
    const env = createTestEnv();
    ctx = loadScript(env.sandbox, 'wsm_comm.js');
});

describe('wsm_comm', () => {
    test('storeKey stores value in localStorage', () => {
        ctx.wsm_comm.storeKey('test_key', 'test_value');
        expect(ctx.window.localStorage.getItem('test_key')).toBe('test_value');
    });

    test('getValue retrieves stored value', () => {
        ctx.wsm_comm.storeKey('foo', 'bar');
        expect(ctx.wsm_comm.getValue('foo')).toBe('bar');
    });

    test('getValue returns null for missing key', () => {
        expect(ctx.wsm_comm.getValue('nonexistent')).toBeNull();
    });

    test('removeKey removes stored value', () => {
        ctx.wsm_comm.storeKey('foo', 'bar');
        ctx.wsm_comm.removeKey('foo');
        expect(ctx.wsm_comm.getValue('foo')).toBeNull();
    });

    test('hasKey returns true for existing key', () => {
        ctx.wsm_comm.storeKey('exists', 'value');
        expect(ctx.wsm_comm.hasKey('exists')).toBe(true);
    });

    test('hasKey returns false for missing key', () => {
        expect(ctx.wsm_comm.hasKey('missing')).toBe(false);
    });

    test('isLoggedIn returns false by default', () => {
        expect(ctx.wsm_comm.isLoggedIn()).toBe(false);
    });

    test('storeCurrentView stores JSON string', () => {
        const arr = ['lat=52', 'lng=0'];
        ctx.wsm_comm.storeCurrentView(arr);
        expect(ctx.wsm_comm.getValue('last_view_params')).toBe(JSON.stringify(arr));
    });

    test('is_app defaults to false', () => {
        expect(ctx.wsm_comm.is_app).toBe(false);
    });

    test('api_v3 URL is set correctly', () => {
        expect(ctx.wsm_comm.api_v3).toContain('api_v3.php');
    });
});
