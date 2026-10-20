import site from './worker.mjs';

// The existing Sites entry remains unchanged for rollback.
const backendOrigin = 'https://grupo-rs-central.lucasbarrosp.chatgpt.site';
const savedReads = new Set(['/api/session','/api/startup-bundle','/api/devices','/api/warehouse','/api/history','/api/maintenance','/api/backups/status','/api/integrations/sync-status','/api/warehouse-costs']);
// Audit events keep the original permission checks and write no business data.
const sessionWrites = new Set(['/api/login','/api/logout','/api/activity','/api/ui-event']);
const denied = (status, error) => Response.json({error}, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const mutation = !['GET','HEAD'].includes(request.method);
    if (mutation && request.headers.get('origin') !== url.origin) return denied(403, 'Origem inválida.');
    if (url.pathname.startsWith('/api/')) {
      // Never enable operational integrations just by opening this test copy.
      if (env.CENTRAL_HOSTING_MODE !== 'production' &&
          !(request.method === 'GET' && savedReads.has(url.pathname)) &&
          !(request.method === 'POST' && sessionWrites.has(url.pathname))) {
        return denied(403, 'Cópia de avaliação: somente dados salvos. Operações e consultas externas estão bloqueadas.');
      }
      // The existing Supabase API checks its canonical host. Only normalize after
      // checking the real browser origin; retain cookies, CSRF and permissions.
      const headers = new Headers(request.headers);
      if (headers.has('origin')) headers.set('origin', backendOrigin);
      const canonical = new URL(url.pathname + url.search, backendOrigin);
      request = new Request(canonical, {method:request.method, headers,
        body:mutation ? request.body : undefined, ...(mutation ? {duplex:'half'} : {})});
    }
    return site.fetch(request, env, ctx);
  }
};
