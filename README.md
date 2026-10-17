# Smart Transformer Digital Twin for TNEB

This browser-based prototype demonstrates an AI-assisted transformer monitoring and LT line fault detection system for TNEB-style transmission operations.

## Run locally

1. Install dependencies:
   npm install
2. Start the server:
   npm start
3. Open the app in your browser:
   http://localhost:4001

## Deploy on Render

Deploy this repository as a **Web Service**, not a Static Site. The app needs its
Express server to handle both the website and `/api` requests; a Static Site
serves the frontend files but cannot run the login API.

The root `render.yaml` configures the Node Web Service, installs dependencies,
starts `backend/server.js`, and checks `/api/health`. In Render, create a
Blueprint from this repository (or create a Node Web Service with the same build
and start commands). If this app is currently deployed as a Static Site, create
the Web Service and use its URL; the existing Static Site deployment will keep
returning 404 for API requests.

## Connect an ESP32 for live sensor data

1. Connect the computer running this server and the ESP32 to the same Wi-Fi network.
2. Find the computer's local IPv4 address and set `serverHost` in `hardware/esp32_flame_sensor.ino` to that address. Do not use `localhost` or the example address unless it is actually the computer's address.
3. Set `ssid` and `password` in the sketch, upload it to the ESP32, and open the serial monitor at 115200 baud.
4. Allow Node.js through the computer's firewall on the private network, then open `http://localhost:4001` and sign in. The ESP32 posts readings to `/api/esp32/data` every five seconds; the website receives server updates live.

The voltage and current conversions in the sketch are initial estimates. Calibrate them for the specific sensor modules and wiring before relying on the displayed measurements. Never connect mains voltage directly to an ESP32.

## Project structure

- backend/server.js — Express API with simulated telemetry, fault logic, and control endpoints
- backend/data/sampleData.json — demo state and initial users
- backend/schema.sql — SQL schema for MySQL-based persistence
- frontend/index.html — main UI shell
- frontend/styles.css — dashboard styling
- frontend/app.js — interactive frontend logic and charts

## API overview

- POST /api/auth/login
- GET /api/telemetry
- GET /api/telemetry/stream
- POST /api/sensor-data
- GET /api/faults
- GET /api/alerts
- GET /api/nodes
- POST /api/control/relay
- POST /api/control/tap

## Demo credentials

- Admin: admin / admin123
- Operator: operator / operator123
- Staff: staff / staff123
