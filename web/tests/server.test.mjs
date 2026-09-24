import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('preview serves only public assets and never accepts writes or outbound API calls', {timeout:10000}, async t => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], { env: { ...process.env, PORT:'0' }, windowsHide:true, stdio:['ignore','pipe','pipe'] });
  t.after(() => child.kill());
  const output = await Promise.race([once(child.stdout,'data'), once(child,'error').then(([e]) => {throw e;}), once(child,'exit').then(([code]) => {throw Error(`Server exited before ready: ${code}`);})]);
  const url = output[0].toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(url);
  for (const file of ['/', '/app.js', '/domain.js', '/styles.css', '/logo.png']) {
    const response = await fetch(url + file); assert.equal(response.status,200,file);
    assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/);
  }
  assert.equal((await fetch(url + '/package.json')).status,404);
  assert.equal((await fetch(url + '/%2e%2e%2fserver.mjs')).status,404);
  assert.equal((await fetch(url + '/api/stock',{method:'POST',body:'{}'})).status,405);
});
