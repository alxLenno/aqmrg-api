import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../../lib/mongoose.js';
import Reading from '../../models/Reading.js';
import Sensor from '../../models/Sensor.js';

const PA_URL = 'https://aqmrg.pythonanywhere.com/api/v1/history/all';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const limitQuery = typeof request.query.limit === 'string' ? request.query.limit : '5000';
  const limit = parseInt(limitQuery) || 5000;

  try {
    // 1. Fetch from PythonAnywhere (Primary Production Source)
    let paReadings: any[] = [];
    try {
      const resp = await fetch(`${PA_URL}?limit=${limit}`, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) {
        const data = await resp.json();
        const raw = data.readings || (Array.isArray(data) ? data : []);
          paReadings = raw.map((r: any) => {
          const m = r.metrics || {};
          return { ...m, id: r.id, device_id: r.device_id, sensor_name: 'Data Entry Controller', recorded_at: r.timestamp, status: 'ControllerData' };
        });
      }
    } catch (e) {
      console.warn('PA history unreachable');
    }

    // 2. Try MongoDB (Backup/Analytics store)
    let mongoReadings: any[] = [];
    try {
      await dbConnect();
      if (Sensor) {
        mongoReadings = await Reading.find()
          .populate('sensor_id', 'device_id name')
          .sort({ recorded_at: -1 })
          .limit(limit)
          .lean();
      }
    } catch (e) {
      console.warn('MongoDB history unreachable');
    }

    // Format Mongo
    const formattedMongo = mongoReadings.map((r: any) => ({
      ...r, id: r._id, device_id: r.sensor_id?.device_id, sensor_name: r.sensor_id?.name
    }));

    // MERGE & DEDUPLICATE: PA takes priority
    const all = [...paReadings, ...formattedMongo];
    const seen = new Set();
    const unique = all.filter(r => {
      const key = `${r.device_id}-${r.recorded_at || r.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return response.status(200).json({
      count: unique.length,
      readings: unique.slice(0, limit)
    });

  } catch (error) {
    console.error('History API Error:', error);
    return response.status(500).json({ error: 'Failed to fetch global historical data' });
  }
}
