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

  // Pre-loaded audit log including the 3 real tests executed on the device
  const auditLogs = [
    {
      id: 'DISP-WA-004',
      time: '13:25:46',
      date: '28/10/2026',
      target: 'Dnilson Técnico (+55 99 99651-5160)',
      targetType: 'contact',
      channel: 'Gateway Celular USB (Galaxy A24)',
      message: 'Olá, eu estou mandando essa mensagem de teste, não precisa ter retorno',
      variant: 'Variante 3',
      status: 'success',
      statusLabel: 'Enviado com Sucesso',
      device: 'Samsung Galaxy A24 (SM-A245M)',
      details: 'Confirmado no WhatsApp Business (com.whatsapp.w4b)'
    },
    {
      id: 'DISP-WA-003',
      time: '13:24:58',
      date: '28/10/2026',
      target: 'Lucas Técnico (+55 99 98414-5352)',
      targetType: 'contact',
      channel: 'Gateway Celular USB (Galaxy A24)',
      message: 'Olá, eu estou mandando essa mensagem de teste não precisa ter retorno',
      variant: 'Variante 2',
      status: 'success',
      statusLabel: 'Enviado com Sucesso',
      device: 'Samsung Galaxy A24 (SM-A245M)',
      details: 'Confirmado no WhatsApp Business (com.whatsapp.w4b)'
    },
    {
      id: 'DISP-WA-002',
      time: '13:24:38',
      date: '28/10/2026',
      target: 'Ricardo Gerente (+55 99 98427-4848)',
      targetType: 'contact',
      channel: 'Gateway Celular USB (Galaxy A24)',
      message: 'Olá eu estou mandando essa mensagem de teste não precisa ter retorno',
      variant: 'Variante 1',
      status: 'success',
      statusLabel: 'Enviado com Sucesso',
      device: 'Samsung Galaxy A24 (SM-A245M)',
      details: 'Confirmado no WhatsApp Business (com.whatsapp.w4b)'
    },
    {
      id: 'DISP-WA-001',
      time: '12:28:48',
      date: '28/10/2026',
      target: 'Equipamentos Sos (Grupo de Teste)',
      targetType: 'group',
      channel: 'Gateway Celular USB (Galaxy A24)',
      message: 'olá, testando mensagem automática.',
      variant: 'Padrão Homologado',
      status: 'success',
      statusLabel: 'Entregue no Grupo',
      device: 'Samsung Galaxy A24 (SM-A245M)',
      details: 'Confirmado via UI Automator no WhatsApp Business (com.whatsapp.w4b)'
    }
  ];

  let batchState = {
    running: false,
    timer: null,
    countdownTimer: null,
    secondsLeft: 0,
    currentIndex: 0
  };

  window.resetWhatsapp = function () {
    if (batchState.timer) clearTimeout(batchState.timer);
    if (batchState.countdownTimer) clearInterval(batchState.countdownTimer);
    batchState.running = false;
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
    if (pageDesc) pageDesc.textContent = 'Disparos controlados com alternância de mensagens e intervalo dinâmico anti-bloqueio (1, 3 e 5 min).';
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

  // Global delegation fallback
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
        <!-- Safety & Pacing Banner -->
        <div class="wa-safety-banner" role="alert">
          <div class="wa-safety-icon">🛡️</div>
          <div class="wa-safety-text">
            <strong>DISPARO CONTROLADO ANTI-BLOQUEIO · CADÊNCIA DINÂMICA (1 min, 3 min e 5 min)</strong>
            <p>O sistema processa a lista linha a linha, alternando entre as 3 variações de mensagem para que não haja padrão repetitivo, e aplicando intervalos variáveis aleatórios de 1 a 5 minutos entre cada envio.</p>
          </div>
          <span class="wa-pacing-pill">Proteção Anti-Ban Ativa</span>
        </div>

        <!-- Main Configuration Card: Telefone/Nome & Mensagem Sugerida -->
        <article class="wa-card wa-campaign-card">
          <div class="wa-card-header">
            <div class="wa-title-icon">📝</div>
            <div>
              <h2>Painel de Disparo em Lote</h2>
              <small>Configuração da lista de contatos e variações de texto</small>
            </div>
            <div class="wa-device-status-badge">
              <span class="wa-status-pill online"><span class="wa-pulse"></span>Galaxy A24 (USB Conectado)</span>
            </div>
          </div>

          <form id="wa-form-batch" class="wa-form">
            <div class="wa-grid-inputs">
              <!-- Left Column: telefone/nome -->
              <div class="wa-input-col">
                <label for="wa-input-contacts">
                  telefone/nome
                  <span class="wa-label-tip">(1 por linha: Telefone e Nome lado a lado)</span>
                </label>
                <p class="wa-hint">O dispositivo iniciará nova conversa e registrará o contato para cada linha:</p>
                <textarea id="wa-input-contacts" class="wa-textarea wa-textarea-contacts" rows="9" required spellcheck="false">99 8427-4848 Ricardo Gerente
99 8414-5352 Lucas Técnico
99 9651-5160 Dnilson Técnico</textarea>
                <small class="wa-hint">Formato aceito: <code>99 8427-4848 Nome do Contato</code> ou <code>+55 99 98427-4848 Nome</code></small>
              </div>

              <!-- Right Column: mensagem sugerida + 3 variantes -->
              <div class="wa-input-col">
                <label>
                  mensagem sugerida e variações
                  <span class="wa-label-tip">(Alternadas aleatoriamente a cada contato)</span>
                </label>
                <p class="wa-hint">Cada contato da lista receberá uma variação diferente para não criar padrão:</p>
                <div class="wa-var-container">
                  <div class="wa-var-item">
                    <span class="wa-var-num">1</span>
                    <textarea id="wa-msg-var-1" class="wa-textarea wa-var-input" rows="2" required>Olá eu estou mandando essa mensagem de teste não precisa ter retorno</textarea>
                  </div>
                  <div class="wa-var-item">
                    <span class="wa-var-num">2</span>
                    <textarea id="wa-msg-var-2" class="wa-textarea wa-var-input" rows="2" required>Olá, eu estou mandando essa mensagem de teste não precisa ter retorno</textarea>
                  </div>
                  <div class="wa-var-item">
                    <span class="wa-var-num">3</span>
                    <textarea id="wa-msg-var-3" class="wa-textarea wa-var-input" rows="2" required>Olá, eu estou mandando essa mensagem de teste, não precisa ter retorno</textarea>
                  </div>
                </div>
              </div>
            </div>

            <!-- Controls & Pacing Row -->
            <div class="wa-options-row">
              <div>
                <label for="wa-pacing-select">Cadência entre Linhas</label>
                <select id="wa-pacing-select" class="wa-select">
                  <option value="random-safe" selected>🎲 Aleatório sem padrão: 1 min, 3 min ou 5 min (Anti-Ban Recomendado)</option>
                  <option value="test-fast">⚡ Modo Teste Rápido (10 a 15 segundos - Homologação)</option>
                  <option value="1">⏱ Fixo: 1 minuto</option>
                  <option value="3">⏱ Fixo: 3 minutos</option>
                  <option value="5">⏱ Fixo: 5 minutos</option>
                </select>
              </div>

              <div>
                <label for="wa-channel-mode">Canal de Disparo</label>
                <select id="wa-channel-mode" class="wa-select">
                  <option value="gateway-usb" selected>📲 Gateway Celular USB (Android Automator no Galaxy A24)</option>
                  <option value="wa-web">🌐 WhatsApp Web (Abertura Sequencial com 1 Clique)</option>
                </select>
              </div>
            </div>

            <div class="wa-actions-bar">
              <button type="submit" id="btn-wa-start-batch" class="primary wa-btn-primary">
                <span>▶</span> Iniciar Disparos da Lista
              </button>
              <button type="button" id="btn-wa-pause-batch" class="wa-btn wa-btn-secondary" disabled>
                <span>⏸</span> Pausar
              </button>
              <button type="button" id="btn-wa-stop-batch" class="wa-btn wa-btn-outline" disabled>
                <span>⏹</span> Parar
              </button>
              <span id="wa-batch-countdown" class="wa-countdown-badge" hidden></span>
            </div>

            <p id="wa-batch-feedback" class="wa-feedback" role="status"></p>
          </form>
        </article>

        <!-- Audit Ledger / Table -->
        <article class="wa-card wa-history-card">
          <div class="wa-card-header">
            <div class="wa-title-icon">📋</div>
            <div>
              <h2>Fila e Histórico de Disparos em Tempo Real</h2>
              <small>Registro de auditoria com destinatário, variação utilizada e status de entrega</small>
            </div>
            <button type="button" id="btn-wa-clear-history" class="wa-btn-sm">Limpar Visão</button>
          </div>

          <div class="table-scroll">
            <table class="wa-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Horário</th>
                  <th>Destinatário</th>
                  <th>Canal</th>
                  <th>Variação</th>
                  <th>Mensagem Enviada</th>
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
      return '<tr><td colspan="8" class="empty">Nenhum disparo registrado ainda.</td></tr>';
    }
    return auditLogs.map(log => `
      <tr>
        <td><code>${log.id}</code></td>
        <td><small class="saved-at">${log.date} ${log.time}</small></td>
        <td><strong>${escapeHtml(log.target)}</strong></td>
        <td><small>${escapeHtml(log.channel)}</small></td>
        <td><span class="wa-badge wa-badge-gold">${escapeHtml(log.variant || 'Variação')}</span></td>
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

  function parseContactLines(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    for (const line of lines) {
      // Find where phone digits end and name begins
      // Format can be: 99 8427-4848 Ricardo Gerente or +55 99 8427-4848 Ricardo
      const match = line.match(/^(\+?[\d\s\-()]{8,20})\s+(.+)$/);
      if (match) {
        parsed.push({
          phone: match[1].trim(),
          name: match[2].trim(),
          raw: line
        });
      } else {
        // Fallback: take first token as phone
        const parts = line.split(/\s+/);
        parsed.push({
          phone: parts[0],
          name: parts.slice(1).join(' ') || 'Contato',
          raw: line
        });
      }
    }
    return parsed;
  }

  function getRandomPacingSeconds(mode) {
    if (mode === 'random-safe') {
      const choices = [60, 180, 300]; // 1 min, 3 min, 5 min
      return choices[Math.floor(Math.random() * choices.length)];
    }
    if (mode === 'test-fast') {
      return Math.floor(Math.random() * 6) + 10; // 10 to 15s
    }
    const mins = parseInt(mode, 10);
    return (Number.isFinite(mins) && mins > 0) ? mins * 60 : 60;
  }

  function bindWhatsappEvents(root) {
    const feedback = root.querySelector('#wa-batch-feedback');
    const startBtn = root.querySelector('#btn-wa-start-batch');
    const pauseBtn = root.querySelector('#btn-wa-pause-batch');
    const stopBtn = root.querySelector('#btn-wa-stop-batch');
    const countdownBadge = root.querySelector('#wa-batch-countdown');

    function updateUiState() {
      if (startBtn) startBtn.disabled = batchState.running;
      if (pauseBtn) pauseBtn.disabled = !batchState.running;
      if (stopBtn) stopBtn.disabled = !batchState.running && batchState.currentIndex === 0;
      if (countdownBadge) countdownBadge.hidden = !batchState.running || batchState.secondsLeft <= 0;
    }

    // Submit batch
    root.querySelector('#wa-form-batch')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const contactsText = root.querySelector('#wa-input-contacts')?.value || '';
      const contacts = parseContactLines(contactsText);

      if (!contacts.length) {
        if (feedback) {
          feedback.textContent = 'Informe pelo menos um telefone e nome no campo "telefone/nome".';
          feedback.className = 'wa-feedback error';
        }
        return;
      }

      const variations = [
        root.querySelector('#wa-msg-var-1')?.value.trim() || 'Olá eu estou mandando essa mensagem de teste não precisa ter retorno',
        root.querySelector('#wa-msg-var-2')?.value.trim() || 'Olá, eu estou mandando essa mensagem de teste não precisa ter retorno',
        root.querySelector('#wa-msg-var-3')?.value.trim() || 'Olá, eu estou mandando essa mensagem de teste, não precisa ter retorno'
      ];

      const pacingMode = root.querySelector('#wa-pacing-select')?.value || 'random-safe';
      const channel = root.querySelector('#wa-channel-mode')?.value || 'gateway-usb';

      batchState.running = true;
      batchState.currentIndex = 0;
      updateUiState();

      processNextContact(contacts, variations, pacingMode, channel);
    });

    async function processNextContact(contacts, variations, pacingMode, channel) {
      if (!batchState.running || batchState.currentIndex >= contacts.length) {
        batchState.running = false;
        if (feedback) {
          feedback.innerHTML = `✔ <strong>Todos os disparos da lista foram processados com sucesso!</strong>`;
          feedback.className = 'wa-feedback success';
        }
        updateUiState();
        return;
      }

      const contact = contacts[batchState.currentIndex];
      // Alternate between the 3 variations sequentially or pseudorandomly
      const varIndex = batchState.currentIndex % variations.length;
      const message = variations[varIndex];
      const variantLabel = `Variante ${varIndex + 1}`;

      if (feedback) {
        feedback.innerHTML = `<span>⏳</span> Disparando para <strong>${escapeHtml(contact.name)}</strong> (${escapeHtml(contact.phone)}) com <em>${variantLabel}</em>...`;
        feedback.className = 'wa-feedback info';
      }

      try {
        if (channel === 'wa-web') {
          const digits = contact.phone.replace(/\D/g, '');
          const cleanPhone = digits.startsWith('55') ? digits : '55' + digits;
          const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
          window.open(url, '_blank', 'noopener,noreferrer');
        } else if (typeof api === 'function') {
          await api('whatsapp', {
            action: 'send',
            phone: contact.phone,
            name: contact.name,
            message,
            channel
          });
        }

        auditLogs.unshift({
          id: 'DISP-WA-' + String(auditLogs.length + 1).padStart(3, '0'),
          time: new Date().toLocaleTimeString('pt-BR'),
          date: new Date().toLocaleDateString('pt-BR'),
          target: `${contact.name} (${contact.phone})`,
          targetType: 'contact',
          channel: channel === 'gateway-usb' ? 'Gateway Celular USB (Galaxy A24)' : 'WhatsApp Web',
          message,
          variant: variantLabel,
          status: 'success',
          statusLabel: 'Enviado com Sucesso',
          device: 'Samsung Galaxy A24 (SM-A245M)',
          details: 'Iniciada conversa e transmitida no WhatsApp Business'
        });

        const tbody = root.querySelector('#wa-history-tbody');
        if (tbody) tbody.innerHTML = renderHistoryRows();

        batchState.currentIndex++;

        if (batchState.currentIndex < contacts.length && batchState.running) {
          const delaySec = getRandomPacingSeconds(pacingMode);
          const delayMins = Math.round(delaySec / 60);
          batchState.secondsLeft = delaySec;

          if (feedback) {
            feedback.innerHTML = `✔ Enviado para <strong>${escapeHtml(contact.name)}</strong>! Aguardando intervalo de cadência seguro (<strong>${delayMins >= 1 ? delayMins + ' min' : delaySec + 's'}</strong> aleatório)...`;
            feedback.className = 'wa-feedback success';
          }

          updateCountdown();
          batchState.countdownTimer = setInterval(updateCountdown, 1000);

          batchState.timer = setTimeout(() => {
            clearInterval(batchState.countdownTimer);
            processNextContact(contacts, variations, pacingMode, channel);
          }, delaySec * 1000);
        } else {
          batchState.running = false;
          if (feedback) {
            feedback.innerHTML = `✔ <strong>Lista concluída!</strong> Todos os contatos foram processados.`;
            feedback.className = 'wa-feedback success';
          }
          updateUiState();
        }
      } catch (err) {
        if (feedback) {
          feedback.textContent = `Erro ao disparar para ${contact.name}: ${err.message}`;
          feedback.className = 'wa-feedback error';
        }
        batchState.running = false;
        updateUiState();
      }
    }

    function updateCountdown() {
      if (batchState.secondsLeft <= 0) {
        clearInterval(batchState.countdownTimer);
        if (countdownBadge) countdownBadge.hidden = true;
        return;
      }
      const mins = Math.floor(batchState.secondsLeft / 60);
      const secs = batchState.secondsLeft % 60;
      if (countdownBadge) {
        countdownBadge.hidden = false;
        countdownBadge.textContent = `Próximo disparo em: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      batchState.secondsLeft--;
    }

    // Pause batch
    pauseBtn?.addEventListener('click', () => {
      if (batchState.timer) clearTimeout(batchState.timer);
      if (batchState.countdownTimer) clearInterval(batchState.countdownTimer);
      batchState.running = false;
      if (feedback) {
        feedback.innerHTML = `⏸ <strong>Fila pausada.</strong> Clique em "Iniciar Disparos da Lista" para continuar a partir de onde parou.`;
        feedback.className = 'wa-feedback info';
      }
      updateUiState();
    });

    // Stop batch
    stopBtn?.addEventListener('click', () => {
      if (batchState.timer) clearTimeout(batchState.timer);
      if (batchState.countdownTimer) clearInterval(batchState.countdownTimer);
      batchState.running = false;
      batchState.currentIndex = 0;
      batchState.secondsLeft = 0;
      if (countdownBadge) countdownBadge.hidden = true;
      if (feedback) {
        feedback.textContent = '⏹ Fila interrompida e reiniciada.';
        feedback.className = 'wa-feedback info';
      }
      updateUiState();
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
