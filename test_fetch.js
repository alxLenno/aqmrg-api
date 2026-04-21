fetch('https://aqmrg.pythonanywhere.com/api/v1/data/latest')
  .then(res => res.json())
  .then(data => {
    console.log(JSON.stringify(data.slice(0, 3), null, 2));
    const uniqueIds = Array.from(new Set(data.map(d => d.device_id)));
    console.log(`\nFound ${uniqueIds.length} Unique Sensors:`);
    console.log(uniqueIds);
  })
  .catch(err => console.error("Fetch Error:", err));
