import test from 'node:test';
import assert from 'node:assert/strict';
import { getDeviceStatus, normalizePhone } from './whatsapp-gateway.mjs';

test('WhatsApp Gateway: Normalizes Brazilian phone numbers correctly', () => {
  assert.equal(normalizePhone('99 8427-4848'), '5599984274848');
  assert.equal(normalizePhone('+55 99 98414-5352'), '5599984145352');
  assert.equal(normalizePhone('99 9651-5160'), '5599996515160');
});

test('WhatsApp Gateway: Status returns Samsung Galaxy A24 and WhatsApp Business metadata', () => {
  const status = getDeviceStatus();
  assert.equal(status.serial, 'RQ8WB02FN3P');
  assert.equal(status.whatsappPackage, 'com.whatsapp.w4b');
  assert.equal(status.safetyLock, true);
  assert.equal(status.authorizedGroup, 'Equipamentos Sos');
});
