// routes/dashboard.js — Real-time dashboard stats from DB
const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/dashboard — all stats in one call
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;

    // Run all queries in parallel for speed
    const [
      inspectionsRes,
      issuesRes,
      recentInspectionsRes,
      monthlyRes,
      teamRes,
    ] = await Promise.all([
      // Total inspections & severity breakdown
      supabase.from('inspections')
        .select('id, severity, status, created_at')
        .order('created_at', { ascending: false }),

      // Issues breakdown
      supabase.from('issues')
        .select('id, severity, status, created_at, due_date'),

      // Recent 5 inspections for activity feed
      supabase.from('inspections')
        .select('id, inspection_no, project_name, inspection_type, zone, severity, status, created_at, inspector_name')
        .order('created_at', { ascending: false })
        .limit(5),

      // Last 6 months inspection counts
      supabase.from('inspections')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 180 * 86400000).toISOString()),

      // Team workload
      supabase.from('issues')
        .select('assigned_to_name, status')
        .eq('status', 'open'),
    ]);

    const inspections = inspectionsRes.data || [];
    const issues      = issuesRes.data || [];

    // ── Compute stats ────────────────────────────────────────
    const totalInspections = inspections.length;
    const openIssues       = issues.filter(i => i.status === 'open').length;
    const inProgressIssues = issues.filter(i => i.status === 'in_progress').length;
    const closedIssues     = issues.filter(i => i.status === 'closed').length;

    const severityCount = {
      critical:    inspections.filter(i => i.severity === 'critical').length,
      major:       inspections.filter(i => i.severity === 'major').length,
      minor:       inspections.filter(i => i.severity === 'minor').length,
      observation: inspections.filter(i => i.severity === 'observation').length,
    };

    // Compliance score: % of inspections that are closed
    const closedInspections = inspections.filter(i => i.status === 'closed').length;
    const complianceScore = totalInspections > 0
      ? Math.round((closedInspections / totalInspections) * 100)
      : 0;

    // Monthly counts (last 6 months)
    const monthly = buildMonthlyCounts(monthlyRes.data || []);

    // Overdue issues (past due_date and not closed)
    const today = new Date().toISOString().split('T')[0];
    const overdueIssues = issues.filter(
      i => i.status !== 'closed' && i.due_date && i.due_date < today
    ).length;

    res.json({
      totalInspections,
      openIssues,
      inProgressIssues,
      closedIssues,
      overdueIssues,
      complianceScore,
      severityCount,
      monthly,
      recentInspections: recentInspectionsRes.data || [],
      teamWorkload: buildTeamWorkload(teamRes.data || []),
    });
  } catch (err) {
    console.error('[DASHBOARD]', err);
    res.status(500).json({ error: err.message });
  }
});

// Build array of last 6 months with inspection counts
function buildMonthlyCounts(inspections) {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const label = d.toLocaleString('en-US', { month: 'short' });
    const year  = d.getFullYear();
    const month = d.getMonth();
    const count = inspections.filter(ins => {
      const insDate = new Date(ins.created_at);
      return insDate.getMonth() === month && insDate.getFullYear() === year;
    }).length;
    months.push({ label, count });
  }
  return months;
}

// Build team workload summary
function buildTeamWorkload(openIssues) {
  const map = {};
  openIssues.forEach(i => {
    const name = i.assigned_to_name || 'Unassigned';
    map[name] = (map[name] || 0) + 1;
  });
  return Object.entries(map)
    .map(([name, count]) => ({ name, openCount: count }))
    .sort((a, b) => b.openCount - a.openCount)
    .slice(0, 5);
}

module.exports = router;
