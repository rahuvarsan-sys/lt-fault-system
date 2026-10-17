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
const HARDWARE_LOCATION_ADDRESS = 'NH – 67, Covai Road, KarudayampalayaPo, Karudayampalayam, Tamil Nadu 639111';
const HARDWARE_LOCATION_COORDINATES = '10.9551158,77.9548901';
let telemetryInterval = null;
let telemetryStream = null;

function getApiUrl(path) {
  const origin = window.location.origin;
  if (origin && origin !== 'null' && !origin.startsWith('file:')) {
    return `${origin}${path}`;
  }

  const fallbackPort = window.location.port || '4001';
  return `http://localhost:${fallbackPort}${path}`;
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
    <form id="auth-form">
      <div class="form-group">
        <label for="username">Username</label>
        <input id="username" name="username" placeholder="Enter username" autocomplete="username" required />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" placeholder="Enter password" autocomplete="current-password" required />
      </div>
      <div class="form-group">
        <label for="role">Role</label>
        <select id="role" name="role">
          <option value="Staff">Staff</option>
          <option value="Operator">Operator</option>
          <option value="Admin">Admin</option>
        </select>
      </div>
      <p class="small" id="auth-message" role="alert" aria-live="polite"></p>
      <div class="inline-actions">
        <button class="primary-btn" id="login-btn" type="submit">Login</button>
        <button class="secondary-btn" id="register-btn" type="button">Create Account</button>
      </div>
    </form>
    <p class="small" style="margin-top:10px">Demo credentials: admin/admin123, operator/operator123, staff/staff123</p>
  `;

  const handleAuth = async (endpoint, payload) => {
    const message = card.querySelector('#auth-message');
    const loginButton = card.querySelector('#login-btn');
    loginButton.disabled = true;
    message.textContent = '';
    try {
      const response = await fetch(getApiUrl(`/api/auth/${endpoint}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        message.textContent = result.message || 'Unable to sign in. Please try again.';
        return;
      }

      const user = { ...result.user };
      if (payload.password) user.password = payload.password;
      state.auth = user;
      state.view = 'device';
      saveSession(user);
      await fetchTelemetry();
      startTelemetryPolling();
      render();
    } catch (error) {
      console.error('Authentication request failed', error);
      message.textContent = 'Could not connect to the server. Check that the app is running and try again.';
    } finally {
      loginButton.disabled = false;
    }
  };

  card.querySelector('#auth-form').addEventListener('submit', (event) => {
    event.preventDefault();
    handleAuth('login', {
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    });
  });

  card.querySelector('#register-btn').addEventListener('click', () => {
    if (!card.querySelector('#auth-form').reportValidity()) return;
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
    if (telemetryStream) {
      telemetryStream.close();
      telemetryStream = null;
    }
    if (telemetryInterval) {
      clearInterval(telemetryInterval);
      telemetryInterval = null;
    }
    state.auth = null;
    state.telemetry = null;
    state.lastDeviceIp = null;
    state.view = 'device';
    saveSession(null);
    saveDeviceIp(null);
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
        if (telemetryStream) {
          telemetryStream.close();
          telemetryStream = null;
        }
        if (telemetryInterval) {
          clearInterval(telemetryInterval);
          telemetryInterval = null;
        }
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
  if (status === 'Flame Detected') return 'danger';
  if (status === 'Warning') return 'warn';
  return 'safe';
}

function getFlamePillClass(status) {
  if (status === 'Flame Detected') return 'red';
  if (status === 'Warning') return 'yellow';
  return 'green';
}

function getFlameStatusText() {
  if (state.telemetry?.isTelemetryCleared) return 'No data';
  return state.telemetry?.flameSensor?.status || 'No data';
}

function getVibrationStatusClass(status) {
  if (status === 'High Vibration') return 'danger';
  if (status === 'Warning') return 'warn';
  return 'safe';
}

function getVibrationPillClass(status) {
  if (status === 'High Vibration') return 'red';
  if (status === 'Warning') return 'yellow';
  return 'green';
}

function getVibrationStatusText() {
  if (state.telemetry?.isTelemetryCleared) return 'No data';
  return state.telemetry?.vibrationSensor?.status || 'No data';
}

function renderDeviceRegistration() {
  const section = createElement('div');
  const devices = state.telemetry?.devices || [];
  const registeredDevice = devices.find((device) => device.ipAddress === state.lastDeviceIp)
    || (!state.lastDeviceIp ? devices.find((device) => device.status === 'Online') : null)
    || null;
  const isReceivingData = Boolean(registeredDevice?.lastTelemetryAt && registeredDevice.status === 'Online');
  const isRegisteredOnline = Boolean(registeredDevice && registeredDevice.status === 'Online');
  const boardIp = state.lastDeviceIp || registeredDevice?.ipAddress || '---';
  const hardwareStatus = isReceivingData ? 'LIVE' : isRegisteredOnline ? 'READY' : 'OFFLINE';
  const statusClass = isReceivingData ? 'green' : isRegisteredOnline ? 'blue' : 'red';

  section.dataset.deviceRegistration = 'true';
  section.innerHTML = `
    <div class="hero">
      <div>
        <div class="pill">Hardware Connection Setup</div>
        <h1>Register Your ESP32 Device</h1>
        <p class="small">No values are shown until the ESP32 sends live readings.</p>
      </div>
      <div class="panel status-panel">
        <div class="label-row">
          <strong>Hardware Status</strong>
          <span class="status-pill ${statusClass}" data-device-status>${hardwareStatus}</span>
        </div>
        <div class="small">Linked Board IP: <span data-device-ip>${boardIp}</span></div>
        <div class="small">Current role: ${state.auth.role}</div>
        <div class="small">Last update: <span data-device-last-update>${new Date().toLocaleTimeString()}</span></div>
      </div>
    </div>
    <div class="grid grid-2">
      <div class="panel">
        <div class="label-row"><strong>ESP32 Hardware Link</strong><span class="status-pill green">Device Registration</span></div>
        <p class="small">Use this screen as the first setup step for your connected flame sensor board.</p>
        <div class="form-group">
          <label for="esp32-ip">ESP32 IP Address</label>
          <input id="esp32-ip" placeholder="e.g. 192.168.1.50" />
        </div>
        <div class="inline-actions">
          <button class="primary-btn" id="connect-esp32">Connect</button>
        </div>
        <div id="esp32-status" class="small" style="margin-top:10px">${isReceivingData ? `${registeredDevice.name} is sending sensor readings.` : isRegisteredOnline ? `${registeredDevice.name} is ready. No values are shown until live telemetry arrives.` : state.deviceStatusMessage || 'No board registered yet.'}</div>
        <div class="small" style="margin-top:8px">In the ESP32 sketch, set <code>serverHost</code> to this computer's address below, not the ESP32 IP. Set <code>serverPort</code> to the matching port.</div>
        <div id="server-host-addresses" class="small" style="margin-top:6px">Finding this computer's LAN address...</div>
        <ul class="device-list" data-device-list>${renderRegisteredDevices(devices)}</ul>
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

  fetch(getApiUrl('/api/connection-info'))
    .then((response) => response.json())
    .then(({ addresses, port }) => {
      const addressList = section.querySelector('#server-host-addresses');
      if (!addressList?.isConnected) return;
      addressList.textContent = addresses.length
        ? `Set serverHost to one of: ${addresses.join(', ')} (port ${port})`
        : 'No LAN IPv4 address found. Check that this computer is connected to the same network as the ESP32.';
    })
    .catch(() => {
      const addressList = section.querySelector('#server-host-addresses');
      if (addressList?.isConnected) {
        addressList.textContent = 'Could not find the server address. Check that the app server is running.';
      }
    });

  section.querySelector('#connect-esp32').addEventListener('click', async () => {
    const ipAddress = section.querySelector('#esp32-ip').value.trim();
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
      state.deviceStatusMessage = `${result.device.name} registered. Waiting for the first live telemetry update.`;
      state.telemetry = result.snapshot;
      render();
      await fetchTelemetry();
    } else {
      state.deviceStatusMessage = 'Could not connect the ESP32 board.';
      render();
    }
  });

  return section;
}

function renderRegisteredDevices(devices) {
  return devices.map((device) => {
    const status = device.status !== 'Online' ? 'Offline' : device.lastTelemetryAt ? 'Live' : 'Ready (baseline)';
    return `<li class="device-item"><strong>${device.name}</strong><span>${device.ipAddress}</span><span>${status}</span></li>`;
  }).join('');
}

function updateDeviceRegistrationView() {
  const section = document.querySelector('[data-device-registration]');
  if (!section) return;

  const devices = state.telemetry?.devices || [];
  const registeredDevice = devices.find((device) => device.ipAddress === state.lastDeviceIp)
    || (!state.lastDeviceIp ? devices.find((device) => device.status === 'Online') : null)
    || null;
  const isReceivingData = Boolean(registeredDevice?.lastTelemetryAt && registeredDevice.status === 'Online');
  const isRegisteredOnline = Boolean(registeredDevice && registeredDevice.status === 'Online');
  const status = section.querySelector('[data-device-status]');
  if (status) {
    status.textContent = isReceivingData ? 'LIVE' : isRegisteredOnline ? 'READY' : 'OFFLINE';
    status.className = `status-pill ${isReceivingData ? 'green' : isRegisteredOnline ? 'blue' : 'red'}`;
  }

  const deviceIp = section.querySelector('[data-device-ip]');
  if (deviceIp) deviceIp.textContent = state.lastDeviceIp || registeredDevice?.ipAddress || '---';

  const lastUpdate = section.querySelector('[data-device-last-update]');
  if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString();

  const statusMessage = section.querySelector('#esp32-status');
  if (statusMessage) {
    statusMessage.textContent = isReceivingData
      ? `${registeredDevice.name} is sending sensor readings.`
      : isRegisteredOnline
        ? `${registeredDevice.name} is ready. No values are shown until live telemetry arrives.`
        : state.deviceStatusMessage || 'No board registered yet.';
  }

  const deviceList = section.querySelector('[data-device-list]');
  if (deviceList) deviceList.innerHTML = renderRegisteredDevices(devices);
}

function renderHome() {
  const section = createElement('div');
  section.innerHTML = `
    <div class="hero">
      <div>
        <div class="pill">Smart transformer monitoring • AI assisted</div>
        <h1>Smart Transformer Digital Twin for TNEB</h1>
        <p>The digital twin monitors live voltage and current signals from connected hardware and identifies faults for resilient power delivery.</p>
      </div>
      <div class="panel">
        <div class="label-row">
          <strong>System Status</strong>
          <span class="status-pill ${state.telemetry?.isTelemetryCleared ? 'blue' : 'green'}">${state.telemetry?.isTelemetryCleared ? 'No live data' : 'Live telemetry'}</span>
        </div>
        <div class="small">Current role: ${state.auth.role}</div>
        <div class="small">Last update: ${new Date().toLocaleTimeString()}</div>
      </div>
    </div>
    <div class="grid grid-6">
      <div class="metric-card"><h4>Voltage</h4><div class="value">${renderVoltage()}</div><div class="sub">Single-phase voltage</div></div>
      <div class="metric-card"><h4>Current</h4><div class="value">${renderCurrent()}</div><div class="sub">Single-phase current</div></div>
      <div class="metric-card"><h4>Health Index</h4><div class="value">${displayValue(state.telemetry?.transformer?.healthIndex)}</div><div class="sub">Transformer condition score</div></div>
      <div class="metric-card"><h4>Fault Area</h4><div class="value">${renderFaultArea()}</div><div class="sub">Nearest node ${renderNearestNode()}</div></div>
      <div class="metric-card"><h4>Flame Sensor</h4><div class="value ${getFlameStatusClass(getFlameStatusText())}">${getFlameStatusText()}</div><div class="sub">Intensity ${displayValue(state.telemetry?.flameSensor?.intensity, '%')} • Threshold ${displayValue(state.telemetry?.flameSensor?.threshold, '%')}</div></div>
      <div class="metric-card"><h4>Vibration Sensor</h4><div class="value ${getVibrationStatusClass(getVibrationStatusText())}">${getVibrationStatusText()}</div><div class="sub">Level ${displayValue(state.telemetry?.vibrationSensor?.level, '%')} • Threshold ${displayValue(state.telemetry?.vibrationSensor?.threshold, '%')}</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="panel chart-card">
        <div class="label-row"><strong>Power Trend</strong><span class="status-pill ${getSeverityClass(state.telemetry?.faults?.length ? 'High' : 'Low')}">${state.telemetry?.faults?.length ? 'Alert Active' : 'Stable'}</span></div>
        <canvas id="powerChart"></canvas>
      </div>
      <div class="panel chart-card">
        <div class="label-row"><strong>Energy Consumption</strong><span class="status-pill ${state.telemetry?.isTelemetryCleared ? 'blue' : 'green'}">${state.telemetry?.isTelemetryCleared ? 'No live data' : 'Live'}</span></div>
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
      <div class="metric-card"><h4>Active Power</h4><div class="value">${displayPower(state.telemetry?.transformer?.power?.active, 'W')}</div></div>
      <div class="metric-card"><h4>Reactive Power</h4><div class="value">${displayPower(state.telemetry?.transformer?.power?.reactive, 'VAr')}</div></div>
      <div class="metric-card"><h4>Apparent Power</h4><div class="value">${displayPower(state.telemetry?.transformer?.power?.apparent, 'VA')}</div></div>
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
    <div class="panel" style="margin-top:16px">
      <div class="label-row"><strong>Vibration Sensor Monitor</strong><span class="status-pill ${getVibrationPillClass(getVibrationStatusText())}">${getVibrationStatusText()}</span></div>
      <div class="flame-meter"><div class="flame-fill ${getVibrationStatusClass(getVibrationStatusText())}" style="width:${state.telemetry?.vibrationSensor?.level ?? 0}%"></div></div>
      <div class="small">Level: ${state.telemetry?.vibrationSensor?.level ?? 0}% • Threshold: ${state.telemetry?.vibrationSensor?.threshold ?? 50}%</div>
      <div class="small">Last high vibration: ${state.telemetry?.vibrationSensor?.lastDetectedAt ? new Date(state.telemetry.vibrationSensor.lastDetectedAt).toLocaleTimeString() : 'No event yet'}</div>
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
        <div class="label-row"><strong>Transformer Digital Twin</strong><span class="status-pill ${state.telemetry?.isTelemetryCleared ? 'blue' : 'green'}">${state.telemetry?.isTelemetryCleared ? 'Waiting for hardware' : 'Live hardware data'}</span></div>
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
  const mapUrl = `https://www.google.com/maps?q=${HARDWARE_LOCATION_COORDINATES}&z=17&output=embed`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${HARDWARE_LOCATION_COORDINATES}`;
  section.innerHTML = `
    <div class="map-card fixed-location-map panel">
      <div class="label-row"><strong>Fixed Hardware Location</strong><span class="status-pill blue">Pinned location</span></div>
      <div class="small">${HARDWARE_LOCATION_ADDRESS}</div>
      <iframe title="Map of the fixed hardware location" src="${mapUrl}" loading="lazy" tabindex="-1" referrerpolicy="no-referrer-when-downgrade"></iframe>
      <div class="small">Map pin: ${HARDWARE_LOCATION_COORDINATES}</div>
      <a href="${mapLink}" target="_blank" rel="noopener noreferrer">Open this fixed location in Google Maps</a>
    </div>
  `;
  return section;
}

async function fetchTelemetry() {
  if (!state.auth) return;
  try {
    const response = await fetch(getApiUrl('/api/telemetry'));
    if (!response.ok) throw new Error(`Telemetry request failed: ${response.status}`);
    const telemetry = await response.json();
    updateTelemetry(telemetry);
  } catch (error) {
    console.error('Unable to fetch telemetry', error);
  }
}

function startTelemetryPolling() {
  if (telemetryStream || !window.EventSource) {
    if (!telemetryInterval) telemetryInterval = setInterval(fetchTelemetry, 4000);
    return;
  }

  telemetryStream = new EventSource(getApiUrl('/api/telemetry/stream'));
  telemetryStream.onopen = () => {
    if (telemetryInterval) {
      clearInterval(telemetryInterval);
      telemetryInterval = null;
    }
  };
  telemetryStream.onmessage = (event) => {
    try {
      updateTelemetry(JSON.parse(event.data));
    } catch (error) {
      console.error('Unable to read live telemetry update', error);
    }
  };
  telemetryStream.onerror = () => {
    if (!telemetryInterval) telemetryInterval = setInterval(fetchTelemetry, 4000);
  };
}

function updateTelemetry(telemetry) {
  state.telemetry = telemetry;
  if (state.view === 'device') {
    updateDeviceRegistrationView();
    return;
  }
  if (state.view === 'map') return;

  const activeElement = document.activeElement;
  const preserveInput = activeElement instanceof HTMLInputElement && activeElement.id
    ? { id: activeElement.id, value: activeElement.value, start: activeElement.selectionStart, end: activeElement.selectionEnd }
    : null;
  render();
  if (preserveInput) {
    const replacement = document.getElementById(preserveInput.id);
    if (replacement) {
      replacement.value = preserveInput.value;
      replacement.focus();
      if (preserveInput.start !== null && preserveInput.end !== null) {
        replacement.setSelectionRange(preserveInput.start, preserveInput.end);
      }
    }
  }
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

  const history = state.telemetry?.telemetryHistory || [];
  const labels = history.map((entry) => new Date(entry.timestamp).toLocaleTimeString());
  const powerData = history.map((entry) => entry.power == null ? null : Number(entry.power) * 1000);
  const energyData = history.map((entry) => entry.energy);

  state.charts.power = new Chart(powerCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Power (W)',
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
      labels,
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
  if (state.telemetry?.isTelemetryCleared) return '-- V';
  const v = state.telemetry?.transformer?.voltage;
  if (!v || v.R == null || Number.isNaN(Number(v.R))) {
    return '-- V';
  }
  return `${Number(v.R).toFixed(0)} V`;
}

function renderCurrent() {
  if (state.telemetry?.isTelemetryCleared) return '-- A';
  const c = state.telemetry?.transformer?.current;
  if (!c || c.R == null || Number.isNaN(Number(c.R))) {
    return '-- A';
  }
  return `${Number(c.R).toFixed(3)} A`;
}

function displayValue(value, suffix = '') {
  if (state.telemetry?.isTelemetryCleared || value == null) return '--';
  return `${value}${suffix}`;
}

function displayPower(powerKilounits, unit) {
  if (state.telemetry?.isTelemetryCleared || powerKilounits == null || !Number.isFinite(Number(powerKilounits))) {
    return '--';
  }
  return `${(Number(powerKilounits) * 1000).toFixed(2)} ${unit}`;
}

function renderFaultArea() {
  if (state.telemetry?.isTelemetryCleared) return 'No data';
  const area = state.telemetry?.locationState?.faultArea;
  return area || 'No data';
}

function renderNearestNode() {
  if (state.telemetry?.isTelemetryCleared) return 'No data';
  const node = state.telemetry?.locationState?.nearestNode;
  return node || 'No data';
}

function renderFaultDistance() {
  const distance = state.telemetry?.locationState?.faultDistanceKm;
  return distance ? `${distance} km` : '';
}

function getTelemetryStatusClass() {
  if (state.telemetry?.isTelemetryCleared) return 'blue';
  const load = state.telemetry?.transformer?.loadPercent || 0;
  if (load > 85) return 'red';
  if (load > 70) return 'yellow';
  return 'green';
}

function getTelemetryStatus() {
  if (state.telemetry?.isTelemetryCleared) return 'No live data';
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
  if (restoredUser) saveSession(null);
  render();
})();
