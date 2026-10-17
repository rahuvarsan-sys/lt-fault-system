const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isDeviceOnline } = require('./deviceStatus');

const app = express();
const DEFAULT_PORT = 4001;
const requestedPort = parseInt(process.env.PORT, 10) || DEFAULT_PORT;
const frontendDir = path.join(__dirname, '..', 'frontend');
const portCandidates = Array.from({ length: 20 }, (_, index) => requestedPort + index);
let started = false;

function startServerOnNextPort(portIndex = 0) {
  const port = portCandidates[portIndex];
  if (!port) {
    console.error(`No free port found in range ${requestedPort}-${requestedPort + portCandidates.length - 1}.`);
    process.exit(1);
    return;
  }

  const server = app.listen(port, () => {
    started = true;
    console.log(`TNEB digital twin server running at http://localhost:${port}`);
    setInterval(simulateTelemetry, 4000);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is already in use. Trying ${portCandidates[portIndex + 1]}...`);
      startServerOnNextPort(portIndex + 1);
      return;
    }

    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
}
const dataFile = path.join(__dirname, 'data', 'state.json');
const sampleDataFile = path.join(__dirname, 'data', 'sampleData.json');

app.use(cors());
app.use(express.json());
app.use(express.static(frontendDir));

let state = loadState();
const sseClients = [];
ensureDefaultState();



function createClearedTelemetryState() {
  return {
    transformer: {
      voltage: { R: null, Y: null, B: null },
      current: { R: null, Y: null, B: null },
      power: { active: null, reactive: null, apparent: null },
      powerFactor: null,
      frequency: null,
      energy: null,
      loadPercent: null,
      temperature: null,
      healthIndex: null
    },
    flameSensor: { status: 'No data', intensity: null, threshold: 70, lastDetectedAt: null },
    vibrationSensor: { status: 'No data', level: null, threshold: 50, lastDetectedAt: null },
    faults: [],
    alerts: [],
    nodes: [],
    relayStatus: 'OFF',
    tapPosition: 0,
    locationState: { faultArea: 'No data', faultDistanceKm: null, nearestNode: 'No data' },
    energyRecords: []
  };
}

function loadState() {
  if (fs.existsSync(dataFile)) {
    try {
      const raw = fs.readFileSync(dataFile, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Falling back to sample data due to state load error', error.message);
    }
  }

  const sample = JSON.parse(fs.readFileSync(sampleDataFile, 'utf8'));
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(sample, null, 2));
  return sample;
}

function persistState() {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
}

function resetTelemetryState() {
  const cleared = createClearedTelemetryState();
  state.transformer = cleared.transformer;
  state.flameSensor = cleared.flameSensor;
  state.vibrationSensor = cleared.vibrationSensor;
  state.faults = cleared.faults;
  state.alerts = cleared.alerts;
  state.nodes = cleared.nodes;
  state.relayStatus = cleared.relayStatus;
  state.tapPosition = 2;
  state.locationState = cleared.locationState;
  state.energyRecords = cleared.energyRecords;
  state.devices = [];
  state.currentDeviceId = null;
  state.isTelemetryCleared = true;
  state.telemetryHistory = [];
  persistState();
}

const TELEMETRY_HISTORY_RETENTION_MS = 15 * 60 * 1000;

function ensureDefaultState() {
  state.users = state.users || [];
  const clearedTelemetry = createClearedTelemetryState();
  // Keep the baseline fixed at 5V until an ESP32 device is connected and sending live telemetry.
  state.isTelemetryCleared = true;
  state.transformer = clearedTelemetry.transformer;
  state.flameSensor = clearedTelemetry.flameSensor;
  state.vibrationSensor = clearedTelemetry.vibrationSensor;
  state.faults = clearedTelemetry.faults;
  state.alerts = clearedTelemetry.alerts;
  state.nodes = clearedTelemetry.nodes;
  state.locationState = clearedTelemetry.locationState;
  state.energyRecords = clearedTelemetry.energyRecords;
  state.telemetryHistory = [];
  state.devices = state.devices || [];
  state.relayStatus = 'OFF';
  state.tapPosition = 0;
  state.currentDeviceId = null;
  state.devices = [];
  persistState();
}

function retainRecentTelemetryHistory() {
  const cutoff = Date.now() - TELEMETRY_HISTORY_RETENTION_MS;
  state.telemetryHistory = (state.telemetryHistory || []).filter((entry) => {
    const timestamp = Date.parse(entry.timestamp);
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
}

function getPrototypeLiveTelemetry() {
  const currentBase = 4.8;
  return {
    voltage: { R: 12, Y: 12, B: 12 },
    current: { R: currentBase, Y: 3.6, B: 5.4 },
    power: { active: 0.058, reactive: 0.01, apparent: 0.058 },
    powerFactor: 0.96,
    frequency: 50,
    energy: 0.2,
    loadPercent: 28,
    temperature: 32,
    healthIndex: 90
  };
}

function refreshDeviceConnectivity() {
  state.devices = (state.devices || []).map((device) => ({
    ...device,
    status: isDeviceOnline(device) ? 'Online' : 'Offline'
  }));

  const hasOnlineDevice = (state.devices || []).some((device) => device.status === 'Online');
  if (!hasOnlineDevice) {
    state.isTelemetryCleared = true;
    state.currentDeviceId = null;
    state.faults = [];
    state.alerts = [];
    state.locationState = { faultArea: 'No data', faultDistanceKm: null, nearestNode: 'No data' };
    state.transformer = createClearedTelemetryState().transformer;
    state.flameSensor = { status: 'No data', intensity: null, threshold: 70, lastDetectedAt: null };
    state.vibrationSensor = { status: 'No data', level: null, threshold: 50, lastDetectedAt: null };
    state.telemetryHistory = [];
    return;
  }

  state.isTelemetryCleared = false;

  if (state.currentDeviceId) {
    const current = state.devices.find((device) => device.id === state.currentDeviceId);
    if (!current) {
      state.currentDeviceId = null;
    }
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function hasCompleteLiveTelemetry(transformer) {
  if (!transformer) return false;
  const voltageValues = [transformer.voltage?.R, transformer.voltage?.Y, transformer.voltage?.B];
  const currentValues = [transformer.current?.R, transformer.current?.Y, transformer.current?.B];
  const hasVoltage = voltageValues.every((value) => value != null && !Number.isNaN(Number(value)));
  const hasCurrent = currentValues.every((value) => value != null && !Number.isNaN(Number(value)));
  return hasVoltage && hasCurrent && transformer.temperature != null && transformer.loadPercent != null;
}

function calculateHealthIndex(transformer) {
  if (!hasCompleteLiveTelemetry(transformer)) {
    return null;
  }
  const avgVoltage = (transformer.voltage.R + transformer.voltage.Y + transformer.voltage.B) / 3;
  const tempScore = Math.max(0, 100 - (transformer.temperature - 50) * 1.6);
  const loadScore = Math.max(0, 100 - Math.max(0, transformer.loadPercent - 70) * 0.8);
  const voltageScore = Math.max(0, 100 - Math.max(0, Math.abs(avgVoltage - 240)) * 0.4);
  const faultPenalty = Math.min(30, state.faults.length * 6);
  return Math.round(clamp(tempScore * 0.4 + loadScore * 0.3 + voltageScore * 0.2 + 10 - faultPenalty, 45, 99));
}

function detectFaults(transformer) {
  if (!hasCompleteLiveTelemetry(transformer)) {
    return [];
  }
  const faults = [];
  const avgVoltage = (transformer.voltage.R + transformer.voltage.Y + transformer.voltage.B) / 3;
  const phaseSpread = Math.max(
    Math.abs(transformer.voltage.R - transformer.voltage.Y),
    Math.abs(transformer.voltage.Y - transformer.voltage.B),
    Math.abs(transformer.voltage.B - transformer.voltage.R)
  );

  if (transformer.loadPercent > 90 || transformer.current.R > 95 || transformer.current.Y > 95 || transformer.current.B > 95) {
    faults.push({
      type: 'Overcurrent',
      severity: 'High',
      description: 'Current exceeded the safe operating threshold for the feeder segment.',
      location: 'Feeder Bay A'
    });
  }

  if (avgVoltage < 215) {
    faults.push({
      type: 'Undervoltage',
      severity: 'High',
      description: 'Voltage dropped below the acceptable threshold for LT consumers.',
      location: 'Distribution Sector 2'
    });
  }

  if (avgVoltage > 255) {
    faults.push({
      type: 'Overvoltage',
      severity: 'Medium',
      description: 'Voltage rose above the safe range and may stress the transformer windings.',
      location: 'Sector 3'
    });
  }

  if (transformer.temperature > 85) {
    faults.push({
      type: 'Overheating',
      severity: 'High',
      description: 'Transformer temperature is above the recommended operating band.',
      location: 'Cooling Unit'
    });
  }

  if (transformer.frequency < 49.2) {
    faults.push({
      type: 'Under-frequency',
      severity: 'Medium',
      description: 'Under-frequency event detected; servers may trip load shedding.',
      location: 'Control Room'
    });
  }

  if (phaseSpread > 22) {
    faults.push({
      type: 'Line-to-Line Fault',
      severity: 'High',
      description: 'An abnormal voltage phase spread suggests a line-to-line fault.',
      location: 'Pole 17'
    });
  }

  if (transformer.loadPercent < 15 && (transformer.current.R < 6 || transformer.current.Y < 6 || transformer.current.B < 6)) {
    faults.push({
      type: 'Open Circuit',
      severity: 'Medium',
      description: 'A phase appears open or disconnected from the network.',
      location: 'Pole 11'
    });
  }

  if (transformer.temperature > 90 && avgVoltage < 220) {
    faults.push({
      type: 'Short Circuit',
      severity: 'Critical',
      description: 'Severe thermal and voltage stress indicates a probable short circuit.',
      location: 'LT Feeder R1'
    });
  }

  if (transformer.temperature > 88 && transformer.current.R > 80 && transformer.current.Y > 80 && transformer.current.B > 80) {
    faults.push({
      type: 'Earth Fault',
      severity: 'High',
      description: 'Ground fault detected; leakage path is affecting the LT network.',
      location: 'Near Node C4'
    });
  }

  if (state.vibrationSensor && state.vibrationSensor.level > state.vibrationSensor.threshold) {
    faults.push({
      type: 'High Vibration',
      severity: 'Critical',
      description: 'Severe mechanical vibration detected, possible transformer core or casing damage.',
      location: 'Transformer Enclosure'
    });
  }

  return faults;
}

function locateFault(faults, transformer) {
  if (!faults.length) {
    return { faultArea: 'Normal', faultDistanceKm: 0, nearestNode: 'Substation' };
  }

  const reference = transformer.temperature + transformer.loadPercent;
  const fallbackNode = { name: 'Substation', distanceKm: 0 };
  const nearestNode = Array.isArray(state.nodes) && state.nodes.length
    ? state.nodes.reduce((best, node) => {
        const currentDistance = Math.abs(node.distanceKm - reference / 10);
        const bestDistance = Math.abs(best.distanceKm - reference / 10);
        return currentDistance < bestDistance ? node : best;
      }, state.nodes[0] || fallbackNode)
    : fallbackNode;

  return {
    faultArea: faults[0].location,
    faultDistanceKm: Array.isArray(state.nodes) && state.nodes.length
      ? Math.max(1, Math.round(Math.abs(nearestNode.distanceKm - reference / 10)))
      : 0,
    nearestNode: nearestNode.name
  };
}

function appendAlert(faults, location) {
  if (!faults.length) {
    return;
  }

  const newAlerts = faults.map((fault, index) => ({
    id: Date.now() + index,
    type: fault.type,
    severity: fault.severity,
    message: `${fault.type}: ${fault.description}`,
    location: fault.location,
    area: location.nearestNode,
    distanceKm: location.faultDistanceKm,
    createdAt: new Date().toISOString()
  }));

  state.alerts = [...newAlerts, ...state.alerts].slice(0, 8);
}

function registerDevice(deviceInfo, telemetryReceived = false) {
  const incoming = deviceInfo || {};
  const deviceName = incoming.deviceName || incoming.name || 'ESP32-Device';
  const ipAddress = incoming.ipAddress || incoming.ip || '0.0.0.0';
  const newDevice = {
    id: incoming.id || `${deviceName}-${Date.now()}`,
    name: deviceName,
    ipAddress,
    status: incoming.status || 'Online',
    lastSeen: incoming.lastSeen || new Date().toISOString()
  };

  // Preserve the actual device status; if the board is offline, it must not be treated as live telemetry.
  state.devices = (state.devices || []).map((entry) => {
    const sameDevice = entry.id === newDevice.id || entry.ipAddress === newDevice.ipAddress;
    return {
      ...entry,
      status: sameDevice ? newDevice.status : 'Offline'
    };
  });

  const existingIndex = state.devices.findIndex((entry) => entry.id === newDevice.id || entry.ipAddress === newDevice.ipAddress);
  if (existingIndex >= 0) {
    state.devices[existingIndex] = { ...state.devices[existingIndex], ...newDevice };
  } else {
    state.devices.unshift(newDevice);
  }

  const registeredDevice = state.devices.find((device) => device.id === newDevice.id);
  if (telemetryReceived && registeredDevice) {
    registeredDevice.lastTelemetryAt = new Date().toISOString();
  }
  state.devices = state.devices.slice(0, 8);
  state.currentDeviceId = newDevice.id;
  return registeredDevice || newDevice;
}

function simulateTelemetry() {
  refreshDeviceConnectivity();

  if (state.isTelemetryCleared) {
    broadcastSnapshot();
    return;
  }

  const currentDevice = state.devices.find((device) => device.id === state.currentDeviceId);
  if (currentDevice?.lastTelemetryAt) {
    broadcastSnapshot();
    return;
  }

  const demo = getPrototypeLiveTelemetry();
  state.transformer = {
    ...state.transformer,
    ...demo,
    voltage: demo.voltage,
    current: demo.current,
    power: demo.power,
    healthIndex: demo.healthIndex
  };

  state.flameSensor = {
    status: 'Safe',
    intensity: 18,
    threshold: 70,
    lastDetectedAt: null
  };

  state.vibrationSensor = {
    status: 'Normal',
    level: 15,
    threshold: 50,
    lastDetectedAt: null
  };

  state.faults = [
    {
      type: 'Undervoltage',
      severity: 'Medium',
      description: 'Slight voltage dip on the small prototype feeder.',
      location: 'Feeder A'
    },
    {
      type: 'Overvoltage',
      severity: 'Medium',
      description: 'Brief voltage rise above the small prototype safe band.',
      location: 'Feeder B'
    },
    {
      type: 'Short Circuit',
      severity: 'High',
      description: 'Small prototype indicates a brief short-circuit event.',
      location: 'LT Feeder R1'
    }
  ];
  state.alerts = state.faults.map((fault, index) => ({
    id: Date.now() + index,
    type: fault.type,
    severity: fault.severity,
    message: `${fault.type}: ${fault.description}`,
    location: fault.location,
    area: 'Substation',
    distanceKm: 0,
    createdAt: new Date().toISOString()
  }));
  state.locationState = { faultArea: 'Feeder A', faultDistanceKm: 0, nearestNode: 'Substation' };
  state.telemetryHistory = [
    ...(state.telemetryHistory || []),
    {
      timestamp: new Date().toISOString(),
      power: demo.power.active,
      energy: demo.energy
    }
  ];
  retainRecentTelemetryHistory();

  persistState();
  broadcastSnapshot();
}


function buildSnapshot() {
  refreshDeviceConnectivity();
  retainRecentTelemetryHistory();
  const transformer = { ...state.transformer };
  const currentDevice = state.currentDeviceId ? state.devices.find((device) => device.id === state.currentDeviceId) : null;
  const summary = {
    transformer,
    faults: state.faults,
    alerts: state.alerts,
    nodes: state.nodes,
    relayStatus: state.relayStatus,
    tapPosition: state.tapPosition,
    locationState: state.locationState,
    healthIndex: transformer.healthIndex,
    flameSensor: state.flameSensor || { status: 'Safe', intensity: 0, threshold: 70, lastDetectedAt: null },
    vibrationSensor: state.vibrationSensor || { status: 'Normal', level: 0, threshold: 50, lastDetectedAt: null },
    devices: state.devices || [],
    currentDevice,
    isTelemetryCleared: !!state.isTelemetryCleared,
    dataSource: state.isTelemetryCleared ? 'No live data' : 'ESP32 live',
    telemetryHistory: state.telemetryHistory || []
  };

  return summary;
}

function broadcastSnapshot() {
  const payload = JSON.stringify(buildSnapshot());
  sseClients.forEach((client) => {
    client.write(`data: ${payload}\n\n`);
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/connection-info', (req, res) => {
  const addresses = Object.values(os.networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);

  res.json({ addresses: [...new Set(addresses)], port: requestedPort });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, role = 'Staff' } = req.body;

  if (!username || !password) {
    res.status(400).json({ ok: false, message: 'Please provide both a username and password.' });
    return;
  }

  const exists = state.users.some((entry) => entry.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    res.status(409).json({ ok: false, message: 'That username already exists. Please choose another one.' });
    return;
  }

  const user = {
    id: Date.now(),
    username,
    password,
    role,
    name: username
  };

  state.users.push(user);
  persistState();
  res.json({ ok: true, user: { username: user.username, password: user.password, role: user.role, name: user.name } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = state.users.find((entry) => entry.username === username && entry.password === password);

  if (user) {
    res.json({ ok: true, user: { username: user.username, password: user.password, role: user.role, name: user.name } });
    return;
  }

  res.status(401).json({ ok: false, message: 'Invalid credentials. You can create your own account or use the demo accounts.' });
});

app.post('/api/auth/update', (req, res) => {
  const { currentUsername, currentPassword, newUsername, newPassword, newRole } = req.body;
  const user = state.users.find((entry) => entry.username === currentUsername && entry.password === currentPassword);

  if (!user) {
    res.status(401).json({ ok: false, message: 'Current username or password is incorrect.' });
    return;
  }

  if (newUsername && newUsername !== currentUsername) {
    const exists = state.users.some((entry) => entry.username.toLowerCase() === newUsername.toLowerCase());
    if (exists) {
      res.status(409).json({ ok: false, message: 'That username is already taken.' });
      return;
    }
    user.username = newUsername;
  }

  if (newPassword) {
    user.password = newPassword;
  }

  if (newRole) {
    user.role = newRole;
  }

  persistState();
  res.json({ ok: true, user: { username: user.username, password: user.password, role: user.role, name: user.name } });
});

app.get('/api/telemetry', (req, res) => {
  res.json(buildSnapshot());
});

app.get('/api/telemetry/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);
  res.write(`data: ${JSON.stringify(buildSnapshot())}\n\n`);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx >= 0) {
      sseClients.splice(idx, 1);
    }
  });
});

app.post('/api/sensor-data', (req, res) => {
  const incoming = req.body;
  state.isTelemetryCleared = false;
  if (incoming.transformer) {
    state.transformer = {
      ...state.transformer,
      ...incoming.transformer,
      voltage: { ...(state.transformer.voltage || {}), ...(incoming.transformer.voltage || {}) },
      current: { ...(state.transformer.current || {}), ...(incoming.transformer.current || {}) },
      power: { ...(state.transformer.power || {}), ...(incoming.transformer.power || {}) }
    };
  }
  if (incoming.flameSensor) {
    state.flameSensor = { ...(state.flameSensor || { status: 'Safe', intensity: 0, threshold: 70, lastDetectedAt: null }), ...incoming.flameSensor };
  }
  if (incoming.vibrationSensor) {
    state.vibrationSensor = { ...(state.vibrationSensor || { status: 'Normal', level: 0, threshold: 50, lastDetectedAt: null }), ...incoming.vibrationSensor };
  }
  if (incoming.deviceName || incoming.ipAddress || incoming.name || incoming.ip) {
    registerDevice(incoming, true);
  }
  state.transformer.healthIndex = calculateHealthIndex(state.transformer);
  state.faults = detectFaults(state.transformer);
  const location = locateFault(state.faults, state.transformer);
  state.locationState = location;
  appendAlert(state.faults, location);
  persistState();
  broadcastSnapshot();
  res.json({ ok: true, snapshot: buildSnapshot() });
});

app.post('/api/esp32/register', (req, res) => {
  const device = registerDevice(req.body);
  state.alerts.unshift({
    id: Date.now(),
    type: 'ESP32 Connected',
    severity: 'Low',
    message: `${device.name} registered at ${device.ipAddress}.`,
    location: 'Hardware Gateway',
    area: 'ESP32 Link',
    distanceKm: 0,
    createdAt: new Date().toISOString()
  });
  state.alerts = state.alerts.slice(0, 8);
  simulateTelemetry();
  res.json({ ok: true, device, snapshot: buildSnapshot() });
});

app.post('/api/esp32/data', (req, res) => {
  const incoming = req.body || {};
  const device = registerDevice(incoming, true);

  if (incoming.flameSensor) {
    state.flameSensor = { ...(state.flameSensor || { status: 'Safe', intensity: 0, threshold: 70, lastDetectedAt: null }), ...incoming.flameSensor };
  }
  if (incoming.vibrationSensor) {
    state.vibrationSensor = { ...(state.vibrationSensor || { status: 'Normal', level: 0, threshold: 50, lastDetectedAt: null }), ...incoming.vibrationSensor };
  }
  if (incoming.transformer) {
    state.transformer = {
      ...state.transformer,
      ...incoming.transformer,
      voltage: { ...(state.transformer.voltage || {}), ...(incoming.transformer.voltage || {}) },
      current: { ...(state.transformer.current || {}), ...(incoming.transformer.current || {}) },
      power: { ...(state.transformer.power || {}), ...(incoming.transformer.power || {}) }
    };
  }
  state.isTelemetryCleared = false;
  const voltage = Number(state.transformer.voltage?.R || 0);
  const current = Number(state.transformer.current?.R || 0);
  if (voltage > 0 && current > 0) {
    const activePower = parseFloat((voltage * current / 1000).toFixed(3));
    state.transformer.power = {
      ...(state.transformer.power || {}),
      active: activePower,
      apparent: activePower
    };
  }
  state.telemetryHistory = [
    ...(state.telemetryHistory || []),
    {
      timestamp: new Date().toISOString(),
      power: state.transformer.power?.active || null,
      energy: state.transformer.energy || null
    }
  ];
  retainRecentTelemetryHistory();
  if (incoming.relayStatus) {
    state.relayStatus = incoming.relayStatus;
  }
  if (incoming.tapPosition !== undefined) {
    state.tapPosition = incoming.tapPosition;
  }

  state.transformer.healthIndex = calculateHealthIndex(state.transformer);
  state.faults = detectFaults(state.transformer);
  const location = locateFault(state.faults, state.transformer);
  state.locationState = location;
  appendAlert(state.faults, location);
  persistState();
  broadcastSnapshot();
  res.json({ ok: true, device, snapshot: buildSnapshot() });
});

app.get('/api/esp32/devices', (req, res) => {
  res.json(state.devices || []);
});

app.get('/api/faults', (req, res) => {
  res.json(state.faults);
});

app.get('/api/alerts', (req, res) => {
  res.json(state.alerts);
});

app.post('/api/reset-values', (req, res) => {
  resetTelemetryState();
  broadcastSnapshot();
  res.json({ ok: true, message: 'Telemetry values cleared and reset to defaults.' });
});

app.get('/api/nodes', (req, res) => {
  res.json(state.nodes);
});

app.post('/api/control/relay', (req, res) => {
  state.relayStatus = req.body.relayStatus || state.relayStatus;
  state.alerts.unshift({
    id: Date.now(),
    type: 'Relay Control',
    severity: 'Low',
    message: `Relay ${state.relayStatus} commanded from the control panel.`,
    location: 'Control Room',
    area: 'Control Room',
    distanceKm: 0,
    createdAt: new Date().toISOString()
  });
  state.alerts = state.alerts.slice(0, 8);
  persistState();
  broadcastSnapshot();
  res.json({ ok: true, relayStatus: state.relayStatus });
});

app.post('/api/control/tap', (req, res) => {
  state.tapPosition = req.body.tapPosition || state.tapPosition;
  state.alerts.unshift({
    id: Date.now(),
    type: 'Tap Adjustment',
    severity: 'Low',
    message: `Tap position changed to ${state.tapPosition}.`,
    location: 'Tap Changer',
    area: 'Transformer Bay',
    distanceKm: 0,
    createdAt: new Date().toISOString()
  });
  state.alerts = state.alerts.slice(0, 8);
  persistState();
  broadcastSnapshot();
  res.json({ ok: true, tapPosition: state.tapPosition });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

startServerOnNextPort();
