const DEVICE_OFFLINE_TIMEOUT_MS = 15 * 60 * 1000;

function isDeviceOnline(device, now = Date.now()) {
  if (!device || !device.lastSeen) {
    return false;
  }

  const lastSeen = Date.parse(device.lastSeen);
  return Number.isFinite(lastSeen) && now - lastSeen < DEVICE_OFFLINE_TIMEOUT_MS;
}

module.exports = { isDeviceOnline };
