// =============================================================
// server.js — AI QC Inspector Pro (Production-hardened)
// =============================================================
'use strict';

require('dotenv').config();

// ── 1. Validate env at startup — fail loudly ─────────────────
const REQUIRED = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','ANTHROPIC_API_KEY'];
const MISSING  = REQUIRED.filter(k => !process.env[k] || process.env[k].startsWith('YOUR_'));

if (MISSING.length) {
  console.error('\n╔══════════════════════════════════════════╗');
  console.error('║  QC Inspector — Startup Failed           ║');
  console.error('╚══════════════════════════════════════════╝');
  MISSING.forEach(k => console.error(`  ❌  Missing: ${k}`));
  console.error('\n  Fix: copy backend/.env.example → backend/.env and fill in the values.\n');
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

const IS_PROD = process.env.NODE_ENV === 'production';
const app     = express();

// ── 2. Security headers ──────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.set('trust proxy', 1);

// ── 3. CORS — comma-separated origins, wildcard localhost ────
const rawOrigins   = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000');
const allowedList  = rawOrigins.split(',').map(o => o.trim()).filter(Boolean);

// Always add both localhost variants for dev convenience
['http://localhost:3000','http://localhost:3001','http://127.0.0.1:3000'].forEach(o => {
  if (!allowedList.includes(o)) allowedList.push(o);
});

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // server-to-server / curl
    if (allowedList.includes(origin)) return cb(null, true);
    const msg = `CORS blocked: '${origin}'. Add it to ALLOWED_ORIGINS env var.`;
    console.warn('[CORS]', msg);
    return cb(Object.assign(new Error(msg), { status: 403 }));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());

// ── 4. Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── 5. Rate limiting ─────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests — please wait a few minutes.' },
}));
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20,
  message: { error: 'AI rate limit reached — wait 60 seconds.' },
});
['/api/reports/generate','/api/reports/suggest-severity','/api/reports/suggest-actions']
  .forEach(p => app.use(p, aiLimiter));

// ── 6. Request logger (errors only in prod) ──────────────────
app.use((req, _res, next) => {
  if (!IS_PROD) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── 7. Enhanced health check ─────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks = {
    api:          'ok',
    supabase_url: !!process.env.SUPABASE_URL,
    ai_key:       !!process.env.ANTHROPIC_API_KEY,
  };

  // Quick Supabase connectivity check
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    await sb.from('profiles').select('id').limit(1);
    checks.supabase_db = 'ok';
  } catch (e) {
    checks.supabase_db = 'error: ' + e.message;
  }

  const allOk = Object.values(checks).every(v => v === 'ok' || v === true);
  res.status(allOk ? 200 : 503).json({
    status:  allOk ? 'ok' : 'degraded',
    service: 'QC Inspector API',
    version: '1.0.0',
    ts:      new Date().toISOString(),
    env:     process.env.NODE_ENV || 'development',
    checks,
  });
});

// ── 8. API routes ────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/projects',    projectRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/issues',      issueRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/dashboard',   dashboardRoutes);
app.use('/api/upload',      uploadRoutes);

// ── 9. 404 ───────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ── 10. Global error handler ─────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;

  if (err.message?.startsWith('CORS'))
    return res.status(403).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'File too large. Max 20 MB per image.' });

  // Production: hide internals; development: include stack
  const safe = err.message || 'Internal server error';
  const body = { error: IS_PROD ? safe : safe };
  if (!IS_PROD && err.stack) body.stack = err.stack;

  // Only log 5xx in production (4xx are client errors, not our fault)
  if (status >= 500 || !IS_PROD) {
    console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${safe}`);
  }

  res.status(status).json(body);
});

// ── 11. Start ────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  QC Inspector API  →  http://0.0.0.0:${PORT}`);
  console.log(`    Health check      →  http://0.0.0.0:${PORT}/health`);
  console.log(`    Allowed origins   →  ${allowedList.filter(o => !o.includes('localhost')).join(', ') || '(localhost only)'}`);
  console.log(`    Environment       →  ${process.env.NODE_ENV || 'development'}\n`);
});
