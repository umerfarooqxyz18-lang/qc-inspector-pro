// =============================================================
// server.js  —  AI QC Inspector Pro  (Production-hardened)
// =============================================================
'use strict';

require('dotenv').config();

// ── Fail fast if critical env vars are missing ───────────────
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'ANTHROPIC_API_KEY',
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌  Missing required env vars:', missing.join(', '));
  console.error('    Copy backend/.env.example → backend/.env and fill in the values.');
  process.exit(1);
}

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes       = require('./routes/auth');
const inspectionRoutes = require('./routes/inspections');
const issueRoutes      = require('./routes/issues');
const reportRoutes     = require('./routes/reports');
const dashboardRoutes  = require('./routes/dashboard');
const uploadRoutes     = require('./routes/upload');
const projectRoutes    = require('./routes/projects');

const app = express();

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.set('trust proxy', 1);

// CORS
const allowedList = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',').map(o => o.trim());

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedList.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limit: 200 req / 15 min per IP
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, max: 200,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests — try again in a few minutes.' },
}));

// Tighter AI limiter: 15 req / min
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 15,
  message: { error: 'AI rate limit — wait 60 seconds.' },
});
app.use('/api/reports/generate', aiLimiter);
app.use('/api/reports/suggest-severity', aiLimiter);
app.use('/api/reports/suggest-actions', aiLimiter);

// Request logger
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'test')
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check (public)
app.get('/health', (_req, res) => res.json({
  status: 'ok', service: 'QC Inspector API', version: '1.0.0',
  ts: new Date().toISOString(), env: process.env.NODE_ENV || 'development',
}));

// API routes
app.use('/api/auth',        authRoutes);
app.use('/api/projects',    projectRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/issues',      issueRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/dashboard',   dashboardRoutes);
app.use('/api/upload',      uploadRoutes);

// 404
app.use((req, res) =>
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.message?.startsWith('CORS:'))
    return res.status(403).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'File too large. Max 20 MB.' });
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  const status = err.status || 500;
  const body   = { error: err.message || 'Internal server error' };
  if (process.env.NODE_ENV !== 'production') body.stack = err.stack;
  res.status(status).json(body);
});

const PORT = parseInt(process.env.PORT, 10) || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅  API running  →  http://0.0.0.0:${PORT}`);
  console.log(`    Health       →  http://0.0.0.0:${PORT}/health`);
});
