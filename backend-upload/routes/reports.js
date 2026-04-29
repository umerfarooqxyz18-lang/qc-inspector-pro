// routes/reports.js — AI report generation + PDF export
// Features: Claude API with 1 retry, graceful fallback, page-numbered PDF
'use strict';

const express     = require('express');
const router      = express.Router();
const Anthropic   = require('@anthropic-ai/sdk');
const PDFDocument = require('pdfkit');
const supabase    = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 55000 });
const IS_PROD   = process.env.NODE_ENV === 'production';

router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────
function buildPrompt(d) {
  return `You are a Senior QA/QC Engineer (20+ years, oil & gas, SAES/ASME/AWS/API).
Generate a formal Non-Conformance Report from this data:

PROJECT: ${d.project_name || 'N/A'}
REPORT NO: ${d.inspection_no || 'DRAFT'}
TYPE: ${d.inspection_type || 'General'}
ZONE: ${d.zone || 'Site'}
DATE: ${d.inspection_date || new Date().toISOString().split('T')[0]}
INSPECTOR: ${d.inspector_name || 'N/A'}
CONTRACTOR: ${d.contractor || 'N/A'}
CONDITIONS: Temp ${d.temperature || 'N/A'}°C | Humidity ${d.humidity || 'N/A'}%
STANDARD: ${d.reference_standard || 'ASME B31.3'}
METHOD: ${d.inspection_method || 'Visual Testing (VT)'}
SEVERITY: ${(d.severity || 'major').toUpperCase()}
ASSIGNED TO: ${d.assigned_to_name || 'TBD'}

RAW FINDINGS:
${d.findings}

Write the report EXACTLY in this format (keep headers verbatim):

NON-CONFORMANCE INSPECTION REPORT
═══════════════════════════════════════════════════════
Report No.: [inspection_no]       Date: [date]
Project: [project]
Inspector: [inspector]
Standard: [standard]
═══════════════════════════════════════════════════════

SEVERITY: [CRITICAL / MAJOR / MINOR / OBSERVATION]

─── 1. SCOPE & LOCATION ───
[One paragraph: inspection scope, area, elements inspected]

─── 2. OBSERVATIONS ───
[2-4 numbered points: precise technical observations, measurements, joint references]

─── 3. NON-CONFORMANCE DESCRIPTION ───
[How finding deviates from standard. Cite clause numbers. Explain risk.]

─── 4. CORRECTIVE ACTION REQUIRED ───
[4-6 numbered actions: containment → repair → prevention, specific and actionable]

─── 5. VERIFICATION REQUIREMENTS ───
[Re-inspection, tests, or documentation needed to close this NCR]

─── 6. RESPONSIBLE PARTY & TIMELINE ───
Responsible: ${d.assigned_to_name || 'TBD'}
[Timeline appropriate to severity]
NCR Status: OPEN

Use formal engineering passive voice. No conversational language.`;
}

function fallbackReport(d) {
  const date  = new Date().toLocaleDateString('en-GB');
  const sev   = (d.severity || 'major').toUpperCase();
  return `NON-CONFORMANCE INSPECTION REPORT
═══════════════════════════════════════════════════════
Report No.: ${d.inspection_no || 'DRAFT'}       Date: ${date}
Project: ${d.project_name || 'N/A'}
Inspector: ${d.inspector_name || 'N/A'}
Standard: ${d.reference_standard || 'ASME B31.3'}
═══════════════════════════════════════════════════════

SEVERITY: ${sev}

─── 1. SCOPE & LOCATION ───
Inspection was conducted at ${d.zone || 'the designated site area'} as part of ${d.project_name || 'the project'} quality control activities.

─── 2. OBSERVATIONS ───
1. ${d.findings || 'Finding recorded during site inspection.'}
2. Non-conformance identified during ${d.inspection_method || 'visual inspection'}.

─── 3. NON-CONFORMANCE DESCRIPTION ───
The finding described constitutes a departure from ${d.reference_standard || 'ASME B31.3'} acceptance criteria and requires formal corrective action before work can proceed.

─── 4. CORRECTIVE ACTION REQUIRED ───
1. Immediately quarantine and mark the affected area with NCR tag.
2. Conduct detailed NDE / dimensional examination of affected components.
3. Prepare corrective action plan and submit to QC Engineer for approval.
4. Repair or replace non-conforming items per approved WPS / procedure.
5. Re-inspect and document results before resuming work.

─── 5. VERIFICATION REQUIREMENTS ───
Written re-inspection report and sign-off by Lead QC Inspector required. All corrective action documentation to be filed with the NCR.

─── 6. RESPONSIBLE PARTY & TIMELINE ───
Responsible: ${d.assigned_to_name || 'TBD'}
Target Close: ${sev === 'CRITICAL' ? '24 hours' : sev === 'MAJOR' ? '3 working days' : '5 working days'} from issue date.
NCR Status: OPEN

Note: Generated using fallback template (AI service temporarily unavailable).`;
}

// Keyword-based severity fallback
function keywordSeverity(text) {
  const t = (text || '').toLowerCase();
  if (/crack|fracture|rupture|collapse|unsafe|immedi/.test(t)) return 'critical';
  if (/porosity|delamination|inadequate|non.compliant|defect|weld defect|misalign|out of tol/.test(t)) return 'major';
  if (/minor|small|slight|surface|cosmetic/.test(t)) return 'minor';
  return 'observation';
}

// Claude call with 1 retry
async function callClaude(messages, maxTokens) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-5', max_tokens: maxTokens || 1500, messages,
      });
      return msg;
    } catch (err) {
      if (attempt === 2 || err.status === 400) throw err; // don't retry bad requests
      console.warn(`[AI] Attempt ${attempt} failed (${err.message}) — retrying in 3s`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// ── POST /api/reports/generate ──────────────────────────────
router.post('/generate', async (req, res) => {
  const d = req.body;
  if (!d.findings || d.findings.trim().length < 5)
    return res.status(400).json({ error: '`findings` field is required and must be descriptive.' });

  let reportContent;
  let tokensUsed = 0;

  try {
    const msg = await callClaude([{ role: 'user', content: buildPrompt(d) }], 1500);
    reportContent = msg.content[0].text;
    tokensUsed    = msg.usage?.output_tokens || 0;
    if (IS_PROD) console.log(`[AI] report generated — ${tokensUsed} tokens`);
    else console.log(`[AI] report generated — ${tokensUsed} tokens, inspection: ${d.inspection_no}`);
  } catch (aiErr) {
    console.error('[AI] Claude error:', aiErr.message);
    reportContent = fallbackReport(d); // always return something useful
  }

  // Persist to DB (non-fatal if it fails)
  if (d.inspection_id) {
    try {
      await supabase.from('reports').insert({
        inspection_id: d.inspection_id, report_content: reportContent,
        generated_by: req.userId, model_used: 'claude-sonnet-4-5',
      });
      await supabase.from('inspections')
        .update({ ai_report: reportContent }).eq('id', d.inspection_id);
    } catch (dbErr) {
      console.error('[AI] DB save error (non-fatal):', dbErr.message);
    }
  }

  res.json({ report: reportContent, tokens_used: tokensUsed });
});

// ── POST /api/reports/suggest-severity ─────────────────────
router.post('/suggest-severity', async (req, res) => {
  const { findings, inspection_type } = req.body;
  if (!findings) return res.status(400).json({ error: 'findings required' });

  try {
    const msg = await callClaude([{
      role: 'user',
      content: `Classify severity of this ${inspection_type || 'construction'} finding.
Finding: "${findings}"
Respond ONLY with valid JSON (no markdown):
{"severity":"critical|major|minor|observation","reason":"one sentence","keywords":["kw1","kw2"]}`,
    }], 200);
    const match = msg.content[0].text.trim().match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON in response');
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('[AI] suggest-severity fallback:', err.message);
    const sev = keywordSeverity(findings);
    res.json({ severity: sev, reason: 'Classified by keyword analysis (AI unavailable).', keywords: [] });
  }
});

// ── POST /api/reports/suggest-actions ──────────────────────
router.post('/suggest-actions', async (req, res) => {
  const { findings, severity, inspection_type, reference_standard } = req.body;
  if (!findings) return res.status(400).json({ error: 'findings required' });

  try {
    const msg = await callClaude([{
      role: 'user',
      content: `List 5 corrective actions for this ${severity || 'major'} ${inspection_type} finding per ${reference_standard || 'ASME B31.3'}.
Finding: "${findings}"
Respond ONLY with a JSON array of strings (no markdown):
["Action 1","Action 2","Action 3","Action 4","Action 5"]`,
    }], 500);
    const match = msg.content[0].text.trim().match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no JSON array');
    res.json({ actions: JSON.parse(match[0]) });
  } catch (err) {
    console.error('[AI] suggest-actions fallback:', err.message);
    res.json({ actions: [
      'Quarantine the affected area and mark with NCR tag.',
      'Conduct detailed NDE/dimensional examination.',
      'Prepare and submit corrective action plan for QC Engineer approval.',
      'Repair/replace non-conforming items per approved WPS/procedure.',
      'Re-inspect and document before resuming work.',
    ]});
  }
});

// ── GET /api/reports/pdf/:id ────────────────────────────────
router.get('/pdf/:inspection_id', async (req, res) => {
  try {
    const { data: insp, error } = await supabase
      .from('inspections').select('*').eq('id', req.params.inspection_id).single();
    if (error || !insp) return res.status(404).json({ error: 'Inspection not found' });

    const filename = `${insp.inspection_no || 'Report'}_QC_Report.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    // Build in memory — no temp files, works serverless
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true, autoFirstPage: true });
    doc.pipe(res);
    buildPDF(doc, insp);
    doc.end();
  } catch (err) {
    console.error('[PDF]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed.' });
  }
});

// ── GET /api/reports — list ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let q = supabase.from('reports').select('*').order('created_at', { ascending: false });
    if (req.query.inspection_id) q = q.eq('inspection_id', req.query.inspection_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PDF BUILDER — professional multi-page with page numbers
// ════════════════════════════════════════════════════════════
function buildPDF(doc, insp) {
  const W     = doc.page.width;
  const BLUE  = '#1a3a8f';
  const DBLUE = '#0f265c';
  const GRAY  = '#4a4a4a';
  const LGRAY = '#888888';
  const BLACK = '#1a1a1a';
  const LIGHT = '#f5f7fa';
  const SEV_COLORS = { critical:'#c0392b', major:'#d68910', minor:'#1e8449', observation:'#555555' };
  const sevColor   = SEV_COLORS[insp.severity] || '#555555';
  const companyName = process.env.COMPANY_NAME || 'AI QC Inspector Pro';
  const genDate    = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });

  // ── PAGE 1: Cover ─────────────────────────────────────────
  // Top blue header band
  doc.rect(0, 0, W, 90).fill(DBLUE);

  // Company name + logo placeholder
  doc.rect(50, 18, 36, 36).fill(BLUE).stroke('#ffffff');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
     .text('QC', 68, 30, { align: 'center', width: 1 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
     .text(companyName, 96, 22, { width: W - 146 });
  doc.fillColor('rgba(255,255,255,0.7)').font('Helvetica').fontSize(9)
     .text('Non-Conformance & Quality Control Inspection Report', 96, 44);
  doc.fillColor('#ffffff').font('Helvetica').fontSize(9)
     .text('Generated: ' + genDate, 0, 70, { align: 'right', width: W - 50 });

  // Severity ribbon
  doc.rect(0, 90, W, 28).fill(sevColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
     .text(
       `SEVERITY: ${(insp.severity || 'MAJOR').toUpperCase()}  ·  STATUS: ${(insp.status || 'OPEN').toUpperCase()}`,
       50, 99, { align: 'center', width: W - 100 }
     );

  // Details table
  const tableY = 132;
  const tableH = 196;
  doc.rect(40, tableY, W - 80, tableH).fill(LIGHT).stroke('#dde0ea');

  // Table header
  doc.rect(40, tableY, W - 80, 20).fill(BLUE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
     .text('INSPECTION DETAILS', 54, tableY + 6);

  const rows = [
    ['Inspection No.',    insp.inspection_no      || '—'],
    ['Project',           insp.project_name       || '—'],
    ['Type',              insp.inspection_type    || '—'],
    ['Zone / Location',   insp.zone               || '—'],
    ['Inspection Date',   insp.inspection_date    || '—'],
    ['Inspector',         insp.inspector_name     || '—'],
    ['Contractor',        insp.contractor         || '—'],
    ['Reference Standard',insp.reference_standard || '—'],
    ['Inspection Method', insp.inspection_method  || '—'],
    ['Assigned To',       insp.assigned_to_name   || '—'],
  ];

  let y = tableY + 26;
  rows.forEach(function([label, val], i) {
    const col = i % 2 === 0 ? 54  : W / 2 + 4;
    if (i > 0 && i % 2 === 0) y += 22;
    doc.font('Helvetica-Bold').fillColor(LGRAY).fontSize(7.5)
       .text(label.toUpperCase(), col, y);
    doc.font('Helvetica').fillColor(BLACK).fontSize(9)
       .text(String(val).slice(0, 40), col, y + 10);
    // Column divider
    if (i % 2 === 0 && i < rows.length - 1) {
      doc.moveTo(W / 2, y - 2).lineTo(W / 2, y + 20).stroke('#dde0ea');
    }
  });

  // ── Findings section ─────────────────────────────────────
  y = tableY + tableH + 18;
  sectionHeader(doc, 'OBSERVATIONS / FINDINGS', y, W, BLUE);
  y += 20;
  doc.fillColor(BLACK).font('Helvetica').fontSize(10)
     .text(insp.findings || 'No findings recorded.', 50, y,
           { width: W - 100, lineGap: 4, paragraphGap: 6 });

  // ── AI Report section (may span pages) ───────────────────
  if (insp.ai_report) {
    y = doc.y + 20;
    // Add new page if not enough room
    if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
    sectionHeader(doc, 'AI-GENERATED NCR REPORT', y, W, BLUE);
    y += 20;
    doc.fillColor(GRAY).font('Helvetica').fontSize(9)
       .text(insp.ai_report, 50, y, { width: W - 100, lineGap: 3 });
  }

  // ── Page numbers (applied to all pages) ──────────────────
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    // Footer bar
    doc.rect(0, doc.page.height - 34, W, 34).fill('#f0f2f5');
    doc.moveTo(40, doc.page.height - 34).lineTo(W - 40, doc.page.height - 34).stroke('#dde0ea');
    doc.fillColor(LGRAY).font('Helvetica').fontSize(7.5)
       .text(
         `${companyName}  ·  Report: ${insp.inspection_no || '—'}  ·  CONFIDENTIAL — Authorized use only`,
         50, doc.page.height - 22,
         { align: 'left', width: W - 180 }
       );
    doc.fillColor(LGRAY).font('Helvetica-Bold').fontSize(8)
       .text(`Page ${i + 1} of ${totalPages}`, 0, doc.page.height - 22,
             { align: 'right', width: W - 50 });
  }
}

function sectionHeader(doc, text, y, W, color) {
  doc.rect(40, y, W - 80, 18).fill(color);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
     .text(text, 54, y + 5);
}

module.exports = router;
