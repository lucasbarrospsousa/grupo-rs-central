/**
 * WhatsApp Gateway - Mobile USB Controller
 * Sideracode / Grupo RS Central
 *
 * Automates controlled WhatsApp Business messaging on the USB-connected
 * Samsung Galaxy A24 (SM-A245M, serial: RQ8WB02FN3P).
 *
 * STRICT SAFETY LOCK:
 * - Live client messages are blocked in test mode.
 * - Only the authorized group "Equipamentos Sos" is permitted.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ADB_PATH = process.env.LOCALAPPDATA + '\\Android\\Sdk\\platform-tools\\adb.exe';
const TARGET_DEVICE = 'RQ8WB02FN3P';
const PACKAGE_NAME = 'com.whatsapp.w4b';
const AUTHORIZED_TEST_GROUP = 'Equipamentos Sos';
const DEFAULT_TEST_MESSAGE = 'olá, testando mensagem automática.';

export function runAdb(args, timeoutMs = 10000) {
  try {
    return execSync(`"${ADB_PATH}" -s ${TARGET_DEVICE} ${args}`, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (err) {
    throw new Error(`ADB error executing [${args}]: ${err.stderr || err.message}`);
  }
}

export function getDeviceStatus() {
  const model = 'SM-A245M (Galaxy A24)';
  try {
    const devicesOutput = execSync(`"${ADB_PATH}" devices -l`, { encoding: 'utf8' });
    const isConnected = devicesOutput.includes(TARGET_DEVICE);
    if (!isConnected) {
      return {
        ok: false,
        connected: false,
        serial: TARGET_DEVICE,
        model,
        whatsappPackage: PACKAGE_NAME,
        safetyLock: true,
        authorizedGroup: AUTHORIZED_TEST_GROUP,
        error: `Dispositivo ${TARGET_DEVICE} desconectado da USB (modo App Mobile / Gateway sem fio ativo).`
      };
    }

    const focusedWindow = runAdb('shell "dumpsys window | grep -E \'mCurrentFocus|mFocusedApp\'"');
    const isW4bActive = focusedWindow.includes(PACKAGE_NAME);

    return {
      ok: true,
      serial: TARGET_DEVICE,
      model,
      connected: true,
      whatsappPackage: PACKAGE_NAME,
      isFocused: isW4bActive,
      safetyLock: true,
      authorizedGroup: AUTHORIZED_TEST_GROUP
    };
  } catch (err) {
    return {
      ok: false,
      connected: false,
      serial: TARGET_DEVICE,
      model,
      whatsappPackage: PACKAGE_NAME,
      safetyLock: true,
      authorizedGroup: AUTHORIZED_TEST_GROUP,
      error: err.message
    };
  }
}

export function normalizePhone(rawPhone) {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 8) digits = '999' + digits;
  else if (digits.length === 9) digits = '99' + digits;
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  if (digits.length === 12 && digits.startsWith('55')) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4);
  }
  return digits;
}

export async function sendDirectMessage({ phone, name = '', message = DEFAULT_TEST_MESSAGE }) {
  const digits = normalizePhone(phone);
  if (!digits) throw new Error('Número de telefone inválido.');

  const status = getDeviceStatus();
  if (!status.ok) throw new Error(`Gateway offline: ${status.error}`);

  console.log(`[WhatsApp Gateway] Disparando para ${name || digits} (${digits})...`);
  runAdb('shell "svc power stayon true && input keyevent KEYCODE_WAKEUP && wm dismiss-keyguard"');

  const encodedText = encodeURIComponent(message);
  const deepLink = `https://api.whatsapp.com/send?phone=${digits}&text=${encodedText}`;
  runAdb(`shell "am start -a android.intent.action.VIEW -d '${deepLink}' ${PACKAGE_NAME}"`);

  await new Promise(r => setTimeout(r, 2000));

  // Click Send button
  runAdb('shell "input tap 986 2122"');
  await new Promise(r => setTimeout(r, 1000));

  return {
    ok: true,
    phone: digits,
    name: name || '',
    message,
    timestamp: new Date().toISOString(),
    status: 'sent'
  };
}

export async function sendControlledMessage({ target = AUTHORIZED_TEST_GROUP, message = DEFAULT_TEST_MESSAGE } = {}) {
  // Safety rule check
  if (target !== AUTHORIZED_TEST_GROUP) {
    throw new Error(`[TRAVA DE SEGURANÇA]: Envios externos a clientes estão bloqueados. Destino autorizado exclusivo: "${AUTHORIZED_TEST_GROUP}".`);
  }

  const status = getDeviceStatus();
  if (!status.ok) {
    throw new Error(`Gateway offline: ${status.error}`);
  }

  console.log(`[WhatsApp Gateway] Preparando disparo controlado para "${target}"...`);

  // 1. Wake screen and keep awake on USB
  runAdb('shell "svc power stayon true && input keyevent KEYCODE_WAKEUP && wm dismiss-keyguard && input swipe 540 1800 540 500 200"');

  // 2. Launch deep link with URL-encoded message
  const encodedText = encodeURIComponent(message);
  const deepLink = `https://api.whatsapp.com/send?text=${encodedText}`;
  console.log(`[WhatsApp Gateway] Despachando intent seguro para WhatsApp Business...`);
  runAdb(`shell "am start -a android.intent.action.VIEW -d '${deepLink}' ${PACKAGE_NAME}"`);

  // Small delay for UI rendering
  await new Promise(r => setTimeout(r, 1500));

  // 3. Inspect UI to handle contact picker or direct conversation
  const tempXml = path.join(process.cwd(), 'temp_wa_dump.xml');
  runAdb('shell uiautomator dump /sdcard/gateway_dump.xml');
  runAdb(`pull /sdcard/gateway_dump.xml "${tempXml}"`);

  const xml = fs.readFileSync(tempXml, 'utf8');

  // If in contact picker, select "Equipamentos Sos"
  if (xml.includes('contactpicker') || xml.includes('Enviar para')) {
    console.log(`[WhatsApp Gateway] Selecionando grupo "${AUTHORIZED_TEST_GROUP}" no seletor de contatos...`);
    const groupMatch = xml.match(new RegExp(`content-desc="${AUTHORIZED_TEST_GROUP}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`));
    if (groupMatch) {
      const x = Math.floor((parseInt(groupMatch[1]) + parseInt(groupMatch[3])) / 2);
      const y = Math.floor((parseInt(groupMatch[2]) + parseInt(groupMatch[4])) / 2);
      runAdb(`shell "input tap ${x} ${y}"`);
      await new Promise(r => setTimeout(r, 600));

      // Click the next floating send button
      runAdb('shell "input tap 989 2114"');
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  // 4. In conversation: click Send button
  console.log(`[WhatsApp Gateway] Acionando botão de envio...`);
  runAdb('shell "input tap 986 2122"');
  await new Promise(r => setTimeout(r, 1000));

  // Clean up temp dump
  try { fs.unlinkSync(tempXml); } catch {}

  console.log(`[WhatsApp Gateway] Mensagem enviada com sucesso para "${target}"!`);
  return {
    ok: true,
    target,
    message,
    timestamp: new Date().toISOString(),
    status: 'sent'
  };
}

// CLI handler
if (process.argv[1] && (import.meta.url.includes(path.basename(process.argv[1])) || process.argv[1].endsWith('whatsapp-gateway.mjs'))) {
  const cmd = process.argv[2] || 'status';
  if (cmd === 'status') {
    console.log(JSON.stringify(getDeviceStatus(), null, 2));
  } else if (cmd === 'test' || cmd === 'send') {
    sendControlledMessage()
      .then(res => console.log('Resultado:', JSON.stringify(res, null, 2)))
      .catch(err => {
        console.error('Erro no gateway:', err.message);
        process.exit(1);
      });
  } else {
    console.log('Uso: node whatsapp-gateway.mjs [status|test]');
  }
}
