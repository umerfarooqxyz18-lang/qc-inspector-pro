// routes/issues.js — NCR / Issue tracker full CRUD
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/issues — list issues with filters
router.get('/', async (req, res) => {
  try {
    const { status, severity, project_id, assigned_to_id } = req.query;

    let query = supabase
      .from('issues')
      .select('*')
      .order('created_at', { ascending: false });

    if (status)         query = query.eq('status', status);
    if (severity)       query = query.eq('severity', severity);
    if (project_id)     query = query.eq('project_id', project_id);
    if (assigned_to_id) query = query.eq('assigned_to_id', assigned_to_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/issues/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('issues').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/issues — manually create NCR
router.post('/', async (req, res) => {
  try {
    const {
      inspection_id, project_id, title, description, severity,
      assigned_to_id, assigned_to_name, zone, due_date, corrective_action
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Issue title is required' });

    const { data: ncrNo } = await supabase.rpc('generate_ncr_no');

    const { data, error } = await supabase
      .from('issues')
      .insert({
        ncr_no: ncrNo, inspection_id, project_id, title, description,
        severity: severity || 'major', assigned_to_id, assigned_to_name,
        zone, due_date, corrective_action, status: 'open', created_by: req.userId
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/issues/:id — update status, assignment, corrective action
router.put('/:id', async (req, res) => {
  try {
    const { status, assigned_to_id, assigned_to_name, corrective_action, due_date, title, description, severity } = req.body;
    const update = {};

    if (title)             update.title = title;
    if (description)       update.description = description;
    if (severity)          update.severity = severity;
    if (status)            update.status = status;
    if (assigned_to_id)    update.assigned_to_id = assigned_to_id;
    if (assigned_to_name)  update.assigned_to_name = assigned_to_name;
    if (corrective_action) update.corrective_action = corrective_action;
    if (due_date)          update.due_date = due_date;
    if (status === 'closed') update.closed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('issues').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/issues/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('issues').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Issue deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
