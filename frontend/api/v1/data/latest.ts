import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../lib/mongoose.js';
import Sensor from '../../models/Sensor.js';

const PA_URL = 'https://aqmrg.pythonanywhere.com/api/v1/data/latest';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Try MongoDB (Production Store for registered sensors)
    let mongoSensors: any[] = [];
    try {
      await dbConnect();
      mongoSensors = await Sensor.find().lean();
    } catch (dbError) {
      console.warn('MongoDB unavailable');
    }

    // 2. Fetch from PythonAnywhere (Primary Production Hardware Source)
    let paSensors: any[] = [];
    try {
      const resp = await fetch(PA_URL, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        paSensors = Array.isArray(data) ? data : (data.sensors || []);
      }
    } catch (e) {
      console.warn('PythonAnywhere unreachable');
    }

    // MERGE LOGIC: PA > MongoDB
    const mergedMap = new Map<string, any>();

    // Add MongoDB first
    mongoSensors.forEach((s: any) => {
      mergedMap.set(s.device_id, { ...s, id: s._id });
    });

    // Overlay PA (fresher than MongoDB)
    paSensors.forEach((s: any) => {
      mergedMap.set(s.device_id || 'unknown', { 
        ...s, 
        sensor_name: s.sensor_name || 'Data Entry Controller',
        status: 'ControllerData' 
      });
    });

    const allSensors = Array.from(mergedMap.values());

    return response.status(200).json({
      timestamp: paSensors[0]?.timestamp || null,
      sensorsCount: allSensors.length,
      sensors: allSensors
    });

  } catch (error) {
    console.error('Latest Data API Error:', error);
    return response.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
}
