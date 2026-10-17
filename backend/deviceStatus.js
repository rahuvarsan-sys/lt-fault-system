const DEVICE_OFFLINE_TIMEOUT_MS = 15 * 1000;

function isDeviceOnline(device, now = Date.now()) {
  if (!device || !device.lastSeen) {
    return false;
  }

  const lastSeen = Date.parse(device.lastSeen);
  return Number.isFinite(lastSeen) && now - lastSeen < DEVICE_OFFLINE_TIMEOUT_MS;
}

function hasLiveTelemetry(devices, now = Date.now()) {
  return (devices || []).some((device) =>
    device.status === 'Online' && isDeviceOnline({ lastSeen: device.lastTelemetryAt }, now)
  );
}

module.exports = { isDeviceOnline, hasLiveTelemetry };
