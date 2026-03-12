const https = require('https');

https.get('https://aqmrg.pythonanywhere.com/api/v1/data/latest', (resp) => {
  let data = '';
  resp.on('data', (chunk) => { data += chunk; });
  resp.on('end', () => {
    const rawData = JSON.parse(data);
    const lastSeen = new Date(rawData[0].timestamp);
    const now = new Date();
    
    // The timestamp is from a Python server returning UTC time but naive
    // The Arduino is likely sending its local time to the PythonAnywhere relay which saves it, OR PythonAnywhere uses its own system time.
    console.log("Last Seen (Server):", lastSeen.toISOString());
    console.log("Current Time (Local):", now.toISOString());
    console.log("Difference (Local - Server) in minutes:", (now - lastSeen) / 1000 / 60);
  });
});
