## Sending sensor data


// PythonAnywhere Dashboard Relay
const char *DASHBOARD_URL = "aqmrg.pythonanywhere.com";
const int DASHBOARD_PORT = 80;
const char *DASHBOARD_PATH = "/api/v1/data/ingest";

const char *PROTOCOL = "http://";

const unsigned long SEND_INTERVAL = 180000; // Send data every 3 minutes
unsigned long lastSendTime = 0;
bool gsmReady = false;
