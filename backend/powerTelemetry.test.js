const test = require('node:test');
const assert = require('node:assert/strict');
const { mergePowerTelemetry } = require('./powerTelemetry');

test('preserves precise measured low-wattage readings from the ESP32', () => {
  const power = mergePowerTelemetry(
    { active: 0.02, apparent: 0.02 },
    { active: 0.00901, apparent: 0.0092, reactive: 0.00185 },
    230,
    0.04
  );

  assert.equal(power.active, 0.00901);
  assert.equal(power.apparent, 0.0092);
  assert.equal(power.reactive, 0.00185);
});

test('preserves a measured zero-power reading instead of estimating power', () => {
  const power = mergePowerTelemetry(
    { active: 0.02, apparent: 0.02 },
    { active: 0 },
    230,
    0.04
  );

  assert.equal(power.active, 0);
});

test('keeps the legacy voltage-current estimate for devices without measured power', () => {
  const power = mergePowerTelemetry({}, {}, 230, 0.04);

  assert.equal(power.active, 0.009);
  assert.equal(power.apparent, 0.009);
});
