import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../hosting/cloudflare-entry.mjs';

test('Cloudflare evaluation preserves authenticated transport and denies external/operational routes', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({url:String(url),options});
    return Response.json({ok:true}, {headers:{'Set-Cookie':'central_session=fixture; HttpOnly; Secure; SameSite=Lax'}});
  };
  const env = {CENTRAL_BRIDGE_TOKEN:'fixture-secret', ASSETS:{fetch:async()=>new Response('original interface')}};
  const origin = 'https://evaluation.workers.dev';
  const post = (path, source=origin) => new Request(origin+path,{method:'POST',headers:{origin:source,'content-type':'application/json','cookie':'central_session=fixture','x-csrf-token':'fixture-csrf'},body:'{"username":"fixture","password":"synthetic"}'});
  try {
    const response = await worker.fetch(post('/api/login'),env);
    assert.equal(response.status,200);
    assert.match(response.headers.get('set-cookie'),/HttpOnly/);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(calls[0].options.headers.get('origin'),'https://grupo-rs-central.lucasbarrosp.chatgpt.site');
    assert.equal(calls[0].options.headers.get('x-central-bridge'),'fixture-secret');
    assert.equal(calls[0].options.headers.get('x-csrf-token'),'fixture-csrf');
    assert.equal(calls[0].options.headers.get('cookie'),'central_session=fixture');
    assert.match(calls[0].url,/supabase.co\/functions\/v1\/central-api\/api\/login$/);
    for (const source of ['https://evil.test','null','']) assert.equal((await worker.fetch(post('/api/login',source),env)).status,403);
    for (const path of ['/api/warehouse-costs','/api/devices','/api/install','/api/warehouse-activation-send']) assert.equal((await worker.fetch(post(path),env)).status,403);
    for (const path of ['/api/integrations','/api/maintenance-refresh','/api/deployment-token','/api/unknown']) assert.equal((await worker.fetch(new Request(origin+path),env)).status,403);
    assert.equal(calls.length,1);
    await worker.fetch(new Request(origin+'/api/startup-bundle?branch=imperatriz'),env);
    assert.equal(calls.length,2);
    assert.match(calls[1].url,/branch=imperatriz$/);
    assert.equal((await worker.fetch(new Request(origin+'/styles.css'),env)).status,200);
    assert.equal(calls.length,2);
    assert.equal((await worker.fetch(post('/api/login'),{...env,CENTRAL_BRIDGE_TOKEN:''})).status,503);
    assert.equal(calls.length,2);
    for (const path of ['/api/backups/status','/api/integrations/sync-status','/api/warehouse-costs']) assert.equal((await worker.fetch(new Request(origin+path),env)).status,200);
    assert.equal((await worker.fetch(post('/api/ui-event'),env)).status,200);
    assert.equal(calls.length,6);
  } finally { globalThis.fetch=original; }
});
