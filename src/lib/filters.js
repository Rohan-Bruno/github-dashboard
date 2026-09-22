import { nf } from './format.js';

// bot / automation accounts that should never appear as people
export const EXCLUDE_ASSIGNEES = ['copilot', 'maintainer-bruno'];
export const excluded = l => EXCLUDE_ASSIGNEES.includes(String(l).toLowerCase());

// logins are case-insensitive on GitHub, so membership is checked lowercased
export const internalSet = internal => {
  const s = new Set((internal || []).map(l => l.toLowerCase()));
  return { has(l) { return s.has(String(l).toLowerCase()); } };
};

export const hasInternal = D => (D.meta.internal || []).length > 0;
export const teamOpened = (i, INT) => INT.has(i.author);
// unanswered = open with no reply from an INTERNAL login; with none configured
// there is nobody to be internal, so it falls back to zero comments overall
export const isUnanswered = (i, D) => i.state === 'open' && (hasInternal(D) ? !i.internal_comments : !i.comments);

// People-tab-only date-range filter, on the issue's created_at. Blank bound = unbounded.
// Only filters once BOTH ends of the range are picked - a lone "From" (or "To") is treated
// as a range still being chosen, not "everything from this date onward" (or before it), so
// results don't jump the moment the first half is entered.
export const inDateRange = (i, from, to) => {
  if (!from || !to) return true;
  const d = (i.created_at || '').slice(0, 10);
  return d >= from && d <= to;
};
export const dateFilterOn = (from, to) => !!(from && to);
export const withDateFilter = (pred, from, to) => i => inDateRange(i, from, to) && pred(i);

export const UNANS_MODE = {
  all: { label: 'All unanswered', test: () => true },
  silent: { label: 'No replies at all', test: i => !i.comments },
  community: { label: 'Community replied, team did not', test: i => i.comments > 0 },
};

// KPI drill-downs: each one is a predicate over the loaded issues. Built as a function of the
// current unanswered-mode/hide-team-opened state instead of a static object, since 'unanswered'
// depends on both.
export function makeFocus(D, unansMode, hideTeamOpened, INT) {
  return {
    open: { label: 'Open issues', test: i => i.state === 'open' },
    closed: { label: 'Closed issues', test: i => i.state === 'closed' },
    unanswered: {
      label: UNANS_MODE[unansMode].label + (hideTeamOpened ? ', excluding team-opened' : ''),
      test: i => isUnanswered(i, D) && UNANS_MODE[unansMode].test(i) && (!hideTeamOpened || !teamOpened(i, INT)),
    },
    bugs: { label: 'Open bugs', test: i => i.state === 'open' && i.labels.some(l => /^bug$/i.test(l)) },
    enhancements: { label: 'Open enhancements', test: i => i.state === 'open' && i.labels.some(l => /^enhancement$/i.test(l)) },
    stale: { label: 'Stale open issues', test: i => i.state === 'open' && Date.now() - Date.parse(i.updated_at) > (D.meta.stale_days ?? 60) * 864e5 },
  };
}

// "Tickets closed" metrics. closed_by_others is derived: an authored issue that was closed,
// minus the ones the author closed themselves.
export const CLOSED_METRICS = {
  self_closed: { get: p => p.self_closed,
    note: 'Self-closed: issues whose close-event actor equals the issue author, counted per author.' },
  authored_closed: { get: p => p.authored_closed,
    note: 'Closed by author: closed issues grouped by the person who opened them, regardless of who closed them.' },
  closed_by_others: { get: p => Math.max(0, p.authored_closed - p.self_closed),
    note: 'Closed by someone else: issues this person opened that were closed by a different account.' },
  closed_by_them: { get: p => p.closed_by_them,
    note: 'Closed by this person: close actions credited to whoever closed the issue (deduped to the most recent closer).' },
};

// Overview and People are independent views. Overview describes the whole repo and ignores the
// person/date filters; People applies them and ignores Overview's KPI drill-down. `withDate`
// defaults to peopleScope but can be forced on its own (used by the date-filtered people-derive
// path, which needs the date range and any active KPI focus without narrowing to selected people).
export function filtered(D, { state, asg = [], focusTest, peopleScope = false, withDate = peopleScope, from = '', to = '' }) {
  const effectiveAsg = peopleScope ? asg : [];
  return D.issues.filter(i =>
    (state === 'all' || i.state === state) &&
    (!effectiveAsg.length || i.assignees.some(a => effectiveAsg.includes(a))) &&
    (peopleScope || !focusTest || focusTest(i)) &&
    (!withDate || inDateRange(i, from, to)));
}

// Derives per-person totals from a set of issues, same shape as data.json's people[] entries.
// Used only when a date filter is active — the precomputed D.people totals are whole-history
// and can't be sliced by date, so this recomputes the same aggregates from the filtered issues.
// Tradeoff: "comments" becomes issues-touched, not total reply count (issues don't carry
// per-comment dates), disclosed in the Comments Per Person hint when this path is active.
export function derivePeople(rows, INT) {
  const m = new Map();
  const get = l => {
    const key = l.toLowerCase();
    if (!m.has(key)) m.set(key, { login: l, internal: INT.has(l), assigned_total: 0, assigned_open: 0,
      comments: 0, closed_by_them: 0, self_closed: 0, authored: 0, authored_closed: 0 });
    return m.get(key);
  };
  for (const i of rows) {
    if (i.author) { const p = get(i.author); p.authored++; if (i.state !== 'open') p.authored_closed++; }
    for (const a of i.assignees) { const p = get(a); p.assigned_total++; if (i.state === 'open') p.assigned_open++; }
    for (const c of (i.commenters || [])) get(c).comments++;
    if (i.closed_by) {
      const p = get(i.closed_by);
      p.closed_by_them++;
      if (i.closed_by.toLowerCase() === (i.author || '').toLowerCase()) p.self_closed++;
    }
  }
  return [...m.values()];
}

// Closed issues are capped in data.json (MAX_CLOSED_KEPT), so a repo-wide count can
// legitimately exceed what's loaded. One shared explanation for every card/tile that shows
// such a count, so the wording can't drift between call sites.
export function capGapNote(expected, loadedCount, noun, closedKeptDefault) {
  if (expected == null || expected === loadedCount) return '';
  return ` · ${noun} counts ${nf.format(expected)} repo-wide; ${nf.format(Math.abs(expected - loadedCount))} ` +
    `sit outside the loaded set (all open + newest ${nf.format(closedKeptDefault || 1500)} closed)`;
}

// Only CHART_TOP bars are drawn, so say when a selection reaches past that.
export const capped = (shown, total) => total > shown
  ? `top ${nf.format(shown)} of ${nf.format(total)} selected · narrow the selection to see the rest`
  : `${nf.format(shown)} shown · respects the filters above`;

export const CHART_TOP = 25;   // bars per chart: enough to compare, few enough to read
