/*
 * AIR QUALITY SENSOR WITH GSM + CO2 (MH-Z19C) - FULLY DYNAMIC VERSION
 * ====================================================================
 * Hardware:
 * - Arduino Due (or Mega with multiple hardware serials)
 * - PMS5003 (Serial3)
 * - MH-Z19C (Serial2)
 * - SIM800L (Serial1)
 * - DHT11, MQ-7, SGP41, RTC, Display
 *
 * Dynamic features:
 * - APN read from SIM (fallback "safaricom")
 * - Operator name from network (fallback "Unknown")
 * - Location via AT+CLBS (fallback Nairobi)
 * - Time via network (fallback RTC)
 * - Device ID from SGP41 serial (fallback "AQ-NODE-001")
 * - Signal strength, sensor readings, etc.
 */

#include "DHT.h"
#include "RTClib.h"
#include <Arduino.h>
#include <Mhz19.h>
#include <NOxGasIndexAlgorithm.h>
#include <SensirionI2CSgp41.h>
#include <U8g2lib.h>
#include <VOCGasIndexAlgorithm.h>
#include <Wire.h>
#include <stdio.h>

// ----------------------
// Pin definitions
// ----------------------
#define DHTPIN 7
#define DHTTYPE DHT11
#define MQ7_PIN A0

// === GSM AND NETWORK SETTINGS ===
String DEVICE_ID =
    "AQ-NODE-001"; // Will be overwritten if SGP41 serial available

#define SIM800L_SERIAL Serial1
const long GSM_BAUD = 9600;

// ----------------------
// GSM CONFIGURATION (dynamic APN)
// ----------------------
String APN = "safaricom"; // fallback, will be updated dynamically

// Railway Backend
const char *BACKEND_URL = "yamanote.proxy.rlwy.net";
const int BACKEND_PORT = 45265;
const char *BACKEND_PATH = "/api/sensor-data";

// PythonAnywhere Dashboard Relay
const char *DASHBOARD_URL = "aqmrg.pythonanywhere.com";
const int DASHBOARD_PORT = 80;
const char *DASHBOARD_PATH = "/api/v1/data/ingest";

// Local Flask Server (your computer's LAN IP — update if your IP changes)
const char *LOCAL_URL = "192.168.100.71";
const int LOCAL_PORT = 5001;
const char *LOCAL_PATH = "/api/v1/data/ingest";

const char *PROTOCOL = "http://";

const unsigned long SEND_INTERVAL = 180000; // Send data every 3 minutes
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

// ================= DYNAMIC LOCATION =================
float location_lat = -1.294584; // fallback (Nairobi)
float location_lon = 36.726746;
String location_name = "Nairobi (fallback)";
bool location_fallback = true;
unsigned long lastLocationRefresh = 0;
const unsigned long LOCATION_REFRESH_INTERVAL = 3600000; // 1 hour

// ----------------------
// Devices & Algorithms
// ----------------------
DHT dht(DHTPIN, DHTTYPE);
RTC_DS3231 rtc;
U8G2_ST7920_128X64_F_SW_SPI u8g2(U8G2_R0, 13, 11, 10, 8);
Mhz19 myMHZ19;

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
uint16_t sgp_serial[3]; // To store SGP41 serial number

float humidity = 0;
float temperature = 0;
float CO_ppm = 0;

// ----------------------
// Helper: Send AT command and read response line
// ----------------------
String sendATReadLine(const char *cmd, unsigned long timeout) {
  SIM800L_SERIAL.println(cmd);
  String response = "";
  unsigned long start = millis();
  while (millis() - start < timeout) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      response += c;
      if (c == '\n')
        return response;
    }
  }
  return response;
}

// ----------------------
// Dynamic APN retrieval from SIM
// ----------------------
void getDynamicAPN() {
  Serial.println(F("Reading PDP contexts from SIM..."));
  SIM800L_SERIAL.println("AT+CGDCONT?");
  delay(1500);
  String resp = "";
  unsigned long start = millis();
  while (millis() - start < 2000) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      resp += c;
      Serial.write(c);
    }
  }
  Serial.println();

  // Expected: +CGDCONT: 1,"IP","safaricom","",0,0
  int idx = resp.indexOf("+CGDCONT: ");
  if (idx != -1) {
    int firstQuote = resp.indexOf('"', idx);
    int secondQuote = resp.indexOf('"', firstQuote + 1);
    int thirdQuote = resp.indexOf('"', secondQuote + 1);
    int fourthQuote = resp.indexOf('"', thirdQuote + 1);
    if (firstQuote != -1 && secondQuote != -1 && thirdQuote != -1 &&
        fourthQuote != -1) {
      String apn = resp.substring(thirdQuote + 1, fourthQuote);
      if (apn.length() > 0) {
        APN = apn;
        Serial.print(F("✓ Dynamic APN found: "));
        Serial.println(APN);
        return;
      }
    }
  }
  Serial.println(F("⚠ No APN found in PDP context, using fallback: safaricom"));
  APN = "safaricom";
}

// ----------------------
// Dynamic operator name
// ----------------------
void getOperatorName() {
  Serial.println(F("Reading operator name..."));
  SIM800L_SERIAL.println("AT+COPS?");
  delay(1000);
  String resp = "";
  unsigned long start = millis();
  while (millis() - start < 2000) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      resp += c;
      Serial.write(c);
    }
  }
  Serial.println();

  // Format: +COPS: 0,0,"Safaricom",7
  int idx = resp.indexOf("+COPS: ");
  if (idx != -1) {
    int firstQuote = resp.indexOf('"', idx);
    int secondQuote = resp.indexOf('"', firstQuote + 1);
    if (firstQuote != -1 && secondQuote != -1) {
      operator_name = resp.substring(firstQuote + 1, secondQuote);
      Serial.print(F("✓ Operator: "));
      Serial.println(operator_name);
      return;
    }
  }
  Serial.println(F("⚠ Could not read operator name, using 'Unknown'"));
  operator_name = "Unknown";
}

// ----------------------
// Read PMS5003 (Serial3)
// ----------------------
bool readPMS5003() {
  if (Serial3.available() < 32)
    return false;

  if (Serial3.read() == 0x42 && Serial3.peek() == 0x4D) {
    Serial3.read(); // Consume 0x4D
    uint8_t data[30];
    size_t n = Serial3.readBytes(data, 30);
    if (n != 30) {
      Serial.println(F("✗ PMS5003 data incomplete"));
      return false;
    }
    pm1_0 = (data[8] << 8) | data[9];
    pm2_5 = (data[10] << 8) | data[11];
    pm10 = (data[12] << 8) | data[13];
    while (Serial3.available())
      Serial3.read();
    return true;
  }
  while (Serial3.available())
    Serial3.read();
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
  response.reserve(128);
  unsigned long startTime = millis();
  while (millis() - startTime < timeout) {
    while (SIM800L_SERIAL.available()) {
      char c = SIM800L_SERIAL.read();
      response += c;
      Serial.write(c);
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
      // Once match is found, keep reading for a short bit to get parameters
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

// --------------------- DYNAMIC LOCATION (AT+CLBS) --------------------
void getNetworkLocation() {
  Serial.println(F("Location: Network fetching disabled, sticking to verified Estate coordinates."));
  return;
}

// --------------------------------------------------------------------

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

  // Dynamic APN and operator name
  getDynamicAPN();
  getOperatorName();

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
  String apnCmd = "AT+SAPBR=3,1,\"APN\",\"" + APN + "\"";
  sendATCommand(apnCmd.c_str(), "OK", 2000);
  delay(500);

  Serial.println(F("Opening GPRS bearer (this may take 30-60 seconds)..."));
  if (sendATCommand("AT+SAPBR=1,1", "OK", 65000)) {
    Serial.println(F("✓ Bearer opened"));

    // --- NETWORK TIME SYNC ---
    Serial.println(F("Syncing RTC with network time..."));
    sendATCommand("AT+CLTS=1", "OK", 2000);
    delay(2000);
    SIM800L_SERIAL.println("AT+CCLK?");
    delay(1000);
    String clkResp = "";
    while (SIM800L_SERIAL.available())
      clkResp += (char)SIM800L_SERIAL.read();
    Serial.print(F("RAW CCLK: "));
    Serial.println(clkResp);
    int firstQuote = clkResp.indexOf('"');
    if (firstQuote != -1) {
      int secondQuote = clkResp.indexOf('"', firstQuote + 1);
      if (secondQuote != -1) {
        String timeStr = clkResp.substring(firstQuote + 1, secondQuote);
        if (timeStr.length() >= 17) {
          int yy = timeStr.substring(0, 2).toInt() + 2000;
          int mm = timeStr.substring(3, 5).toInt();
          int dd = timeStr.substring(6, 8).toInt();
          int hh = timeStr.substring(9, 11).toInt();
          int min = timeStr.substring(12, 14).toInt();
          int ss = timeStr.substring(15, 17).toInt();
          if (yy > 2000) {
            rtc.adjust(DateTime(yy, mm, dd, hh, min, ss));
            Serial.print(F("✓ RTC synced to: "));
            Serial.println(timeStr);
          } else {
            Serial.println(F("✗ Invalid year in CCLK response"));
          }
        }
      }
    }
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
  sendATCommand("AT+HTTPPARA=\"REDIR\",1", "OK", 2000);
  delay(500);

  gsmReady = true;
  Serial.println(F("✓ GSM Module Ready!\n"));

  getNetworkLocation();
  lastLocationRefresh = millis();
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
  jsonData += "\"temperature\":" + String(temperature, 1) + ",";
  jsonData += "\"humidity\":" + String(humidity, 1) + ",";
  jsonData += "\"voc_index\":" + String(voc_index) + ",";
  jsonData += "\"nox_index\":" + String(nox_index);
  jsonData += "},";

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

    jsonData += "\"health\":{";
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
    jsonData += "},";
  }

  jsonData += "\"measurements\":{";
  jsonData += "\"pm1\":" + String(pm1_0) + ",";
  jsonData += "\"pm25\":" + String(pm2_5) + ",";
  jsonData += "\"pm10\":" + String(pm10) + ",";
  jsonData += "\"co\":" + String(CO_ppm, 2) + ",";
  jsonData += "\"co2\":" + String(co2_ppm) + ",";
  jsonData += "\"temperature\":" + String(temperature, 1) + ",";
  jsonData += "\"humidity\":" + String(humidity, 1) + ",";
  jsonData += "\"voc_index\":" + String(voc_index) + ",";
  jsonData += "\"nox_index\":" + String(nox_index);
  jsonData += "}";
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
          int bodyLen =
              fullActionResp.substring(secondComma + 1).toInt();
          last_http_status = status;

          // Print human-readable status
          Serial.println(F("\n╔══════════════════════════════════════════╗"));
          Serial.print(F("║  HTTP STATUS: "));
          Serial.print(status);
          Serial.print(F(" - "));

          if (status == 200)      Serial.println(F("OK (Success)             ║"));
          else if (status == 201) Serial.println(F("Created (Data Saved)     ║"));
          else if (status == 204) Serial.println(F("No Content (Accepted)    ║"));
          else if (status == 301) Serial.println(F("Moved Permanently        ║"));
          else if (status == 302) Serial.println(F("Redirect (Captive Portal)║"));
          else if (status == 400) Serial.println(F("Bad Request (Invalid JSON)║"));
          else if (status == 401) Serial.println(F("Unauthorized (Auth Fail) ║"));
          else if (status == 403) Serial.println(F("Forbidden (Access Denied)║"));
          else if (status == 404) Serial.println(F("Not Found (Wrong URL)    ║"));
          else if (status == 405) Serial.println(F("Method Not Allowed       ║"));
          else if (status == 408) Serial.println(F("Request Timeout          ║"));
          else if (status == 413) Serial.println(F("Payload Too Large        ║"));
          else if (status == 429) Serial.println(F("Too Many Requests        ║"));
          else if (status == 500) Serial.println(F("Internal Server Error    ║"));
          else if (status == 502) Serial.println(F("Bad Gateway              ║"));
          else if (status == 503) Serial.println(F("Service Unavailable      ║"));
          else if (status == 504) Serial.println(F("Gateway Timeout          ║"));
          // SIM800L-specific error codes (600+)
          else if (status == 601) Serial.println(F("Network Error (DNS Fail) ║"));
          else if (status == 602) Serial.println(F("No Internet Connection   ║"));
          else if (status == 603) Serial.println(F("DNS Error                ║"));
          else if (status == 604) Serial.println(F("Stack Busy               ║"));
          else if (status == 605) Serial.println(F("SSL Error                ║"));
          else if (status == 606) Serial.println(F("Connection Timed Out     ║"));
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
            Serial.println(F("║  → Dial *544# to buy bundles"));
          } else if (status >= 300 && status <= 399) {
            Serial.println(F("Server is redirecting request"));
            Serial.println(F("║  → Check if URL is correct"));
          } else if (status == 400) {
            Serial.println(F("Server rejected the JSON payload"));
            Serial.println(F("║  → Check JSON format matches API"));
          } else if (status == 404) {
            Serial.println(F("API endpoint path not found"));
            Serial.println(F("║  → Verify the URL path is correct"));
          } else if (status >= 500 && status <= 599) {
            Serial.println(F("Remote server is down/broken"));
            Serial.println(F("║  → Try again later"));
          } else if (status == 601) {
            Serial.println(F("Cannot reach server at all"));
            Serial.println(F("║  → No data bundles OR DNS blocked"));
            Serial.println(F("║  → Server hostname may be wrong"));
            Serial.println(F("║  → Port may be blocked by ISP"));
          } else if (status >= 602 && status <= 606) {
            Serial.println(F("SIM800L internal network error"));
            Serial.println(F("║  → Check GPRS bearer is open"));
            Serial.println(F("║  → May need GSM reinit"));
          } else {
            Serial.println(F("Unexpected code"));
          }
          Serial.println(F("╚══════════════════════════════════════════╝"));

          // Track success / failure
          if (status >= 200 && status <= 299) {
            last_successful_send = millis();
            failed_requests = 0;
          } else {
            failed_requests++;
          }

          // Always read response body for ALL status codes
          if (bodyLen > 0) {
            Serial.println(F("[RESPONSE BODY] Reading..."));
            SIM800L_SERIAL.println("AT+HTTPREAD");
            unsigned long rStart = millis();
            while (millis() - rStart < 5000) {
              while (SIM800L_SERIAL.available()) {
                Serial.write(SIM800L_SERIAL.read());
              }
            }
            Serial.println(F("\n[RESPONSE BODY] End."));
          } else {
            Serial.println(F("[RESPONSE BODY] Empty (0 bytes)."));
          }
        }
      }
    } else {
      Serial.println(F("\n╔══════════════════════════════════════════╗"));
      Serial.println(F("║  HTTP STATUS: TIMEOUT                    ║"));
      Serial.println(F("║  No response from SIM800L module         ║"));
      Serial.println(F("║  Diagnosis: GSM module may be frozen     ║"));
      Serial.println(F("║  → Check SIM800L power & antenna         ║"));
      Serial.println(F("║  → May need full GSM reinit              ║"));
      Serial.println(F("╚══════════════════════════════════════════╝"));
      failed_requests++;
      last_http_status = 0;
    }
  } else {
    Serial.println(F("\n╔══════════════════════════════════════════╗"));
    Serial.println(F("║  HTTP STATUS: DATA MODE FAILED           ║"));
    Serial.println(F("║  SIM800L did not accept the POST data    ║"));
    Serial.println(F("║  Diagnosis: GPRS bearer may be closed    ║"));
    Serial.println(F("║  → Will attempt GSM reinit next cycle    ║"));
    Serial.println(F("╚══════════════════════════════════════════╝"));
    failed_requests++;
  }
}

void sendDataToBackend() {
  Serial.println(F("\n>>> Triggering triple transmission..."));
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

  // SGP41 Initialization
  delay(1000); // Wait for sensor to power up
  sgp41.begin(Wire);
  uint16_t testResult;
  uint16_t error = sgp41.executeSelfTest(testResult);
  if (error) {
    Serial.print(F("SGP41 Self Test Error: "));
    Serial.println(error);
  } else if (testResult != 0) {
    Serial.print(F("SGP41 Self Test Failed, Result: "));
    Serial.println(testResult, HEX);
  }

  error = sgp41.getSerialNumber(sgp_serial);
  if (error) {
    Serial.print(F("SGP41 Serial Number Error: "));
    Serial.println(error);
    status_sgp41 = false;
  } else {
    Serial.print(F("SGP41 Serial: "));
    Serial.print(sgp_serial[0], HEX);
    Serial.print(sgp_serial[1], HEX);
    Serial.println(sgp_serial[2], HEX);
    status_sgp41 = true;
    // Generate unique Device ID from SGP41 serial (first 6 hex digits)
    if (DEVICE_ID == "AQ-NODE-001") {
      char buf[20];
      sprintf(buf, "AQ-%04X%04X", sgp_serial[0], sgp_serial[1]);
      DEVICE_ID = String(buf);
      Serial.print(F("✓ Dynamic Device ID: "));
      Serial.println(DEVICE_ID);
    }
  }

  // Serial Port Assignments
  Serial3.begin(9600); // PMS5003
  Serial2.begin(9600); // MH-Z19C
  myMHZ19.begin(&Serial2);

  SIM800L_SERIAL.begin(GSM_BAUD);

  Serial.println(F("\n================================"));
  Serial.println(F("Air Quality Monitor: Hardware Check"));
  Serial.print(F("PMS5003 (Serial3): ... "));
  Serial.println(Serial3 ? "OK" : "FAIL");
  Serial.print(F("MH-Z19C (Serial2): ... "));
  Serial.println(Serial2 ? "OK" : "FAIL");
  Serial.println(F("================================\n"));

  delay(3000);
  initGSM(); // This calls dynamic APN, operator, location
}

// ----------------------
// MAIN LOOP
// ----------------------
void loop() {
  // FAIL-SAFE SUPERVISOR
  if (millis() > 1800000 && (millis() - last_successful_send > 1800000)) {
    Serial.println(
        F("\n[FAIL-SAFE] HTTP Communication lost for 30 mins. REBOOTING..."));
    delay(1000);
    NVIC_SystemReset();
  }

  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 10000) {
    Serial.print(F("... Heartbeat: Sensors active, conditioning: "));
    Serial.print(conditioning_s);
    Serial.print(F(", GSM Ready: "));
    Serial.println(gsmReady ? "YES" : "NO");
    lastHeartbeat = millis();
  }

  if (readPMS5003()) {
    last_pms_read = millis();
    status_pms = true;
  } else if (millis() - last_pms_read > 60000) {
    status_pms = false;
  }

  co2_ppm = myMHZ19.getCarbonDioxide();
  status_mhz19 = (co2_ppm > 0);

  uint16_t srawVoc = 0, srawNox = 0;
  uint16_t sgp_err;
  if (conditioning_s > 0) {
    sgp_err = sgp41.executeConditioning(0x8000, 0x6666, srawVoc);
    if (sgp_err == 0)
      conditioning_s--;
  } else {
    sgp_err = sgp41.measureRawSignals(0x8000, 0x6666, srawVoc, srawNox);
  }
  status_sgp41 = (sgp_err == 0);
  if (sgp_err != 0) {
    Serial.print(F("SGP41 Error: "));
    Serial.println(sgp_err);
  }
  if (status_sgp41) {
    voc_index = voc_helper.process(srawVoc);
    nox_index = nox_helper.process(srawNox);
  }

  float h = dht.readHumidity();
  float t = dht.readTemperature();
  status_dht = (h == h) && (t == t);
  if (status_dht) {
    humidity = h;
    temperature = t;
  }

  int mq7_raw = analogRead(MQ7_PIN);
  CO_ppm = ((mq7_raw * 3.3) / 1023.0) * 200.0;

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
  u8g2.drawStr(0, 10, timeStr);
  u8g2.drawStr(65, 10, dateStr);
  u8g2.drawHLine(0, 13, 128);

  if (page == 0) {
    u8g2.drawStr(35, 25, "[ PM LEVELS ]");
    char p1[20], p25[20], p10[20];
    sprintf(p1, "PM1.0: %d ug/m3", pm1_0);
    sprintf(p25, "PM2.5: %d ug/m3", pm2_5);
    sprintf(p10, "PM10 : %d ug/m3", pm10);
    u8g2.drawStr(5, 40, p1);
    u8g2.drawStr(5, 52, p25);
    u8g2.drawStr(5, 64, p10);
  } else if (page == 1) {
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
  } else if (page == 2) {
    u8g2.drawStr(25, 23, "[ ENVIRONMENT ]");
    char tStr[20], hStr[20], coStr[20], co2Str[20];
    sprintf(tStr, "Temp: %.1f C", temperature);
    sprintf(hStr, "Hum : %.1f %%", humidity);
    sprintf(coStr, "CO  : %.1f ppm", CO_ppm);
    sprintf(co2Str, "CO2 : %d ppm", co2_ppm);
    u8g2.drawStr(10, 34, tStr);
    u8g2.drawStr(10, 44, hStr);
    u8g2.drawStr(10, 54, coStr);
    u8g2.drawStr(10, 64, co2Str);
  } else if (page == 3) {
    u8g2.drawStr(25, 25, "[ AQ STATUS ]");
    if (pm2_5 > 75 || pm10 > 100 || CO_ppm > 3.4) {
      u8g2.drawStr(15, 45, "DANGER!");
      u8g2.drawStr(15, 60, "VENTILATE NOW!");
    } else if (pm2_5 > 55 || pm10 > 75 || CO_ppm > 2.5) {
      u8g2.drawStr(15, 45, "WARNING");
      u8g2.drawStr(15, 60, "Reduce exposure");
    } else if (pm2_5 > 35 || pm10 > 50 || CO_ppm > 1.7) {
      u8g2.drawStr(15, 45, "MODERATE");
      u8g2.drawStr(15, 60, "Sensitive: caution");
    } else {
      u8g2.drawStr(15, 45, "GOOD");
      u8g2.drawStr(15, 60, "Air quality safe");
    }
  }
  u8g2.sendBuffer();

  unsigned long currentTime = millis();
  if (currentTime - lastSendTime >= SEND_INTERVAL) {
    bool sensorsReady =
        (conditioning_s == 0) || (millis() > 60000 && !status_sgp41);
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

  if (gsmReady &&
      (millis() - lastLocationRefresh > LOCATION_REFRESH_INTERVAL)) {
    getNetworkLocation();
    lastLocationRefresh = millis();
  }

  delay(100);
}