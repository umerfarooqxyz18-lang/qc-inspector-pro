// routes/reports.js — AI report generation + PDF export (production-hardened)
'use strict';

const express    = require('express');
const router     = express.Router();
const Anthropic  = require('@anthropic-ai/sdk');
const PDFDocument = require('pdfkit');
const supabase   = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

// Initialize Anthropic client once
const anthropic = new Anthropic({
  apiKey:  process.env.ANTHROPIC_API_KEY,
  timeout: 30000, // 30 s hard timeout
});

router.use(requireAuth);

// ── POST /api/reports/generate ──────────────────────────────
router.post('/generate', async (req, res) => {
  const {
    inspection_id, inspection_no, project_name, inspection_type,
    zone, inspection_date, inspector_name, contractor,
    temperature, humidity, findings, reference_standard,
    inspection_method, severity, assigned_to_name,
  } = req.body;

  if (!findings || findings.trim().length < 5)
    return res.status(400).json({ error: '`findings` field is required.' });

  const prompt = buildPrompt({
    inspection_no, project_name, inspection_type, zone, inspection_date,
    inspector_name, contractor, temperature, humidity, findings,
    reference_standard, inspection_method, severity, assigned_to_name,
  });

  let reportContent;
  let tokensUsed = 0;

  try {
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1500,
      messages:   [{ role: 'user', content: prompt }],
    });
    reportContent = message.content[0].text;
    tokensUsed    = message.usage?.output_tokens || 0;
    console.log(`[AI] report generated — ${tokensUsed} output tokens`);
  } catch (aiErr) {
    console.error('[AI] Claude API error:', aiErr.message);
    // Graceful fallback: return a structured template
    reportContent = buildFallbackReport({ inspection_no, project_name, findings, severity, assigned_to_name });
  }

  // Persist to DB if we have an inspection_id
  if (inspection_id) {
    try {
      await supabase.from('reports').insert({
        inspection_id,
        report_content: reportContent,
        generated_by:   req.userId,
        model_used:     'claude-sonnet-4-5',
      });
      await supabase.from('inspections')
        .update({ ai_report: reportContent })
        .eq('id', inspection_id);
    } catch (dbErr) {
      console.error('[AI] DB save error:', dbErr.message);
      // Non-fatal — still return the report
    }
  }

  res.json({ report: reportContent, tokens_used: tokensUsed });
});

// ── POST /api/reports/suggest-severity ─────────────────────
router.post('/suggest-severity', async (req, res) => {
  const { findings, inspection_type } = req.body;
  if (!findings) return res.status(400).json({ error: 'findings required' });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are a QA/QC expert. Classify the severity of this ${inspection_type || 'construction'} finding.

Finding: "${findings}"

Respond ONLY with valid JSON (no markdown, no backticks):
{"severity":"critical|major|minor|observation","reason":"one sentence","keywords":["kw1","kw2"]}`,
      }],
    });
    const raw   = message.content[0].text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI returned unexpected format');
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('[AI] severity suggest:', err.message);
    // Rule-based fallback
    const low = findings.toLowerCase();
    const sev = /crack|rupture|collapse|unsafe/.test(low) ? 'critical'
              : /porosity|delamination|inadequate|defect/.test(low) ? 'major'
              : /minor|small|slight/.test(low) ? 'minor' : 'observation';
    res.json({ severity: sev, reason: 'Classified by keyword rules (AI unavailable).', keywords: [] });
  }
});

// ── POST /api/reports/suggest-actions ──────────────────────
router.post('/suggest-actions', async (req, res) => {
  const { findings, severity, inspection_type, reference_standard } = req.body;
  if (!findings) return res.status(400).json({ error: 'findings required' });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 600,
      messages: [{
        role: 'user',
        content: `As a QA/QC engineer, list 4-5 corrective actions for this ${severity || 'major'} finding in a ${inspection_type} inspection per ${reference_standard || 'ASME B31.3'}.

Finding: "${findings}"

Respond ONLY with a JSON array of strings (no markdown):
["Action 1","Action 2","Action 3","Action 4"]`,
      }],
    });
    const raw   = message.content[0].text.trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('AI format error');
    res.json({ actions: JSON.parse(match[0]) });
  } catch (err) {
    console.error('[AI] suggest-actions:', err.message);
    res.json({
      actions: [
        'Quarantine the affected area immediately.',
        'Conduct detailed NDE/UT examination of affected components.',
        'Repair or replace non-conforming items per approved WPS/procedure.',
        'Review and update applicable QC procedures.',
        'Verify corrective action effectiveness before re-inspection.',
      ],
    });
  }
});

// ── GET /api/reports/pdf/:inspection_id ────────────────────
router.get('/pdf/:inspection_id', async (req, res) => {
  try {
    const { data: insp, error } = await supabase
      .from('inspections').select('*').eq('id', req.params.inspection_id).single();
    if (error || !insp) return res.status(404).json({ error: 'Inspection not found' });

    const filename = `${insp.inspection_no || 'Report'}_QC_Report.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    // Build PDF in memory — streams directly to response (no temp files)
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    doc.pipe(res);

    buildPDF(doc, insp);

    doc.end();
  } catch (err) {
    console.error('[PDF]', err);
    if (!res.headersSent)
      res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

// ── GET /api/reports — list for an inspection ───────────────
router.get('/', async (req, res) => {
  try {
    const { inspection_id } = req.query;
    let q = supabase.from('reports').select('*').order('created_at', { ascending: false });
    if (inspection_id) q = q.eq('inspection_id', inspection_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════
function buildPrompt(d) {
  return `You are a Senior QA/QC Engineer with 20+ years experience in oil & gas and construction projects following SAES, ASME, AWS, and API standards.

Generate a formal Non-Conformance Report (NCR) from this data:

PROJECT: ${d.project_name || 'N/A'}
INSPECTION NO: ${d.inspection_no || 'DRAFT'}
TYPE: ${d.inspection_type || 'General'}
ZONE: ${d.zone || 'Site'}
DATE: ${d.inspection_date || new Date().toISOString().split('T')[0]}
INSPECTOR: ${d.inspector_name || 'N/A'}
CONTRACTOR: ${d.contractor || 'N/A'}
CONDITIONS: Temp ${d.temperature || 'N/A'}°C  Humidity ${d.humidity || 'N/A'}%
STANDARD: ${d.reference_standard || 'ASME B31.3'}
METHOD: ${d.inspection_method || 'Visual Testing (VT)'}
SEVERITY: ${(d.severity || 'major').toUpperCase()}
ASSIGNED TO: ${d.assigned_to_name || 'TBD'}

RAW FINDINGS:
${d.findings}

Produce the report EXACTLY in this format (keep headers as shown):

NON-CONFORMANCE INSPECTION REPORT
═══════════════════════════════════════════════════════
Report No.: [inspection_no]       Date: [inspection_date]
Project: [project_name]
Inspector: [inspector_name]
Standard Reference: [reference_standard]
═══════════════════════════════════════════════════════

SEVERITY CLASSIFICATION: [CRITICAL / MAJOR / MINOR / OBSERVATION]

─── 1. SCOPE & LOCATION ────────────────────────────────
[One paragraph — inspection scope and area]

─── 2. OBSERVATIONS ────────────────────────────────────
[2-4 numbered technical observations with measurements/joint refs]

─── 3. NON-CONFORMANCE DESCRIPTION ─────────────────────
[How finding deviates from standard. Cite clause numbers. Explain risk.]

─── 4. CORRECTIVE ACTION REQUIRED ──────────────────────
[4-6 numbered actions: containment → repair → prevention]

─── 5. VERIFICATION REQUIREMENTS ───────────────────────
[Re-inspection, tests, or documents needed to close NCR]

─── 6. RESPONSIBLE PARTY & TIMELINE ────────────────────
Responsible: ${d.assigned_to_name || 'TBD'}
[Suggested timeline based on severity]
NCR Status: OPEN

Use formal passive/technical voice. No conversational language.`;
}

function buildFallbackReport(d) {
  const date = new Date().toLocaleDateString('en-GB');
  return `NON-CONFORMANCE INSPECTION REPORT
═══════════════════════════════════════════════════════
Report No.: ${d.inspection_no || 'DRAFT'}       Date: ${date}
Project: ${d.project_name || 'N/A'}
Standard Reference: ASME B31.3
═══════════════════════════════════════════════════════

SEVERITY CLASSIFICATION: ${(d.severity || 'MAJOR').toUpperCase()}

─── 1. SCOPE & LOCATION ────────────────────────────────
Inspection conducted on-site per applicable engineering standards.

─── 2. OBSERVATIONS ────────────────────────────────────
1. ${d.findings}

─── 3. NON-CONFORMANCE DESCRIPTION ─────────────────────
The finding described above constitutes a departure from the applicable standard acceptance criteria and requires formal corrective action.

─── 4. CORRECTIVE ACTION REQUIRED ──────────────────────
1. Quarantine and mark affected area immediately.
2. Conduct detailed NDE/dimensional examination.
3. Repair or replace non-conforming items per approved procedure.
4. Re-inspect after corrective action.
5. Document all corrective actions taken.

─── 5. VERIFICATION REQUIREMENTS ───────────────────────
Re-inspection and sign-off by Lead QC Inspector required before resuming work.

─── 6. RESPONSIBLE PARTY & TIMELINE ────────────────────
Responsible: ${d.assigned_to_name || 'TBD'}
Target Close: Within 5 working days of issue date.
NCR Status: OPEN

Note: This report was generated using the fallback template (AI temporarily unavailable).`;
}

function buildPDF(doc, insp) {
  const BLUE  = '#1a3a8f';
  const GRAY  = '#555555';
  const BLACK = '#1a1a1a';
  const LIGHT = '#f7f9fc';
  const SEV_COLOR = { critical:'#c0392b', major:'#d68910', minor:'#1e8449', observation:'#555555' };
  const sevColor  = SEV_COLOR[insp.severity] || GRAY;

  // Header band
  doc.rect(0, 0, doc.page.width, 76).fill(BLUE);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18)
     .text('AI QC INSPECTOR PRO', 50, 18);
  doc.font('Helvetica').fontSize(10)
     .text('Non-Conformance & Inspection Report', 50, 42);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 0, 42,
           { align:'right', width: doc.page.width - 50 });

  // Severity banner
  doc.rect(0, 76, doc.page.width, 26).fill(sevColor);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
     .text(`SEVERITY: ${(insp.severity||'MAJOR').toUpperCase()}  —  STATUS: ${(insp.status||'OPEN').toUpperCase()}`,
           50, 84, { align:'center', width: doc.page.width - 100 });

  // Details table
  doc.rect(40, 114, doc.page.width - 80, 168).fill(LIGHT).stroke('#ddd');
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text('INSPECTION DETAILS', 50, 124);

  const rows = [
    ['Inspection No.',       insp.inspection_no     || '—'],
    ['Project',              insp.project_name      || '—'],
    ['Inspection Type',      insp.inspection_type   || '—'],
    ['Zone / Location',      insp.zone              || '—'],
    ['Date',                 insp.inspection_date   || '—'],
    ['Inspector',            insp.inspector_name    || '—'],
    ['Contractor',           insp.contractor        || '—'],
    ['Reference Standard',   insp.reference_standard|| '—'],
    ['Inspection Method',    insp.inspection_method || '—'],
    ['Assigned To',          insp.assigned_to_name  || '—'],
  ];
  let y = 140;
  rows.forEach(([label, val], i) => {
    const col = i % 2 === 0 ? 50 : 310;
    if (i > 0 && i % 2 === 0) y += 20;
    doc.font('Helvetica-Bold').fillColor(GRAY).fontSize(8).text(label.toUpperCase(), col, y);
    doc.font('Helvetica').fillColor(BLACK).fontSize(9).text(String(val), col, y + 10);
  });

  // Findings
  y = 296;
  doc.rect(40, y, doc.page.width - 80, 14).fill(BLUE);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
     .text('OBSERVATIONS / FINDINGS', 50, y + 2);
  y += 20;
  doc.fillColor(BLACK).font('Helvetica').fontSize(10)
     .text(insp.findings || 'No findings recorded.', 50, y,
           { width: doc.page.width - 100, lineGap: 4 });

  // AI Report section
  if (insp.ai_report) {
    y = doc.y + 20;
    if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
    doc.rect(40, y, doc.page.width - 80, 14).fill(BLUE);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
       .text('AI-GENERATED NCR REPORT', 50, y + 2);
    y += 20;
    doc.fillColor(GRAY).font('Helvetica').fontSize(9)
       .text(insp.ai_report, 50, y,
             { width: doc.page.width - 100, lineGap: 3 });
  }

  // Footer
  const footY = doc.page.height - 38;
  doc.rect(0, footY, doc.page.width, 38).fill('#f0f0f0');
  doc.fillColor(GRAY).fontSize(7).font('Helvetica')
     .text(
       `QC Inspector Pro  ·  Report ${insp.inspection_no}  ·  Confidential — Authorized use only  ·  ${new Date().toISOString()}`,
       50, footY + 14,
       { align:'center', width: doc.page.width - 100 }
     );
}

module.exports = router;
