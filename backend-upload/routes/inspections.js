// routes/inspections.js — Full CRUD for inspections
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ── GET /api/inspections — list with optional filters ────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status, severity, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('inspections')
      .select(`
        id, inspection_no, project_name, inspection_type, zone,
        inspection_date, inspector_name, severity, status, 
        created_at, image_urls, assigned_to_name
      `)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (project_id) query = query.eq('project_id', project_id);
    if (status)     query = query.eq('status', status);
    if (severity)   query = query.eq('severity', severity);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/inspections/:id — single inspection ─────────────
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data)  return res.status(404).json({ error: 'Inspection not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/inspections — create new inspection ────────────
router.post('/', async (req, res) => {
  try {
    const {
      project_id, project_name, inspection_type, zone, inspection_date,
      inspector_name, contractor, temperature, humidity, weather,
      findings, reference_standard, inspection_method, severity,
      ncr_required, assigned_to_id, assigned_to_name, image_urls, due_date
    } = req.body;

    // Validate required fields
    if (!project_name || !inspection_type || !findings || !inspector_name) {
      return res.status(400).json({ error: 'Missing required fields: project_name, inspection_type, findings, inspector_name' });
    }

    // Auto-generate inspection number
    const { data: seqData, error: seqErr } = await supabase.rpc('generate_inspection_no');
    if (seqErr) throw seqErr;

    const { data, error } = await supabase
      .from('inspections')
      .insert({
        inspection_no: seqData,
        project_id, project_name, inspection_type, zone,
        inspection_date: inspection_date || new Date().toISOString().split('T')[0],
        inspector_id: req.userId,
        inspector_name,
        contractor, temperature, humidity, weather,
        findings, reference_standard, inspection_method,
        severity: severity || 'minor',
        ncr_required, assigned_to_id, assigned_to_name,
        image_urls: image_urls || [],
        due_date,
        status: 'open',
        created_by: req.userId,
        user_id: req.userId,
      })
      .select()
      .single();

    if (error) throw error;

    // Auto-create NCR if required
    if (ncr_required === 'Yes — Raise NCR') {
      const { data: ncrNo } = await supabase.rpc('generate_ncr_no');
      await supabase.from('issues').insert({
        ncr_no: ncrNo,
        inspection_id: data.id,
        project_id,
        title: `${inspection_type} — ${zone || 'Site'} (from INS ${seqData})`,
        description: findings,
        severity: severity || 'minor',
        assigned_to_id,
        assigned_to_name,
        zone,
        due_date,
        status: 'open',
        created_by: req.userId,
      });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('[INSPECTION CREATE]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/inspections/:id — update inspection ─────────────
router.put('/:id', async (req, res) => {
  try {
    const allowed = [
      'project_name','inspection_type','zone','inspection_date','contractor',
      'temperature','humidity','weather','findings','reference_standard',
      'inspection_method','severity','ncr_required','assigned_to_id',
      'assigned_to_name','image_urls','ai_report','status','due_date'
    ];

    // Only pick allowed fields from body
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    if (update.status === 'closed') update.closed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('inspections')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/inspections/:id ──────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('inspections')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Inspection deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
