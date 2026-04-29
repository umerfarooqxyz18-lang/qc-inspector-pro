/**
 * QC Inspector Pro — Configuration
 * Keys are already filled in. Just deploy this folder!
 */
(function () {
  'use strict';

  var isLocal = (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
  );

  // ── YOUR REAL VALUES ────────────────────────────────────────
  var SUPABASE_URL      = 'https://xvofoksoqsipdtxdyeni.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_qv2ZoAnf7-7yVo8URTc9Zg_dScRA-Qv';
  var RAILWAY_URL       = 'https://qc-inspector-pro-production.up.railway.app/api';
  var COMPANY_NAME      = 'QC Inspector Pro';
  // ────────────────────────────────────────────────────────────

  window.ENV = {
    SUPABASE_URL:      SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    API_URL:           isLocal ? 'http://localhost:3001/api' : RAILWAY_URL,
    COMPANY_NAME:      COMPANY_NAME,
    IS_LOCAL:          isLocal,
  };

  console.log('[QC Inspector] Config loaded — API:', window.ENV.API_URL);
}());
