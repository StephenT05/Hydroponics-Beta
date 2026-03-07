#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// --- Configuration ---
const char* ssid = "PLDTWIFI_2020";
const char* password = "PLDTWIFI@w99e3";
const char* serverHost = "192.168.1.7";
const uint16_t serverPort = 3000;
const char* serverEndpoint = "/api/water-level";
const unsigned long sampleIntervalMs = 3000;
const uint16_t httpTimeoutMs = 3000;
const uint8_t httpRetries = 2;
const bool verboseHttpLogs = false;

// --- Pins ---
const int pwrPin = 14;        // D5: Power for Analog Sensor
const int waterLevelPin = A0; // Signal wire from Analog Sensor
const int trigPin = 5;        // D1: Ultrasonic Trig
const int echoPin = 4;        // D2: Ultrasonic Echo

// We keep only minimal state on the MCU; backend handles filtering.
unsigned long lastSampleMs = 0;
uint8_t consecutivePostFailures = 0;

void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println(F("WiFi disconnected, reconnecting..."));
  WiFi.disconnect();
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 5000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("\nWiFi reconnected, IP: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("\nWiFi reconnect failed"));
  }
}

bool postWithRetry(const char* jsonPayload) {
  for (uint8_t attempt = 1; attempt <= httpRetries; attempt++) {
    ensureWiFiConnected();
    if (WiFi.status() != WL_CONNECTED) {
      delay(400);
      continue;
    }

    WiFiClient client;

    // Probe raw TCP connectivity first to make connection-refused issues obvious.
    if (!client.connect(serverHost, serverPort)) {
      Serial.printf("TCP connect failed (attempt %u) -> %s:%u\n", attempt, serverHost, serverPort);
      delay(500);
      continue;
    }
    client.stop();

    HTTPClient http;
    http.setReuse(false);
    http.setTimeout(httpTimeoutMs);
    http.begin(client, serverHost, serverPort, serverEndpoint);
    http.addHeader("Content-Type", "application/json");

    int httpResponseCode = http.POST((uint8_t*)jsonPayload, strlen(jsonPayload));
    if (verboseHttpLogs && httpResponseCode >= 400) {
      String responseBody = http.getString();
      if (responseBody.length() > 0) {
        Serial.println(F("Server error body:"));
        Serial.println(responseBody);
      }
    }
    http.end();

    if (httpResponseCode > 0 && httpResponseCode < 400) {
      Serial.printf("Upload OK (attempt %u): %d\n", attempt, httpResponseCode);
      consecutivePostFailures = 0;
      return true;
    }

    if (httpResponseCode < 0) {
      Serial.printf("Upload failed (attempt %u): %d\n", attempt, httpResponseCode);
    } else {
      Serial.printf("Upload failed (attempt %u): HTTP %d\n", attempt, httpResponseCode);
    }

    if (verboseHttpLogs) {
      Serial.printf("Posting to: http://%s:%u%s\n", serverHost, serverPort, serverEndpoint);
    }
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
  WiFi.hostname("hydroponics-esp8266");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.print(F("\nWiFi Connected, IP: "));
  Serial.println(WiFi.localIP());
  Serial.printf("Server target: http://%s:%u%s\n", serverHost, serverPort, serverEndpoint);
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
  if (duration == 0) {
    // 0 can be a valid "touching sensor" state in this setup; keep it as-is.
    Serial.println(F("Ultrasonic returned 0 distance"));
  }

  // 2. Backend determines filling state from raw_analog threshold/hysteresis.
  int rssi = WiFi.RSSI();

  // 3. Send Filtered Data
  char jsonPayload[160];
  snprintf(
    jsonPayload,
    sizeof(jsonPayload),
    "{\"raw_analog\":%d,\"raw_distance\":%.2f,\"rssi\":%d}",
    rawAnalog,
    rawDistance,
    rssi
  );

  bool ok = postWithRetry(jsonPayload);
  char debugLine[120];
  snprintf(
    debugLine,
    sizeof(debugLine),
    "Raw distance: %.2f in | analog: %d | heap: %u",
    rawDistance,
    rawAnalog,
    ESP.getFreeHeap()
  );
  Serial.println(debugLine);

  if (ok) {
    Serial.println(F("Payload sent"));
    if (verboseHttpLogs) {
      Serial.println(jsonPayload);
    }
  } else {
    consecutivePostFailures++;
    Serial.println(F("Payload dropped after retries"));
    Serial.printf("Consecutive post failures: %u\n", consecutivePostFailures);
    if (verboseHttpLogs) {
      Serial.println(jsonPayload);
    }

    if (consecutivePostFailures >= 6) {
      Serial.println(F("Too many failures, restarting ESP..."));
      delay(1000);
      ESP.restart();
    }
  }
}