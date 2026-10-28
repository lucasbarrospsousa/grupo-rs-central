/**
 * WhatsApp Local Gateway Daemon
 * Grupo RS Central / Sideracode
 *
 * Runs locally on the Windows workstation where Samsung Galaxy A24 (RQ8WB02FN3P)
 * is plugged in via USB.
 *
 * 1. Provides local HTTP bridge on http://127.0.0.1:5038 (CORS + Private Network Access)
 * 2. Connects to Cloudflare Worker queue for remote dispatch synchronization
 * 3. Monitors USB connection and reports live status
 */

import http from 'http';
import { getDeviceStatus, sendDirectMessage, normalizePhone } from './whatsapp-gateway.mjs';

const PORT = 5038;
const WORKER_URL = 'https://central-paralela.sinderacode.workers.dev/api/whatsapp';

let isProcessing = false;

// 1. Local HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS & Private Network Access headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-csrf-token, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/status' || url.pathname === '/check-usb') {
    const status = getDeviceStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  if (url.pathname === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const phone = payload.phone || payload.target;
        const name = payload.name || '';
        const message = payload.message || '';

        const status = getDeviceStatus();
        if (!status.ok) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: status.error || 'Celular desconectado da USB.' }));
          return;
        }

        isProcessing = true;
        const result = await sendDirectMessage({ phone, name, message });
        isProcessing = false;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        isProcessing = false;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint não encontrado no Gateway USB.' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[WhatsApp Gateway Daemon] Ativo e escutando em http://127.0.0.1:${PORT}`);
});

// 2. Worker Queue Polling & Heartbeat Loop
async function heartbeatAndPoll() {
  if (isProcessing) return;

  try {
    const status = getDeviceStatus();

    // Send heartbeat
    await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'gateway-heartbeat',
        deviceStatus: status
      })
    }).catch(() => {});

    if (!status.ok) return;

    // Poll for pending jobs from web frontend
    const pollRes = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gateway-poll' })
    }).catch(() => null);

    if (pollRes && pollRes.ok) {
      const data = await pollRes.json();
      if (data.job) {
        console.log(`[WhatsApp Gateway Daemon] Processando job em fila: ${data.job.id} (${data.job.name} - ${data.job.phone})`);
        isProcessing = true;
        try {
          const result = await sendDirectMessage({
            phone: data.job.phone,
            name: data.job.name,
            message: data.job.message
          });
          isProcessing = false;

          await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'gateway-report',
              id: data.job.id,
              status: 'sent',
              result
            })
          }).catch(() => {});
        } catch (jobErr) {
          isProcessing = false;
          console.error(`[WhatsApp Gateway Daemon] Erro no job ${data.job.id}:`, jobErr.message);
          await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'gateway-report',
              id: data.job.id,
              status: 'failed',
              error: jobErr.message
            })
          }).catch(() => {});
        }
      }
    }
  } catch (loopErr) {
    // Non-fatal loop error
  }
}

// Run heartbeat/poll every 2.5 seconds
setInterval(heartbeatAndPoll, 2500);
// Initial run
heartbeatAndPoll();
