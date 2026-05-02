// routes/auth.js — Profile management (signup/login handled by Supabase client-side)
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/auth/profile — get current user's profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.userId)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/profile — update profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { full_name, company, position, phone } = req.body;

    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name, company, position, phone, updated_at: new Date() })
      .eq('id', req.userId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
async function handleLogin() {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-pass").value;

  console.log("Login clicked", email); // DEBUG

  if (!email || !password) {
    document.getElementById("login-error").innerText = "Enter email and password";
    return;
  }

  try {
    // Example (if using Supabase)
    const { data, error } = await authClient.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      document.getElementById("login-error").innerText = error.message;
      return;
    }

    // SUCCESS
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app").classList.remove("hidden");

  } catch (err) {
    console.error(err);
    document.getElementById("login-error").innerText = "Login failed";
  }
}

// GET /api/auth/team — get all team members (for assignment dropdowns)
router.get('/team', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, position')
      .order('full_name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
