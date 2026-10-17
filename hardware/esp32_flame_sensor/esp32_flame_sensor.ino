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

const int powerSampleCount = 1000;
const int powerSampleIntervalUs = 200;
const float adcVoltsPerCount = 3.3f / 4095.0f;
const float voltageCalibrationVoltsPerCount = 0.1726f;
const float acs712SensitivityMillivoltsPerAmp = 185.0f;

struct PowerReadings {
  float voltageRms;
  float currentRms;
  float activePowerWatts;
  float apparentPowerVoltAmps;
  float powerFactor;
};

PowerReadings readPower() {
  float sumVoltage = 0;
  float sumCurrent = 0;
  float sumVoltageSquared = 0;
  float sumCurrentSquared = 0;
  float sumVoltageCurrent = 0;

  for (int sample = 0; sample < powerSampleCount; sample++) {
    const float voltageSample = analogRead(voltagePin);
    const float currentSample = analogRead(currentPin);
    sumVoltage += voltageSample;
    sumCurrent += currentSample;
    sumVoltageSquared += voltageSample * voltageSample;
    sumCurrentSquared += currentSample * currentSample;
    sumVoltageCurrent += voltageSample * currentSample;
    delayMicroseconds(powerSampleIntervalUs);
  }

  const float meanVoltage = sumVoltage / powerSampleCount;
  const float meanCurrent = sumCurrent / powerSampleCount;
  const float voltageVariance = max(0.0f, sumVoltageSquared / powerSampleCount - meanVoltage * meanVoltage);
  const float currentVariance = max(0.0f, sumCurrentSquared / powerSampleCount - meanCurrent * meanCurrent);
  const float covariance = sumVoltageCurrent / powerSampleCount - meanVoltage * meanCurrent;
  const float currentVoltsPerAmp = acs712SensitivityMillivoltsPerAmp / 1000.0f;

  PowerReadings readings;
  readings.voltageRms = sqrtf(voltageVariance) * voltageCalibrationVoltsPerCount;
  readings.currentRms = sqrtf(currentVariance) * adcVoltsPerCount / currentVoltsPerAmp;
  readings.activePowerWatts = covariance * voltageCalibrationVoltsPerCount * adcVoltsPerCount / currentVoltsPerAmp;
  readings.apparentPowerVoltAmps = readings.voltageRms * readings.currentRms;
  readings.powerFactor = readings.apparentPowerVoltAmps > 0
    ? constrain(readings.activePowerWatts / readings.apparentPowerVoltAmps, -1.0f, 1.0f)
    : 0;
  return readings;
}

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

  const PowerReadings power = readPower();
  int flameRaw = analogRead(flamePin);
  int vibrationRaw = analogRead(vibrationPin);

  int intensity = map(flameRaw, 0, 4095, 0, 100);
  String flameStatus = intensity >= 70 ? "Flame Detected" : "Safe";

  int vibrationLevel = map(vibrationRaw, 0, 4095, 0, 100);
  String vibrationStatus = vibrationLevel >= 50 ? "High Vibration" : "Normal";

  digitalWrite(ledPin, flameStatus == "Flame Detected" ? HIGH : LOW);

  sendSensorData(flameStatus, intensity, vibrationStatus, vibrationLevel, power);
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

void sendSensorData(String flameStatus, int flameIntensity, String vibStatus, int vibLevel, PowerReadings power) {
  String url = "http://" + String(serverHost) + ":" + String(serverPort) + "/api/esp32/data";
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  const float reactivePowerKvar = sqrtf(max(0.0f,
    power.apparentPowerVoltAmps * power.apparentPowerVoltAmps
    - power.activePowerWatts * power.activePowerWatts)) / 1000.0f;
  String payload = "{\"deviceName\":\"" + String(deviceName)
    + "\",\"ipAddress\":\"" + WiFi.localIP().toString()
    + "\",\"flameSensor\":{\"status\":\"" + flameStatus
    + "\",\"intensity\":" + String(flameIntensity)
    + ",\"threshold\":70,\"lastDetectedAt\":\"" + String(millis())
    + "\"},\"vibrationSensor\":{\"status\":\"" + vibStatus
    + "\",\"level\":" + String(vibLevel)
    + ",\"threshold\":50,\"lastDetectedAt\":\"" + String(millis())
    + "\"},\"transformer\":{\"voltage\":{\"R\":" + String(power.voltageRms, 1)
    + "},\"current\":{\"R\":" + String(power.currentRms, 3)
    + "},\"power\":{\"active\":" + String(power.activePowerWatts / 1000.0f, 6)
    + ",\"reactive\":" + String(reactivePowerKvar, 6)
    + ",\"apparent\":" + String(power.apparentPowerVoltAmps / 1000.0f, 6)
    + "},\"powerFactor\":" + String(power.powerFactor, 3) + "}}";

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