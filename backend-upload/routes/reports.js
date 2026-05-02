// routes/reports.js — AI report generation + Professional PDF export
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

// ── Saudi Aramco & Industry Constants ───────────────────────
const ARAMCO_STANDARDS = [
  'SAES-W-011 — Welding Requirements for Pressure Vessels',
  'SAES-W-012 — Requirements for Welding Pressure Piping',
  'SAES-W-014 — Weld Overlays and Cladding',
  'SAES-L-350 — Construction of Plant Piping',
  'SAES-L-450 — Construction of Transmission Lines',
  'SAES-Q-001 — Criteria for Design and Construction of Concrete Structures',
  'SAES-Q-006 — Foundations',
  'SAES-M-001 — Structural Design Criteria',
  'SAES-A-004 — General Requirements for Pressure Testing',
  'SAES-B-068 — Fire Protection',
  'SAES-P-100 — Basic Design Criteria Electrical',
  'SAES-J-002 — Instruments for Pressure & Temperature',
  'SAES-H-001 — Selection Requirements for Industrial Protective Coatings',
  'SAES-H-002 — Coating Requirements for Pipelines',
  'SAES-H-101 — Approved Protective Coating Systems',
  'ASME B31.3 — Process Piping',
  'ASME B31.4 — Pipeline Transportation Systems',
  'ASME B31.8 — Gas Transmission Piping',
  'ASME Sec. IX — Welding Qualifications',
  'ASME Sec. VIII Div.1 — Pressure Vessels',
  'AWS D1.1 — Structural Welding Steel',
  'AWS D1.6 — Structural Welding Stainless Steel',
  'API 650 — Welded Steel Tanks for Oil Storage',
  'API 653 — Tank Inspection, Repair, Alteration',
  'API 570 — Piping Inspection Code',
  'API 510 — Pressure Vessel Inspection Code',
  'API 1104 — Welding Pipelines',
  'ISO 3834 — Quality Requirements for Fusion Welding',
  'ISO 9001 — Quality Management Systems',
  'NACE SP0169 — Control of External Corrosion',
  'NACE SP0188 — Discontinuity Testing Coatings',
  'ACI 318 — Building Code for Structural Concrete',
  'AISC 360 — Specification for Structural Steel Buildings',
  'BS EN ISO 15614 — Welding Procedure Specification',
];

const SAUDI_COMPANIES = [
  'Saudi Aramco',
  'Saudi Aramco — JIGPC',
  'Saudi Aramco — GOSP',
  'Saudi Aramco — Gas Plants',
  'Saudi Aramco — Offshore',
  'SABIC',
  'SABIC — Engineering Polymers',
  'Saudi Electricity Company (SEC)',
  'Saudi Basic Industries Corp',
  'Maaden — Saudi Arabian Mining',
  'SWCC — Saline Water Conversion',
  'SCECO — Saudi Consolidated Electric',
  'Aramco Trading Company',
  'Saudi Kayan Petrochemical',
  'Yanbu National Petrochemical (YANSAB)',
  'Petro Rabigh',
  'Advanced Petrochemical Company',
  'National Petrochemical Company (NATPET)',
  'Saudi Polymers Company',
  'TOTAL — Saudi Arabia',
  'Shell — Saudi Arabia',
  'ExxonMobil — Saudi Arabia',
  'Bechtel',
  'Fluor Arabia Ltd',
  'Technip Arabia',
  'Wood Group',
  'Worley Arabia',
  'JGC Arabia',
  'Maire Tecnimont',
  'Tecnicas Reunidas',
  'Foster Wheeler',
  'WorleyParsons',
  'CB&I',
  'KBR',
  'AECOM Middle East',
  'McDermott Arabia',
  'Petrofac',
  'Saipem Saudi Arabia',
  'AFCONS Infrastructure',
  'Al-Rashid Steel Works',
  'Arabian Pipes Company',
  'Saudi Steel Pipes Company',
  'National Pipe Company',
  'AlHoty Contracting',
  'Consolidated Contractors (CCC)',
  'Saudi Oger',
  'Nesma & Partners',
  'TAQA Arabian Power',
  'Other',
];

const ZONES = [
  'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5',
  'Zone 6', 'Zone 7', 'Zone 8', 'Zone 9', 'Zone 10',
  'Block A', 'Block B', 'Block C', 'Block D', 'Block E',
  'Area 1', 'Area 2', 'Area 3', 'Area 4', 'Area 5',
  'Train 1', 'Train 2', 'Train 3',
  'Pipe Rack A', 'Pipe Rack B', 'Pipe Rack C',
  'Tank Farm 1', 'Tank Farm 2',
  'Compressor Area', 'Pump Area', 'Utility Area',
  'Substation', 'Control Room', 'Flare Area',
  'Offshore Platform A', 'Offshore Platform B',
  'Onshore Processing Facility',
  'Gas-Oil Separation Plant (GOSP)',
  'Natural Gas Liquids (NGL) Plant',
  'Crude Stabilization Unit',
  'Desalination Plant',
  'Water Injection Facility',
];

const INSPECTION_TYPES = [
  'Welding — Visual Testing (VT)',
  'Welding — Radiographic Testing (RT)',
  'Welding — Ultrasonic Testing (UT)',
  'Welding — Magnetic Particle Testing (MT)',
  'Welding — Dye Penetrant Testing (PT)',
  'Welding — Hardness Testing (HT)',
  'Welding — Positive Material Identification (PMI)',
  'Welding — Ferrite Testing',
  'Welding — Holiday Testing',
  'Structural Steel — Dimensional Check',
  'Structural Steel — Erection Inspection',
  'Structural Steel — Bolt Torque Verification',
  'Structural Steel — Weld Visual Inspection',
  'Concrete — Pre-Pour Inspection',
  'Concrete — Post-Pour Inspection',
  'Concrete — Rebar Inspection',
  'Concrete — Core Sample Testing',
  'Concrete — Cube Test',
  'Concrete — Cover Measurement',
  'Pipeline — Pre-Hydro Inspection',
  'Pipeline — Hydrostatic Testing',
  'Pipeline — Pneumatic Testing',
  'Pipeline — Pig Testing',
  'Pipeline — Cathodic Protection',
  'Pipeline — Holiday Detection',
  'Pressure Vessel — Shell Inspection',
  'Pressure Vessel — Nozzle Inspection',
  'Pressure Vessel — Pre-Hydro',
  'Pressure Vessel — Hydrostatic Test',
  'Pressure Vessel — Relief Valve Test',
  'Coating — DFT Measurement',
  'Coating — Holiday Testing',
  'Coating — Adhesion Test',
  'Coating — Surface Preparation (SSPC)',
  'Coating — Blast Profile Check',
  'Mechanical — Alignment Check',
  'Mechanical — Vibration Test',
  'Mechanical — Pump Performance',
  'Mechanical — Compressor Test',
  'Mechanical — Valve Testing',
  'Electrical — Cable Insulation Test',
  'Electrical — Earth Continuity Test',
  'Electrical — Loop Test',
  'Electrical — High Voltage Test',
  'Instrumentation — Calibration Check',
  'Instrumentation — Loop Check',
  'Instrumentation — Function Test',
  'Civil — Foundation Inspection',
  'Civil — Piling Inspection',
  'Civil — Formwork Inspection',
  'Civil — Excavation Inspection',
  'Civil — Backfill Compaction',
  'Civil — Grading Inspection',
  'Fire Protection — Hydrant Test',
  'Fire Protection — Sprinkler Test',
  'Fire Protection — Deluge Test',
  'HVAC — Duct Pressure Test',
  'HVAC — Air Balancing',
  'General — Pre-Commissioning',
  'General — Commissioning',
  'General — Pre-Startup Safety Review (PSSR)',
  'General — Walk-Through Inspection',
  'General — Punch List Clearance',
];

// ── GET /api/reports/constants — send all dropdown data ─────
router.get('/constants', (req, res) => {
  res.json({
    standards:        ARAMCO_STANDARDS,
    companies:        SAUDI_COMPANIES,
    zones:            ZONES,
    inspection_types: INSPECTION_TYPES,
  });
});

// ── Prompt builder ───────────────────────────────────────────
function buildPrompt(d) {
  return `You are a Senior QA/QC Engineer (20+ years experience) in oil & gas and construction projects in Saudi Arabia. You are familiar with Saudi Aramco standards (SAES), ASME, AWS, API, and ISO standards.

Generate a formal, professional Non-Conformance Report (NCR) from this inspection data:

PROJECT: ${d.project_name || 'N/A'}
REPORT NO: ${d.inspection_no || 'DRAFT'}
INSPECTION TYPE: ${d.inspection_type || 'General Inspection'}
ZONE / LOCATION: ${d.zone || 'Site'}
DATE: ${d.inspection_date || new Date().toISOString().split('T')[0]}
INSPECTOR: ${d.inspector_name || 'N/A'}
CONTRACTOR: ${d.contractor || 'N/A'}
ENVIRONMENTAL CONDITIONS: Temp ${d.temperature || 'N/A'}C | Humidity ${d.humidity || 'N/A'}%
REFERENCE STANDARD: ${d.reference_standard || 'ASME B31.3'}
INSPECTION METHOD: ${d.inspection_method || 'Visual Testing (VT)'}
SEVERITY: ${(d.severity || 'major').toUpperCase()}
ASSIGNED TO: ${d.assigned_to_name || 'TBD'}

RAW FINDINGS FROM INSPECTOR:
${d.findings}

Generate a complete professional NCR report using ONLY standard ASCII characters (no special Unicode box-drawing characters). Use dashes and equals signs for separators.

FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS:

NON-CONFORMANCE INSPECTION REPORT
=====================================================
Report No.: ${d.inspection_no || 'DRAFT'}        Date: ${d.inspection_date || new Date().toISOString().split('T')[0]}
Project: ${d.project_name || 'N/A'}
Inspector: ${d.inspector_name || 'N/A'}
Standard: ${d.reference_standard || 'ASME B31.3'}
=====================================================

SEVERITY: ${(d.severity || 'MAJOR').toUpperCase()}

1. SCOPE & LOCATION
-------------------
[One paragraph describing inspection scope, location, and elements inspected. Reference specific equipment tag numbers, joint numbers, or area descriptions from the findings.]

2. OBSERVATIONS
---------------
[3-5 numbered technical observations with specific measurements, dimensions, joint references, and quantitative data where possible]

3. NON-CONFORMANCE DESCRIPTION
-------------------------------
[Formal description of how the finding deviates from the reference standard. Cite specific clause numbers. Explain the technical risk and potential consequence if not corrected.]

4. CORRECTIVE ACTION REQUIRED
------------------------------
1. [Immediate containment action]
2. [Investigation / NDE action]
3. [Repair / rework action per approved procedure]
4. [Quality system preventive action]
5. [Verification before resumption of work]

5. VERIFICATION REQUIREMENTS
-----------------------------
[List specific tests, inspections, or documentation needed to close this NCR]

6. RESPONSIBLE PARTY & TIMELINE
---------------------------------
Responsible: ${d.assigned_to_name || 'TBD'}
Priority: ${(d.severity || 'major').toUpperCase()}
Target Closure: [appropriate timeline based on severity]
NCR Status: OPEN

IMPORTANT INSTRUCTIONS FOR UNIQUE CONTENT:
- The corrective actions MUST be specific to THIS type of finding: "${d.findings}"
- For "${d.inspection_type}" inspections, reference the exact repair/test procedures
- Do NOT use generic actions — tailor every section to the specific defect described
- Reference specific clause numbers from "${d.reference_standard || 'ASME B31.3'}"
- Corrective actions must follow the actual repair sequence for this defect type
- Verification requirements must match what is needed for THIS specific defect

Use formal engineering passive voice. Be specific and technical. No conversational language.`;
}

// ── Fallback report ──────────────────────────────────────────
function fallbackReport(d) {
  const date = new Date().toLocaleDateString('en-GB');
  const sev  = (d.severity || 'major').toUpperCase();
  return `NON-CONFORMANCE INSPECTION REPORT
=====================================================
Report No.: ${d.inspection_no || 'DRAFT'}        Date: ${date}
Project: ${d.project_name || 'N/A'}
Inspector: ${d.inspector_name || 'N/A'}
Standard: ${d.reference_standard || 'ASME B31.3'}
=====================================================

SEVERITY: ${sev}

1. SCOPE & LOCATION
-------------------
Inspection was conducted at ${d.zone || 'the designated site area'} as part of ${d.project_name || 'the project'} quality control activities in accordance with ${d.reference_standard || 'ASME B31.3'} requirements.

2. OBSERVATIONS
---------------
1. ${d.findings || 'Finding recorded during site inspection.'}
2. Non-conformance identified during ${d.inspection_method || 'visual inspection'}.
3. Affected area has been documented and requires corrective action.

3. NON-CONFORMANCE DESCRIPTION
-------------------------------
The finding described above constitutes a departure from ${d.reference_standard || 'ASME B31.3'} acceptance criteria. The non-conformance requires formal corrective action before work in the affected area can proceed. Failure to address this finding may result in quality defects affecting structural integrity and project safety.

4. CORRECTIVE ACTION REQUIRED
------------------------------
1. Immediately quarantine and mark the affected area with NCR identification tag.
2. Conduct detailed NDE / dimensional examination of all affected components.
3. Prepare and submit corrective action plan to QC Engineer for approval.
4. Repair or replace non-conforming items per approved WPS / procedure.
5. Re-inspect and document all corrective actions before resuming work.

5. VERIFICATION REQUIREMENTS
-----------------------------
Written re-inspection report and sign-off by Lead QC Inspector required prior to NCR closure. All corrective action documentation, test records, and photographic evidence to be filed with the NCR package.

6. RESPONSIBLE PARTY & TIMELINE
---------------------------------
Responsible: ${d.assigned_to_name || 'TBD'}
Priority: ${sev}
Target Closure: ${sev === 'CRITICAL' ? '24 hours' : sev === 'MAJOR' ? '3 working days' : '5 working days'} from issue date.
NCR Status: OPEN

Note: This report was generated using the standard template. Add Claude API credits for AI-powered detailed reports.`;
}

// Keyword severity
function keywordSeverity(text) {
  const t = (text || '').toLowerCase();
  if (/crack|fracture|rupture|collapse|unsafe|immediate|structural failure/.test(t)) return 'critical';
  if (/porosity|delamination|inadequate|non.compliant|defect|weld defect|misalign|out of tol|below spec/.test(t)) return 'major';
  if (/minor|small|slight|surface|cosmetic|observation/.test(t)) return 'minor';
  return 'observation';
}

// Claude with retry
async function callClaude(messages, maxTokens) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await anthropic.messages.create({
        model: 'claude-sonnet-4-5', max_tokens: maxTokens || 1500, messages,
      });
    } catch (err) {
      if (attempt === 2 || err.status === 400) throw err;
      console.warn(`[AI] Attempt ${attempt} failed — retrying in 3s`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// ── POST /api/reports/generate ──────────────────────────────
router.post('/generate', async (req, res) => {
  const d = req.body;
  if (!d.findings || d.findings.trim().length < 5)
    return res.status(400).json({ error: '`findings` field is required.' });

  let reportContent;
  let tokensUsed = 0;

  try {
    const msg = await callClaude([{ role: 'user', content: buildPrompt(d) }], 1500);
    reportContent = msg.content[0].text;
    tokensUsed    = msg.usage?.output_tokens || 0;
    console.log(`[AI] report generated — ${tokensUsed} tokens`);
  } catch (aiErr) {
    console.error('[AI] Claude error:', aiErr.message);
    reportContent = fallbackReport(d);
  }

  if (d.inspection_id) {
    try {
      await supabase.from('reports').insert({
        inspection_id: d.inspection_id, report_content: reportContent,
        generated_by: req.userId, model_used: 'claude-sonnet-4-5',
      });
      await supabase.from('inspections')
        .update({ ai_report: reportContent }).eq('id', d.inspection_id);
    } catch (dbErr) {
      console.error('[AI] DB save error:', dbErr.message);
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
      content: `Classify severity of this ${inspection_type || 'construction'} finding per Saudi Aramco / ASME standards.
Finding: "${findings}"
Respond ONLY with valid JSON (no markdown):
{"severity":"critical|major|minor|observation","reason":"one sentence","keywords":["kw1","kw2"]}`,
    }], 200);
    const match = msg.content[0].text.trim().match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON');
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('[AI] severity fallback:', err.message);
    res.json({ severity: keywordSeverity(findings), reason: 'Classified by keyword analysis.', keywords: [] });
  }
});

// ── POST /api/reports/suggest-actions ──────────────────────
router.post('/suggest-actions', async (req, res) => {
  const { findings, severity, inspection_type, reference_standard } = req.body;
  if (!findings) return res.status(400).json({ error: 'findings required' });
  try {
    const msg = await callClaude([{
      role: 'user',
      content: `List 5 specific corrective actions for this ${severity || 'major'} ${inspection_type} finding per ${reference_standard || 'ASME B31.3'} / Saudi Aramco standards.
Finding: "${findings}"
Respond ONLY with a JSON array (no markdown):
["Action 1","Action 2","Action 3","Action 4","Action 5"]`,
    }], 500);
    const match = msg.content[0].text.trim().match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no JSON array');
    res.json({ actions: JSON.parse(match[0]) });
  } catch (err) {
    console.error('[AI] actions fallback:', err.message);
    res.json({ actions: [
      'Quarantine the affected area and attach NCR identification tag.',
      'Conduct 100% NDE examination of all affected joints/components.',
      'Submit corrective action plan to QC Engineer for review and approval.',
      'Repair or replace non-conforming items per approved WPS/procedure.',
      'Re-inspect and document results prior to resumption of work.',
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
// PROFESSIONAL PDF BUILDER
// ════════════════════════════════════════════════════════════
function buildPDF(doc, insp) {
  const W      = doc.page.width;
  const H      = doc.page.height;
  const MARGIN = 45;

  // Colors
  const C = {
    navy:    '#0a1f5c',
    blue:    '#1a3a8f',
    lblue:   '#2563eb',
    red:     '#b91c1c',
    amber:   '#b45309',
    green:   '#166534',
    gray:    '#374151',
    lgray:   '#6b7280',
    xlgray:  '#9ca3af',
    light:   '#f8fafc',
    white:   '#ffffff',
    border:  '#e2e8f0',
    gold:    '#d4af37',
  };

  const SEV = {
    critical:    { bg: '#b91c1c', light: '#fef2f2', text: 'CRITICAL' },
    major:       { bg: '#b45309', light: '#fffbeb', text: 'MAJOR' },
    minor:       { bg: '#166534', light: '#f0fdf4', text: 'MINOR' },
    observation: { bg: '#374151', light: '#f9fafb', text: 'OBSERVATION' },
  };

  const sev        = SEV[insp.severity] || SEV.major;
  const company    = process.env.COMPANY_NAME || 'AI QC Inspector Pro';
  const genDate    = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  const reportNo   = insp.inspection_no || 'DRAFT';

  // ── Clean AI report text — remove Unicode box chars ────────
  function cleanText(text) {
    if (!text) return '';
    return text
      .replace(/[═─┌┐└┘├┤┬┴┼│]/g, '-')
      .replace(/[^\x00-\x7F]/g, '') // remove all non-ASCII
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  // ── Parse AI report into sections ───────────────────────────
  function parseReportSections(text) {
    if (!text) return null;
    const clean = cleanText(text);
    const sections = [];

    // Extract numbered sections
    const sectionRegex = /(\d+)\.\s+([A-Z][A-Z\s&\/]+)\s*[-=]*\s*\n([\s\S]*?)(?=\n\d+\.\s+[A-Z]|$)/g;
    let match;
    while ((match = sectionRegex.exec(clean)) !== null) {
      sections.push({
        num:     match[1],
        title:   match[2].trim(),
        content: match[3].trim(),
      });
    }

    if (sections.length === 0) {
      // Fallback: just return clean text
      return [{ num: '', title: 'NCR REPORT', content: clean }];
    }
    return sections;
  }

  // ── Helper: draw horizontal rule ───────────────────────────
  function hRule(y, color, thick) {
    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y)
       .lineWidth(thick || 0.5).stroke(color || C.border);
    doc.lineWidth(1);
  }

  // ── Helper: section title bar ───────────────────────────────
  function sectionBar(y, title, bgColor) {
    const barH = 20;
    doc.rect(MARGIN, y, W - MARGIN * 2, barH).fill(bgColor || C.blue);
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(8.5)
       .text(title, MARGIN + 8, y + 6, { width: W - MARGIN * 2 - 16 });
    return y + barH;
  }

  // ── PAGE 1 ──────────────────────────────────────────────────

  // Top header gradient effect (two rects)
  doc.rect(0, 0, W, 70).fill(C.navy);
  doc.rect(0, 70, W, 20).fill(C.blue);

  // Gold accent line
  doc.rect(0, 88, W, 3).fill(C.gold);

  // Logo box
  doc.rect(MARGIN, 14, 42, 42).fill(C.blue).stroke(C.gold);
  doc.rect(MARGIN + 2, 16, 38, 38).fill(C.blue);
  doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(11)
     .text('QC', MARGIN + 7, 27, { width: 28, align: 'center' });
  doc.fillColor(C.white).font('Helvetica').fontSize(6)
     .text('INSP', MARGIN + 7, 40, { width: 28, align: 'center' });

  // Company name
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(17)
     .text(company, MARGIN + 52, 16, { width: W - MARGIN - 52 - 20 });
  doc.fillColor('rgba(255,255,255,0.7)').font('Helvetica').fontSize(9)
     .text('Non-Conformance & Quality Control Inspection Report', MARGIN + 52, 38);
  doc.fillColor('rgba(255,255,255,0.5)').font('Helvetica').fontSize(8)
     .text('Generated: ' + genDate, MARGIN + 52, 52);

  // Severity badge (right side of header)
  const sevBadgeW = 110;
  doc.rect(W - MARGIN - sevBadgeW, 16, sevBadgeW, 46).fill(sev.bg).stroke('rgba(255,255,255,0.3)');
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(10)
     .text(sev.text, W - MARGIN - sevBadgeW, 26, { width: sevBadgeW, align: 'center' });
  doc.fillColor('rgba(255,255,255,0.7)').font('Helvetica').fontSize(7)
     .text('SEVERITY LEVEL', W - MARGIN - sevBadgeW, 42, { width: sevBadgeW, align: 'center' });

  // Sub-header bar
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9)
     .text(`Report No: ${reportNo}`, MARGIN, 75, { width: 150 });
  doc.fillColor('rgba(255,255,255,0.8)').font('Helvetica').fontSize(9)
     .text(`Status: ${(insp.status || 'OPEN').toUpperCase()}`, MARGIN + 160, 75, { width: 100 });
  doc.fillColor('rgba(255,255,255,0.8)').font('Helvetica').fontSize(9)
     .text(`Date: ${insp.inspection_date || genDate}`, MARGIN + 270, 75, { width: 150 });

  // ── INSPECTION DETAILS TABLE ─────────────────────────────
  let y = 100;

  // Table header
  y = sectionBar(y, 'INSPECTION DETAILS', C.navy) + 2;

  // Table background
  const tableData = [
    [['Inspection No.',    reportNo],                          ['Project',          insp.project_name || '—']],
    [['Inspection Type',   insp.inspection_type || '—'],      ['Zone / Location',   insp.zone || '—']],
    [['Date',              insp.inspection_date || '—'],      ['Status',           (insp.status || 'OPEN').toUpperCase()]],
    [['Inspector',         insp.inspector_name || '—'],       ['Contractor',        insp.contractor || '—']],
    [['Reference Standard',insp.reference_standard || '—'],  ['Inspection Method', insp.inspection_method || '—']],
    [['Severity',          sev.text],                         ['Assigned To',       insp.assigned_to_name || 'TBD']],
  ];

  const colW     = (W - MARGIN * 2) / 2;
  const rowH     = 26;
  const tableBot = y + tableData.length * rowH;

  // Table background
  doc.rect(MARGIN, y, W - MARGIN * 2, tableData.length * rowH).fill(C.light).stroke(C.border);

  tableData.forEach((row, ri) => {
    const rowY = y + ri * rowH;
    // Alternating rows
    if (ri % 2 === 1) {
      doc.rect(MARGIN, rowY, W - MARGIN * 2, rowH).fill('#eef2ff').stroke(C.border);
    }
    // Column divider
    doc.moveTo(MARGIN + colW, rowY).lineTo(MARGIN + colW, rowY + rowH)
       .lineWidth(0.5).stroke(C.border);

    row.forEach(([label, val], ci) => {
      const cx = MARGIN + ci * colW + 6;
      // Label
      doc.fillColor(C.lgray).font('Helvetica-Bold').fontSize(6.5)
         .text(label.toUpperCase(), cx, rowY + 5, { width: colW - 12 });
      // Value — truncate long strings
      const displayVal = String(val).length > 55 ? String(val).slice(0, 55) + '...' : String(val);
      doc.fillColor(C.gray).font('Helvetica').fontSize(9)
         .text(displayVal, cx, rowY + 14, { width: colW - 12 });
    });
  });

  y = tableBot + 2;
  hRule(y, C.border);
  y += 8;

  // ── ENVIRONMENTAL CONDITIONS ─────────────────────────────
  if (insp.temperature || insp.humidity || insp.weather) {
    const envItems = [
      insp.temperature ? `Temperature: ${insp.temperature}°C` : null,
      insp.humidity    ? `Humidity: ${insp.humidity}%` : null,
      insp.weather     ? `Weather: ${insp.weather}` : null,
    ].filter(Boolean);

    doc.fillColor(C.lgray).font('Helvetica-Bold').fontSize(7)
       .text('ENVIRONMENTAL CONDITIONS:', MARGIN, y);
    doc.fillColor(C.gray).font('Helvetica').fontSize(8.5)
       .text(envItems.join('   |   '), MARGIN + 120, y, { width: W - MARGIN * 2 - 120 });
    y += 16;
    hRule(y, C.border);
    y += 8;
  }

  // ── FINDINGS ─────────────────────────────────────────────
  y = sectionBar(y, 'OBSERVATIONS / FINDINGS', C.blue) + 6;

  doc.rect(MARGIN, y, W - MARGIN * 2, 2).fill(sev.bg); // colored accent
  y += 6;

  const findingsText = cleanText(insp.findings || 'No findings recorded.');
  doc.fillColor(C.gray).font('Helvetica').fontSize(10)
     .text(findingsText, MARGIN, y, { width: W - MARGIN * 2, lineGap: 3 });
  y = doc.y + 12;

  // ── AI REPORT SECTIONS ────────────────────────────────────
  if (insp.ai_report) {
    const sections = parseReportSections(insp.ai_report);

    if (sections) {
      sections.forEach(section => {
        // Check if we need a new page
        if (y > H - 120) {
          doc.addPage();
          y = MARGIN;
        }

        if (section.title && section.title !== 'NCR REPORT') {
          y = sectionBar(y, section.num ? `${section.num}. ${section.title}` : section.title, C.navy) + 6;
        }

        if (section.content) {
          const content = cleanText(section.content);

          // Check if content has numbered list
          if (/^\d+\.\s/.test(content)) {
            const lines = content.split('\n').filter(l => l.trim());
            lines.forEach(line => {
              const isItem = /^\d+\.\s/.test(line.trim());
              if (y > H - 80) { doc.addPage(); y = MARGIN; }

              if (isItem) {
                // Bullet point styling
                doc.circle(MARGIN + 5, y + 4, 2).fill(C.blue);
                doc.fillColor(C.gray).font('Helvetica').fontSize(9)
                   .text(line.replace(/^[0-9]+\.\s*/, '').trim(), MARGIN + 14, y,
                         { width: W - MARGIN * 2 - 14, lineGap: 2 });
              } else {
                doc.fillColor(C.gray).font('Helvetica').fontSize(9)
                   .text(line, MARGIN, y, { width: W - MARGIN * 2, lineGap: 2 });
              }
              y = doc.y + 4;
            });
          } else {
            doc.fillColor(C.gray).font('Helvetica').fontSize(9)
               .text(content, MARGIN, y, { width: W - MARGIN * 2, lineGap: 3 });
            y = doc.y + 8;
          }
        }

        y += 4;
      });
    }
  }

  // ── CORRECTIVE ACTION (from form) ───────────────────────
  if (insp.corrective_action && !insp.ai_report) {
    if (y > H - 80) { doc.addPage(); y = MARGIN; }
    y = sectionBar(y, '4. CORRECTIVE ACTION REQUIRED', C.navy) + 8;
    const caLines = insp.corrective_action.split("\n").filter(function(l){ return l.trim(); });
    caLines.forEach((line, i) => {
      if (y > H - 60) { doc.addPage(); y = MARGIN; }
      doc.circle(MARGIN + 5, y + 4, 2).fill(C.blue);
      doc.fillColor(C.gray).font('Helvetica').fontSize(9)
         .text(line.replace(/^[0-9]+\.\s*/, '').trim(), MARGIN + 14, y,
               { width: W - MARGIN * 2 - 14, lineGap: 2 });
      y = doc.y + 4;
    });
    y += 6;
  }

  // ── VERIFICATION REQUIREMENTS (from form) ────────────────
  if (insp.verification_requirements && !insp.ai_report) {
    if (y > H - 80) { doc.addPage(); y = MARGIN; }
    y = sectionBar(y, '5. VERIFICATION REQUIREMENTS', C.navy) + 8;
    doc.fillColor(C.gray).font('Helvetica').fontSize(9)
       .text(cleanText(insp.verification_requirements), MARGIN, y,
             { width: W - MARGIN * 2, lineGap: 3 });
    y = doc.y + 10;
  }

  // ── PHOTO EVIDENCE SECTION ──────────────────────────────
  if (insp.image_urls && insp.image_urls.length > 0) {
    if (y > H - 120) { doc.addPage(); y = MARGIN; }
    y += 8;
    y = sectionBar(y, 'PHOTO EVIDENCE', C.navy) + 10;

    // Note about photos
    doc.rect(MARGIN, y, W - MARGIN * 2, 50).fill(C.light).stroke(C.border);
    doc.fillColor(C.blue).font('Helvetica-Bold').fontSize(9)
       .text('ATTACHED PHOTOGRAPHS:', MARGIN + 8, y + 8);
    doc.fillColor(C.gray).font('Helvetica').fontSize(8.5);
    insp.image_urls.forEach((url, idx) => {
      const shortUrl = url.length > 80 ? url.slice(0, 80) + '...' : url;
      doc.text(`Photo ${idx + 1}: ${shortUrl}`, MARGIN + 8, y + 20 + (idx * 12), { width: W - MARGIN * 2 - 16 });
    });
    y += 60;

    doc.fillColor(C.lgray).font('Helvetica').fontSize(7.5).font('Helvetica-Oblique')
       .text('Note: Original high-resolution photographs are stored in the QC Inspector system and available on request.', 
             MARGIN, y, { width: W - MARGIN * 2 });
    y = doc.y + 12;
  }

  // ── SIGN-OFF BOX ─────────────────────────────────────────
  if (y > H - 100) { doc.addPage(); y = MARGIN; }
  y += 8;

  doc.rect(MARGIN, y, W - MARGIN * 2, 70).fill(C.light).stroke(C.border);
  doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8)
     .text('SIGNATURES & APPROVAL', MARGIN + 8, y + 6);
  hRule(y + 18, C.border);

  const sigY = y + 24;
  const sigCols = [
    { label: 'QC INSPECTOR', name: insp.inspector_name || '_______________' },
    { label: 'QC SUPERVISOR', name: '_______________' },
    { label: 'CONTRACTOR REP.', name: '_______________' },
  ];

  sigCols.forEach((sig, i) => {
    const sx = MARGIN + 8 + i * ((W - MARGIN * 2 - 16) / 3);
    doc.fillColor(C.lgray).font('Helvetica').fontSize(7)
       .text(sig.label, sx, sigY, { width: 140 });
    doc.fillColor(C.gray).font('Helvetica').fontSize(8.5)
       .text(sig.name, sx, sigY + 10, { width: 140 });
    doc.moveTo(sx, sigY + 32).lineTo(sx + 130, sigY + 32)
       .lineWidth(0.5).stroke(C.lgray);
    doc.fillColor(C.xlgray).font('Helvetica').fontSize(6.5)
       .text('Signature / Date', sx, sigY + 34, { width: 140 });
  });

  // ── PAGE NUMBERS & FOOTER ─────────────────────────────────
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);

    // Footer
    doc.rect(0, H - 28, W, 28).fill('#0a1f5c');
    doc.fillColor('rgba(255,255,255,0.6)').font('Helvetica').fontSize(7)
       .text(
         `${company}  |  Report: ${reportNo}  |  CONFIDENTIAL — For authorized personnel only`,
         MARGIN, H - 18,
         { align: 'left', width: W - MARGIN * 2 - 60 }
       );
    doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(8)
       .text(`${i + 1} / ${totalPages}`, 0, H - 18,
             { align: 'right', width: W - MARGIN / 2 });
  }
}

module.exports = router;
