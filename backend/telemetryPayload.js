function hasTelemetryReadings(incoming) {
  if (!incoming) return false;

  const transformer = incoming.transformer || {};
  const readings = [
    transformer.voltage?.R, transformer.voltage?.Y, transformer.voltage?.B,
    transformer.current?.R, transformer.current?.Y, transformer.current?.B,
    transformer.power?.active, transformer.power?.reactive, transformer.power?.apparent,
    transformer.powerFactor, transformer.frequency, transformer.energy,
    transformer.loadPercent, transformer.temperature,
    incoming.flameSensor?.intensity,
    incoming.vibrationSensor?.level
  ];

  return readings.some((value) => {
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
  });
}

module.exports = { hasTelemetryReadings };
