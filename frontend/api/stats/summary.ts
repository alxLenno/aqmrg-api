import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../lib/mongoose.js';
import Reading from '../models/Reading.js';

const PA_SUMMARY_URL = 'https://aqmrg.pythonanywhere.com/api/stats/summary';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Try PythonAnywhere (Primary Production Stats)
    try {
      const resp = await fetch(PA_SUMMARY_URL, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.count > 0) return response.status(200).json(data);
      }
    } catch (e) {
      console.warn('PA summary unreachable');
    }

    // 2. Try MongoDB Aggregation (Fallback)
    try {
      await dbConnect();
      const stats = await Reading.aggregate([
        { $match: { pm25: { $ne: null } } },
        { 
          $group: {
            _id: null,
            count: { $sum: 1 },
            mean: { $avg: "$pm25" },
            min: { $min: "$pm25" },
            max: { $max: "$pm25" },
            std: { $stdDevPop: "$pm25" }
          }
        }
      ]);

      if (stats.length > 0) {
        const result = stats[0];
        return response.status(200).json({
          count: result.count,
          mean: result.mean,
          std: result.std,
          min: result.min,
          max: result.max,
          median: result.mean,
          skewness: 0,
          kurtosis: 0
        });
      }
    } catch (e) {
      console.warn('MongoDB summary failed');
    }

    return response.status(200).json({ count: 0, mean: 0, std: 0, min: 0, max: 0, median: 0 });

  } catch (error) {
    console.error('Stats Summary API Error:', error);
    return response.status(500).json({ error: 'Failed to calculate stats summary' });
  }
}
