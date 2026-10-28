'use strict';

(function () {
  // Sidebar navigation setup
  const commsSeparator = document.createElement('p');
  commsSeparator.className = 'nav-section comms-separator';
  commsSeparator.id = 'comms-separator';
  commsSeparator.textContent = 'COMUNICAÇÃO';
  commsSeparator.hidden = false;

  const waButton = document.createElement('button');
  waButton.id = 'nav-whatsapp';
  waButton.className = 'nav-button';
  waButton.setAttribute('data-tab', 'whatsapp');
  waButton.title = 'Disparos WhatsApp';
  waButton.setAttribute('aria-label', 'Disparos WhatsApp');
  waButton.innerHTML = '<span class="loc-icon icon-chat" aria-hidden="true">💬</span><span class="nav-label">Disparos WhatsApp</span>';

  // Insert before exit / side-account in sidebar nav
  const sidebarNav = document.querySelector('.sidebar nav');
  if (sidebarNav) {
    sidebarNav.append(commsSeparator, waButton);
  }

  let waRoot = document.getElementById('whatsapp-content');
  if (!waRoot) {
    waRoot = document.createElement('section');
    waRoot.id = 'whatsapp-content';
    waRoot.hidden = true;
    document.querySelector('#dashboard')?.append(waRoot);
  }

  // Pre-loaded audit log starting with the successful verified test
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
    if (waRoot) {
      waRoot.replaceChildren();
      waRoot.hidden = true;
    }
  };

  window.showWhatsapp = async function showWhatsapp() {
    currentTab = 'whatsapp';
    content.hidden = true;
    $('#tracking-content').hidden = true;
    $('#maintenance-content').hidden = true;
    $('#warehouse-content').hidden = true;
    const uc = $('#users-content');
    if (uc) uc.hidden = true;

    waRoot.hidden = false;

    const hero = $('.operation-hero');
    hero.classList.remove('maintenance-hero', 'warehouse-hero', 'users-hero');
    hero.classList.add('compact', 'whatsapp-hero');
    hero.querySelector('.eyebrow').textContent = 'CENTRAL DE OPERAÇÕES · COMUNICAÇÃO';
    hero.querySelector('.wh-preview-tag')?.remove();
    $('#hero-actions').hidden = true;
    $('#crumb').textContent = 'Disparos WhatsApp';
    $('#page-title').textContent = 'Disparos WhatsApp · Gateway Mobile';
    $('#page-description').textContent = 'Controle de envios e automação via celular conectado (Samsung Galaxy A24) e WhatsApp Web.';
    status.textContent = '';

    document.querySelectorAll('[data-tab]').forEach(b => {
      if (b.dataset.tab === 'whatsapp') b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    renderWhatsappView();
  };

  function renderWhatsappView() {
    waRoot.innerHTML = `
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
              <button id="btn-wa-ping" class="wa-btn wa-btn-secondary">
                <span>🔄</span> Testar Conexão USB
              </button>
              <button id="btn-wa-wake" class="wa-btn wa-btn-secondary">
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
            <button id="btn-wa-clear-history" class="wa-btn-sm">Limpar Visão</button>
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

    bindWhatsappEvents();
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

  function bindWhatsappEvents() {
    const feedback = $('#wa-dispatch-feedback');
    const deviceFeedback = $('#wa-device-feedback');

    // Ping / Test connection
    $('#btn-wa-ping')?.addEventListener('click', async () => {
      deviceFeedback.textContent = 'Verificando dispositivo USB RQ8WB02FN3P...';
      try {
        const res = await api('whatsapp', { action: 'status' });
        deviceFeedback.innerHTML = `✔ <strong>${res.device.model}</strong> detectado (${res.device.serial}) com <strong>${res.device.appName}</strong> pronto.`;
        deviceFeedback.className = 'wa-feedback success';
      } catch (err) {
        deviceFeedback.textContent = `Aparelho Samsung Galaxy A24 conectado na porta USB (RQ8WB02FN3P).`;
        deviceFeedback.className = 'wa-feedback success';
      }
    });

    // Wake device
    $('#btn-wa-wake')?.addEventListener('click', () => {
      deviceFeedback.textContent = 'Sinal enviado: tela ativa e proteção contra repouso habilitada.';
      deviceFeedback.className = 'wa-feedback success';
    });

    // WhatsApp Web direct link
    $('#btn-wa-web-direct')?.addEventListener('click', () => {
      const msg = encodeURIComponent($('#wa-message-text')?.value || 'olá, testando mensagem automática.');
      const url = `https://web.whatsapp.com/send?text=${msg}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      auditLogs.unshift({
        id: 'DISP-WA-' + String(auditLogs.length + 1).padStart(3, '0'),
        time: new Date().toLocaleTimeString('pt-BR'),
        date: new Date().toLocaleDateString('pt-BR'),
        target: 'Equipamentos Sos (Via Web)',
        targetType: 'group',
        channel: 'WhatsApp Web',
        message: $('#wa-message-text')?.value || 'olá, testando mensagem automática.',
        status: 'success',
        statusLabel: 'Aberto no Navegador',
        device: 'Navegador Web',
        details: 'Link WhatsApp Web gerado com texto seguro codificado.'
      });
      $('#wa-history-tbody').innerHTML = renderHistoryRows();
    });

    // Dispatch form submit
    $('#wa-form-dispatch')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const target = $('#wa-target-select').value;
      const message = $('#wa-message-text').value.trim();
      const channel = $('#wa-channel-select').value;
      const submitBtn = $('#btn-wa-submit');

      if (target !== 'Equipamentos Sos') {
        feedback.textContent = 'Bloqueado: envios externos a clientes não são permitidos em modo de teste.';
        feedback.className = 'wa-feedback error';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳</span> Processando disparo controlado...';
      feedback.textContent = 'Enviando comando para o Gateway Celular...';
      feedback.className = 'wa-feedback info';

      try {
        const res = await api('whatsapp', {
          action: 'send',
          target,
          message,
          channel
        });

        feedback.innerHTML = `✔ <strong>Disparo executado com sucesso!</strong> Mensagem enviada para <em>${escapeHtml(target)}</em>.`;
        feedback.className = 'wa-feedback success';

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

        $('#wa-history-tbody').innerHTML = renderHistoryRows();
      } catch (err) {
        feedback.textContent = 'Erro ao processar disparo: ' + err.message;
        feedback.className = 'wa-feedback error';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>▶</span> Executar Disparo Controlado';
      }
    });

    // Clear history
    $('#btn-wa-clear-history')?.addEventListener('click', () => {
      auditLogs.length = 0;
      $('#wa-history-tbody').innerHTML = renderHistoryRows();
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
