const state = {
  auth: null,
  view: 'home',
  telemetry: null,
  charts: {},
  serialStatus: null
};

let telemetryInterval = null;

function createElement(tag, className, innerHTML) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (innerHTML !== undefined) element.innerHTML = innerHTML;
  return element;
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
    const response = await fetch(`/api/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (result.ok) {
      const user = { ...result.user };
      if (payload.password) user.password = payload.password;
      state.auth = user;
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
        <button data-view="home" class="${state.view === 'home' ? 'active' : ''}">Home</button>
        <button data-view="dashboard" class="${state.view === 'dashboard' ? 'active' : ''}">Operator Dashboard</button>
        <button data-view="control" class="${state.view === 'control' ? 'active' : ''}">Staff Control Panel</button>
        <button data-view="faults" class="${state.view === 'faults' ? 'active' : ''}">Fault Monitoring</button>
        <button data-view="twin" class="${state.view === 'twin' ? 'active' : ''}">Digital Twin</button>
        <button data-view="map" class="${state.view === 'map' ? 'active' : ''}">Live Map</button>
        <button data-view="esp32" class="${state.view === 'esp32' ? 'active' : ''}">🔌 ESP32 COM</button>
        <button data-view="profile" class="${state.view === 'profile' ? 'active' : ''}">Profile</button>
        <button id="logout">Logout</button>
      </div>
    </div>
  `;

  const content = createElement('div');
  if (state.view === 'home') content.appendChild(renderHome());
  if (state.view === 'dashboard') content.appendChild(renderDashboard());
  if (state.view === 'control') content.appendChild(renderControl());
  if (state.view === 'faults') content.appendChild(renderFaults());
  if (state.view === 'twin') content.appendChild(renderTwin());
  if (state.view === 'map') content.appendChild(renderMap());
  if (state.view === 'esp32') content.appendChild(renderEsp32Monitor());
  if (state.view === 'profile') content.appendChild(renderProfile());
  shell.appendChild(content);

  shell.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.getAttribute('data-view');
      render();
    });
  });

  shell.querySelector('#logout').addEventListener('click', () => {
    state.auth = null;
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
    </div>
  `;

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
          <span class="status-pill ${state.telemetry?.dataSource?.includes('ESP32') ? 'green' : 'yellow'}">● ${state.telemetry?.dataSource || 'Online'}</span>
        </div>
        <div class="small">Current role: ${state.auth.role}</div>
        <div class="small">Last update: ${new Date().toLocaleTimeString()}</div>
      </div>
    </div>
    <div class="grid grid-4">
      <div class="metric-card"><h4>Voltage RYB</h4><div class="value">${renderVoltage()}</div><div class="sub">Phase-wise monitoring</div></div>
      <div class="metric-card"><h4>Current RYB</h4><div class="value">${renderCurrent()}</div><div class="sub">Feeder load profile</div></div>
      <div class="metric-card"><h4>Health Index</h4><div class="value">${displayValue(state.telemetry?.transformer?.healthIndex)}</div><div class="sub">Transformer condition score</div></div>
      <div class="metric-card"><h4>Fault Area</h4><div class="value">${renderFaultArea()}</div><div class="sub">Nearest node ${renderNearestNode()}</div></div>
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
  const response = await fetch('/api/telemetry');
  const telemetry = await response.json();
  state.telemetry = telemetry;
  // Also refresh serial status silently
  try {
    const sRes = await fetch('/api/serial-status');
    state.serialStatus = await sRes.json();
  } catch (e) {}
  render();
}

function startTelemetryPolling() {
  if (telemetryInterval) return;
  telemetryInterval = setInterval(fetchTelemetry, 3000);
}

async function sendControl(type, value) {
  const endpoint = type === 'relay' ? '/api/control/relay' : '/api/control/tap';
  const payload = type === 'relay' ? { relayStatus: value } : { tapPosition: value };
  await fetch('/api/control' + (type === 'relay' ? '/relay' : '/tap'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  fetchTelemetry();
}

function sendTap(delta) {
  const next = (state.telemetry?.tapPosition || 2) + delta;
  fetch('/api/control/tap', {
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
  const v = state.telemetry?.transformer?.voltage;
  if (!v || (v.R === 0 && v.Y === 0 && v.B === 0)) {
    return '-- / -- / -- V';
  }
  return `${v.R.toFixed(0)} / ${v.Y.toFixed(0)} / ${v.B.toFixed(0)} V`;
}

function renderCurrent() {
  const c = state.telemetry?.transformer?.current;
  if (!c || (c.R === 0 && c.Y === 0 && c.B === 0)) {
    return '-- / -- / -- A';
  }
  return `${c.R.toFixed(0)} / ${c.Y.toFixed(0)} / ${c.B.toFixed(0)} A`;
}

function displayValue(value, suffix = '') {
  if (value == null || value === 0) return '';
  return `${value}${suffix}`;
}

function renderFaultArea() {
  const area = state.telemetry?.locationState?.faultArea;
  return area && area !== 'Normal' ? area : '';
}

function renderNearestNode() {
  const node = state.telemetry?.locationState?.nearestNode;
  return node && node !== 'Substation' ? node : '';
}

function renderFaultDistance() {
  const distance = state.telemetry?.locationState?.faultDistanceKm;
  return distance ? `${distance} km` : '';
}

function getTelemetryStatusClass() {
  const load = state.telemetry?.transformer?.loadPercent || 0;
  if (load > 85) return 'red';
  if (load > 70) return 'yellow';
  return 'green';
}

function getTelemetryStatus() {
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


async function fetchSerialStatus() {
  try {
    const res = await fetch('/api/serial-status');
    state.serialStatus = await res.json();
  } catch (e) {
    state.serialStatus = { connected: false, port: null, availablePorts: [] };
  }
}

function renderEsp32Monitor() {
  const ss = state.serialStatus || {};
  const t = state.telemetry?.transformer;
  const isLive = (state.telemetry?.dataSource || '').includes('ESP32');
  const section = createElement('div');

  section.innerHTML = `
    <div class="hero">
      <div>
        <div class="pill">ESP32 COM Port Live Monitor</div>
        <h1>Hardware Serial Connection</h1>
        <p>The server auto-detects and connects to your ESP32 over USB. Live sensor data streams directly into the digital twin dashboard.</p>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:16px">
      <div class="panel">
        <div class="label-row">
          <strong>🔌 Serial Port Status</strong>
          <span class="status-pill ${ss.connected ? 'green' : 'red'}">${ss.connected ? '● Connected' : '○ Disconnected'}</span>
        </div>
        <div class="small" style="margin:8px 0">Active Port: <strong>${ss.port || 'None detected'}</strong></div>
        <div class="small">Data Source: <strong>${ss.dataSource || state.telemetry?.dataSource || 'Simulation Mode'}</strong></div>
        <div class="small" style="margin-top:6px">Last ESP32 packet: <strong>${state.telemetry?.lastHardwareTime ? new Date(state.telemetry.lastHardwareTime).toLocaleTimeString() : '—'}</strong></div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="secondary-btn" id="scan-ports-btn">🔍 Scan Ports</button>
          ${ss.connected ? '<button class="secondary-btn" id="disconnect-btn" style="background:rgba(255,80,80,0.15)">⏏ Disconnect</button>' : ''}
        </div>
      </div>

      <div class="panel">
        <div class="label-row"><strong>📡 Available COM Ports</strong></div>
        ${(ss.availablePorts || []).length === 0
          ? '<div class="small" style="margin-top:8px">No COM ports found. Connect your ESP32 via USB.</div>'
          : `<table class="table" style="margin-top:8px">
              <thead><tr><th>Port</th><th>Manufacturer</th><th>VID</th><th>Action</th></tr></thead>
              <tbody>
                ${(ss.availablePorts || []).map(p => `
                  <tr>
                    <td><strong>${p.path}</strong></td>
                    <td>${p.manufacturer || '—'}</td>
                    <td>${p.vendorId || '—'}</td>
                    <td><button class="secondary-btn connect-port-btn" data-port="${p.path}" style="padding:4px 10px;font-size:11px">Connect</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="metric-card ${isLive ? '' : 'dim'}">
        <h4>Voltage R/Y/B</h4>
        <div class="value" style="font-size:1.2rem">${t ? `${t.voltage.R.toFixed(0)} / ${t.voltage.Y.toFixed(0)} / ${t.voltage.B.toFixed(0)} V` : '— / — / —'}</div>
        <div class="sub">${isLive ? '⚡ From ESP32' : 'Simulated'}</div>
      </div>
      <div class="metric-card ${isLive ? '' : 'dim'}">
        <h4>Current R/Y/B</h4>
        <div class="value" style="font-size:1.2rem">${t ? `${t.current.R.toFixed(1)} / ${t.current.Y.toFixed(1)} / ${t.current.B.toFixed(1)} A` : '— / — / —'}</div>
        <div class="sub">${isLive ? '⚡ From ESP32' : 'Simulated'}</div>
      </div>
      <div class="metric-card ${isLive ? '' : 'dim'}">
        <h4>Temperature</h4>
        <div class="value">${t ? `${t.temperature.toFixed(1)} °C` : '—'}</div>
        <div class="sub">${isLive ? '⚡ From ESP32' : 'Simulated'}</div>
      </div>
      <div class="metric-card ${isLive ? '' : 'dim'}">
        <h4>Health Index</h4>
        <div class="value">${t ? `${t.healthIndex}%` : '—'}</div>
        <div class="sub">${isLive ? '⚡ From ESP32' : 'Simulated'}</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="panel">
        <div class="label-row"><strong>🔴 Active Faults</strong><span class="status-pill ${(state.telemetry?.faults?.length || 0) > 0 ? 'red' : 'green'}">${(state.telemetry?.faults?.length || 0) > 0 ? state.telemetry.faults.length + ' Active' : 'No Faults'}</span></div>
        ${(state.telemetry?.faults || []).length === 0
          ? '<div class="small" style="margin-top:8px">✅ All systems nominal</div>'
          : `<ul style="margin:10px 0;padding-left:18px">
              ${(state.telemetry.faults || []).map(f => `<li class="small" style="margin:4px 0"><span style="color:${f.severity==='Critical'?'#ff4444':f.severity==='High'?'#ff8c00':'#f0c040'}">■ ${f.severity}</span> — <strong>${f.type}</strong> @ ${f.location}</li>`).join('')}
            </ul>`
        }
      </div>
      <div class="panel">
        <div class="label-row"><strong>ℹ️ How to Connect ESP32</strong></div>
        <ol style="margin:10px 0;padding-left:18px;font-size:13px;line-height:1.8">
          <li>Flash <code>esp32_firmware.ino</code> to your ESP32 board via Arduino IDE</li>
          <li>Connect the ESP32 to this PC via USB cable</li>
          <li>The server auto-detects the COM port every 5 seconds</li>
          <li>JSON sensor data streams in at 115200 baud</li>
          <li>Click <strong>Scan Ports</strong> if the port isn't found automatically</li>
          <li>Or click <strong>Connect</strong> next to a specific port above</li>
        </ol>
        <div class="small" style="color:#5DD5B8">📁 Firmware: <code>esp32_firmware/esp32_firmware.ino</code></div>
      </div>
    </div>
  `;

  // Event listeners
  const scanBtn = section.querySelector('#scan-ports-btn');
  if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
      scanBtn.textContent = 'Scanning...';
      await fetchSerialStatus();
      render();
    });
  }

  const disconnectBtn = section.querySelector('#disconnect-btn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      await fetch('/api/serial-disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      await fetchSerialStatus();
      render();
    });
  }

  section.querySelectorAll('.connect-port-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const portPath = btn.getAttribute('data-port');
      btn.textContent = 'Connecting...';
      await fetch('/api/serial-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: portPath })
      });
      setTimeout(async () => { await fetchSerialStatus(); render(); }, 1500);
    });
  });

  return section;
}

(async function init() {
  render();
})();
