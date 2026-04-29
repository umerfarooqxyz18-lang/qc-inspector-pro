// routes/projects.js — Project CRUD
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

// All routes require authentication
router.use(requireAuth);

// GET /api/projects — list all projects
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects — create project
router.post('/', async (req, res) => {
  try {
    const { name, client, location, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });

    const { data, error } = await supabase
      .from('projects')
      .insert({ name, client, location, description, created_by: req.userId })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:id — update project
router.put('/:id', async (req, res) => {
  try {
    const { name, client, location, description, status } = req.body;
    const { data, error } = await supabase
      .from('projects')
      .update({ name, client, location, description, status })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
