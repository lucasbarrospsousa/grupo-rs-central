import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeviceStatus, sendControlledMessage } from './whatsapp-gateway.mjs';

test('WhatsApp Gateway: Safety lock blocks external client numbers', async () => {
  await assert.rejects(
    async () => {
      await sendControlledMessage({ target: '+5599988776655', message: 'teste cliente' });
    },
    /TRAVA DE SEGURANÇA/
  );
});

test('WhatsApp Gateway: Status returns Samsung Galaxy A24 and WhatsApp Business metadata', () => {
  const status = getDeviceStatus();
  assert.equal(status.serial, 'RQ8WB02FN3P');
  assert.equal(status.whatsappPackage, 'com.whatsapp.w4b');
  assert.equal(status.safetyLock, true);
  assert.equal(status.authorizedGroup, 'Equipamentos Sos');
});
