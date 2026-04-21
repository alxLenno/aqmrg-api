import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.SENSOR_ADAPTER_SERVICE_PORT || 8006;
const INGESTION_SERVICE_URL = process.env.DATA_INGESTION_SERVICE_URL || 'http://data-ingestion-service:8002';

app.use(cors());
app.use(express.json());

// Standard Internal Format
interface AqmReading {
    sensorId: string;
    controllerId?: string;
    manufacturer: string;
    timestamp: string;
    location: { latitude?: number; longitude?: number; name: string };
    hardware?: {
        controller: string;
        sensors: string[];
    };
    measurements: {
        pm1?: number; pm25: number; pm10: number;
        co?: number; co2?: number; temperature: number; humidity: number;
        voc_index?: number; nox_index?: number;
    };
}

// Adapters
const adapters = {
    arduino: (raw: any): AqmReading => ({
        sensorId: raw.sensorId || 'unknown',
        controllerId: raw.controllerId,
        manufacturer: 'Arduino-Custom',
        timestamp: raw.timestamp || new Date().toISOString(),
        location: {
            name: raw.location?.name || 'Unknown',
            latitude: raw.location?.latitude,
            longitude: raw.location?.longitude
        },
        hardware: raw.hardware,
        measurements: {
            pm1: raw.metrics?.pm1,
            pm25: raw.metrics?.pm25,
            pm10: raw.metrics?.pm10,
            co: raw.metrics?.co,
            co2: raw.metrics?.co2,
            temperature: raw.metrics?.temperature,
            humidity: raw.metrics?.humidity,
            voc_index: raw.metrics?.voc_index,
            nox_index: raw.metrics?.nox_index,
        }
    }),
    purpleair: (raw: any): AqmReading => ({
        sensorId: raw.sensor_index?.toString() || 'purple-raw',
        manufacturer: 'PurpleAir',
        timestamp: raw.time_stamp ? new Date(raw.time_stamp * 1000).toISOString() : new Date().toISOString(),
        location: { name: raw.name || 'Purple-Station' },
        measurements: {
            pm25: raw.pm2_5_atm,
            pm10: raw.pm10_0_atm,
            temperature: raw.temperature,
            humidity: raw.humidity,
        }
    })
};

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'sensor-adapter-service' });
});

app.post('/', async (req, res) => {
    const rawData = req.body;
    console.log('--- RAW SENSOR DATA RECEIVED ---');
    console.log(JSON.stringify(rawData, null, 2));
    let normalized: AqmReading | null = null;

    // Detection Logic
    if (rawData.metrics) {
        normalized = adapters.arduino(rawData);
    } else if (rawData.sensor_index) {
        normalized = adapters.purpleair(rawData);
    }

    if (!normalized) {
        console.warn('Unknown sensor format received:', rawData);
        return res.status(400).json({ status: 'Error', message: 'Unsupported sensor format' });
    }

    try {
        console.log(`Normalized data for sensor ${normalized.sensorId}. Forwarding to ingestion...`);
        await axios.post(INGESTION_SERVICE_URL, normalized);
        res.status(202).json({ status: 'Processed', sensorId: normalized.sensorId });
    } catch (error) {
        console.error('Failed to forward normalized data:', error);
        res.status(500).json({ status: 'Error', message: 'Ingestion service unreachable' });
    }
});

app.listen(PORT, () => {
    console.log(`Sensor Adapter service running on port ${PORT}`);
});
