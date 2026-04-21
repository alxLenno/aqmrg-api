import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User';

dotenv.config();

const app = express();
const PORT = process.env.AUTH_SERVICE_PORT || 8001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aqmrg_auth';

// MongoDB Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Auth Service connected to MongoDB'))
    .catch((err: any) => console.error('Auth Service MongoDB connection error:', err));

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'auth-service',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Basic registration endpoint
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username,
            email,
            password_hash: hashedPassword
        });
        await user.save();
        res.status(201).json({ userId: user._id });
    } catch (error: any) {
        console.error('Registration failed:', error);
        res.status(500).json({ error: 'Registration failed', details: error.message });
    }
});

// Basic login endpoint
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );
        res.json({ token, userId: user._id });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

app.listen(PORT, () => {
    console.log(`Auth service running on port ${PORT}`);
});
