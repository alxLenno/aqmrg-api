import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env.local') });

const MONGODB_URI = process.env.aqmrg_frontend_MONGODB_URI;

mongoose.connect(MONGODB_URI).then(async () => {
  const db = mongoose.connection;
  const sensors = await db.collection('sensors').find().toArray();
  const readings = await db.collection('readings').find().toArray();
  console.log(`Sensors count: ${sensors.length}`);
  if (sensors.length > 0) {
    console.log(sensors[0]);
  }
  console.log(`Readings count: ${readings.length}`);
  process.exit();
}).catch(e => {
  console.error(e);
  process.exit(1);
});
