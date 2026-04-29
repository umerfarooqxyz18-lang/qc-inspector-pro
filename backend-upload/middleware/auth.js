// middleware/auth.js — Verify Supabase JWT on every protected route
'use strict';

const { createClient } = require('@supabase/supabase-js');

// Public client — only verifies tokens, never bypasses RLS
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header. Please sign in.' });
    }

    const token = header.split(' ')[1];
    const { data: { user }, error } = await supabasePublic.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    }

    req.user   = user;
    req.userId = user.id;
    next();
  } catch (err) {
    console.error('[AUTH]', err.message);
    res.status(500).json({ error: 'Authentication check failed.' });
  }
}

// Role guard — usage: router.use(requireRole('admin'))
function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const { createClient: mkClient } = require('@supabase/supabase-js');
      const sb = mkClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await sb.from('profiles').select('role').eq('id', req.userId).single();
      if (!data || !roles.includes(data.role)) {
        return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
      }
      req.userRole = data.role;
      next();
    } catch (err) {
      res.status(500).json({ error: 'Role check failed.' });
    }
  };
}

module.exports = { requireAuth, requireRole };
