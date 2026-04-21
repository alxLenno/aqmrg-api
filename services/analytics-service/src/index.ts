import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Kafka } from 'kafkajs';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import Sensor from './models/Sensor';
import Reading from './models/Reading';

dotenv.config();

const app = express();
const PORT = process.env.ANALYTICS_SERVICE_PORT || 8004;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aqmrg_analytics';

// --- INFLUXDB SETUP ---
const influxUrl = process.env.INFLUXDB_URL || 'http://localhost:8086';
const influxToken = process.env.INFLUXDB_TOKEN || 'admin_token';
const influxOrg = process.env.INFLUXDB_ORG || 'aqmrg';
const influxBucket = process.env.INFLUXDB_BUCKET || 'sensor_data';

const influxDB = new InfluxDB({ url: influxUrl, token: influxToken });
const writeApi = influxDB.getWriteApi(influxOrg, influxBucket, 's');

// --- KAFKA SETUP ---
const kafka = new Kafka({
    clientId: 'analytics-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
});
const consumer = kafka.consumer({ groupId: 'aqmrg-analytics-bridge' });

const startBridge = async () => {
    try {
        await consumer.connect();
        await consumer.subscribe({ topic: 'sensor.raw.airquality', fromBeginning: false });
        
        await consumer.run({
            eachMessage: async ({ message }: { message: any }) => {
                if (!message.value) return;
                
                try {
                    const data = JSON.parse(message.value.toString());
                    console.log(`[BRIDGE] Processing sensor data for ${data.sensorId}`);
                    
                    // 1. Prepare InfluxDB Point
                    const m = data.measurements;
                    const point = new Point('air_quality')
                        .tag('sensor_id', data.sensorId)
                        .tag('status', data.status || 'Unknown')
                        .floatField('pm1', m.pm1 || 0)
                        .floatField('pm25', m.pm25 || 0)
                        .floatField('pm10', m.pm10 || 0)
                        .floatField('co', m.co || 0)
                        .floatField('co2', m.co2 || 0)
                        .floatField('temperature', m.temperature || 0)
                        .floatField('humidity', m.humidity || 0)
                        .floatField('voc_index', m.voc_index || 0)
                        .floatField('nox_index', m.nox_index || 0)
                        .timestamp(new Date(data.timestamp || Date.now()));
                    
                    // 2. Write to InfluxDB (Instant)
                    writeApi.writePoint(point);
                    await writeApi.flush();
                    
                    console.log(`[BRIDGE] Successfully bridged ${data.sensorId} to InfluxDB`);
                } catch (err) {
                    console.error('[BRIDGE] Error processing Kafka message:', err);
                }
            },
        });
        
        console.log('Kafka-to-InfluxDB bridge started successfully');
    } catch (error) {
        console.error('Failed to start bridge:', error);
    }
};

// Start the background bridge worker
startBridge();

// MongoDB Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Analytics Service connected to MongoDB'))
    .catch((err: any) => console.error('Analytics Service MongoDB connection error:', err));

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
    res.json({ 
        status: 'healthy', 
        service: 'analytics-service',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        influx: 'connected'
    });
});

app.get('/realtime', async (req: Request, res: Response) => {
    try {
        const sensors = await Sensor.find().lean();
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        const sensorsWithReadings = sensors.map(sensor => {
            const lastSeen = sensor.last_seen ? new Date(sensor.last_seen) : null;
            const isOnline = lastSeen ? lastSeen > tenMinutesAgo : false;

            return {
                ...sensor,
                id: sensor._id,
                is_online: isOnline,
                readings: sensor.last_readings ? {
                    ...sensor.last_readings,
                    timestamp: lastSeen
                } : null
            };
        });

        const latestPulse = await Sensor.findOne().sort({ last_seen: -1 }).select('last_seen').lean();

        res.json({
            timestamp: latestPulse?.last_seen || new Date().toISOString(),
            sensorsCount: sensors.length,
            sensors: sensorsWithReadings
        });
    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

app.get('/history/all', async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 5000;
    try {
        const readings = await Reading.find()
            .populate('sensor_id', 'device_id name')
            .sort({ recorded_at: -1 })
            .limit(limit)
            .lean();

        const formattedReadings = readings.map((r: any) => ({
            ...r,
            id: r._id,
            device_id: r.sensor_id?.device_id,
            sensor_name: r.sensor_id?.name
        }));

        res.json({
            count: formattedReadings.length,
            readings: formattedReadings
        });
    } catch (error) {
        console.error('Global History Query Error:', error);
        res.status(500).json({ error: 'Failed to fetch global historical data' });
    }
});

app.listen(PORT, () => {
    console.log(`Analytics service running on port ${PORT}`);
});
