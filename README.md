#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// --- Configuration ---
const char* ssid = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverPath = "http://192.168.1.XX:3000/api/water-level";
const unsigned long sampleIntervalMs = 10000;
const uint16_t httpTimeoutMs = 8000;
const uint8_t httpRetries = 3;

// --- Pins ---
const int pwrPin = 14;        // D5: Power for Analog Sensor
const int waterLevelPin = A0; // Signal wire from Analog Sensor
const int trigPin = 5;        // D1: Ultrasonic Trig
const int echoPin = 4;        // D2: Ultrasonic Echo

// --- Kalman Filter Variables ---
float kalmanDistance = 0; 
float kalmanAnalog = 0;
float pc = 0.0;
float g = 0.0;
float p = 1.0;
float q = 0.1; // Process noise (lower = smoother/slower)
float r = 0.1; // Measurement noise (higher = trusts old data more)
float lastKalmanDistance = 0;
unsigned long lastSampleMs = 0;

// Kalman function
float updateKalman(float measurement, float lastEstimate) {
  pc = p + q;
  g = pc / (pc + r);
  p = (1 - g) * pc;
  return g * measurement + (1 - g) * lastEstimate;
}

void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println("WiFi disconnected, reconnecting...");
  WiFi.disconnect();
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\nWiFi reconnected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi reconnect failed");
  }
}

int calculatePercentage(float filteredAnalog) {
  // ESP8266 A0 is usually 0-1023; clamp to avoid invalid payload values.
  int clamped = constrain((int)filteredAnalog, 0, 1023);
  return map(clamped, 0, 1023, 0, 100);
}

bool postWithRetry(const String& jsonPayload) {
  for (uint8_t attempt = 1; attempt <= httpRetries; attempt++) {
    ensureWiFiConnected();
    if (WiFi.status() != WL_CONNECTED) {
      delay(400);
      continue;
    }

    WiFiClient client;
    HTTPClient http;
    http.setTimeout(httpTimeoutMs);
    http.begin(client, serverPath);
    http.addHeader("Content-Type", "application/json");

    int httpResponseCode = http.POST(jsonPayload);
    http.end();

    if (httpResponseCode > 0 && httpResponseCode < 400) {
      Serial.println("Upload OK (attempt " + String(attempt) + "): " + String(httpResponseCode));
      return true;
    }

    Serial.println("Upload failed (attempt " + String(attempt) + "): " + String(httpResponseCode));
    delay(500);
  }

  return false;
}

void setup() {
  Serial.begin(115200);
  pinMode(pwrPin, OUTPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  digitalWrite(pwrPin, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.print("\nWiFi Connected, IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (millis() - lastSampleMs < sampleIntervalMs) {
    delay(10);
    return;
  }
  lastSampleMs = millis();

  ensureWiFiConnected();

  // 1. Read Raw Data
  digitalWrite(pwrPin, HIGH);
  delay(10);
  int rawAnalog = analogRead(waterLevelPin);
  digitalWrite(pwrPin, LOW);

  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000);
  float rawDistance = duration * 0.034 / 2;

  // 2. Apply Kalman Filter
  // If it's the first run, initialize the filter with the raw value
  if (kalmanDistance == 0) {
    kalmanDistance = rawDistance;
  }
  if (kalmanAnalog == 0) {
    kalmanAnalog = (float)rawAnalog;
  }

  kalmanDistance = updateKalman(rawDistance, kalmanDistance);
  kalmanAnalog = updateKalman((float)rawAnalog, kalmanAnalog);

  int percentage = calculatePercentage(kalmanAnalog);
  bool isFilling = (lastKalmanDistance > 0) ? (kalmanDistance < lastKalmanDistance - 0.2) : false;
  lastKalmanDistance = kalmanDistance;
  int rssi = WiFi.RSSI();

  // 3. Send Filtered Data
  String jsonPayload = "{\"percentage\":" + String(percentage) +
                       ",\"raw_distance\":" + String(rawDistance, 2) +
                       ",\"is_filling\":" + String(isFilling ? "true" : "false") +
                       ",\"rssi\":" + String(rssi) + "}";

  bool ok = postWithRetry(jsonPayload);
  if (ok) {
    Serial.println("Payload sent: " + jsonPayload);
  } else {
    Serial.println("Payload dropped after retries: " + jsonPayload);
  }
}
