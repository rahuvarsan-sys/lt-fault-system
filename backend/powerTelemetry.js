function mergePowerTelemetry(existingPower, incomingPower, voltage, current) {
  const mergedPower = { ...(existingPower || {}), ...(incomingPower || {}) };
  const measuredActivePower = incomingPower?.active;
  const hasMeasuredActivePower = measuredActivePower !== null
    && measuredActivePower !== undefined
    && Number.isFinite(Number(measuredActivePower));

  if (hasMeasuredActivePower || voltage <= 0 || current <= 0) {
    return mergedPower;
  }

  const estimatedPower = parseFloat((voltage * current / 1000).toFixed(3));
  return {
    ...mergedPower,
    active: estimatedPower,
    apparent: estimatedPower
  };
}

module.exports = { mergePowerTelemetry };
