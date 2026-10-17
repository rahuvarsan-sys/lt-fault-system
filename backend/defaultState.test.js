const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('./data/sampleData.json');
const { isDeviceOnline } = require('./deviceStatus');

test('default telemetry stays empty until hardware delivers live data', () => {
  assert.equal(state.transformer.voltage.R, null, 'Voltage should be blank before the board connects');
  assert.equal(state.transformer.current.R, null, 'Current should be blank before the board connects');
  assert.equal(state.flameSensor.status, 'No data', 'Flame sensor should show no data until live readings arrive');
  assert.equal(state.vibrationSensor.status, 'No data', 'Vibration sensor should show no data until live readings arrive');
  assert.equal(state.isTelemetryCleared, true, 'Telemetry should be marked as cleared until live data arrives');
});

test('partial hardware payloads do not create false fault alarms', () => {
  const partial = {
    transformer: {
      voltage: { R: 230.5, Y: null, B: null },
      current: { R: 12.3, Y: null, B: null },
      loadPercent: null,
      temperature: null
    }
  };

  const hasCompleteLiveTelemetry = (transformer) => {
    if (!transformer) return false;
    const voltageValues = [transformer.voltage?.R, transformer.voltage?.Y, transformer.voltage?.B];
    const currentValues = [transformer.current?.R, transformer.current?.Y, transformer.current?.B];
    const hasVoltage = voltageValues.every((value) => value != null && !Number.isNaN(Number(value)));
    const hasCurrent = currentValues.every((value) => value != null && !Number.isNaN(Number(value)));
    return hasVoltage && hasCurrent && transformer.temperature != null && transformer.loadPercent != null;
  };

  assert.equal(hasCompleteLiveTelemetry(partial.transformer), false, 'Partial data should not be treated as valid live telemetry');
});

test('a recent device heartbeat restores online status after an earlier offline mark', () => {
  const now = Date.parse('2026-10-16T08:36:25.588Z');
  const device = {
    status: 'Offline',
    lastSeen: '2026-10-16T08:33:58.361Z'
  };

  assert.equal(isDeviceOnline(device, now), true, 'A fresh heartbeat should override a stale offline status');
});

test('a device with no heartbeat for more than 15 minutes is offline', () => {
  const now = Date.parse('2026-10-16T08:50:00.000Z');
  const device = {
    status: 'Online',
    lastSeen: '2026-10-16T08:33:58.361Z'
  };

  assert.equal(isDeviceOnline(device, now), false, 'A heartbeat older than 15 minutes should be offline');
});
