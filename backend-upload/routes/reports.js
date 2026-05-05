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

// ── Master AI Prompt Builder ─────────────────────────────────
// Generates discipline-specific, standards-referenced NCR reports
function buildPrompt(d) {

  // Build standards knowledge base based on inspection type
  const discipline = (d.inspection_type || '').toLowerCase();
  
  let disciplineContext = '';
  
  if (discipline.includes('weld') || discipline.includes('ndt')) {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- SAES-W-011: Welding Requirements for On-Plot Process Equipment
- SAES-W-012: Requirements for Welding Pressure Piping
- ASME Section IX: Welding and Brazing Qualifications
- AWS D1.1: Structural Welding Code - Steel
- API 1104: Welding of Pipelines and Related Facilities
- ASME B31.3: Process Piping (Chapter VI - Inspection, Examination, Testing)
- ISO 3834: Quality Requirements for Fusion Welding of Metallic Materials
- SAES-W-017: Positive Material Identification
KEY ACCEPTANCE CRITERIA TO REFERENCE:
- ASME B31.3 Table 341.3.2: Examination acceptance criteria
- AWS D1.1 Table 6.1: Visual inspection acceptance criteria
- API 1104 Section 9: Acceptance standards for NDT`;
  } else if (discipline.includes('concrete') || discipline.includes('civil') || discipline.includes('foundation')) {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- SAES-Q-001: Criteria for Design and Construction of Concrete Structures
- SAES-Q-006: Foundations
- ACI 318: Building Code Requirements for Structural Concrete
- ACI 301: Specifications for Structural Concrete
- ACI 305R: Guide to Hot Weather Concreting (critical in Saudi Arabia - temps >32C)
- ACI 306R: Guide to Cold Weather Concreting
- ASTM C31: Standard Practice for Making and Curing Concrete Test Specimens
- ASTM C39: Standard Test Method for Compressive Strength of Cylindrical Specimens
- ASTM C138: Density, Yield, and Air Content of Concrete
- ASTM C143: Slump of Hydraulic-Cement Concrete
- SAES-M-001: Structural Design Criteria
KEY ACCEPTANCE CRITERIA TO REFERENCE:
- ACI 318 Section 26.12: Evaluation and Acceptance of Concrete
- ACI 318 Table 20.6.1.3.1: Concrete cover requirements
- ASTM C39: Minimum 28-day compressive strength f'c
- ACI 305R: Maximum concrete temperature at discharge 35C in hot weather`;
  } else if (discipline.includes('pipeline') || discipline.includes('piping')) {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- SAES-L-350: Construction of Plant Piping
- SAES-L-450: Construction of Onshore and Nearshore Pipelines
- ASME B31.3: Process Piping
- ASME B31.4: Pipeline Transportation Systems for Liquids
- ASME B31.8: Gas Transmission and Distribution Piping Systems
- API 570: Piping Inspection Code
- API 5L: Specification for Line Pipe
- SAES-A-004: General Requirements for Pressure Testing
- SAES-L-310: Design of Plant Piping
KEY ACCEPTANCE CRITERIA TO REFERENCE:
- ASME B31.3 Para 341.4: Required Examination
- ASME B31.3 Para 345: Testing requirements and test pressures
- API 570 Section 5: Inspection practices
- SAES-A-004: Hydrostatic test pressure = 1.5 x design pressure`;
  } else if (discipline.includes('coating') || discipline.includes('paint')) {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- SAES-H-001: Selection Requirements for Industrial Protective Coatings
- SAES-H-002: Coating Requirements for Onshore Pipelines
- SAES-H-101: Approved Protective Coating Systems
- SAES-H-200: Thermal Insulation for Mechanical Equipment and Piping
- SSPC-SP 6: Commercial Blast Cleaning
- SSPC-SP 10: Near-White Blast Cleaning
- SSPC-PA 1: Shop, Field, and Maintenance Painting of Steel
- SSPC-PA 2: Measurement of Dry Coating Thickness (DFT)
- NACE SP0169: Control of External Corrosion on Underground Pipelines
- ASTM D4285: Indicating Oil or Water in Compressed Air (Blotter Test)
KEY ACCEPTANCE CRITERIA TO REFERENCE:
- SSPC-PA 2: DFT measurements - max 20% of readings below minimum
- SAES-H-001: Surface preparation minimum SSPC-SP 10 for immersed service
- ISO 8501-1: Surface cleanliness grades Sa 2.5 for most applications`;
  } else if (discipline.includes('structural') || discipline.includes('steel')) {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- SAES-M-001: Structural Design Criteria
- AISC 360: Specification for Structural Steel Buildings
- AWS D1.1: Structural Welding Code - Steel
- ASTM A36: Standard Specification for Carbon Structural Steel
- ASTM A325: High-Strength Bolts for Structural Steel Joints
- ASTM A490: Heat-Treated Steel Structural Bolts
- AISC Code of Standard Practice for Steel Buildings and Bridges
- RCSC: Specification for Structural Joints using High-Strength Bolts
KEY ACCEPTANCE CRITERIA TO REFERENCE:
- AWS D1.1 Table 6.1: Visual weld acceptance criteria
- AISC 360 Section J3: Bolted connections torque requirements
- ASTM F436: Hardened Steel Washers for structural bolting`;
  } else if (discipline.includes('electrical')) {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- SAES-P-100: Basic Design Criteria for Electrical Systems
- SAES-P-101: Grounding
- SAES-P-104: Wiring Methods and Materials
- SAES-P-111: Power Transformers
- IEC 60364: Low-Voltage Electrical Installations
- IEEE 80: Guide for Safety in AC Substation Grounding
- NFPA 70: National Electrical Code (NEC)
- IEC 60529: Degrees of Protection provided by Enclosures (IP Code)
- API RP 505: Recommended Practice for Classification of Locations for Electrical Installations
- SAES-B-067: Safety Requirements for Electrical Systems in Hazardous Areas
KEY ACCEPTANCE CRITERIA TO REFERENCE:
- IEC 60364-6: Verification testing requirements
- IEEE 1584: Arc Flash Hazard Calculations
- SAES-P-101: Earth resistance maximum 1 ohm for main grounding grid`;
  } else if (discipline.includes('mechanical') || discipline.includes('pressure vessel') || discipline.includes('equipment')) {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- ASME Section VIII Division 1: Rules for Construction of Pressure Vessels
- ASME Section VIII Division 2: Alternative Rules
- SAES-D-001: Design Criteria for Pressure Vessels
- API 510: Pressure Vessel Inspection Code
- API 650: Welded Steel Tanks for Oil Storage
- API 653: Tank Inspection, Repair, Alteration and Reconstruction
- ASME PCC-1: Guidelines for Pressure Boundary Bolted Flange Joint Assembly
- ASME B16.5: Pipe Flanges and Flanged Fittings
- API 598: Valve Inspection and Testing
KEY ACCEPTANCE CRITERIA TO REFERENCE:
- ASME Sec VIII UG-125: Safety relief valve requirements
- API 510 Section 7: Pressure testing after repair
- ASME PCC-1: Flange bolt torque sequences and values
- ASME B16.5: Flange rating pressure-temperature tables`;
  } else if (discipline.includes('instrument') || discipline.includes('control')) {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- SAES-J-001: Measurement of Fluid Flow in Pipes
- SAES-J-002: Instruments for Pressure Measurement
- SAES-J-600: Safeguarding Instrumentation
- IEC 61511: Functional Safety - Safety Instrumented Systems
- IEC 61508: Functional Safety of E/E/PE Safety-related Systems
- ISA 5.1: Instrumentation Symbols and Identification
- ASME PTC 19.3: Temperature Measurement
- API RP 551: Process Measurement Instrumentation
KEY ACCEPTANCE CRITERIA TO REFERENCE:
- IEC 61511: SIL verification for safety functions
- SAES-J-002: Calibration accuracy requirements
- IEC 61508: Proof test intervals for SIS`;
  } else if (discipline.includes('fire')) {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- SAES-B-068: Fire Prevention and Control
- NFPA 13: Standard for the Installation of Sprinkler Systems
- NFPA 14: Standard for Standpipe and Hose Systems
- NFPA 25: Standard for the Inspection Testing and Maintenance of Water-Based Fire Protection
- NFPA 72: National Fire Alarm and Signaling Code
- API RP 2001: Fire Protection in Refineries
- FM Global Property Loss Prevention Data Sheets
KEY ACCEPTANCE CRITERIA TO REFERENCE:
- NFPA 13 Section 24.1: Acceptance testing requirements
- NFPA 25: Annual inspection and test requirements
- SAES-B-068 Table 1: Minimum fire water flow rates`;
  } else {
    disciplineContext = `
APPLICABLE STANDARDS FOR THIS DISCIPLINE:
- ISO 9001: Quality Management Systems Requirements
- SAES-A-004: General Requirements for Pressure Testing
- Saudi Aramco General Instructions (GI) applicable to this work scope
- Project Quality Plan and Inspection Test Plans (ITP)
- Applicable ASTM, ASME, API, AWS, IEC standards for this discipline`;
  }

  const hasPhotos = d.image_urls && d.image_urls.length > 0;
  const photoNote = hasPhotos 
    ? `
PHOTO EVIDENCE: ${d.image_urls.length} photograph(s) have been uploaded documenting this finding. Reference these as "Photographic Evidence Ref. ${d.inspection_no}-IMG-001 through ${d.inspection_no}-IMG-00${d.image_urls.length}" in your observations.`
    : '';

  return `You are a Principal QA/QC Engineer with 25+ years of experience in Saudi Aramco, oil & gas, petrochemical, and construction projects across all disciplines. You have deep expertise in Saudi Aramco Engineering Standards (SAES), ASME, ASTM, AWS, API, ACI, AISC, IEC, NFPA, NACE, and all applicable international standards.

Your task: Generate a COMPLETELY TAILORED, HIGHLY DETAILED, PROFESSIONAL Non-Conformance Report (NCR) for this SPECIFIC finding. Every section must be written specifically for THIS observation - NOT generic text.

INSPECTION DATA:
================
Project: ${d.project_name || 'N/A'}
Report No: ${d.inspection_no || 'DRAFT'}
Date: ${d.inspection_date || new Date().toISOString().split('T')[0]}
Inspector: ${d.inspector_name || 'N/A'}
Contractor: ${d.contractor || 'N/A'}
Discipline: ${d.inspection_type || 'General'}
Zone/Location: ${d.zone || 'Site'}
Inspection Method: ${d.inspection_method || 'Visual Testing'}
Severity: ${(d.severity || 'major').toUpperCase()}
Reference Standard: ${d.reference_standard || 'Applicable Standards'}
Temperature: ${d.temperature || 'N/A'}C | Humidity: ${d.humidity || 'N/A'}%
Assigned To: ${d.assigned_to_name || 'TBD'}
${photoNote}

INSPECTOR'S OBSERVATION (verbatim):
"${d.findings}"

${disciplineContext}

INSTRUCTIONS - READ CAREFULLY:
1. Write EVERY section specifically for THIS observation. Never use generic filler text.
2. In Section 2 (Observations), expand the inspector's raw note into 3-5 detailed technical observations. Infer what an experienced engineer would observe based on the finding described.
3. In Section 3 (Non-Conformance), cite the EXACT clause/paragraph number from the applicable standard. Explain WHY this is a problem and what RISK it creates.
4. In Section 4 (Corrective Actions), write SPECIFIC repair/corrective steps for THIS EXACT type of defect - not generic steps. Include specific test parameters, acceptance criteria, and reference the applicable standard clause.
5. In Section 5 (Verification), specify EXACT tests with acceptance criteria values (e.g., "Hydrostatic test at 1.5x design pressure per ASME B31.3 Para 345.4.2" not just "re-test").
6. ${hasPhotos ? `Reference the photographic evidence in your observations section as supporting documentation.` : `Note that no photographic evidence was provided.`}
7. Use ONLY standard ASCII characters - no special box-drawing Unicode characters.
8. Write in formal engineering passive voice throughout.

FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS (copy headers exactly):

NON-CONFORMANCE INSPECTION REPORT
=====================================================
Report No.: ${d.inspection_no || 'DRAFT'}        Date: ${d.inspection_date || new Date().toISOString().split('T')[0]}
Project: ${d.project_name || 'N/A'}
Discipline: ${d.inspection_type || 'N/A'}
Inspector: ${d.inspector_name || 'N/A'}
Contractor: ${d.contractor || 'N/A'}
Standard: ${d.reference_standard || 'Applicable Standards'}
=====================================================

SEVERITY CLASSIFICATION: ${(d.severity || 'MAJOR').toUpperCase()}

1. SCOPE & LOCATION
-------------------
[2-3 sentences describing what was inspected, where exactly, and during which activity. Be specific about location reference (e.g., "Grid Line C-7", "Weld Joint W-14", "Column C3 Foundation"). Reference the inspection method used.]

2. OBSERVATIONS
---------------
[3-5 numbered observations. Each must be a specific technical finding. Include measurements, dimensions, quantities where inferrable. ${hasPhotos ? 'Reference photographic evidence.' : ''} Examples of good observations: "1. Concrete cover measured at 18mm (0.71 inch) on eastern face of Column C-3 foundation, falling below the minimum 40mm (1.57 inch) required by ACI 318 Table 20.6.1.3.1 for foundations exposed to soil." NOT "1. The foundation was not good."]

3. NON-CONFORMANCE DESCRIPTION
-------------------------------
[Paragraph citing the EXACT standard clause violated. Format: "The identified condition constitutes a non-conformance with [STANDARD NAME] [Clause X.X.X], which requires [exact requirement]. The recorded [measurement/condition] of [value] deviates from the acceptance criterion of [value]. This non-conformance poses [specific technical risk] which may result in [specific consequence]."]

4. CORRECTIVE ACTION REQUIRED
------------------------------
1. IMMEDIATE: [Stop-work / containment / quarantine action specific to this defect type]
2. INVESTIGATION: [Specific NDE or testing to determine full extent - with test method and acceptance criteria]
3. REPAIR: [Specific repair procedure referencing the applicable standard repair clause and approved procedure requirement]
4. DOCUMENTATION: [What WPS, method statement, or procedure must be submitted]
5. PREVENTION: [Specific procedural or supervisory change to prevent recurrence]
6. RE-INSPECTION: [Specific hold point - what test, what acceptance criterion, who signs off]

5. VERIFICATION REQUIREMENTS
-----------------------------
[3-4 specific verification items. Each must state WHAT to test, HOW to test it, and WHAT the acceptance criterion is. Example: "1. Concrete core samples to be extracted at minimum 3 locations per ACI 318 Section 26.12.4 and tested per ASTM C39 - minimum accepted f'c = [project specification value] MPa." NOT just "re-inspect the area."]

6. RESPONSIBLE PARTY & TIMELINE
---------------------------------
Responsible Party: ${d.assigned_to_name || 'Contractor QC Manager'}
Severity: ${(d.severity || 'MAJOR').toUpperCase()}
Required Closure: ${(d.severity || 'major') === 'critical' ? '24 hours - WORK STOPPAGE IN EFFECT' : (d.severity || 'major') === 'major' ? '3 working days' : '7 working days'} from NCR issue date
Hold Point: QC Inspector and Company Representative sign-off required before resumption
NCR Status: OPEN - Pending Corrective Action

Remember: Make this report COMPLETELY SPECIFIC to the observation: "${d.findings}". A reader should be able to use this report as a complete technical document to understand, fix, and close this specific finding.`;
}

// ════════════════════════════════════════════════════════════
// SMART MOCK REPORT — Professional, discipline-specific,
// standards-referenced. Used when no API key is present.
// Reads: findings, inspection_type, reference_standard,
//        severity, zone, contractor, inspector, photos.
// ════════════════════════════════════════════════════════════
function smartMockReport(d) {
  const date      = new Date().toLocaleDateString('en-GB');
  const sev       = (d.severity || 'major').toUpperCase();
  const std       = d.reference_standard || 'ASME B31.3';
  const type      = d.inspection_type    || 'General Inspection';
  const findings  = d.findings           || 'Non-conformance identified during inspection.';
  const zone      = d.zone               || 'Site';
  const inspector = d.inspector_name     || 'N/A';
  const assigned  = d.assigned_to_name   || 'Contractor QC Manager';
  const no        = d.inspection_no      || 'DRAFT';
  const project   = d.project_name       || 'N/A';
  const method    = d.inspection_method  || 'Visual Testing (VT)';
  const hasPhotos = d.image_urls && d.image_urls.length > 0;
  const photoRef  = hasPhotos ? `Photographic evidence referenced as ${no}-IMG-001 through ${no}-IMG-00${d.image_urls.length} supports the findings documented below.` : '';

  const disc = type.toLowerCase();
  const timeline = sev === 'CRITICAL' ? '24 hours - IMMEDIATE WORK STOPPAGE IN EFFECT'
                 : sev === 'MAJOR'    ? '3 working days'
                 : sev === 'MINOR'    ? '7 working days'
                 : '14 working days';

  // ── Discipline-specific content ───────────────────────────
  let scope = '', observations = '', nonConformance = '',
      correctiveActions = '', verification = '';

  if (disc.includes('weld') || disc.includes('ndt')) {
    scope = `Inspection of welding works and associated NDT activities was conducted at ${zone} in accordance with ${std} and applicable Saudi Aramco Engineering Standards SAES-W-011 and SAES-W-012. Inspection scope included visual examination of weld joints, dimensional verification, and assessment of weld profile and surface condition. Method employed: ${method}.`;
    
    observations = `1. ${findings} ${photoRef}
2. Visual examination revealed surface discontinuities inconsistent with the acceptance criteria defined in AWS D1.1 Table 6.1 and ASME B31.3 Table 341.3.2.
3. Weld geometry and profile deviations were identified indicating potential inadequate fusion, incomplete penetration, or surface irregularity beyond permissible limits.
4. Affected weld joint(s) require mandatory NDE (Radiographic or Ultrasonic Testing) to determine subsurface extent of non-conformance per ASME Section V Article 2 / Article 5.
5. Environmental conditions at time of inspection: Temp ${d.temperature || 'N/A'}C, Humidity ${d.humidity || 'N/A'}% - within/outside permissible range per SAES-W-011 Para 6.`;
    
    nonConformance = `The identified condition constitutes a non-conformance with ${std} Table 341.3.2 (Examination Acceptance Criteria) and SAES-W-011 Section 6, which requires all welds to meet specified visual and dimensional acceptance criteria before proceeding to pressure testing or commissioning activities. The recorded condition deviates from acceptance requirements. This non-conformance poses risk of weld failure under operating pressure and temperature cycling, potentially resulting in loss of containment, process safety incident, and structural integrity compromise. Welding Procedure Specification (WPS) compliance and Welder Qualification Records (WQR) shall be reviewed to identify root cause.`;
    
    correctiveActions = `1. IMMEDIATE: Quarantine and tag all identified non-conforming weld joints with NCR identification. Suspend welding activities on affected spool/structure pending corrective action approval.
2. INVESTIGATION: Conduct 100% Radiographic Testing (RT) or Ultrasonic Testing (UT) per ASME Section V on all affected welds to determine extent of sub-surface defects. Accept/reject per ASME B31.3 Para 341.3.2.
3. REPAIR: Prepare and submit Weld Repair Procedure for Company QC Engineer approval. Repair defective weld(s) per approved WPS using qualified welder. Remove defect to sound metal by grinding/gouging per ASME B31.3 Para 328.6.
4. DOCUMENTATION: Submit revised Weld Map, updated Weld Log, and WQR for affected welder(s). Review welder performance qualification per ASME Section IX.
5. PREVENTION: Implement increased in-process inspection frequency. Assign QC Inspector as mandatory hold point at fit-up and root pass stages for this contractor.
6. RE-INSPECTION: 100% NDE on repaired welds. Visual acceptance per AWS D1.1 Table 6.1. Final sign-off by Company QC Inspector and QC Supervisor required.`;
    
    verification = `1. 100% RT or UT examination of repaired weld joints per ASME Section V, acceptance per ASME B31.3 Table 341.3.2 - No linear indications exceeding permissible limits.
2. Dimensional verification of weld profile (reinforcement, undercut, overlap) per AWS D1.1 Table 6.1 - measured with calibrated welding gauge.
3. Hardness testing (if applicable) per SAES-W-011 Para 7 - Maximum 248 HV10 for carbon steel.
4. Pressure test (hydrostatic) on repaired piping/spool at 1.5x design pressure per ASME B31.3 Para 345.4.2 for minimum 10 minutes.
5. Company QC Inspector and QC Supervisor sign-off on NCR Corrective Action Report before resuming work.`;

  } else if (disc.includes('concrete') || disc.includes('civil') || disc.includes('foundation')) {
    scope = `Inspection of concrete works and civil construction activities was conducted at ${zone} in accordance with ${std}, SAES-Q-001 (Criteria for Design and Construction of Concrete Structures), and ACI 318 (Building Code Requirements for Structural Concrete). Inspection scope included pre-pour/post-pour verification, concrete cover measurement, rebar placement, formwork condition, and concrete placement compliance. Method employed: ${method}.`;
    
    observations = `1. ${findings} ${photoRef}
2. Concrete cover measurements at multiple locations found to deviate from the minimum specified cover requirements per ACI 318 Table 20.6.1.3.1 and project specifications.
3. Concrete placement and/or compaction methods observed to be inconsistent with ACI 301 Section 5.3 requirements for consolidation of concrete.
4. Slump test results and/or concrete temperature at point of discharge require verification against ACI 305R limits (maximum 35C discharge temperature in hot weather applicable to Saudi Arabia climate).
5. Cube/cylinder specimens (per ASTM C31) taken for 7-day and 28-day compressive strength verification per ASTM C39. Results pending.`;
    
    nonConformance = `The identified condition constitutes a non-conformance with ${std} and SAES-Q-001 Section 5, which specifies mandatory quality control requirements for all concrete placement activities. The recorded condition deviates from the acceptance criterion specified in ACI 318 and the Project Quality Plan. In the environmental conditions of Saudi Arabia (high ambient temperatures per ACI 305R), inadequate concrete placement procedures pose risk of reduced compressive strength, increased permeability, premature cracking, and reduced structural service life. This directly impacts the structural integrity and long-term durability of the foundation/structure.`;
    
    correctiveActions = `1. IMMEDIATE: Stop concrete placement activities in the affected area. Mark and segregate non-conforming work with NCR tag.
2. INVESTIGATION: Extract concrete core samples (minimum 3 per ACI 318 Section 26.12.4) from affected pour and test per ASTM C39. Schmidt Hammer rebound test per ASTM C805 as preliminary assessment.
3. REPAIR: Based on core test results - if f'c < 85% of specified strength: prepare repair method statement per ACI 318 Section 26.4 for Company Engineer approval. Options: epoxy injection, concrete replacement, or structural strengthening design.
4. DOCUMENTATION: Submit non-conforming pour records, batch plant mix design verification, delivery tickets, and all QC test results to Company QC Engineer.
5. PREVENTION: Implement mandatory concrete pre-placement checklist. Assign dedicated QC Inspector for all concrete pours. Verify batch plant calibration per ASTM C94.
6. RE-INSPECTION: Verify corrective repair meets ACI 318 acceptance criteria. Hold point: Company QC Engineer approval of repair method prior to execution.`;
    
    verification = `1. Core sample compressive strength per ASTM C39 - minimum f'c = project specified value (typically 30-40 MPa). Test at 7 and 28 days.
2. Concrete cover verification per ACI 318 Table 20.6.1.3.1 using calibrated cover meter (Profometer or equivalent) - minimum 75mm for foundations exposed to soil.
3. Slump test per ASTM C143 at point of discharge - maximum 175mm (7 inches) unless otherwise specified.
4. Concrete temperature at discharge per ACI 305R - maximum 35C for hot weather concreting in Saudi Arabia.
5. Company QC Engineer and Structural Engineer sign-off on repair method statement and post-repair inspection report.`;

  } else if (disc.includes('pipeline') || disc.includes('piping')) {
    scope = `Inspection of pipeline/piping construction activities was conducted at ${zone} in accordance with ${std}, SAES-L-350 (Construction of Plant Piping), and applicable Saudi Aramco Project Standards. Inspection scope covered pipe installation, joint assembly, dimensional verification, and pre-test conditions. Method employed: ${method}.`;
    
    observations = `1. ${findings} ${photoRef}
2. Visual inspection identified deviations from the specified installation requirements per SAES-L-350 and ${std}.
3. Pipe alignment, support spacing, and/or joint assembly conditions were found to be outside permissible tolerances per ASME B31.3 Para 335.
4. Material identification and traceability markings require verification against mill certificates per SAES-L-350 Section 8 and API 5L.
5. Pre-hydrostatic test checklist items incomplete - mandatory hold points not cleared per SAES-A-004 requirements.`;
    
    nonConformance = `The identified condition constitutes a non-conformance with ${std} and SAES-L-350, which specifies mandatory requirements for plant piping construction. The deviation from specified installation requirements poses risk of failure under design operating pressure, temperature, and cyclic loading conditions. Per ASME B31.3 Para 341.4, all examination requirements must be met before pressure testing. Failure to comply may result in loss of containment, process safety incident, and loss of production.`;
    
    correctiveActions = `1. IMMEDIATE: Place NCR hold on affected piping section. Do not proceed to pressure testing until NCR is closed.
2. INVESTIGATION: Complete 100% visual examination and dimensional check of all affected joints per ASME B31.3 Para 341.4. Conduct NDE as required by service classification.
3. REPAIR: Correct installation deficiencies per ASME B31.3 Para 328 and approved construction procedure. Re-examine all repaired joints per original examination requirements.
4. DOCUMENTATION: Update as-built drawings and weld/joint records. Verify all material traceability documentation per SAES-L-350 Section 8.
5. PREVENTION: Review and update Inspection Test Plan (ITP). Implement mandatory QC hold points at critical installation stages.
6. RE-INSPECTION: Hydrostatic test at 1.5x MAWP per ASME B31.3 Para 345.4.2. Company QC Inspector witness and sign-off required.`;
    
    verification = `1. Hydrostatic pressure test at 1.5x Maximum Allowable Working Pressure (MAWP) per ASME B31.3 Para 345.4.2 for minimum 10 minutes with no visible leaks or pressure drop.
2. 100% visual examination of all repaired joints per ASME B31.3 Para 341.4.1 - zero visible defects.
3. NDE (RT/UT) on repaired welds per ASME B31.3 Table 341.3.2 acceptance criteria.
4. Dimensional verification of pipe alignment per ASME B31.3 Para 335 - within ±3mm of specified position.
5. Company QC Inspector and Operations Representative sign-off on completed Punch List before handover.`;

  } else if (disc.includes('coating') || disc.includes('paint')) {
    scope = `Inspection of protective coating/painting works was conducted at ${zone} in accordance with ${std}, SAES-H-001 (Selection Requirements for Industrial Protective Coatings), and SAES-H-101 (Approved Protective Coating Systems). Inspection scope included surface preparation assessment, DFT measurement, holiday testing, and adhesion verification. Method employed: ${method}.`;
    
    observations = `1. ${findings} ${photoRef}
2. Dry Film Thickness (DFT) measurements using calibrated ElcoMeter (Type 2 per SSPC-PA 2) indicated readings below the minimum specified system DFT requirement.
3. Surface preparation cleanliness grade observed to be below the specified minimum per SSPC-SP 10 (Near-White Blast) or SSPC-SP 6 (Commercial Blast) as required by the approved coating system data sheet.
4. Surface profile (anchor pattern) measurement using Testex Press-O-Film tape per ASTM D4417 Method C - results require verification against coating manufacturer's specification (typically 40-75 microns Rz).
5. Blotter test per ASTM D4285 to be conducted to confirm absence of oil/moisture contamination in compressed air supply used for blast cleaning.`;
    
    nonConformance = `The identified condition constitutes a non-conformance with SAES-H-001 Section 7 and ${std}, which requires all coating applications to meet the specified surface preparation and DFT requirements before the coating system is accepted. Per SSPC-PA 2, more than 20% of individual DFT measurements falling below the minimum specified DFT constitutes a non-conformance. Inadequate surface preparation and/or DFT directly reduces coating adhesion and barrier protection, resulting in accelerated corrosion, coating delamination, and reduced service life - particularly critical in the corrosive Saudi Arabian environment.`;
    
    correctiveActions = `1. IMMEDIATE: Stop coating application in affected area. Mark non-conforming surfaces with NCR tape. Protect blast-cleaned surfaces not yet coated from contamination and re-rusting.
2. INVESTIGATION: Conduct comprehensive DFT survey per SSPC-PA 2 (minimum 5 gauge readings per 10m2). Perform holiday/continuity test per NACE SP0188 at 67.5V per 25 microns DFT.
3. REPAIR: Re-blast surface to specified cleanliness per SSPC-SP 10. Apply additional coat(s) of approved material to achieve specified DFT. Feather edges per SSPC-PA 1.
4. DOCUMENTATION: Submit coating inspection records (surface preparation, DFT, holiday test), material batch certificates, and applicator qualification records to QC Engineer.
5. PREVENTION: Increase inspection frequency. Mandatory hold points at surface preparation and each coat application stage. Verify applicator qualifications per SAES-H-001.
6. RE-INSPECTION: Full DFT survey per SSPC-PA 2. Holiday test per NACE SP0188. Pull-off adhesion test per ASTM D4541 - minimum 5 MPa (725 psi).`;
    
    verification = `1. DFT survey per SSPC-PA 2 - 100% of readings at or above minimum, no single reading below 80% of minimum specified DFT. Record all measurements.
2. Holiday/continuity test per NACE SP0188 using wet sponge or high-voltage DC detector at specified voltage (67.5V per 25 microns DFT) - zero holidays acceptable.
3. Pull-off adhesion test per ASTM D4541 - minimum adhesion 5 MPa (725 psi). Test at 5 locations minimum per SAES-H-001.
4. Surface cleanliness verification per SSPC VIS-1 - minimum Sa 2.5 (ISO 8501-1) photographically documented.
5. Company QC Inspector and Coating Inspector (NACE/BGAS certified) sign-off on all inspection records before system acceptance.`;

  } else if (disc.includes('electrical')) {
    scope = `Inspection of electrical installation works was conducted at ${zone} in accordance with ${std}, SAES-P-100 (Basic Design Criteria for Electrical Systems), IEC 60364, and applicable Saudi Aramco Engineering Standards. Inspection scope included cable installation, termination quality, earthing/grounding continuity, and compliance with hazardous area classification requirements. Method employed: ${method}.`;
    
    observations = `1. ${findings} ${photoRef}
2. Visual inspection identified deviations from IEC 60364 wiring installation requirements and SAES-P-104 (Wiring Methods and Materials) specifications.
3. Earthing/grounding system continuity and earth resistance verification required per SAES-P-101 and IEEE 80 - minimum test: earth resistance measurement using fall-of-potential method.
4. Cable management, bending radius, and termination quality to be assessed against IEC 60228 and cable manufacturer specifications.
5. Hazardous area (Ex) equipment installation compliance to be verified against API RP 505 area classification drawing and IEC 60079-14 installation requirements.`;
    
    nonConformance = `The identified condition constitutes a non-conformance with ${std} and SAES-P-100, which specifies mandatory requirements for all electrical installations in industrial facilities. The deviation from specified requirements poses risk of electrical fault, arc flash, or ignition of flammable atmosphere in hazardous areas, potentially resulting in fire, explosion, personnel injury, and equipment damage. Per SAES-B-067, all electrical installations in classified areas must be verified as Ex-certified and correctly installed per IEC 60079-14 before energization.`;
    
    correctiveActions = `1. IMMEDIATE: De-energize and isolate affected electrical circuits. Prohibit energization until NCR is closed and Company Electrical Engineer provides written clearance.
2. INVESTIGATION: Conduct complete verification testing per IEC 60364-6 (Initial Verification): insulation resistance (per IEC 60364-6 Table 6A - minimum 1 MΩ), earth continuity, and polarity checks.
3. REPAIR: Correct installation deficiencies per SAES-P-104 and IEC 60364. Use only approved materials from Saudi Aramco Approved Vendor List (AVL).
4. DOCUMENTATION: Submit As-Built drawings, cable schedule updates, test records, and Ex equipment installation certificates to Electrical QC Engineer.
5. PREVENTION: Mandatory hold point inspection at first-fix and second-fix stages. Verify installation contractor's electrical competency certification.
6. RE-INSPECTION: Full IEC 60364-6 verification test suite. Earth resistance test per IEEE 80 - maximum 1 ohm for main grounding grid. Company Electrical Engineer sign-off required.`;
    
    verification = `1. Insulation resistance test per IEC 60364-6 Table 6A - minimum 1 MΩ at 500V DC for low voltage circuits, 1000V DC for 1kV systems.
2. Earth continuity test - maximum resistance 0.1 ohm from main earth bar to equipment earthing point.
3. Earth electrode resistance per SAES-P-101 - maximum 1 ohm for main plant grounding grid (measured per IEEE 81 fall-of-potential method).
4. Loop impedance test per IEC 60364-6 to verify correct operation of overcurrent protective devices.
5. Company Electrical Engineer and Operations Electrical Representative witness testing and sign completion certificates before energization.`;

  } else if (disc.includes('structural') || disc.includes('steel')) {
    scope = `Inspection of structural steel erection and connection works was conducted at ${zone} in accordance with ${std}, SAES-M-001 (Structural Design Criteria), AISC 360, and AWS D1.1 (Structural Welding Code - Steel). Inspection scope included member alignment, bolt installation and torque verification, weld quality, and dimensional compliance with approved structural drawings. Method employed: ${method}.`;
    
    observations = `1. ${findings} ${photoRef}
2. Structural member alignment and plumb/level deviations identified - requires verification against permissible erection tolerances per AISC Code of Standard Practice Section 7.
3. High-strength bolt installation (ASTM A325/A490) requires verification of bolt grade, washer placement, and installed tension per RCSC Specification Table 8.1 using Turn-of-Nut or Direct Tension Indicator method.
4. Weld visual inspection per AWS D1.1 Table 6.1 required on all complete joint penetration (CJP) and partial joint penetration (PJP) welds at identified connection.
5. Base plate bearing and grout installation to be verified per ACI 318 Section 26 and AISC Design Guide 1 requirements.`;
    
    nonConformance = `The identified condition constitutes a non-conformance with ${std} and SAES-M-001, which requires all structural steel connections to meet specified dimensional, bolt pretension, and weld quality requirements before the structure is loaded or construction proceeds to subsequent phases. Inadequate structural connections pose risk of connection failure under design loads (gravity, wind, seismic), potentially resulting in partial or total structural collapse, with severe safety consequences to personnel and adjacent structures.`;
    
    correctiveActions = `1. IMMEDIATE: Stop loading of affected structural members. Install temporary shoring if required to maintain stability. Tag with NCR identification.
2. INVESTIGATION: Complete dimensional survey of affected frame using total station or laser level. Conduct 100% visual weld inspection per AWS D1.1 Table 6.1. Conduct UT on CJP welds per AWS D1.1 Section 6, Part F.
3. REPAIR: Submit structural repair/rectification scheme prepared by Structural Engineer of Record. Obtain Company approval before commencing repairs. Correct misalignment, re-torque bolts, or repair welds per approved procedure.
4. DOCUMENTATION: Update As-Built structural drawings. Submit erection survey records, bolt torque records, and weld NDE reports to Structural QC Engineer.
5. PREVENTION: Implement mandatory QC hold points at column erection, beam connection, and bolt installation stages. Verify surveying instrument calibration.
6. RE-INSPECTION: Post-repair dimensional survey. 100% NDE on repaired welds. Bolt audit (10% minimum) per RCSC Specification. Structural Engineer of Record sign-off required.`;
    
    verification = `1. Dimensional survey of structural frame per AISC Code of Standard Practice Section 7 - plumb tolerance ±1:500 (max 25mm for multi-story).
2. Bolt pretension verification per RCSC Specification Table 8.1 - ASTM A325 M20 minimum 142 kN, A490 M20 minimum 179 kN (calibrated torque wrench method).
3. 100% UT examination of CJP welds per AWS D1.1 Section 6, Part F - accept/reject per AWS D1.1 Table 6.3.
4. Weld visual inspection per AWS D1.1 Table 6.1 - 100% of repaired welds.
5. Structural Engineer of Record and Company QC Engineer joint sign-off on post-repair survey report and test records.`;

  } else if (disc.includes('mechanical') || disc.includes('pressure vessel') || disc.includes('equipment')) {
    scope = `Inspection of mechanical equipment installation and testing activities was conducted at ${zone} in accordance with ${std}, SAES-D-001 (Design Criteria for Pressure Vessels), API 510 (Pressure Vessel Inspection Code), and project specifications. Inspection scope included equipment installation, nozzle alignment, flange assembly, and pre-commissioning verification requirements. Method employed: ${method}.`;
    
    observations = `1. ${findings} ${photoRef}
2. Mechanical equipment installation deviations identified requiring assessment against manufacturer installation manual requirements and ASME standards.
3. Flange joint assembly requires verification per ASME PCC-1 (Guidelines for Pressure Boundary Bolted Flange Joint Assembly) - bolt sequence, lubrication, and bolt stress requirements.
4. Equipment alignment (shaft/coupling) requires laser alignment verification per manufacturer tolerances - typically ±0.05mm offset and ±0.05mm/m angularity.
5. Pre-commissioning checklist items require completion per Saudi Aramco SAES-A-004 before pressure testing authorization.`;
    
    nonConformance = `The identified condition constitutes a non-conformance with ${std} and SAES-D-001, which requires all pressure equipment to meet specified installation and testing requirements before introduction to process fluids or pressurization. The deviation poses risk of equipment failure under operating pressure and temperature, potentially resulting in loss of containment, personnel injury, and process safety incident. Per API 510, all pressure vessels must pass hydrostatic test and inspection before return to or initial service.`;
    
    correctiveActions = `1. IMMEDIATE: Place hold on pressurization/commissioning of affected equipment. Do not introduce process fluids until NCR is closed.
2. INVESTIGATION: Complete pre-commissioning inspection checklist per SAES-A-004. Verify all nozzle loads are within NEMA SM-23/API 610 allowable limits. Check flange face condition per ASME B16.5.
3. REPAIR: Correct identified deficiencies per manufacturer installation manual and ASME PCC-1. Re-assemble flanged joints per ASME PCC-1 bolt tightening procedure (cross-pattern, 30%-60%-100% torque sequence).
4. DOCUMENTATION: Submit equipment installation records, alignment report, and pressure test record to Mechanical QC Engineer. Obtain Operations acceptance signature.
5. PREVENTION: Implement mandatory ITP hold point at equipment setting, alignment, and flange assembly stages. Verify torque wrench calibration certification.
6. RE-INSPECTION: Hydrostatic test per ASME Section VIII UG-99 at 1.3x MAWP (ASME Div. 1) for minimum 1 hour. Witness by Company Inspector required.`;
    
    verification = `1. Hydrostatic pressure test per ASME Section VIII UG-99 at 1.3x MAWP (minimum) for 1 hour - zero leaks, no visible permanent deformation.
2. Shaft alignment verification using laser alignment tool - offset ≤0.05mm, angularity ≤0.05mm/m at operating temperature.
3. Flange bolt torque audit per ASME PCC-1 Appendix O - minimum 10% of joints verified with calibrated torque wrench.
4. Vibration baseline measurement at commissioning per ISO 10816-3 acceptance Zone A/B limits.
5. Company Mechanical Inspector, Operations Maintenance Representative, and Vendor Representative joint sign-off on pre-commissioning completion certificate.`;

  } else {
    // General/default
    scope = `Quality control inspection was conducted at ${zone} as part of ${project} under the ${type} work scope in accordance with ${std} and applicable Saudi Aramco Engineering Standards. Inspection scope covered all work activities within the designated area. Method employed: ${method}.`;
    
    observations = `1. ${findings} ${photoRef}
2. The identified condition requires formal corrective action and QC hold before work proceeds.
3. Extent of non-conformance to be fully determined through detailed inspection of adjacent/related work.
4. Related work activities in the affected area to be reviewed for similar non-conformances.
5. Root cause investigation required to prevent recurrence per ISO 9001 Section 10.2 requirements.`;
    
    nonConformance = `The identified condition constitutes a non-conformance with ${std} and the Project Quality Plan requirements. The deviation from specified quality requirements must be addressed through the formal NCR process per ISO 9001 Section 8.7 (Control of Nonconforming Outputs) before work in the affected area may proceed. Failure to address this non-conformance may result in quality defects propagating to subsequent construction phases, increasing the cost and complexity of corrective action.`;
    
    correctiveActions = `1. IMMEDIATE: Stop affected work activities. Quarantine non-conforming work with NCR tag. Notify QC Supervisor and Company QC Engineer.
2. INVESTIGATION: Conduct detailed inspection to determine full extent of non-conformance. Review related work for similar defects.
3. REPAIR: Prepare and submit corrective action plan to Company QC Engineer for approval before commencing repairs.
4. DOCUMENTATION: Document all non-conforming work with measurements, photographs, and inspection records. Update quality records.
5. PREVENTION: Review and update work procedure. Implement additional inspection hold points. Conduct toolbox talk with workforce on quality requirements.
6. RE-INSPECTION: Independent re-inspection by Company QC Inspector after corrective action. Sign-off required before resuming work.`;
    
    verification = `1. Re-inspection of all corrective work by Company QC Inspector - 100% acceptance against ${std} requirements.
2. All test records, inspection reports, and corrective action documentation filed in NCR package.
3. Root Cause Analysis (RCA) report submitted to Company QC Engineer within 5 working days.
4. Updated Inspection Test Plan (ITP) with additional hold points submitted for Company approval.
5. Company QC Inspector, QC Supervisor, and Project QC Manager sign-off on NCR Corrective Action Report.`;
  }

  const photoSection = hasPhotos 
    ? `
PHOTOGRAPHIC EVIDENCE
---------------------
${d.image_urls.length} photograph(s) referenced: ${no}-IMG-001 through ${no}-IMG-00${d.image_urls.length}
Photographs are embedded in this report and available in the QC Inspector system.
`
    : '';

  return `NON-CONFORMANCE INSPECTION REPORT
=====================================================
Report No.: ${no}        Date: ${date}
Project: ${project}
Discipline: ${type}
Zone/Location: ${zone}
Inspector: ${inspector}
Contractor: ${d.contractor || 'N/A'}
Standard: ${std}
Environmental: Temp ${d.temperature || 'N/A'}C | Humidity ${d.humidity || 'N/A'}%
=====================================================

SEVERITY CLASSIFICATION: ${sev}

1. SCOPE & LOCATION
-------------------
${scope}

2. OBSERVATIONS
---------------
${observations}
${photoSection}
3. NON-CONFORMANCE DESCRIPTION
-------------------------------
${nonConformance}

4. CORRECTIVE ACTION REQUIRED
------------------------------
${correctiveActions}

5. VERIFICATION REQUIREMENTS
-----------------------------
${verification}

6. RESPONSIBLE PARTY & TIMELINE
---------------------------------
Responsible Party: ${assigned}
Severity Classification: ${sev}
Required Closure: ${timeline}
Hold Point: Company QC Inspector and QC Supervisor written sign-off required before resuming work in affected area
NCR Status: OPEN - Corrective Action Pending`;
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

// Claude with retry — only called if API key is real
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

// Check if real API key exists
function hasRealApiKey() {
  const key = process.env.ANTHROPIC_API_KEY || '';
  return key.startsWith('sk-ant-') && key.length > 20;
}

// ── POST /api/reports/generate ──────────────────────────────
router.post('/generate', async (req, res) => {
  const d = req.body;
  if (!d.findings || d.findings.trim().length < 5)
    return res.status(400).json({ error: '`findings` field is required.' });

  let reportContent;
  let tokensUsed = 0;

  d.image_urls = d.image_urls || [];

  // Use real Claude AI if key exists, otherwise use smartMockReport
  if (hasRealApiKey()) {
    try {
      const msg = await callClaude([{ role: 'user', content: buildPrompt(d) }], 2000);
      reportContent = msg.content[0].text;
      tokensUsed    = msg.usage?.output_tokens || 0;
      console.log(`[AI] Claude report generated — ${tokensUsed} tokens`);
    } catch (aiErr) {
      console.error('[AI] Claude error:', aiErr.message);
      reportContent = smartMockReport(d); // fallback to smart mock
    }
  } else {
    // No API key — use smart discipline-specific mock report
    console.log('[AI] No API key — using smartMockReport');
    reportContent = smartMockReport(d);
    tokensUsed = 0;
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
      content: `You are a Principal QA/QC Engineer with 25+ years experience in Saudi Aramco projects.

For this SPECIFIC ${severity || 'major'} finding in a ${inspection_type} inspection:
"${findings}"

Applicable standard: ${reference_standard || 'ASME B31.3'}

Write 5 SPECIFIC corrective actions tailored to THIS exact defect type. Each action must:
- Reference the specific standard clause (e.g., "per ASME B31.3 Para 341.4.1")
- Include specific acceptance criteria where applicable
- Be actionable and sequential (containment -> investigation -> repair -> verify)
- NOT be generic - write for THIS specific observation

Respond ONLY with a valid JSON array of 5 strings (no markdown, no backticks):
["Action 1 with standard reference","Action 2 with standard reference","Action 3","Action 4","Action 5"]`,
    }], 600);
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
// Helper: download image from URL and return Buffer
// Download image from Supabase Storage using service role (bypasses auth)
async function fetchImageBuffer(url) {
  try {
    if (!url || typeof url !== 'string') return null;

    // Extract the storage path from the URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/inspection-images/USER_ID/FILE.jpg
    const BUCKET = 'inspection-images';
    const marker = `/object/public/${BUCKET}/`;
    const altMarker = `/object/sign/${BUCKET}/`;

    let storagePath = null;
    if (url.includes(marker)) {
      storagePath = url.split(marker)[1].split('?')[0];
    } else if (url.includes(altMarker)) {
      storagePath = url.split(altMarker)[1].split('?')[0];
    }

    if (storagePath) {
      // Use Supabase service role to download — most reliable method
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(decodeURIComponent(storagePath));

      if (!error && data) {
        const arrayBuffer = await data.arrayBuffer();
        const buf = Buffer.from(arrayBuffer);
        if (buf.length > 100) {
          console.log(`[PDF] Supabase download OK: ${storagePath} (${buf.length} bytes)`);
          return buf;
        }
      } else {
        console.warn('[PDF] Supabase download error:', error?.message, 'path:', storagePath);
      }
    }

    // Fallback: direct HTTP fetch (works for truly public buckets)
    return new Promise((resolve) => {
      const https = require('https');
      const http  = require('http');
      const mod   = url.startsWith('https') ? https : http;
      const reqOpts = { timeout: 10000 };
      const req = mod.get(url, reqOpts, (resp) => {
        if (resp.statusCode !== 200) {
          console.warn('[PDF] HTTP fetch status:', resp.statusCode, url.slice(-50));
          return resolve(null);
        }
        const chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end',  () => {
          const buf = Buffer.concat(chunks);
          console.log(`[PDF] HTTP fetch OK: ${buf.length} bytes`);
          resolve(buf.length > 100 ? buf : null);
        });
        resp.on('error', () => resolve(null));
      });
      req.on('error',   (e) => { console.warn('[PDF] HTTP error:', e.message); resolve(null); });
      req.on('timeout', ()  => { req.destroy(); resolve(null); });
    });
  } catch(e) {
    console.error('[PDF] fetchImageBuffer exception:', e.message);
    return null;
  }
}

router.get('/pdf/:inspection_id', async (req, res) => {
  try {
    const { data: insp, error } = await supabase
      .from('inspections').select('*').eq('id', req.params.inspection_id).single();
    if (error || !insp) return res.status(404).json({ error: 'Inspection not found' });

    // Download all images as buffers BEFORE building PDF
    const imageBuffers = [];
    if (insp.image_urls && insp.image_urls.length > 0) {
      for (const url of insp.image_urls) {
        if (!url || typeof url !== 'string') continue;
        try {
          const buf = await fetchImageBuffer(url);
          if (buf && buf.length > 100) {
            imageBuffers.push({ buffer: buf, url });
            console.log(`[PDF] Image fetched: ${buf.length} bytes`);
          } else {
            console.warn('[PDF] Empty or failed image:', url);
          }
        } catch (imgErr) {
          console.warn('[PDF] Image error:', imgErr.message);
        }
      }
    }

    const filename = `${insp.inspection_no || 'Report'}_QC_Report.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true, autoFirstPage: true });
    doc.pipe(res);
    buildPDF(doc, insp, imageBuffers);
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
function buildPDF(doc, insp, imageBuffers) {
  imageBuffers = imageBuffers || [];
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

  // ── AI / SMART REPORT SECTIONS ──────────────────────────
  if (insp.ai_report) {
    const reportText = cleanText(insp.ai_report);
    const headers = [];

    // Find section headers: "1. TITLE" followed by dashes
    const lines = reportText.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      const hm = line.match(/^([0-9]+)[.]\s+([A-Z][A-Z\s&\/]+)$/);
      if (hm) {
        // next line might be dashes - skip it
        const nextLine = (lines[i+1] || '').trim();
        const afterDash = nextLine.match(/^[-=]+$/) ? i + 2 : i + 1;
        headers.push({ num: hm[1], title: hm[2].trim(), contentStart: afterDash, lineIndex: i });
      }
      i++;
    }

    if (headers.length === 0) {
      // No sections — render as paragraphs
      if (y > H - 80) { doc.addPage(); y = MARGIN; }
      doc.fillColor(C.gray).font('Helvetica').fontSize(9)
         .text(reportText, MARGIN, y, { width: W - MARGIN * 2, lineGap: 3 });
      y = doc.y + 8;
    } else {
      headers.forEach(function(hdr, hi) {
        const nextHdrLine = hi + 1 < headers.length ? headers[hi + 1].lineIndex : lines.length;
        const sectionLines = lines.slice(hdr.contentStart, nextHdrLine);

        if (y > H - 100) { doc.addPage(); y = MARGIN; }
        y = sectionBar(y, hdr.num + '. ' + hdr.title, C.navy) + 8;

        sectionLines.forEach(function(line) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.match(/^[-=]+$/)) { return; }
          if (y > H - 60) { doc.addPage(); y = MARGIN; }

          const numMatch = trimmed.match(/^([0-9]+)[.]\s+(.+)$/);
          if (numMatch) {
            const label = numMatch[2];
            const colonIdx = label.indexOf(':');
            doc.circle(MARGIN + 5, y + 5, 2.5).fill(C.blue);
            if (colonIdx > 0 && colonIdx < 25) {
              doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8.5)
                 .text(label.slice(0, colonIdx) + ': ', MARGIN + 14, y, { continued: true, width: W - MARGIN * 2 - 14 });
              doc.fillColor(C.gray).font('Helvetica').fontSize(8.5)
                 .text(label.slice(colonIdx + 1).trim(), { width: W - MARGIN * 2 - 14, lineGap: 2 });
            } else {
              doc.fillColor(C.gray).font('Helvetica').fontSize(9)
                 .text(label, MARGIN + 14, y, { width: W - MARGIN * 2 - 14, lineGap: 2 });
            }
          } else {
            doc.fillColor(C.gray).font('Helvetica').fontSize(9)
               .text(trimmed, MARGIN, y, { width: W - MARGIN * 2, lineGap: 3 });
          }
          y = doc.y + 5;
        });
        y += 6;
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

  // ── PHOTO EVIDENCE SECTION — REAL EMBEDDED IMAGES ──────
  const hasImages = imageBuffers && imageBuffers.length > 0;
  const hasImageUrls = insp.image_urls && insp.image_urls.length > 0;

  if (hasImages || hasImageUrls) {
    // Add new page only if not enough room
    if (y > H - 200) { doc.addPage(); y = MARGIN; }
    else { y += 12; }

    y = sectionBar(y, 'PHOTO EVIDENCE', C.navy) + 12;

    // Count line
    const photoCount = hasImages ? imageBuffers.length : insp.image_urls.length;
    doc.fillColor(C.lgray).font('Helvetica').fontSize(8)
       .text(`${photoCount} photograph(s) attached to this inspection report.`, MARGIN, y);
    y += 18;

    if (hasImages) {
      // ── Embed actual images — 2 per row ──────────────────
      const imgW   = (W - MARGIN * 2 - 12) / 2;  // 2 columns
      const imgH   = 180;                           // height per photo
      const capH   = 20;
      const padH   = 10;

      let rowStartY = y;
      imageBuffers.forEach((imgData, idx) => {
        const col = idx % 2;

        // Start new row
        if (col === 0 && idx > 0) {
          rowStartY += imgH + capH + padH + 6;
          y = rowStartY;
        }

        // New page if row won't fit
        if (col === 0 && y + imgH + capH + padH > H - 60) {
          doc.addPage();
          y = MARGIN;
          rowStartY = y;
          y = sectionBar(y, 'PHOTO EVIDENCE (continued)', C.navy) + 12;
          rowStartY = y;
        }

        const imgX = MARGIN + col * (imgW + 12);
        const imgY = rowStartY;

        try {
          // Draw border around photo
          doc.rect(imgX - 2, imgY - 2, imgW + 4, imgH + 4).fill(C.border);

          // Embed the image
          doc.image(imgData.buffer, imgX, imgY, {
            width:  imgW,
            height: imgH,
            cover:  [imgW, imgH],
            align:  'center',
            valign: 'center',
          });

          // Photo caption
          doc.rect(imgX, imgY + imgH - capH, imgW, capH).fill('rgba(10,31,92,0.75)');
          doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7.5)
             .text(`Photo ${idx + 1} of ${imageBuffers.length}`, imgX + 4, imgY + imgH - capH + 6,
                   { width: imgW - 8 });

        } catch (embedErr) {
          console.warn('[PDF] Image embed failed:', embedErr.message);
          doc.rect(imgX, imgY, imgW, imgH).fill(C.light).stroke(C.border);
          doc.fillColor(C.lgray).font('Helvetica').fontSize(9)
             .text('Image unavailable', imgX, imgY + imgH/2 - 5, { width: imgW, align: 'center' });
        }
      });
      // Move y past the last row
      y = rowStartY + imgH + capH + padH + 6;

    } else {
      // No buffers but URLs exist — show as list
      doc.rect(MARGIN, y, W - MARGIN * 2, 40 + hasImageUrls * 14).fill(C.light).stroke(C.border);
      doc.fillColor(C.lgray).font('Helvetica-Oblique').fontSize(8)
         .text('Photos were uploaded but could not be embedded. Available at:', MARGIN + 8, y + 8);
      insp.image_urls.forEach((url, i) => {
        doc.fillColor(C.blue).font('Helvetica').fontSize(7.5)
           .text(`${i+1}. ${url}`, MARGIN + 8, y + 22 + i * 14, { width: W - MARGIN * 2 - 16 });
      });
      y += 44 + insp.image_urls.length * 14;
    }
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
  // Flush all pages then add footers
  const range      = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    // Footer bar
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
