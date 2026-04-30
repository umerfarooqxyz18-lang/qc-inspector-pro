// routes/reports.js — FIXED VERSION (Images + Headings + Async PDF)

'use strict';

const express     = require('express');
const router      = express.Router();
const Anthropic   = require('@anthropic-ai/sdk');
const PDFDocument = require('pdfkit');
const supabase    = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────
router.use(requireAuth);

// ── FIXED PARSER (STRONG) ─────────────────────
function parseReportSections(text) {
  if (!text) return null;

  const clean = text
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();

  const sections = clean.split(/\n(?=\d+\.\s)/g).map(block => {
    const match = block.match(/^(\d+)\.\s+(.*)\n([\s\S]*)/);

    if (!match) {
      return {
        num: '',
        title: 'GENERAL',
        content: block.trim()
      };
    }

    return {
      num: match[1],
      title: match[2].trim(),
      content: match[3].trim()
    };
  });

  return sections;
}

// ── IMAGE LOADER ─────────────────────────────
function loadImage(url, index) {
  const tempPath = path.join(__dirname, `temp_${index}.jpg`);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);

    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(tempPath));
      });
    }).on('error', err => reject(err));
  });
}

// ── AI PROMPT (IMPROVED) ─────────────────────
function buildPrompt(d) {
  return `
Generate a professional NCR report.

STRICT RULES:
- MUST include ALL 6 sections
- MUST use numbering 1 to 6
- DO NOT skip any section
- DO NOT rename sections

1. SCOPE & LOCATION
2. OBSERVATIONS
3. NON-CONFORMANCE DESCRIPTION
4. CORRECTIVE ACTION REQUIRED
5. VERIFICATION REQUIREMENTS
6. RESPONSIBLE PARTY & TIMELINE

DATA:
Project: ${d.project_name}
Inspection: ${d.inspection_type}
Findings: ${d.findings}
Standard: ${d.reference_standard}
`;
}

// ── REPORT GENERATION ────────────────────────
router.post('/generate', async (req, res) => {
  const d = req.body;

  let reportContent;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: buildPrompt(d) }]
    });

    reportContent = msg.content[0].text;

  } catch (err) {
    reportContent = `1. SCOPE & LOCATION\n${d.findings}`;
  }

  if (d.inspection_id) {
    await supabase.from('inspections')
      .update({ ai_report: reportContent })
      .eq('id', d.inspection_id);
  }

  res.json({ report: reportContent });
});

// ── PDF ROUTE (FIXED) ───────────────────────
router.get('/pdf/:inspection_id', async (req, res) => {
  try {
    const { data: insp } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', req.params.inspection_id)
      .single();

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');

    doc.pipe(res);

    await buildPDF(doc, insp); // IMPORTANT

    doc.end();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ✅ FINAL PDF BUILDER (FIXED)
// ─────────────────────────────────────────────
async function buildPDF(doc, insp) {

  const MARGIN = 50;

  doc.fontSize(16).text('QC INSPECTION REPORT', { align: 'center' });
  doc.moveDown();

  doc.fontSize(10).text(`Project: ${insp.project_name}`);
  doc.text(`Inspector: ${insp.inspector_name}`);
  doc.text(`Date: ${insp.inspection_date}`);
  doc.moveDown();

  // ── FINDINGS ─────────────────────────
  doc.fontSize(12).text('FINDINGS', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(insp.findings || '');
  doc.moveDown();

  // ── AI REPORT ───────────────────────
  if (insp.ai_report) {
    const sections = parseReportSections(insp.ai_report);

    sections.forEach(sec => {
      doc.moveDown();
      doc.fontSize(11).text(`${sec.num}. ${sec.title}`, { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).text(sec.content);
    });
  }

  // ── IMAGES (REAL FIX) ───────────────
  if (insp.image_urls && insp.image_urls.length > 0) {

    doc.addPage();
    doc.fontSize(14).text('PHOTO EVIDENCE', { underline: true });

    let y = doc.y + 10;

    for (let i = 0; i < insp.image_urls.length; i++) {
      try {
        const imgPath = await loadImage(insp.image_urls[i], i);

        doc.image(imgPath, MARGIN, y, {
          fit: [250, 180]
        });

        y += 190;

        if (y > 700) {
          doc.addPage();
          y = 50;
        }

      } catch (err) {
        doc.text(`Image ${i + 1} failed to load`);
      }
    }
  }
}

module.exports = router;
