import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 8000;

// Trust the first proxy (ngrok)
app.set('trust proxy', 1);

// Simple logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// Middleware
app.use(helmet());
app.use(cors());
app.use((req, res, next) => {
  const start = Date.now();
  const originalPath = req.path;
  const originalUrl = req.url;
  const oldEnd = res.end;

  // @ts-ignore - wrapping res.end for logging
  res.end = function (chunk: any, encoding: any, cb?: any) {
    const duration = Date.now() - start;
    if (originalPath.startsWith('/api/api/')) {
      const collapsedUrl = originalUrl.replace('/api/api/', '/api/');
      logger.info(`Collapsed: ${req.method} ${collapsedUrl} ${res.statusCode} (${duration}ms)`);
    } else {
      logger.info(`${req.method} ${originalPath} ${res.statusCode} (${duration}ms)`);
    }
    return oldEnd.call(this, chunk, encoding, cb);
  };

  // Collapse double /api/api prefixes if they occur
  if (req.path.startsWith('/api/api/')) {
    req.url = req.url.replace('/api/api/', '/api/');
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
});
app.use(limiter);

// Health check
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Proxy Error Handler
const onProxyError = (err: any, req: any, res: any) => {
  logger.error(`Proxy Error (${req.path}): ${err.message}`);
  if (!res.headersSent) {
    res.status(502).json({ status: 'error', message: 'Service temporarily unavailable' });
  }
};

// --- PROXY CONFIGURATION ---
// We use a more flexible approach to handle potential /api/api prefixes from cached clients

// Dashboard & Analytics
const dashboardProxy = createProxyMiddleware({
  target: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:8004',
  changeOrigin: true,
  pathRewrite: {
    '^.*/v1/dashboard': '',
    '^.*/v1/data/latest': '/realtime',
    '^.*/v1/history': '/history',
    '^.*/stats': '/stats'
  },
  onProxyReq: fixRequestBody,
  onError: onProxyError,
});

// Authentication
const authProxy = createProxyMiddleware({
  target: process.env.AUTH_SERVICE_URL || 'http://auth-service:8001',
  changeOrigin: true,
  pathRewrite: { '^.*/v1/auth': '' },
  onProxyReq: fixRequestBody,
  onError: onProxyError,
});

// Predictions
const predictionsProxy = createProxyMiddleware({
  target: process.env.MODEL_SERVING_SERVICE_URL || 'http://model-serving-service:8003',
  changeOrigin: true,
  pathRewrite: { '^.*/v1/predictions': '' },
  onProxyReq: fixRequestBody,
  onError: onProxyError,
});

// Ingestion
const ingestionProxy = createProxyMiddleware({
  target: process.env.SENSOR_ADAPTER_SERVICE_URL || 'http://sensor-adapter-service:8006',
  changeOrigin: true,
  pathRewrite: { '^.*/v1/data/ingest': '' },
  onProxyReq: fixRequestBody,
  onError: onProxyError,
});

// Alerts
const alertsProxy = createProxyMiddleware({
  target: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:8005',
  changeOrigin: true,
  pathRewrite: { '^.*/v1/alerts': '' },
  onProxyReq: fixRequestBody,
  onError: onProxyError,
});

// Export
const exportProxy = createProxyMiddleware({
  target: process.env.EXPORT_SERVICE_URL || 'http://export-service:8007',
  changeOrigin: true,
  pathRewrite: { '^.*/v1/data/export': '' },
  onProxyReq: fixRequestBody,
  onError: onProxyError,
});

// Application of Proxies
// Handle any path containing v1/dashboard, v1/auth, etc. regardless of /api or /api/api prefix
app.use('**/v1/dashboard', dashboardProxy);
app.use('**/v1/data/latest', dashboardProxy);
app.use('**/v1/history', dashboardProxy);
app.use('**/v1/auth', authProxy);
app.use('**/v1/predictions', predictionsProxy);
app.use('**/v1/data/ingest', ingestionProxy);
app.use('**/v1/alerts', alertsProxy);
app.use('**/v1/data/export', exportProxy);
app.use('**/stats', dashboardProxy);

// Body parser for non-proxied routes (like health and home)
app.use(express.json());

app.get('/', (req, res) => {
  res.send('AQMRG API Gateway is running.');
});

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
});
