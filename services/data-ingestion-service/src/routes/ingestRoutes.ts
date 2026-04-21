import { Request, Response, Router } from 'express';
import { processIngestion } from '../services/dataService';

const router = Router();

/**
 * Handle incoming sensor data.
 */
const ingestHandler = async (req: Request, res: Response) => {
    const reading = req.body;

    if (!reading.sensorId || !reading.measurements) {
        console.warn('Received malformed normalized data:', req.body);
        return res.status(400).json({ status: 'Bad Request', message: 'Missing sensorId or measurements' });
    }

    try {
        console.log(`Ingesting normalized data from sensor ${reading.sensorId}...`);
        const { sensor, reading: savedReading } = await processIngestion(reading);
        console.log('Ingestion successful, sensor ID:', sensor._id);
        res.status(202).json({ status: 'Accepted', sensorId: sensor._id, readingId: savedReading._id });
    } catch (err: any) {
        console.error('Failed to update sensor data MongoDB:', err);
        res.status(500).json({ status: 'Error', message: err.message });
    }
};

router.post('/', ingestHandler);
router.post('/api/v1/data/ingest', ingestHandler);

export default router;
