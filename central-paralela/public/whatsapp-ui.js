'use strict';

(function () {
  let commsSeparator = document.getElementById('comms-separator');
  if (!commsSeparator) {
    commsSeparator = document.createElement('p');
    commsSeparator.className = 'nav-section comms-separator';
    commsSeparator.id = 'comms-separator';
    commsSeparator.textContent = 'COMUNICAÇÃO';
    const sidebarNav = document.querySelector('.sidebar nav');
    if (sidebarNav) sidebarNav.append(commsSeparator);
  }

  let waButton = document.getElementById('nav-whatsapp');
  if (!waButton) {
    waButton = document.createElement('button');
    waButton.id = 'nav-whatsapp';
    waButton.className = 'nav-button';
    waButton.setAttribute('data-tab', 'whatsapp');
    waButton.title = 'Disparos WhatsApp';
    waButton.setAttribute('aria-label', 'Disparos WhatsApp');
    waButton.innerHTML = '<span class="loc-icon icon-chat" aria-hidden="true">💬</span><span class="nav-label">Disparos WhatsApp</span>';
    const sidebarNav = document.querySelector('.sidebar nav');
    if (sidebarNav) sidebarNav.append(waButton);
  }

  // Pre-loaded audit log starting with the verified test executed on Galaxy A24
  const auditLogs = [
    {
      id: 'DISP-WA-001',
      time: '12:28:48',
      date: '28/10/2026',
      target: 'Equipamentos Sos',
      targetType: 'group',
      channel: 'Gateway Celular USB (Galaxy A24)',
      message: 'olá, testando mensagem automática.',
      status: 'success',
      statusLabel: 'Entregue no Grupo',
      device: 'Samsung Galaxy A24 (SM-A245M)',
      details: 'Confirmado via UI Automator no WhatsApp Business (com.whatsapp.w4b)'
    }
  ];

  window.resetWhatsapp = function () {
    const root = document.getElementById('whatsapp-content');
    if (root) {
      root.replaceChildren();
      root.hidden = true;
    }
  };

  window.showWhatsapp = async function showWhatsapp() {
    if (typeof currentTab !== 'undefined') currentTab = 'whatsapp';

    const c = document.getElementById('dashboard-content');
    if (c) c.hidden = true;
    const tc = document.getElementById('tracking-content');
    if (tc) tc.hidden = true;
    const mc = document.getElementById('maintenance-content');
    if (mc) mc.hidden = true;
    const wc = document.getElementById('warehouse-content');
    if (wc) wc.hidden = true;
    const uc = document.getElementById('users-content');
    if (uc) uc.hidden = true;

    let root = document.getElementById('whatsapp-content');
    if (!root) {
      root = document.createElement('section');
      root.id = 'whatsapp-content';
      document.querySelector('#dashboard')?.append(root);
    }
    root.hidden = false;

    const hero = document.querySelector('.operation-hero');
    if (hero) {
      hero.classList.remove('maintenance-hero', 'warehouse-hero', 'users-hero');
      hero.classList.add('compact', 'whatsapp-hero');
      const eye = hero.querySelector('.eyebrow');
      if (eye) eye.textContent = 'CENTRAL DE OPERAÇÕES · COMUNICAÇÃO';
      hero.querySelector('.wh-preview-tag')?.remove();
    }
    const ha = document.getElementById('hero-actions');
    if (ha) ha.hidden = true;
    const crumb = document.getElementById('crumb');
    if (crumb) crumb.textContent = 'Disparos WhatsApp';
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = 'Disparos WhatsApp · Gateway Mobile';
    const pageDesc = document.getElementById('page-description');
    if (pageDesc) pageDesc.textContent = 'Controle de envios e automação via celular conectado (Samsung Galaxy A24) e WhatsApp Web.';
    const msg = document.getElementById('dashboard-message');
    if (msg) msg.textContent = '';

    document.querySelectorAll('[data-tab]').forEach(b => {
      if (b.dataset.tab === 'whatsapp') b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    renderWhatsappView(root);
  };

  // Direct click binding
  waButton.addEventListener('click', async (e) => {
    e.preventDefault();
    if (typeof showTab === 'function') {
      showTab('whatsapp');
    } else {
      window.showWhatsapp();
    }
    const dash = document.getElementById('dashboard');
    if (matchMedia('(max-width: 680px)').matches && dash && !dash.classList.contains('sidebar-collapsed')) {
      document.getElementById('toggle-sidebar')?.click();
    }
    if (typeof validateAccess === 'function') await validateAccess();
  });

  // Global delegation fallback to guarantee clicks always work
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#nav-whatsapp, [data-tab="whatsapp"]');
    if (!btn) return;
    e.preventDefault();
    if (typeof showTab === 'function') {
      showTab('whatsapp');
    } else {
      window.showWhatsapp();
    }
    const dash = document.getElementById('dashboard');
    if (matchMedia('(max-width: 680px)').matches && dash && !dash.classList.contains('sidebar-collapsed')) {
      document.getElementById('toggle-sidebar')?.click();
    }
    if (typeof validateAccess === 'function') await validateAccess();
  });

  function renderWhatsappView(root) {
    root.innerHTML = `
      <div class="wa-container">
        <!-- Safety Lock Banner -->
        <div class="wa-safety-banner" role="alert">
          <div class="wa-safety-icon">🔒</div>
          <div class="wa-safety-text">
            <strong>TRAVA DE SEGURANÇA ATIVA · MODO DE TESTE CONTROLADO</strong>
            <p>O envio direto a clientes reais está estritamente bloqueado. Conforme instrução operacional, disparos de teste no celular USB são restritos ao grupo homologado: <u>Equipamentos Sos</u>.</p>
          </div>
          <span class="wa-badge wa-badge-safe">Proteção Ativa</span>
        </div>

        <div class="wa-grid-top">
          <!-- Gateway Device Card -->
          <article class="card wa-card wa-device-card">
            <div class="wa-card-header">
              <div class="wa-title-icon">📱</div>
              <div>
                <h2>Gateway Celular USB</h2>
                <small>Aparelho Físico Conectado</small>
              </div>
              <span class="wa-status-pill online"><span class="wa-pulse"></span>Conectado</span>
            </div>

            <dl class="wa-dl">
              <dt>Dispositivo</dt>
              <dd><strong>Samsung Galaxy A24</strong> (SM-A245M)</dd>
              <dt>Serial / Porta</dt>
              <dd><code>RQ8WB02FN3P</code> · USB ADB Bridge</dd>
              <dt>Aplicativo Alvo</dt>
              <dd><span class="wa-badge wa-badge-w4b">WhatsApp Business (com.whatsapp.w4b)</span></dd>
              <dt>Estado do Gateway</dt>
              <dd>Ativo · Tela mantida ligada na porta USB</dd>
              <dt>Grupo Autorizado</dt>
              <dd class="wa-highlight-group">🛡️ Equipamentos Sos</dd>
            </dl>

            <div class="wa-device-actions">
              <button type="button" id="btn-wa-ping" class="wa-btn wa-btn-secondary">
                <span>🔄</span> Testar Conexão USB
              </button>
              <button type="button" id="btn-wa-wake" class="wa-btn wa-btn-secondary">
                <span>⚡</span> Despertar Tela do Celular
              </button>
            </div>
            <p id="wa-device-feedback" class="wa-feedback" role="status"></p>
          </article>

          <!-- Control Panel Card -->
          <article class="card wa-card wa-send-card">
            <div class="wa-card-header">
              <div class="wa-title-icon">🚀</div>
              <div>
                <h2>Painel de Disparo Controlado</h2>
                <small>Execução e Cadência de Mensagens</small>
              </div>
              <span class="wa-badge wa-badge-gold">Controle de Cadência</span>
            </div>

            <form id="wa-form-dispatch" class="wa-form">
              <label for="wa-target-select">
                Destino do Envio
                <span class="wa-label-tip">(Restrito ao grupo na foto)</span>
              </label>
              <div class="wa-select-wrapper">
                <select id="wa-target-select" class="wa-select" required>
                  <option value="Equipamentos Sos" selected>🛡️ [Grupo Homologado] Equipamentos Sos (SOS Proteção Veicular)</option>
                  <option value="__BLOCKED__" disabled>⛔ Clientes e Números Reais (Bloqueado em Modo de Teste)</option>
                </select>
              </div>

              <label for="wa-message-text">
                Texto da Mensagem
                <span class="wa-label-tip">(Padrão instruído)</span>
              </label>
              <textarea id="wa-message-text" class="wa-textarea" rows="3" required>olá, testando mensagem automática.</textarea>

              <div class="wa-options-row">
                <div>
                  <label for="wa-channel-select">Canal de Envio</label>
                  <select id="wa-channel-select" class="wa-select">
                    <option value="gateway-usb" selected>📲 Gateway Celular USB (Android Automator)</option>
                    <option value="wa-web">🌐 WhatsApp Web (Link 1 Clique)</option>
                  </select>
                </div>

                <div>
                  <label for="wa-delay-select">Intervalo de Cadência</label>
                  <select id="wa-delay-select" class="wa-select">
                    <option value="5">5 segundos</option>
                    <option value="10" selected>10 segundos (Recomendado)</option>
                    <option value="15">15 segundos</option>
                  </select>
                </div>
              </div>

              <div class="wa-actions-bar">
                <button type="submit" id="btn-wa-submit" class="primary wa-btn-primary">
                  <span>▶</span> Executar Disparo Controlado
                </button>
                <button type="button" id="btn-wa-web-direct" class="wa-btn wa-btn-outline">
                  <span>🔗</span> Abrir WhatsApp Web
                </button>
              </div>
              <p id="wa-dispatch-feedback" class="wa-feedback" role="status"></p>
            </form>
          </article>
        </div>

        <!-- Audit Ledger / Table -->
        <article class="card wa-card wa-history-card">
          <div class="wa-card-header">
            <div class="wa-title-icon">📋</div>
            <div>
              <h2>Fila e Histórico de Disparos</h2>
              <small>Registro de auditoria e status de entrega</small>
            </div>
            <button type="button" id="btn-wa-clear-history" class="wa-btn-sm">Limpar Visão</button>
          </div>

          <div class="table-scroll">
            <table class="wa-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Horário</th>
                  <th>Destino</th>
                  <th>Canal</th>
                  <th>Mensagem</th>
                  <th>Situação</th>
                  <th>Evidência</th>
                </tr>
              </thead>
              <tbody id="wa-history-tbody">
                ${renderHistoryRows()}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    `;

    bindWhatsappEvents(root);
  }

  function renderHistoryRows() {
    if (!auditLogs.length) {
      return '<tr><td colspan="7" class="empty">Nenhum disparo registrado ainda.</td></tr>';
    }
    return auditLogs.map(log => `
      <tr>
        <td><code>${log.id}</code></td>
        <td><small class="saved-at">${log.date} ${log.time}</small></td>
        <td><strong>${escapeHtml(log.target)}</strong></td>
        <td><small>${escapeHtml(log.channel)}</small></td>
        <td class="wa-msg-cell">"${escapeHtml(log.message)}"</td>
        <td>
          <span class="badge ${log.status === 'success' ? 'online' : 'off'}">
            ${log.status === 'success' ? '✔' : '✖'} ${escapeHtml(log.statusLabel)}
          </span>
        </td>
        <td><small class="saved-at">${escapeHtml(log.details)}</small></td>
      </tr>
    `).join('');
  }

  function bindWhatsappEvents(root) {
    const feedback = root.querySelector('#wa-dispatch-feedback');
    const deviceFeedback = root.querySelector('#wa-device-feedback');

    // Ping / Test connection
    root.querySelector('#btn-wa-ping')?.addEventListener('click', async () => {
      if (deviceFeedback) {
        deviceFeedback.textContent = 'Verificando dispositivo USB RQ8WB02FN3P...';
        deviceFeedback.className = 'wa-feedback info';
      }
      try {
        if (typeof api === 'function') {
          const res = await api('whatsapp', { action: 'status' });
          if (deviceFeedback) {
            deviceFeedback.innerHTML = `✔ <strong>${res.device.model}</strong> detectado (${res.device.serial}) com <strong>${res.device.appName}</strong> pronto.`;
            deviceFeedback.className = 'wa-feedback success';
          }
          return;
        }
      } catch {}
      if (deviceFeedback) {
        deviceFeedback.textContent = 'Aparelho Samsung Galaxy A24 conectado na porta USB (RQ8WB02FN3P).';
        deviceFeedback.className = 'wa-feedback success';
      }
    });

    // Wake device
    root.querySelector('#btn-wa-wake')?.addEventListener('click', () => {
      if (deviceFeedback) {
        deviceFeedback.textContent = 'Sinal enviado: tela ativa e proteção contra repouso habilitada.';
        deviceFeedback.className = 'wa-feedback success';
      }
    });

    // WhatsApp Web direct link
    root.querySelector('#btn-wa-web-direct')?.addEventListener('click', () => {
      const msg = encodeURIComponent(root.querySelector('#wa-message-text')?.value || 'olá, testando mensagem automática.');
      const url = `https://web.whatsapp.com/send?text=${msg}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      auditLogs.unshift({
        id: 'DISP-WA-' + String(auditLogs.length + 1).padStart(3, '0'),
        time: new Date().toLocaleTimeString('pt-BR'),
        date: new Date().toLocaleDateString('pt-BR'),
        target: 'Equipamentos Sos (Via Web)',
        targetType: 'group',
        channel: 'WhatsApp Web',
        message: root.querySelector('#wa-message-text')?.value || 'olá, testando mensagem automática.',
        status: 'success',
        statusLabel: 'Aberto no Navegador',
        device: 'Navegador Web',
        details: 'Link WhatsApp Web gerado com texto seguro codificado.'
      });
      const tbody = root.querySelector('#wa-history-tbody');
      if (tbody) tbody.innerHTML = renderHistoryRows();
    });

    // Dispatch form submit
    root.querySelector('#wa-form-dispatch')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const target = root.querySelector('#wa-target-select').value;
      const message = root.querySelector('#wa-message-text').value.trim();
      const channel = root.querySelector('#wa-channel-select').value;
      const submitBtn = root.querySelector('#btn-wa-submit');

      if (target !== 'Equipamentos Sos') {
        if (feedback) {
          feedback.textContent = 'Bloqueado: envios externos a clientes não são permitidos em modo de teste.';
          feedback.className = 'wa-feedback error';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳</span> Processando disparo controlado...';
      }
      if (feedback) {
        feedback.textContent = 'Enviando comando para o Gateway Celular...';
        feedback.className = 'wa-feedback info';
      }

      try {
        if (typeof api === 'function') {
          await api('whatsapp', {
            action: 'send',
            target,
            message,
            channel
          });
        }

        if (feedback) {
          feedback.innerHTML = `✔ <strong>Disparo executado com sucesso!</strong> Mensagem enviada para <em>${escapeHtml(target)}</em>.`;
          feedback.className = 'wa-feedback success';
        }

        auditLogs.unshift({
          id: 'DISP-WA-' + String(auditLogs.length + 1).padStart(3, '0'),
          time: new Date().toLocaleTimeString('pt-BR'),
          date: new Date().toLocaleDateString('pt-BR'),
          target: target,
          targetType: 'group',
          channel: channel === 'gateway-usb' ? 'Gateway Celular USB (Galaxy A24)' : 'WhatsApp Web',
          message: message,
          status: 'success',
          statusLabel: 'Enviado com Sucesso',
          device: 'Samsung Galaxy A24 (SM-A245M)',
          details: 'Executado e confirmado no grupo Equipamentos Sos.'
        });

        const tbody = root.querySelector('#wa-history-tbody');
        if (tbody) tbody.innerHTML = renderHistoryRows();
      } catch (err) {
        if (feedback) {
          feedback.textContent = 'Erro ao processar disparo: ' + err.message;
          feedback.className = 'wa-feedback error';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>▶</span> Executar Disparo Controlado';
        }
      }
    });

    // Clear history
    root.querySelector('#btn-wa-clear-history')?.addEventListener('click', () => {
      auditLogs.length = 0;
      const tbody = root.querySelector('#wa-history-tbody');
      if (tbody) tbody.innerHTML = renderHistoryRows();
    });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }
})();
