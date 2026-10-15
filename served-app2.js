const state = {
  auth: null,
  view: 'device',
  telemetry: null,
  charts: {},
  deviceStatusMessage: '',
  lastDeviceIp: null
};

const SESSION_STORAGE_KEY = 'tneb-digital-twin-auth';
const DEVICE_IP_STORAGE_KEY = 'tneb-digital-twin-esp32-ip';
let telemetryInterval = null;

function getApiUrl(path) {
  const origin = window.location.origin;
  return origin && origin !== 'null' ? `${origin}${path}` : `http://localhost:4000${path}`;
}

function createElement(tag, className, innerHTML) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (innerHTML !== undefined) element.innerHTML = innerHTML;
  return element;
}

function saveSession(user) {
  if (!user) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

function restoreSession() {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed?.username) return null;
    return parsed;
  } catch (error) {
    console.warn('Unable to restore session', error);
    return null;
  }
}

function restoreDeviceIp() {
  return localStorage.getItem(DEVICE_IP_STORAGE_KEY) || null;
}

function saveDeviceIp(ip) {
  if (!ip) {
    localStorage.removeItem(DEVICE_IP_STORAGE_KEY);
    return;
  }
  localStorage.setItem(DEVICE_IP_STORAGE_KEY, ip);
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  if (!state.auth) {
    app.appendChild(renderLogin());
    return;
  }

  app.appendChild(renderShell());
}

function renderLogin() {
  const card = createElement('div', 'login-card');
  card.innerHTML = `
    <div class="pill">TNEB Smart Grid Operations</div>
    <h2>Secure Control Access</h2>
    <p class="small">Create your own username and password, or use the demo accounts.</p>
    <div class="form-group">
      <label>Username</label>
      <input id="username" placeholder="Enter username" />
    </div>
    <div class="form-group">
      <label>Password</label>
      <input id="password" type="password" placeholder="Enter password" />
    </div>
    <div class="form-group">
      <label>Role</label>
      <select id="role">
        <option value="Staff">Staff</option>
        <option value="Operator">Operator</option>
        <option value="Admin">Admin</option>
      </select>
    </div>
    <div class="inline-actions">
      <button class="primary-btn" id="login-btn">Login</button>
      <button class="secondary-btn" id="register-btn">Create Account</button>
    </div>
    <p class="small" style="margin-top:10px">Demo credentials: admin/admin123, operator/operator123, staff/staff123</p>
  `;

  const handleAuth = async (endpoint, payload) => {
    const response = await fetch(getApiUrl(`/api/auth/${endpoint}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (result.ok) {
      const user = { ...result.user };
      if (payload.password) user.password = payload.password;
      state.auth = user;
      state.view = 'device';
      saveSession(user);
      await fetchTelemetry();
      startTelemetryPolling();
      render();
    } else {
      alert(result.message);
    }
  };

  card.querySelector('#login-btn').addEventListener('click', () => {
    handleAuth('login', {
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    });
  });

  card.querySelector('#register-btn').addEventListener('click', () => {
    handleAuth('register', {
      username: document.getElementById('username').value,
      password: document.getElementById('password').value,
      role: document.getElementById('role').value
    });
  });

  return card;
}

function renderShell() {
  const shell = createElement('div', 'app-shell');
  shell.innerHTML = `
    <div class="navbar">
      <div class="brand">
        <strong>TNEB • AI Smart Transformer Digital Twin</strong>
        <span>LT line fault detection and location system</span>
      </div>
      <div class="nav-links">
        <button data-view="device" class="${state.view === 'device' ? 'active' : ''}">Device Registration</button>
        <button data-view="home" class="${state.view === 'home' ? 'active' : ''}">Home</button>
        <button data-view="dashboard" class="${state.view === 'dashboard' ? 'active' : ''}">Operator Dashboard</button>
        <button data-view="control" class="${state.view === 'control' ? 'active' : ''}">Staff Control Panel</button>
        <button data-view="faults" class="${state.view === 'faults' ? 'active' : ''}">Fault Monitoring</button>
        <button data-view="twin" class="${state.view === 'twin' ? 'active' : ''}">Digital Twin</button>
        <button data-view="map" class="${state.view === 'map' ? 'active' : ''}">Live Map</button>      <button data-view="profile" class="${state.view === 'profile' ? 'active' : ''}">Profile</button>        <button id="logout">Logout</button>
      </div>
    </div>
  `;

  const content = createElement('div');
  if (state.view === 'device') content.appendChild(renderDeviceRegistration());
  if (state.view === 'home') content.appendChild(renderHome());
  if (state.view === 'dashboard') content.appendChild(renderDashboard());
  if (state.view === 'control') content.appendChild(renderControl());
  if (state.view === 'faults') content.appendChild(renderFaults());
  if (state.view === 'twin') content.appendChild(renderTwin());
  if (state.view === 'map') content.appendChild(renderMap());
  if (state.view === 'profile') content.appendChild(renderProfile());
  shell.appendChild(content);

  shell.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.getAttribute('data-view');
      render();
    });
  });

  shell.querySelector('#logout').addEventListener('click', () => {
    if (telemetryInterval) {
      clearInterval(telemetryInterval);
      telemetryInterval = null;
    }
    state.auth = null;
    state.telemetry = null;
    state.view = 'device';
    saveSession(null);
    render();
  });

  return shell;
}

function renderProfile() {
  const section = createElement('div');
  section.innerHTML = `
    <div class="hero">
      <div>
        <div class="pill">Profile Settings</div>
        <h1>Account Details</h1>
        <p class="small">Your username and role are visible here only.</p>
      </div>
    </div>
    <div class="panel" style="max-width: 560px; margin: 0 auto;">
      <div class="form-group">
        <label>Username</label>
        <input id="current-username" value="${state.auth.username}" disabled />
      </div>
      <div class="form-group password-group">
        <label>Password</label>
        <input id="current-password" type="text" value="${state.auth.password || ''}" readonly />
      </div>
      <div class="form-group">
        <label>Role</label>
        <input id="current-role" value="${state.auth.role}" disabled />
      </div>
      <div class="form-group">
        <button class="secondary-btn" id="reset-values">Reset All Values</button>
        <p class="small" style="margin-top:8px">Click to clear the current telemetry values and restore the system to default demo state.</p>
      </div>
    </div>
  `;

  section.querySelector('#reset-values').addEventListener('click', async () => {
    if (!confirm('Clear all telemetry values, local data, and sign out?')) return;
    try {
      const response = await fetch(getApiUrl('/api/reset-values'), { method: 'POST' });
      const result = await response.json();
      if (result.ok) {
        // Clear client-side session and device info
        saveSession(null);
        saveDeviceIp(null);
        try { localStorage.clear(); } catch (e) { /* ignore */ }
        alert(result.message);
        // Ensure UI reflects cleared state
        state.auth = null;
        state.telemetry = null;
        state.view = 'device';
        await fetchTelemetry();
        render();
      } else {
        alert('Unable to reset values.');
      }
    } catch (err) {
      console.error('Reset failed', err);
      alert('Reset failed');
    }
  });

  return section;
}

function getFlameStatusClass(status) {
  if (state.telemetry?.isTelemetryCleared) return '';
  if (status === 'Flame Detected') return 'danger';
  if (status === 'Warning') return 'warn';
  return 'safe';
}

function getFlamePillClass(status) {
  if (state.telemetry?.isTelemetryCleared) return 'grey';
  if (status === 'Flame Detected') return 'red';
  if (status === 'Warning') return 'yellow';
  return 'green';
}

function getFlameStatusText() {
  if (state.telemetry?.isTelemetryCleared) return '--';
  return state.telemetry?.flameSensor?.status || 'Safe';
}

function renderDeviceRegistration() {
  const section = createElement('div');
  const registeredDevice = (state.telemetry?.devices || []).find((device) => device.ipAddress === state.lastDeviceIp || device.status === 'Online') || null;
  const currentDevice = registeredDevice && registeredDevice.status === 'Online' ? registeredDevice : null;
  const boardIp = registeredDevice?.ipAddress || state.lastDeviceIp || '---';
  const hardwareStatus = currentDevice ? 'ONLINE' : registeredDevice ? 'PENDING' : 'OFFLINE';
  const statusClass = currentDevice ? 'green' : registeredDevice ? 'yellow' : 'red';

  section.innerHTML = `
    <div class="hero">
      <div>
        <div class="pill">Hardware Connection Setup</div>
        <h1>Register Your ESP32 Device</h1>
        <p class="small">Enter the ESP32 IP address to link the hardware node, monitor flame activity, and collect telemetry live.</p>
      </div>
      <div class="panel status-panel">
        <div class="label-row">
          <strong>Hardware Status</strong>
          <span class="status-pill ${statusClass}">${hardwareStatus}</span>
        </div>
        <div class="small">Linked Board IP: ${boardIp}</div>
        <div class="small">Current role: ${state.auth.role}</div>
        <div class="small">Last update: ${new Date().toLocaleTimeString()}</div>
      </div>
    </div>
    <div class="grid grid-2">
      <div class="panel">
        <div class="label-row"><strong>ESP32 Hardware Link</strong><span class="status-pill green">Device Registration</span></div>
        <p class="small">Use this screen as the first setup step for your connected flame sensor board.</p>
        <div class="form-group">
          <label>ESP32 IP Address</label>
          <input id="esp32-ip" placeholder="e.g. 192.168.1.50" />
        </div>
        <div class="inline-actions">
          <button class="primary-btn" id="connect-esp32">Connect</button>
        </div>
        <div id="esp32-status" class="small" style="margin-top:10px">${currentDevice ? `${currentDevice.name} is already connected.` : state.deviceStatusMessage || 'No board connected yet.'}</div>
        <div class="small" style="margin-top:8px">Enter the ESP32 IP address to register the board. The device name is generated automatically.</div>
        <ul class="device-list">
          ${(state.telemetry?.devices || []).map((device) => `<li class="device-item"><strong>${device.name}</strong><span>${device.ipAddress}</span><span>${device.status}</span></li>`).join('')}
        </ul>
      </div>
      <div class="panel guide-panel">
        <div class="label-row"><strong>Wiring & Diagnostic Guide</strong><span class="status-pill blue">Reference</span></div>
        <div class="guide-section">
          <h4>Hardware Pins (ESP32)</h4>
          <ul class="guide-list">
            <li>ZMPT101B Voltage Sensor: GPIO 34 (Analog input)</li>
            <li>ACS712 Current Sensor: GPIO 35 (Analog input)</li>
            <li>Solid State Relay (Load): GPIO 18 (Output control)</li>
            <li>ESP32 Built-in LED: GPIO 2 (Status monitor)</li>
          </ul>
        </div>
        <div class="guide-section">
          <h4>Calibration Formulas</h4>
          <p>P = V(rms) × I(rms)</p>
          <p>Tariff rate calculation: Total ₹ = kWh × ₹6.50</p>
        </div>
        <div class="guide-section">
          <h4>Safety Parameters</h4>
          <ul class="guide-list">
            <li>Overvoltage Trip Limit: &gt;245V RMS (Warning logs)</li>
            <li>Undervoltage Drop Limit: &lt;200V RMS (Grid sag logs)</li>
            <li>Max Current Rating: 5.0A (Sensor threshold)</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  section.querySelector('#connect-esp32').addEventListener('click', async () => {
    const ipAddress = document.getElementById('esp32-ip').value.trim();
    if (!ipAddress) {
      state.deviceStatusMessage = 'Please enter the ESP32 IP address.';
      render();
      return;
    }

    const response = await fetch(getApiUrl('/api/esp32/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: `ESP32-${ipAddress}`, ipAddress })
    });
    const result = await response.json();
    if (result.ok) {
      state.lastDeviceIp = result.device.ipAddress;
      saveDeviceIp(result.device.ipAddress);
      state.deviceStatusMessage = `${result.device.name} connected at ${result.device.ipAddress}.`;
      if (result.snapshot) {
        state.telemetry = result.snapshot;
      }
      await fetchTelemetry();
    } else {
      state.deviceStatusMessage = 'Could not connect the ESP32 board.';
      render();
    }
  });

  return section;
}

function renderHome() {
  const section = createElement('div');
  section.innerHTML = `
    <div class="hero">
      <div>
        <div class="pill">Smart transformer monitoring • AI assisted</div>
        <h1>Smart Transformer Digital Twin for TNEB</h1>
        <p>The digital twin simulates LT line behavior, monitors voltage and current signals, and identifies faults instantly for resilient power delivery.</p>
      </div>
      <div class="panel">
        <div class="label-row">
          <strong>Live System Status</strong>
          <span class="status-pill green">● Online</span>
        </div>
        <div class="small">Current role: ${state.auth.role}</div>
        <div class="small">Last update: ${new Date().toLocaleTimeString()}</div>
      </div>
    </div>
    <div class="grid grid-5">
      <div class="metric-card"><h4>Voltage</h4><div class="value">${renderVoltage()}</div><div class="sub">Single-phase voltage</div></div>
      <div class="metric-card"><h4>Current</h4><div class="value">${renderCurrent()}</div><div class="sub">Single-phase current</div></div>
      <div class="metric-card"><h4>Health Index</h4><div class="value">${displayValue(state.telemetry?.transformer?.healthIndex)}</div><div class="sub">Transformer condition score</div></div>
      <div class="metric-card"><h4>Fault Area</h4><div class="value">${renderFaultArea()}</div><div class="sub">Nearest node ${renderNearestNode()}</div></div>
      <div class="metric-card"><h4>Flame Sensor</h4><div class="value ${getFlameStatusClass(getFlameStatusText())}">${getFlameStatusText()}</div><div class="sub">Intensity ${state.telemetry?.isTelemetryCleared ? '--' : state.telemetry?.flameSensor?.intensity ?? 0}% • Threshold ${state.telemetry?.isTelemetryCleared ? '--' : state.telemetry?.flameSensor?.threshold ?? 70}%</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="panel chart-card">
        <div class="label-row"><strong>Power Trend</strong><span class="status-pill ${getSeverityClass(state.telemetry?.faults?.length ? 'High' : 'Low')}">${state.telemetry?.faults?.length ? 'Alert Active' : 'Stable'}</span></div>
        <canvas id="powerChart"></canvas>
      </div>
      <div class="panel chart-card">
        <div class="label-row"><strong>Energy Consumption</strong><span class="status-pill green">Live</span></div>
        <canvas id="energyChart"></canvas>
      </div>
    </div>
  `;

  setTimeout(() => renderCharts(), 50);
  return section;
}

function renderDashboard() {
  const section = createElement('div');
  section.innerHTML = `
    <div class="grid grid-4">
      <div class="metric-card"><h4>Active Power</h4><div class="value">${displayValue(state.telemetry?.transformer?.power?.active, ' kW')}</div></div>
      <div class="metric-card"><h4>Reactive Power</h4><div class="value">${displayValue(state.telemetry?.transformer?.power?.reactive, ' kVAr')}</div></div>
      <div class="metric-card"><h4>Apparent Power</h4><div class="value">${displayValue(state.telemetry?.transformer?.power?.apparent, ' kVA')}</div></div>
      <div class="metric-card"><h4>Power Factor</h4><div class="value">${displayValue(state.telemetry?.transformer?.powerFactor)}</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="panel">
        <div class="label-row"><strong>Operational Metrics</strong><span class="status-pill ${getTelemetryStatusClass()}">${getTelemetryStatus()}</span></div>
        <table class="table">
          <tr><th>Frequency</th><td>${displayValue(state.telemetry?.transformer?.frequency, ' Hz')}</td></tr>
          <tr><th>Temperature</th><td>${displayValue(state.telemetry?.transformer?.temperature, ' °C')}</td></tr>
          <tr><th>Load %</th><td>${displayValue(state.telemetry?.transformer?.loadPercent, '%')}</td></tr>
          <tr><th>Energy</th><td>${displayValue(state.telemetry?.transformer?.energy, ' kWh')}</td></tr>
        </table>
      </div>
      <div class="panel">
        <div class="label-row"><strong>Critical Alerts</strong><span class="status-pill ${getStatusClassFromAlerts()}">${(state.telemetry?.alerts || []).length} active</span></div>
        <table class="table">
          ${(state.telemetry?.alerts || []).slice(0, 5).map((alert) => `<tr><td>${alert.type}</td><td>${alert.severity}</td><td>${alert.message}</td></tr>`).join('')}
        </table>
      </div>
    </div>
  `;
  return section;
}

function renderControl() {
  const section = createElement('div');
  section.innerHTML = `
    <div class="grid grid-2">
      <div class="panel">
        <div class="label-row"><strong>Relay Control</strong><span class="status-pill ${state.telemetry?.relayStatus === 'ON' ? 'green' : 'yellow'}">${state.telemetry?.relayStatus || 'ON'}</span></div>
        <p class="small">Staff can remotely switch the relay circuit and monitor remote operations.</p>
        <div class="inline-actions">
          <button class="primary-btn" id="relay-on">Relay ON</button>
          <button class="secondary-btn" id="relay-off">Relay OFF</button>
        </div>
      </div>
      <div class="panel">
        <div class="label-row"><strong>Tap Changer Control</strong><span class="status-pill blue">Tap ${state.telemetry?.tapPosition || 2}</span></div>
        <p class="small">Adjust tap position to stabilize voltage under changing load conditions.</p>
        <div class="inline-actions">
          <button class="secondary-btn" id="tap-down">Tap -</button>
          <button class="secondary-btn" id="tap-up">Tap +</button>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="label-row"><strong>Flame Sensor Monitor</strong><span class="status-pill ${getFlamePillClass(getFlameStatusText())}">${getFlameStatusText()}</span></div>
      <div class="flame-meter"><div class="flame-fill ${getFlameStatusClass(getFlameStatusText())}" style="width:${state.telemetry?.flameSensor?.intensity ?? 0}%"></div></div>
      <div class="small">Intensity: ${state.telemetry?.flameSensor?.intensity ?? 0}% • Threshold: ${state.telemetry?.flameSensor?.threshold ?? 70}%</div>
      <div class="small">Last detected: ${state.telemetry?.flameSensor?.lastDetectedAt ? new Date(state.telemetry.flameSensor.lastDetectedAt).toLocaleTimeString() : 'No event yet'}</div>
    </div>
  `;

  section.querySelector('#relay-on').addEventListener('click', () => sendControl('relay', 'ON'));
  section.querySelector('#relay-off').addEventListener('click', () => sendControl('relay', 'OFF'));
  section.querySelector('#tap-down').addEventListener('click', () => sendTap(-1));
  section.querySelector('#tap-up').addEventListener('click', () => sendTap(1));
  return section;
}

function renderFaults() {
  const section = createElement('div');
  section.innerHTML = `
    <div class="panel">
      <div class="label-row"><strong>Fault Monitoring</strong><span class="status-pill ${getStatusClassFromFaults()}">${(state.telemetry?.faults || []).length || 0} active fault signatures</span></div>
      <table class="table">
        <thead><tr><th>Fault</th><th>Severity</th><th>Location</th><th>Description</th></tr></thead>
        <tbody>
          ${(state.telemetry?.faults || []).map((fault) => `<tr><td>${fault.type}</td><td><span class="badge ${severityToClass(fault.severity)}">${fault.severity}</span></td><td>${fault.location}</td><td>${fault.description}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  return section;
}

function renderTwin() {
  const section = createElement('div');
  section.innerHTML = `
    <div class="grid grid-2">
      <div class="panel">
        <div class="label-row"><strong>Transformer Digital Twin</strong><span class="status-pill green">Simulation Active</span></div>
        <div class="transformer-visual">
          <div class="transformer-box"></div>
          <div class="small">Relay: ${displayValue(state.telemetry?.relayStatus)} • Tap: ${displayValue(state.telemetry?.tapPosition)} • Load: ${displayValue(state.telemetry?.transformer?.loadPercent, '%')}</div>
          <div class="small">Temperature: ${displayValue(state.telemetry?.transformer?.temperature, ' °C')} • Health Index: ${displayValue(state.telemetry?.transformer?.healthIndex)}</div>
        </div>
      </div>
      <div class="panel">
        <div class="label-row"><strong>Fault Simulation</strong><span class="status-pill ${getStatusClassFromFaults()}">Live behavior</span></div>
        <p class="small">The digital twin responds to voltage, power, and temperature variations in near real-time. Faults shift the highlighted node and update the affected area.</p>
        <div class="small">Current fault location: ${renderFaultArea()} ${renderFaultDistance()}</div>
      </div>
    </div>
  `;
  return section;
}

function renderMap() {
  const section = createElement('div');
  section.innerHTML = `
    <div class="grid grid-2">
      <div class="map-card panel">
        <div class="label-row"><strong>Live Network Map</strong><span class="status-pill yellow">Node Tracking</span></div>
        <iframe src="https://www.google.com/maps?q=12.9784,80.2422&z=12&output=embed"></iframe>
      </div>
      <div class="panel">
        <div class="label-row"><strong>Node & Fault Area</strong><span class="status-pill ${getStatusClassFromFaults()}">${state.telemetry?.locationState?.nearestNode || 'Substation'}</span></div>
        <table class="table">
          <thead><tr><th>Node</th><th>Distance</th><th>Role</th></tr></thead>
          <tbody>
            ${(state.telemetry?.nodes || []).map((node) => `<tr><td>${node.name}</td><td>${node.distanceKm} km</td><td>${node.name === state.telemetry?.locationState?.nearestNode ? 'Affected' : 'Normal'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  return section;
}

async function fetchTelemetry() {
  if (!state.auth) return;
  const response = await fetch(getApiUrl('/api/telemetry'));
  const telemetry = await response.json();
  state.telemetry = telemetry;
  render();
}

function startTelemetryPolling() {
  if (telemetryInterval) return;
  telemetryInterval = setInterval(fetchTelemetry, 4000);
}

async function sendControl(type, value) {
  const endpoint = type === 'relay' ? '/api/control/relay' : '/api/control/tap';
  const payload = type === 'relay' ? { relayStatus: value } : { tapPosition: value };
  await fetch(getApiUrl('/api/control' + (type === 'relay' ? '/relay' : '/tap')), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  fetchTelemetry();
}

function sendTap(delta) {
  const next = (state.telemetry?.tapPosition || 2) + delta;
  fetch(getApiUrl('/api/control/tap'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tapPosition: next })
  }).then(() => fetchTelemetry());
}

function renderCharts() {
  const powerCanvas = document.getElementById('powerChart');
  const energyCanvas = document.getElementById('energyChart');
  if (!powerCanvas || !energyCanvas) return;

  if (state.charts.power) state.charts.power.destroy();
  if (state.charts.energy) state.charts.energy.destroy();

  const powerData = [30, 35, 38, 42, 39, 45];
  const energyData = [7200, 7400, 7600, 7800, 7700, 7900];

  state.charts.power = new Chart(powerCanvas, {
    type: 'line',
    data: {
      labels: ['00', '04', '08', '12', '16', '20'],
      datasets: [{
        label: 'Power (kW)',
        data: powerData,
        borderColor: '#4BB0F2',
        backgroundColor: 'rgba(75, 176, 242, 0.18)',
        tension: 0.4,
        borderWidth: 2,
        fill: true
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { color: '#cfd7e3' } }, x: { ticks: { color: '#cfd7e3' } } }
    }
  });

  state.charts.energy = new Chart(energyCanvas, {
    type: 'bar',
    data: {
      labels: ['00', '04', '08', '12', '16', '20'],
      datasets: [{
        label: 'Energy (kWh)',
        data: energyData,
        backgroundColor: ['#4BB0F2', '#5DD5B8', '#F2C94C', '#4BB0F2', '#5DD5B8', '#F2C94C']
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { color: '#cfd7e3' } }, x: { ticks: { color: '#cfd7e3' } } }
    }
  });
}

function renderVoltage() {
  if (state.telemetry?.isTelemetryCleared) {
    return '-- V';
  }

  const v = state.telemetry?.transformer?.voltage;
  if (!v || v.R === 0) {
    return '-- V';
  }
  return `${v.R.toFixed(0)} V`;
}

function renderCurrent() {
  if (state.telemetry?.isTelemetryCleared) {
    return '-- A';
  }

  const c = state.telemetry?.transformer?.current;
  if (!c || c.R === 0) {
    return '-- A';
  }
  return `${c.R.toFixed(0)} A`;
}

function displayValue(value, suffix = '') {
  if (state.telemetry?.isTelemetryCleared) return '--';
  if (value == null) return '--';
  return `${value}${suffix}`;
}

function renderFaultArea() {
  if (state.telemetry?.isTelemetryCleared) return '--';
  const area = state.telemetry?.locationState?.faultArea;
  return area && area !== 'Normal' ? area : '--';
}

function renderNearestNode() {
  if (state.telemetry?.isTelemetryCleared) return '--';
  const node = state.telemetry?.locationState?.nearestNode;
  return node && node !== 'Substation' ? node : '--';
}

function renderFaultDistance() {
  const distance = state.telemetry?.locationState?.faultDistanceKm;
  return distance ? `${distance} km` : '';
}

function getTelemetryStatusClass() {
  if (state.telemetry?.isTelemetryCleared) return 'grey';
  const load = state.telemetry?.transformer?.loadPercent || 0;
  if (load > 85) return 'red';
  if (load > 70) return 'yellow';
  return 'green';
}

function getTelemetryStatus() {
  if (state.telemetry?.isTelemetryCleared) return 'No data';
  const load = state.telemetry?.transformer?.loadPercent || 0;
  if (load > 85) return 'Critical Load';
  if (load > 70) return 'Elevated Load';
  return 'Nominal';
}

function getStatusClassFromAlerts() {
  const alerts = state.telemetry?.alerts || [];
  const hasHigh = alerts.some((alert) => alert.severity === 'High' || alert.severity === 'Critical');
  if (hasHigh) return 'red';
  const hasMedium = alerts.some((alert) => alert.severity === 'Medium');
  if (hasMedium) return 'yellow';
  return 'green';
}

function getStatusClassFromFaults() {
  const faults = state.telemetry?.faults || [];
  if (faults.some((fault) => fault.severity === 'Critical')) return 'red';
  if (faults.some((fault) => fault.severity === 'High')) return 'yellow';
  return 'green';
}

function severityToClass(severity) {
  if (severity === 'Critical' || severity === 'High') return 'red';
  if (severity === 'Medium') return 'yellow';
  return 'green';
}

function getSeverityClass(severity) {
  if (severity === 'High' || severity === 'Critical') return 'red';
  if (severity === 'Medium') return 'yellow';
  return 'green';
}


(async function init() {
  const restoredUser = restoreSession();
  state.lastDeviceIp = restoreDeviceIp();
  // Start with telemetry cleared so initial readings are hidden
  state.telemetry = { isTelemetryCleared: true };
  if (restoredUser) {
    state.auth = restoredUser;
    state.view = 'device';
    // Do not auto-fetch telemetry on load; user action (connect/login) triggers data
  }
  render();
})();
