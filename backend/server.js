/**
 * Snake Game Backend Server
 * Express API server with MongoDB, JWT auth, and anti-cheat
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { generalLimiter } = require('./middleware/rateLimiter');

// Route imports
const authRoutes = require('./routes/auth');
const scoreRoutes = require('./routes/scores');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------- Middleware ---------------
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080', 'http://localhost:3000', '*'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

// Serve frontend static files in production
const path = require('path');
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath, { maxAge: '1h' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// --------------- Routes ---------------
app.use('/api/auth', authRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/users', userRoutes);

// SPA fallback - serve index.html for non-API routes
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// --------------- Start ---------------
async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  Snake Game Server running on port ${PORT}`);
    console.log(`  API: http://localhost:${PORT}/api`);
    console.log(`  Health: http://localhost:${PORT}/api/health`);
    console.log(`========================================\n`);
  });
}

start();
