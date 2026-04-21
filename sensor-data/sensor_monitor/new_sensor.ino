/*
 * AIR QUALITY SENSOR WITH GSM + CO2 (MH-Z19C) - FULL VERSION WITH MQ-131
 */

#include "DHT.h"
#include "RTClib.h"
#include <Arduino.h>
#include <MHZ19.h>
#include <NOxGasIndexAlgorithm.h>
#include <SensirionI2CSgp41.h>
#include <U8g2lib.h>
#include <VOCGasIndexAlgorithm.h>
#include <Wire.h>

// ----------------------
// Pin definitions
// ----------------------
#define DHTPIN 7
#define DHTTYPE DHT11
#define MQ7_PIN A0
#define MQ131_PIN A1 // ✅ MQ-131 Ozone sensor

#define SIM800L_SERIAL Serial1
const long GSM_BAUD = 9600;

// === GSM AND NETWORK SETTINGS ===
String DEVICE_ID = "AQ-NODE-001"; // Default, will be used in payload

// ----------------------
// GSM CONFIGURATION (dynamic APN)
// ----------------------
String APN = "safaricom";

// Railway Backend
const char *BACKEND_URL = "yamanote.proxy.rlwy.net";
const int BACKEND_PORT = 45265;
const char *BACKEND_PATH = "/api/sensor-data";

// PythonAnywhere Dashboard Relay
const char *DASHBOARD_URL = "aqmrg.pythonanywhere.com";
const int DASHBOARD_PORT = 80;
const char *DASHBOARD_PATH = "/api/v1/data/ingest";

// Local Flask Server
const char *LOCAL_URL = "192.168.100.71";
const int LOCAL_PORT = 5001;
const char *LOCAL_PATH = "/api/v1/data/ingest";

const char *PROTOCOL = "http://";

const unsigned long SEND_INTERVAL = 180000;
unsigned long lastSendTime = 0;
bool gsmReady = false;

// Health Diagnostics Trackers
int gsm_reconnect_count = 0;
int failed_requests = 0;
int current_signal_dbm = 0;
int last_http_status = 0;
unsigned long last_successful_send = 0;

// Sensor Health flags
bool status_pms = true;
bool status_dht = true;
bool status_mhz19 = true;
bool status_sgp41 = true;
unsigned long last_pms_read = 0;

// Dynamic network info
String operator_name = "Unknown";
float location_lat = -1.294584;
float location_lon = 36.726746;
String location_name = "Nairobi (fallback)";

// ----------------------
// Devices & Algorithms
// ----------------------
DHT dht(DHTPIN, DHTTYPE);
RTC_DS3231 rtc;
U8G2_ST7920_128X64_F_SW_SPI u8g2(U8G2_R0, 13, 11, 10, 8);
MHZ19 myMHZ19;

SensirionI2CSgp41 sgp41;
VOCGasIndexAlgorithm voc_helper;
NOxGasIndexAlgorithm nox_helper;

// ----------------------
// Variables
// ----------------------
int page = 0;
unsigned long lastSwitchTime = 0;
const unsigned long pageInterval = 4000;

uint16_t pm1_0 = 0, pm2_5 = 0, pm10 = 0;
int32_t voc_index = 0, nox_index = 0;
int co2_ppm = 0;

uint16_t conditioning_s = 10;

float humidity = 0;
float temperature = 0;
float CO_ppm = 0;
float O3_ppm = 0; // ✅ Ozone value

// ----------------------
// Read PMS5003 (Serial 13)
// ----------------------
bool readPMS5003() {
  // Clear out any old garbage in the buffer so we always start fresh
  while (Serial3.available() > 32) {
    Serial3.read();
  }

  if (Serial3.available() >= 32) {
    if (Serial3.read() == 0x42 && Serial3.read() == 0x4D) {
      uint8_t data[30];
      Serial3.readBytes(data, 30);
      
      pm1_0 = (data[8] << 8) | data[9];
      pm2_5 = (data[10] << 8) | data[11];
      pm10  = (data[12] << 8) | data[13];
      return true;
    }
  }
  return false;
}

// ----------------------
// GSM Functions
// ----------------------
bool sendATCommand(const char *cmd, const char *expectedResponse,
                   unsigned long timeout) {
  Serial.print(F("GSM CMD: "));
  Serial.println(cmd);

  SIM800L_SERIAL.println(cmd);
  String response = "";
  unsigned long startTime = millis();

  while (millis() - startTime < timeout) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      response += c;
    }
    if (response.indexOf(expectedResponse) != -1) {
      Serial.println();
      return true;
    }
  }
  Serial.println(F("\nGSM Timeout"));
  return false;
}

String waitForResponseString(const char *expected, unsigned long timeout) {
  String response = "";
  response.reserve(128);
  unsigned long startTime = millis();
  while (millis() - startTime < timeout) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      response += c;
      Serial.write(c);
    }
    if (response.indexOf(expected) != -1) {
      delay(200);
      while (SIM800L_SERIAL.available()) {
        response += (char)SIM800L_SERIAL.read();
      }
      Serial.println();
      return response;
    }
  }
  return "";
}

bool waitForResponse(const char *expected, unsigned long timeout) {
  return waitForResponseString(expected, timeout).length() > 0;
}

bool checkNetworkRegistration() {
  Serial.println(F("Checking network registration..."));
  SIM800L_SERIAL.println("AT+CREG?");
  delay(1000);

  String response = "";
  unsigned long startTime = millis();

  while (millis() - startTime < 3000) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      response += c;
      Serial.write(c);
    }
  }

  if (response.indexOf("+CREG: 0,1") != -1 ||
      response.indexOf("+CREG: 0,5") != -1) {
    Serial.println(F("✓ Network registered"));
    return true;
  }

  Serial.println(F("✗ Not registered on network"));
  return false;
}

int getSignalStrengthDbm() {
  SIM800L_SERIAL.println("AT+CSQ");
  delay(100);
  String response = "";
  unsigned long start = millis();
  while (millis() - start < 1000) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      response += c;
    }
  }
  int index = response.indexOf("+CSQ: ");
  if (index != -1) {
    int comma = response.indexOf(',', index);
    if (comma != -1) {
      int rssi = response.substring(index + 6, comma).toInt();
      if (rssi == 99 || rssi == 0)
        return 0;
      return -113 + (rssi * 2);
    }
  }
  return 0;
}

void initGSM() {
  Serial.println(F("\n=== Initializing GSM ==="));

  sendATCommand("AT", "OK", 2000);
  delay(500);

  sendATCommand("ATE0", "OK", 2000);
  delay(500);

  if (sendATCommand("AT+CPIN?", "READY", 5000)) {
    Serial.println(F("✓ SIM card ready"));
  } else {
    Serial.println(F("✗ SIM card error"));
    return;
  }

  sendATCommand("AT+CSQ", "OK", 2000);
  delay(500);

  if (!checkNetworkRegistration()) {
    Serial.println(F("Warning: Network not registered. Continuing anyway..."));
  }

  Serial.println(F("Checking GPRS attachment..."));
  SIM800L_SERIAL.println("AT+CGATT?");
  delay(2000);

  String attachResponse = "";
  unsigned long attachStart = millis();
  while (millis() - attachStart < 2000) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      attachResponse += c;
      Serial.write(c);
    }
  }

  if (attachResponse.indexOf("+CGATT: 0") != -1) {
    Serial.println(F("\n✗ Not attached to GPRS. Attempting to attach..."));
    sendATCommand("AT+CGATT=1", "OK", 10000);
    delay(5000);
    sendATCommand("AT+CGATT?", "+CGATT: 1", 5000);
  } else if (attachResponse.indexOf("+CGATT: 1") != -1) {
    Serial.println(F("\n✓ GPRS attached"));
  }

  Serial.println(F("Connecting to GPRS bearer..."));
  Serial.println(F("Closing any existing bearer..."));
  SIM800L_SERIAL.println("AT+SAPBR=0,1");
  delay(3000);

  sendATCommand("AT+SAPBR=3,1,\"CONTYPE\",\"GPRS\"", "OK", 2000);
  delay(500);

  String apnCmd = "AT+SAPBR=3,1,\"APN\",\"" + String(APN) + "\"";
  sendATCommand(apnCmd.c_str(), "OK", 2000);
  delay(500);

  Serial.println(F("Opening GPRS bearer (this may take 30-60 seconds)..."));
  if (sendATCommand("AT+SAPBR=1,1", "OK", 65000)) {
    Serial.println(F("✓ Bearer opened"));
  } else {
    Serial.println(F("✗ Bearer open failed"));
  }
  delay(5000);

  Serial.println(F("Checking bearer status..."));
  SIM800L_SERIAL.println("AT+SAPBR=2,1");
  delay(2000);

  String bearerResponse = "";
  unsigned long startTime = millis();
  while (millis() - startTime < 3000) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      bearerResponse += c;
      Serial.write(c);
    }
  }

  if (bearerResponse.indexOf("0.0.0.0") != -1) {
    Serial.println(F("\n✗ GPRS Connection Failed: No IP assigned"));
    gsmReady = false;
    return;
  } else if (bearerResponse.indexOf("+SAPBR: 1,1") != -1) {
    Serial.println(F("\n✓ GPRS Connected with valid IP!"));
  }

  SIM800L_SERIAL.println("AT+HTTPTERM");
  delay(1000);

  sendATCommand("AT+HTTPINIT", "OK", 2000);
  delay(500);

  sendATCommand("AT+HTTPPARA=\"CID\",1", "OK", 2000);
  delay(500);

  sendATCommand("AT+HTTPSSL=0", "OK", 2000);
  delay(500);

  gsmReady = true;
  Serial.println(F("✓ GSM Module Ready!\n"));
}

// ----------------------
// SEND DATA
// ----------------------
void sendDataToEndpoint(const char *url, int port, const char *path,
                        bool isDashboard) {
  SIM800L_SERIAL.println("AT+SAPBR=2,1");
  delay(1000);
  String bearerCheck = "";
  unsigned long startTime = millis();
  while (millis() - startTime < 2000) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      bearerCheck += c;
    }
  }
  if (bearerCheck.indexOf("0.0.0.0") != -1) {
    Serial.println(F("✗ GPRS not connected (no valid IP). Skipping send."));
    return;
  }

  DateTime now = rtc.now();
  char isoTime[20];
  sprintf(isoTime, "%04d-%02d-%02d %02d:%02d:%02d", now.year(), now.month(),
          now.day(), now.hour(), now.minute(), now.second());

  String jsonData = "";
  jsonData.reserve(1300);
  jsonData = "{";
  jsonData += "\"sensorId\":\"" + DEVICE_ID + "\",";
  // Dynamic location
  jsonData += "\"location\":{\"name\":\"" + location_name +
              "\",\"latitude\":" + String(location_lat, 6) +
              ","
              "\"longitude\":" +
              String(location_lon, 6) + "},";
  jsonData += "\"latitude\":" + String(location_lat, 6) +
              ",\"longitude\":" + String(location_lon, 6) + ",";
  jsonData += "\"metrics\":{";
  jsonData += "\"pm1\":" + String(pm1_0) + ",";
  jsonData += "\"pm25\":" + String(pm2_5) + ",";
  jsonData += "\"pm10\":" + String(pm10) + ",";
  jsonData += "\"co\":" + String(CO_ppm, 2) + ",";
  jsonData += "\"co2\":" + String(co2_ppm) + ",";
  jsonData += "\"o3\":" + String(O3_ppm, 2) + ",";
  jsonData += "\"temperature\":" + String(temperature, 1) + ",";
  jsonData += "\"humidity\":" + String(humidity, 1) + ",";
  jsonData += "\"voc_index\":" + String(voc_index) + ",";
  jsonData += "\"nox_index\":" + String(nox_index);
  jsonData += "}";

  if (isDashboard) {
    String issuesArray = "[";
    bool hasIssues = false;
    if (millis() / 60000 < 15) {
      if (hasIssues)
        issuesArray += ",";
      issuesArray +=
          "\"The Air Quality Monitor restarted recently. If there was no power "
          "cut, please ensure it is securely plugged into power.\"";
      hasIssues = true;
    }
    if (failed_requests >= 2 ||
        (last_http_status != 0 && last_http_status != 200 &&
         last_http_status != 201)) {
      if (hasIssues)
        issuesArray += ",";
      issuesArray += "\"The monitor cannot connect to the internet. Please "
                     "check if the SIM card has active data bundles (airtime) "
                     "or if there is a network outage.\"";
      hasIssues = true;
    }
    if (current_signal_dbm != 0 && current_signal_dbm <= -95) {
      if (hasIssues)
        issuesArray += ",";
      issuesArray +=
          "\"The cellular signal is very weak. Try moving the monitor or its "
          "antenna closer to a window or an open area.\"";
      hasIssues = true;
    }
    if (!status_pms) {
      if (hasIssues)
        issuesArray += ",";
      issuesArray += "\"The dust sensor is completely offline. Please check "
                     "its wiring or restart the device.\"";
      hasIssues = true;
    }
    if (!status_dht) {
      if (hasIssues)
        issuesArray += ",";
      issuesArray += "\"The temperature and humidity sensor is disconnected. "
                     "Please check its wiring.\"";
      hasIssues = true;
    }
    if (!status_mhz19) {
      if (hasIssues)
        issuesArray += ",";
      issuesArray += "\"The Carbon Dioxide sensor is not reporting data. "
                     "Please check its wiring.\"";
      hasIssues = true;
    }
    if (!status_sgp41) {
      if (hasIssues)
        issuesArray += ",";
      issuesArray += "\"The toxic gas (VOC/NOx) sensor failed to start. Please "
                     "check its wiring.\"";
      hasIssues = true;
    }
    if (!hasIssues) {
      issuesArray += "\"System operating perfectly. No issues detected.\"";
    }
    issuesArray += "]";

    jsonData += ",\"health\":{";
    jsonData += "\"uptime_minutes\":" + String(millis() / 60000) + ",";
    jsonData += "\"signal_dbm\":" + String(current_signal_dbm) + ",";
    jsonData += "\"gsm_reconnects\":" + String(gsm_reconnect_count) + ",";
    jsonData += "\"failed_requests\":" + String(failed_requests) + ",";
    jsonData += "\"last_http_status\":" + String(last_http_status) + ",";
    jsonData += "\"operator\":\"" + operator_name + "\",";
    jsonData += "\"sensors\":{";
    jsonData += "\"pms\":" + String(status_pms ? "true" : "false") + ",";
    jsonData += "\"dht\":" + String(status_dht ? "true" : "false") + ",";
    jsonData += "\"mhz19\":" + String(status_mhz19 ? "true" : "false") + ",";
    jsonData += "\"sgp41\":" + String(status_sgp41 ? "true" : "false");
    jsonData += "},";
    jsonData += "\"issue_descriptions\":" + issuesArray;
    jsonData += "}";
  }

  jsonData += "}";

  Serial.print(F("\n>>> Sending to: "));
  Serial.print(url);
  Serial.print(F(":"));
  Serial.println(port);
  Serial.print(F("Payload: "));
  Serial.println(jsonData);

  SIM800L_SERIAL.println("AT+HTTPTERM");
  delay(500);
  sendATCommand("AT+HTTPINIT", "OK", 2000);
  delay(500);
  sendATCommand("AT+HTTPPARA=\"CID\",1", "OK", 2000);
  delay(500);
  sendATCommand("AT+HTTPSSL=0", "OK", 2000);
  delay(500);

  String fullUrl = String(PROTOCOL) + String(url);
  if (port != 80 && port != 443) {
    fullUrl += ":" + String(port);
  }
  fullUrl += String(path);
  String urlCmd = "AT+HTTPPARA=\"URL\",\"" + fullUrl + "\"";
  sendATCommand(urlCmd.c_str(), "OK", 2000);
  delay(500);
  sendATCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK", 2000);
  delay(500);

  String dataCmd = "AT+HTTPDATA=" + String(jsonData.length()) + ",10000";
  SIM800L_SERIAL.println(dataCmd);
  delay(1000);

  if (waitForResponse("DOWNLOAD", 2000)) {
    SIM800L_SERIAL.println(jsonData);
    delay(2000);
    SIM800L_SERIAL.println("AT+HTTPACTION=1");
    String fullActionResp = waitForResponseString("+HTTPACTION:", 15000);
    if (fullActionResp.length() > 0) {
      int actionIdx = fullActionResp.indexOf("+HTTPACTION:");
      if (actionIdx != -1) {
        int firstComma = fullActionResp.indexOf(',', actionIdx);
        int secondComma = fullActionResp.indexOf(',', firstComma + 1);
        if (firstComma != -1 && secondComma != -1) {
          int status =
              fullActionResp.substring(firstComma + 1, secondComma).toInt();
          int bodyLen = fullActionResp.substring(secondComma + 1).toInt();
          last_http_status = status;

          // Print human-readable status
          Serial.println(F("\n╔══════════════════════════════════════════╗"));
          Serial.print(F("║  HTTP STATUS: "));
          Serial.print(status);
          Serial.print(F(" - "));

          if (status == 200)
            Serial.println(F("OK (Success)             ║"));
          else if (status == 201)
            Serial.println(F("Created (Data Saved)     ║"));
          else if (status == 204)
            Serial.println(F("No Content (Accepted)    ║"));
          else if (status == 301)
            Serial.println(F("Moved Permanently        ║"));
          else if (status == 302)
            Serial.println(F("Redirect (Captive Portal)║"));
          else if (status == 400)
            Serial.println(F("Bad Request (Invalid JSON)║"));
          else if (status == 401)
            Serial.println(F("Unauthorized (Auth Fail) ║"));
          else if (status == 403)
            Serial.println(F("Forbidden (Access Denied)║"));
          else if (status == 404)
            Serial.println(F("Not Found (Wrong URL)    ║"));
          else if (status == 405)
            Serial.println(F("Method Not Allowed       ║"));
          else if (status == 408)
            Serial.println(F("Request Timeout          ║"));
          else if (status == 413)
            Serial.println(F("Payload Too Large        ║"));
          else if (status == 429)
            Serial.println(F("Too Many Requests        ║"));
          else if (status == 500)
            Serial.println(F("Internal Server Error    ║"));
          else if (status == 502)
            Serial.println(F("Bad Gateway              ║"));
          else if (status == 503)
            Serial.println(F("Service Unavailable      ║"));
          else if (status == 504)
            Serial.println(F("Gateway Timeout          ║"));
          else if (status == 601)
            Serial.println(F("Network Error (DNS Fail) ║"));
          else if (status == 602)
            Serial.println(F("No Internet Connection   ║"));
          else if (status == 603)
            Serial.println(F("DNS Error                ║"));
          else if (status == 604)
            Serial.println(F("Stack Busy               ║"));
          else if (status == 605)
            Serial.println(F("SSL Error                ║"));
          else if (status == 606)
            Serial.println(F("Connection Timed Out     ║"));
          else {
            Serial.print(F("Unknown Code             ║"));
            Serial.println();
          }

          Serial.print(F("║  Response Body Size: "));
          Serial.print(bodyLen);
          Serial.println(F(" bytes"));

          // Diagnosis / advice
          Serial.print(F("║  Diagnosis: "));
          if (status >= 200 && status <= 299) {
            Serial.println(F("✓ Data delivered OK"));
          } else if (status == 302) {
            Serial.println(F("Safaricom captive portal"));
            Serial.println(F("║  → SIM has NO active data bundles"));
          } else if (status >= 602 && status <= 606) {
            Serial.println(F("SIM800L internal network error"));
          } else {
            Serial.println(F("Check URL/Server connectivity"));
          }
          Serial.println(F("╚══════════════════════════════════════════╝"));

          if (status >= 200 && status <= 299) {
            last_successful_send = millis();
            failed_requests = 0;
          } else {
            failed_requests++;
          }

          if (bodyLen > 0) {
            Serial.println(F("[RESPONSE BODY] Reading..."));
            SIM800L_SERIAL.println("AT+HTTPREAD");
            delay(1000);
            while (SIM800L_SERIAL.available())
              Serial.write(SIM800L_SERIAL.read());
            Serial.println(F("\n[RESPONSE BODY] End."));
          }
        }
      }
    }
  }
}

void sendDataToBackend() {
  Serial.println(F("\n>>> Triggering data transmission..."));
  sendDataToEndpoint(BACKEND_URL, BACKEND_PORT, BACKEND_PATH, false);
  sendDataToEndpoint(DASHBOARD_URL, DASHBOARD_PORT, DASHBOARD_PATH, true);
  sendDataToEndpoint(LOCAL_URL, LOCAL_PORT, LOCAL_PATH, true);
}

// ----------------------
// SETUP
// ----------------------
void setup() {
  Serial.begin(115200);
  u8g2.begin();
  dht.begin();
  Wire.begin();
  rtc.begin();
  sgp41.begin(Wire);

  // Serial Port Assignments
  Serial3.begin(9600);    // PMS5003
  Serial2.begin(9600);    // MH-Z19C
  myMHZ19.begin(Serial2); // Link MHZ19 library

  SIM800L_SERIAL.begin(GSM_BAUD); // SIM800L on Serial1

  if (!rtc.begin()) {
    Serial.println("RTC not found!");
  }
  Serial.println("Adjusting RTC time...");
  rtc.adjust(DateTime(2026, 4, 15, 23, 59, 0));
  // if (rtc.lostPower()) {
  //  Comment this line of code after running once
  // rtc.adjust(DateTime(2026, 04, 15, 13, 33, 0));
  //}

  Serial.println(F("\n================================"));
  Serial.println(F("Air Quality Monitor with GSM & CO2"));
  Serial.println(F("================================\n"));

  delay(3000);
  initGSM();
}

// ----------------------
//  Main LOOP
// ----------------------
void loop() {
  // Read PMS5003
  if (readPMS5003()) {
    last_pms_read = millis();
    status_pms = true;
  } else if (millis() - last_pms_read > 60000) {
    status_pms = false;
    pm1_0 = 0;
    pm2_5 = 0;
    pm10 = 0;
  }

  // Read MH-Z19C from Serial2
  co2_ppm = myMHZ19.getCO2();
  status_mhz19 = (co2_ppm > 0);

  // SGP41 Reading
  uint16_t srawVoc = 0, srawNox = 0;
  if (conditioning_s > 0) {
    sgp41.executeConditioning(0x8000, 0x6666, srawVoc);
    conditioning_s--;
  } else {
    sgp41.measureRawSignals(0x8000, 0x6666, srawVoc, srawNox);
  }
  status_sgp41 = true;
  voc_index = voc_helper.process(srawVoc);
  nox_index = nox_helper.process(srawNox);

  // humidity and temperature
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  status_dht = (h == h) && (t == t); // Check for NaN
  if (status_dht) {
    humidity = h;
    temperature = t;
  }

  int mq7_raw = analogRead(MQ7_PIN);
  CO_ppm = ((mq7_raw * 3.3) / 1023.0) * 200.0;

  // MQ-131 READ
  int mq131_raw = analogRead(MQ131_PIN);
  float mq131_voltage = (mq131_raw * 3.3) / 1023.0;
  O3_ppm = mq131_voltage * 10.0; // simple estimate

  DateTime now = rtc.now();
  char timeStr[10], dateStr[12];
  sprintf(timeStr, "%02d:%02d:%02d", now.hour(), now.minute(), now.second());
  sprintf(dateStr, "%02d/%02d/%d", now.day(), now.month(), now.year());

  if (millis() - lastSwitchTime > pageInterval) {
    page = (page + 1) % 4;
    lastSwitchTime = millis();
  }

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB08_tr);

  // HEADER (UNCHANGED)
  u8g2.drawStr(0, 10, timeStr);
  u8g2.drawStr(65, 10, dateStr);
  u8g2.drawHLine(0, 13, 128);

  // --- PAGE 0: PARTICULATE MATTER ---
  if (page == 0) {
    u8g2.drawStr(35, 25, "[ PM LEVELS ]");
    char p1[20], p25[20], p10[20];
    sprintf(p1, "PM1.0: %d ug/m3", pm1_0);
    sprintf(p25, "PM2.5: %d ug/m3", pm2_5);
    sprintf(p10, "PM10 : %d ug/m3", pm10);

    u8g2.drawStr(5, 40, p1);
    u8g2.drawStr(5, 52, p25);
    u8g2.drawStr(5, 64, p10);
  }

  // --- PAGE 1: SGP41 VOC & NOX ---
  else if (page == 1) {
    u8g2.drawStr(30, 25, "[ VOC & NOX ]");
    if (conditioning_s > 0) {
      u8g2.drawStr(10, 45, "Warming up...");
      u8g2.setCursor(85, 45);
      u8g2.print(conditioning_s);
      u8g2.print("s");
    } else {
      char vStr[20], nStr[20];
      sprintf(vStr, "VOC Index: %ld", voc_index);
      sprintf(nStr, "NOx Index: %ld", nox_index);
      u8g2.drawStr(10, 45, vStr);
      u8g2.drawStr(10, 60, nStr);
    }
  }

  // --- PAGE 2: ENVIRONMENT (Temp, Hum, CO, CO2, 03) ---
  else if (page == 2) {
    u8g2.setFont(u8g2_font_5x8_tr);     // smaller font
    u8g2.drawStr(30, 20, "ENV");        // short + higher
    u8g2.setFont(u8g2_font_ncenB08_tr); // restore normal font

    char tStr[20], hStr[20], coStr[20], co2Str[20], o3Str[20];

    sprintf(tStr, "Temp: %.1f C", temperature);
    sprintf(hStr, "Hum : %.1f %%", humidity);
    sprintf(coStr, "CO  : %.1f ppm", CO_ppm);
    sprintf(co2Str, "CO2 : %d ppm", co2_ppm);
    sprintf(o3Str, "O3  : %.2f ppm", O3_ppm); // ✅ ozone

    // Compact vertical spacing
    u8g2.drawStr(5, 24, tStr);
    u8g2.drawStr(5, 34, hStr);
    u8g2.drawStr(5, 44, coStr);
    u8g2.drawStr(5, 54, co2Str);
    u8g2.drawStr(5, 64, o3Str);
  }
  // --- PAGE 3: ADVICE ---
  else if (page == 3) {
    u8g2.drawStr(30, 25, "[ ADVICE ]");
    if (CO_ppm < 9 && pm2_5 < 35 && voc_index < 150 && co2_ppm < 1000) {
      u8g2.drawStr(15, 50, "Air Quality: GOOD");
    } else if (CO_ppm > 35 || voc_index > 300 || pm2_5 > 75 || co2_ppm > 1500) {
      u8g2.drawStr(15, 50, "DANGER: VENTILATE!");
    } else {
      u8g2.drawStr(15, 50, "Quality: MODERATE");
    }
  }

  u8g2.sendBuffer();

  // ----------------------
  // GSM DATA TRANSMISSION
  // ----------------------
  unsigned long currentTime = millis();
  if (currentTime - lastSendTime >= SEND_INTERVAL) {
    bool sensorsReady = (conditioning_s == 0);
    if (gsmReady && sensorsReady) {
      current_signal_dbm = getSignalStrengthDbm();
      sendDataToBackend();
    } else {
      Serial.print(F("Data transmission delayed: gsmReady="));
      Serial.print(gsmReady);
      Serial.print(F(", sensorsReady="));
      Serial.print(sensorsReady);
      Serial.print(F(", conditioning_s="));
      Serial.println(conditioning_s);

      SIM800L_SERIAL.println("AT+SAPBR=2,1");
      delay(500);
      String bCheck = "";
      while (SIM800L_SERIAL.available())
        bCheck += (char)SIM800L_SERIAL.read();
      if (bCheck.indexOf("0.0.0.0") != -1 || !gsmReady) {
        Serial.println(F("Bearer lost or GSM not ready. Re-initializing..."));
        gsm_reconnect_count++;
        initGSM();
      }
    }
    lastSendTime = currentTime;
  }

  delay(100);
}