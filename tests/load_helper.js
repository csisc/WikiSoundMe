const { createTestEnv, loadScript } = require('./setup');

function loadAll() {
    const env = createTestEnv();
    const ctx = loadScript(env.sandbox, 'wsm_comm.js');
    loadScript(ctx, 'main_v3.js');
    loadScript(ctx, 'wsm_layer_base.js');
    // Layer classes (order matters: base classes before subclasses)
    loadScript(ctx, 'wsm_layers/wikimedia.js');
    loadScript(ctx, 'wsm_layers/wikipedia.js');
    loadScript(ctx, 'wsm_layers/commons.js');
    loadScript(ctx, 'wsm_layers/wikidata_image.js');
    loadScript(ctx, 'wsm_layers/wikidata_no_image.js');
    loadScript(ctx, 'wsm_layers/flickr.js');
    loadScript(ctx, 'wsm_layers/mixnmatch.js');
    loadScript(ctx, 'wsm_layers/mixnmatch_lc.js');
    loadScript(ctx, 'wsm_layers/geojson.js');
    loadScript(ctx, 'wsm_layers/overpass.js');
    loadScript(ctx, 'wsm_layers/mapillary.js');
    loadScript(ctx, 'wsm_layers/openplaques.js');
    loadScript(ctx, 'wsm_layers/inaturalist.js');
    loadScript(ctx, 'wsm_layers/panoramax.js');
    loadScript(ctx, 'wsm_layers/bildwunsch.js');
    loadScript(ctx, 'wsm_layers/register.js');
    // App modules
    loadScript(ctx, 'wsm_popup.js');
    loadScript(ctx, 'wsm_upload.js');
    loadScript(ctx, 'wsm_map.js');
    loadScript(ctx, 'wsm_search.js');
    ctx.wikishootme.tt = { t: function (key) { return key; } };
    return ctx;
}

module.exports = { loadAll };
