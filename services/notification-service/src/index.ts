import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 8005;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'notification-service' });
});

app.post('/send', (req, res) => {
    const { userId, message, type } = req.body;
    console.log(`Sending ${type} alert to user ${userId}: ${message}`);
    res.status(200).json({ status: 'Sent' });
});

app.listen(PORT, () => {
    console.log(`Notification service running on port ${PORT}`);
});
