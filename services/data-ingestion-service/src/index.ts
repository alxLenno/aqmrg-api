import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ingestRoutes from './routes/ingestRoutes';

dotenv.config();

const app = express();
const PORT = process.env.DATA_INGESTION_SERVICE_PORT || 8002;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aqmrg';

// MongoDB Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Successfully'))
    .catch((err: any) => console.error('MongoDB connection error:', err));

app.use(cors());
app.use(express.json());

// Main Ingestion Routes
app.use('/', ingestRoutes);

app.get('/health', (req: Request, res: Response) => {
    res.json({ 
        status: 'healthy', 
        service: 'data-ingestion-service',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

app.listen(PORT, () => {
    console.log(`Data Ingestion service running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
