// Tiny fallback so the page renders from file:// or before data.json exists.
export const FALLBACK = {
  meta: { repo: 'sample/sample', generated_at: '', source: 'fallback', internal: [], definitions: {}, stale_days: 60 },
  summary: { open: 2, closed: 1, unanswered: 1, open_bugs: 1, stale: 0 },
  issues: [
    { number: 1, title: 'sample open issue', state: 'open', labels: ['bug'], author: 'octocat', assignees: ['octocat'],
      comments: 0, internal_comments: 0, created_at: '', updated_at: '', closed_at: null, state_reason: null,
      closed_by: null, commenters: [], url: '#' },
    { number: 2, title: 'sample open issue two', state: 'open', labels: [], author: 'devx', assignees: [],
      comments: 3, internal_comments: 1, created_at: '', updated_at: '', closed_at: null, state_reason: null,
      closed_by: null, commenters: ['octocat'], url: '#' },
    { number: 3, title: 'sample closed issue', state: 'closed', labels: [], author: 'devx', assignees: ['octocat'],
      comments: 1, internal_comments: 1, created_at: '', updated_at: '', closed_at: '', state_reason: 'completed',
      closed_by: 'devx', commenters: ['octocat'], url: '#' },
  ],
  // devx self-closed #3 (the only closed sample issue), so closed_by_them must include that
  // close for devx too — self_closed can never exceed closed_by_them for the same person.
  people: [
    { login: 'octocat', internal: true, assigned_total: 2, assigned_open: 1, comments: 4, closed_by_them: 0,
      self_closed: 0, authored: 1, authored_closed: 0 },
    { login: 'devx', internal: false, assigned_total: 0, assigned_open: 0, comments: 2, closed_by_them: 1,
      self_closed: 1, authored: 2, authored_closed: 1 },
  ],
  duplicates: [],
};

export async function loadData() {
  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (e) {
    console.warn('data.json unavailable, using built-in fallback sample:', e.message);
    return FALLBACK;
  }
}
