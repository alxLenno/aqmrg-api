import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { Parser } from 'json2csv';

dotenv.config();

const app = express();
const PORT = process.env.EXPORT_SERVICE_PORT || 8007;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', service: 'export-service' });
});

app.get('/csv', async (req: Request, res: Response) => {
    try {
        console.log('Fetching readings for CSV export...');

        // Fetch all readings joined with sensor metadata
        const result = await pool.query(`
            SELECT 
                r.recorded_at as timestamp,
                s.device_id,
                s.name as sensor_name,
                r.pm1,
                r.pm25,
                r.pm10,
                r.co,
                r.co2,
                r.temperature,
                r.humidity,
                r.voc_index,
                r.nox_index,
                r.status as aq_status,
                s.location_name,
                s.latitude,
                s.longitude
            FROM readings r
            JOIN sensors s ON r.sensor_id = s.id
            ORDER BY r.recorded_at DESC
            LIMIT 5000
        `);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No data found to export' });
        }

        const fields = [
            'timestamp', 'device_id', 'sensor_name',
            'pm1', 'pm25', 'pm10', 'co', 'co2',
            'temperature', 'humidity', 'voc_index', 'nox_index',
            'aq_status', 'location_name', 'latitude', 'longitude'
        ];

        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(result.rows);

        const filename = `aqmrg_data_${new Date().toISOString().split('T')[0]}.csv`;

        res.header('Content-Type', 'text/csv');
        res.attachment(filename);
        res.send(csv);

    } catch (error) {
        console.error('Export Error:', error);
        res.status(500).json({ error: 'Failed to generate CSV export' });
    }
});

app.post('/', (req: Request, res: Response) => {
    const { filter, format } = req.body;
    console.log(`Starting data export in ${format} format...`);
    res.status(202).json({ status: 'Export Started', jobId: 'job_123' });
});

app.listen(PORT, () => {
    console.log(`Export service running on port ${PORT}`);
});
