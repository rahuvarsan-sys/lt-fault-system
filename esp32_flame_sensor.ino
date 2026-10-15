#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

const char* serverHost = "192.168.1.50"; // Replace with your PC/Laptop local IP
const int serverPort = 4001; // The local Node.js server runs on port 4001
const char* deviceName = "Transformer-ESP32";
const int voltagePin = 34; // ZMPT101B voltage sensor (analog)
const int currentPin = 35; // ACS712 current sensor (analog)
const int flamePin = 33; // Flame sensor (analog)
const int vibrationPin = 32; // Vibration sensor (analog)
const int ledPin = 2; // Built-in LED status indicator

void setup() {
  Serial.begin(115200);
  pinMode(voltagePin, INPUT);
  pinMode(currentPin, INPUT);
  pinMode(flamePin, INPUT);
  pinMode(vibrationPin, INPUT);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);
  WiFi.mode(WIFI_STA);

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connection failed. Please check SSID/password.");
    return;
  }

  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Telemetry server: http://");
  Serial.print(serverHost);
  Serial.print(":");
  Serial.println(serverPort);

  registerDevice();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    WiFi.reconnect();
    delay(2000);
    return;
  }

  int voltageRaw = analogRead(voltagePin);
  int currentRaw = analogRead(currentPin);
  int flameRaw = analogRead(flamePin);
  int vibrationRaw = analogRead(vibrationPin);

  float voltageVrms = map(voltageRaw, 0, 4095, 0, 250); // adjust based on calibration
  float currentA = map(currentRaw, 0, 4095, 0, 50); // adjust based on sensor range
  int intensity = map(flameRaw, 0, 4095, 0, 100);
  String flameStatus = intensity >= 70 ? "Flame Detected" : "Safe";

  int vibrationLevel = map(vibrationRaw, 0, 4095, 0, 100);
  String vibrationStatus = vibrationLevel >= 50 ? "High Vibration" : "Normal";

  digitalWrite(ledPin, flameStatus == "Flame Detected" ? HIGH : LOW);

  sendSensorData(flameStatus, intensity, vibrationStatus, vibrationLevel, voltageVrms, currentA);
  delay(5000);
}

void registerDevice() {
  String url = "http://" + String(serverHost) + ":" + String(serverPort) + "/api/esp32/register";
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"deviceName\":\"" + String(deviceName) + "\",\"ipAddress\":\"" + WiFi.localIP().toString() + "\"}";

  int httpCode = http.POST(payload);
  Serial.print("Register code: ");
  Serial.println(httpCode);
  if (httpCode > 0) {
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.print("Registration connection error: ");
    Serial.println(http.errorToString(httpCode));
  }
  http.end();
}

void sendSensorData(String flameStatus, int flameIntensity, String vibStatus, int vibLevel, float voltageVrms, float currentA) {
  String url = "http://" + String(serverHost) + ":" + String(serverPort) + "/api/esp32/data";
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"deviceName\":\"" + String(deviceName) + "\",\"ipAddress\":\"" + WiFi.localIP().toString() + "\",\"flameSensor\":{\"status\":\"" + flameStatus + "\",\"intensity\":" + String(flameIntensity) + ",\"threshold\":70,\"lastDetectedAt\":\"" + String(millis()) + "\"},\"vibrationSensor\":{\"status\":\"" + vibStatus + "\",\"level\":" + String(vibLevel) + ",\"threshold\":50,\"lastDetectedAt\":\"" + String(millis()) + "\"},\"transformer\":{\"voltage\":{\"R\":" + String(voltageVrms, 1) + "},\"current\":{\"R\":" + String(currentA, 1) + "}}}";

  int httpCode = http.POST(payload);
  Serial.print("Send code: ");
  Serial.println(httpCode);
  if (httpCode > 0) {
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.print("Sensor upload connection error: ");
    Serial.println(http.errorToString(httpCode));
  }
  http.end();
}