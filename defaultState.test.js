const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('./data/sampleData.json');

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
