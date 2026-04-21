const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://aqmrg:your_postgres_password_change_me@localhost:5432/aqmrg',
});

async function checkRate() {
    try {
        const res = await pool.query('SELECT recorded_at, pm25 FROM readings ORDER BY recorded_at DESC LIMIT 5');
        console.log('--- Last 5 Readings ---');
        res.rows.forEach(row => {
            console.log(`Time: ${row.recorded_at} | PM2.5: ${row.pm25}`);
        });

        if (res.rows.length >= 2) {
            const diff = (res.rows[0].recorded_at - res.rows[1].recorded_at) / 1000 / 60;
            console.log(`\nRate detected: New data every ~${diff.toFixed(2)} minutes`);
        }
    } catch (err) {
        console.error('Error querying DB:', err.message);
    } finally {
        await pool.end();
    }
}

checkRate();
