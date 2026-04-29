/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║           QC Inspector Pro — Configuration              ║
 * ║                                                          ║
 * ║  STEP 1: Fill in your Supabase keys below               ║
 * ║  STEP 2: Fill in your Railway backend URL               ║
 * ║  STEP 3: Save this file and deploy                      ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * WHERE TO GET THESE VALUES:
 *   Supabase keys → supabase.com → your project → Settings → API
 *   Railway URL   → railway.app  → your service → Networking → Domain
 */
(function () {
  'use strict';

  // ── Auto-detect if running locally or on the internet ──────
  var isLocal = (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '0.0.0.0'
  );

  // ════════════════════════════════════════════════════════════
  //  ✏️  PASTE YOUR VALUES HERE
  // ════════════════════════════════════════════════════════════

  // Your Supabase Project URL
  // Example: https://abcdefghijklmn.supabase.co
  var SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';

  // Your Supabase anon/public key (long string starting with eyJ...)
  var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

  // Your Railway backend URL + /api at the end
  // Example: https://qc-inspector-pro.up.railway.app/api
  // For local testing use: http://localhost:3001/api
  var RAILWAY_URL = 'https://YOUR_BACKEND.up.railway.app/api';

  // Your company name (shown on PDF reports)
  var COMPANY_NAME = 'Your Company Name';

  // ════════════════════════════════════════════════════════════
  //  DO NOT EDIT BELOW THIS LINE
  // ════════════════════════════════════════════════════════════

  window.ENV = {
    SUPABASE_URL:      SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    API_URL:           isLocal ? 'http://localhost:3001/api' : RAILWAY_URL,
    COMPANY_NAME:      COMPANY_NAME,
    IS_LOCAL:          isLocal,
  };

  // ── Validate — show a clear error if keys not filled in ─────
  var problems = [];
  if (!SUPABASE_URL      || SUPABASE_URL.indexOf('YOUR_')      !== -1) problems.push('SUPABASE_URL');
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.indexOf('YOUR_') !== -1) problems.push('SUPABASE_ANON_KEY');
  if (!RAILWAY_URL       || RAILWAY_URL.indexOf('YOUR_')       !== -1) problems.push('RAILWAY_URL (backend URL)');

  if (problems.length > 0 && !isLocal) {
    // Show a visible banner on the page
    window.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;padding:16px 20px;font-family:monospace;font-size:14px;line-height:1.8;box-shadow:0 2px 12px rgba(0,0,0,.5)';
      b.innerHTML = '<strong>⚠️ QC Inspector — Not Configured</strong><br>' +
        'Open <code>frontend/config.js</code> and fill in:<br>' +
        problems.map(function(p){ return '&nbsp;&nbsp;• ' + p; }).join('<br>');
      document.body.prepend(b);
    });
  }

  if (isLocal) {
    console.log('[QC Inspector] Running LOCALLY → API: http://localhost:3001/api');
  } else {
    console.log('[QC Inspector] Running in PRODUCTION → API:', RAILWAY_URL);
  }

}());
