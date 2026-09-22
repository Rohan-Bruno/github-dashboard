#!/usr/bin/env node
// GitHub issues dashboard fetcher. Node 20+, built-in fetch, zero dependencies.
// Writes a single data.json consumed by index.html.
//
// Run: OWNER=usebruno REPO=bruno INTERNAL=alice,bob GITHUB_TOKEN=ghp_... node fetch_data.mjs

// Load .env if present. Real environment variables win over the file, so CI secrets
// and one-off `OWNER=x node fetch_data.mjs` overrides still take precedence.
try { process.loadEnvFile(new URL('.env', import.meta.url)); } catch { /* no .env, fine */ }

// ---------------------------------------------------------------- config
const OWNER    = process.env.OWNER  || 'usebruno';
const REPO     = process.env.REPO   || 'bruno';
const INTERNAL = (process.env.INTERNAL || '').split(',').map(s => s.trim()).filter(Boolean);
// GitHub logins are case-insensitive; compare lowercased so a casing mismatch between the
// configured list and the API's canonical casing cannot silently mark someone external.
const INTERNAL_SET = new Set(INTERNAL.map(l => l.toLowerCase()));
const isInternal = l => !!l && INTERNAL_SET.has(l.toLowerCase());
const TOKEN    = process.env.GITHUB_TOKEN || '';
const OUT      = process.env.OUT || './data.json';

const DROP_BOTS       = process.env.DROP_BOTS !== '0';      // drop logins matching /\[bot\]$/i
const MAX_CLOSED_KEPT = +(process.env.MAX_CLOSED_KEPT || 1500); // table cap only; COUNTS stay exact
const SIM_THRESHOLD   = +(process.env.SIM_THRESHOLD   || 0.75); // title token-set Jaccard
const STALE_DAYS      = +(process.env.STALE_DAYS      || 60);
const BACKFILL_GAPS   = process.env.BACKFILL_GAPS !== '0';       // fetch issues the list endpoints missed
const BACKFILL_CONC   = +(process.env.BACKFILL_CONC || 8);       // parallel requests during backfill
const MAX_RATE_WAIT_MS = +(process.env.MAX_RATE_WAIT_MS || 300000); // give up rather than sleep an hour
const DUP_LABEL_RE    = /^duplicate$/i;
const BUG_LABEL_RE    = /^bug$/i;   // exact label, not any label containing "bug"
const BOT_RE          = /\[bot\]$/i;

// ------------------------------------------------- metric interpretations
// Every ambiguous definition lives here and is printed on every run.
const DEF = {
  unanswered:      'open issue with ZERO comments from an INTERNAL login (falls back to zero comments overall when INTERNAL is empty)',
  assigned_scope:  'issues assigned to a login, open AND closed; an issue with N assignees counts once for each of them',
  closed_primary:  'self_closed = close-event actor === issue author (per unique issue)',
  closed_secondary:'authored_closed = closed issues grouped by their author, regardless of who closed them',
  close_events:    'deduped to the MOST RECENT close event per issue, so a reopen+reclose counts once',
  comment_scope:   'comments on non-PR issues only: each comment is mapped via issue_url to the known issue set, PR comments dropped',
  duplicates:      `(a) label matching ${DUP_LABEL_RE} or state_reason duplicate/not_planned; (b) normalized-title token-set Jaccard >= ${SIM_THRESHOLD}`,
  stale:           `open issue with no update in ${STALE_DAYS} days`,
  open_bugs:       `open issue with a label matching ${BUG_LABEL_RE}`,
};

console.log('--- config ---');
console.log({ OWNER, REPO, INTERNAL, token: TOKEN ? `set (${TOKEN.length} chars)` : 'MISSING (60 req/hr)',
              DROP_BOTS, MAX_CLOSED_KEPT, SIM_THRESHOLD, STALE_DAYS, OUT });
console.log('--- metric interpretations ---');
for (const [k, v] of Object.entries(DEF)) console.log(`  ${k}: ${v}`);
console.log('---');

// ------------------------------------------------------------------ http
async function req(url, tries = 0, soft = []) {
  const res = await fetch(url, { headers: {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'issues-dashboard',
    ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
  }});
  if (res.ok || res.status === 422 || soft.includes(res.status)) return res;   // 422 = pagination cap
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = +(res.headers.get('x-ratelimit-reset') || 0);
  if ((res.status === 403 || res.status === 429) && remaining === '0' && tries < 2) {
    const waitMs = Math.max(0, reset * 1000 - Date.now()) + 1000;
    if (waitMs > MAX_RATE_WAIT_MS) throw new Error(
      `rate limit exhausted, resets in ${Math.round(waitMs / 60000)} min — that is longer than ` +
      `MAX_RATE_WAIT_MS (${MAX_RATE_WAIT_MS}ms). Set GITHUB_TOKEN to a PAT (5,000 req/hr) and rerun.`);
    console.error(`rate limit hit, sleeping ${Math.round(waitMs / 1000)}s until reset`);
    await new Promise(r => setTimeout(r, waitMs));
    return req(url, tries + 1);
  }
  throw new Error(`${res.status} ${res.statusText} ${url}\n${(await res.text()).slice(0, 300)}`);
}

// GitHub serves short and sometimes EMPTY pages for large repos on /issues, and drops the
// rel="next" link long before the end — following Link cost us 90% of this repo's issues.
// So: page by explicit offset, tolerate empty pages, dedupe by id (pages can overlap), and
// stop when GitHub refuses to paginate further (422).
const EMPTY_PAGE_TOLERANCE = +(process.env.EMPTY_PAGE_TOLERANCE || 5);

async function paginate(path, params = {}) {
  const out = new Map();
  let page = 1, empties = 0, capped = false;
  while (empties < EMPTY_PAGE_TOLERANCE) {
    const url = new URL(`https://api.github.com${path}`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await req(url.toString());
    const body = await res.json();
    if (res.status === 422) {
      if (!/pagination is limited/i.test(body.message || '')) throw new Error(`422 ${url}: ${body.message}`);
      capped = true;
      break;
    }
    if (!Array.isArray(body)) throw new Error(`expected array from ${url}, got ${JSON.stringify(body).slice(0, 200)}`);
    page++;
    if (!body.length) { empties++; continue; }
    empties = 0;
    // id is always present on real API objects; fall back to position so a payload
    // without one is not silently collapsed into a single row
    body.forEach((it, i) => out.set(it.id ?? it.number ?? `${page}:${i}`, it));
    if (page % 25 === 0) console.log(`  ${path}: ${out.size} rows...`);
  }
  console.log(`  ${path}: ${out.size} rows (${page - 1} pages${capped ? ', CAPPED by GitHub' : ''})`);
  return { rows: [...out.values()], capped };
}

// Ground truth for completeness. The Search API counts what the list endpoint should return.
async function searchCount(q) {
  const url = `https://api.github.com/search/issues?per_page=1&q=${encodeURIComponent(`repo:${OWNER}/${REPO} ${q}`)}`;
  try { return (await (await req(url)).json()).total_count ?? null; } catch { return null; }
}

// ------------------------------------------------- near-duplicate titles
const STOPWORDS = new Set(('a an the and or but if then when while is are was were be been being am do does did done ' +
  'to of in on for with without at by from as it its this that these those not no nor so than too very can cannot ' +
  'cant could should would will just i we you my our your me us they them there here what which who how why ' +
  'issue issues bug error problem feature request support help please add new use using work works working doesnt ' +
  'does not after before again still when').split(/\s+/));

const titleTokens = t => new Set(String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w)));

const jaccard = (a, b) => {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};

// ponytail: union-find over pairs that share at least one rare token. O(n^2) inside each
// token bucket, buckets > 150 skipped (pairs still meet via a rarer shared token).
// Upgrade path if this ever gets slow: MinHash/LSH.
function nearDuplicateClusters(issues) {
  const toks = issues.map(i => titleTokens(i.title));
  const parent = issues.map((_, i) => i);
  const find = x => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };

  const index = new Map();
  toks.forEach((set, i) => { for (const t of set) { if (!index.has(t)) index.set(t, []); index.get(t).push(i); } });

  const seen = new Set();
  for (const bucket of index.values()) {
    if (bucket.length > 150) continue;
    for (let x = 0; x < bucket.length; x++) for (let y = x + 1; y < bucket.length; y++) {
      const key = `${bucket[x]}:${bucket[y]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (toks[bucket[x]].size && toks[bucket[y]].size &&
          jaccard(toks[bucket[x]], toks[bucket[y]]) >= SIM_THRESHOLD) union(bucket[x], bucket[y]);
    }
  }

  const groups = new Map();
  issues.forEach((_, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });
  return [...groups.values()].filter(g => g.length >= 2)
    .map(g => g.map(i => issues[i]));
}

// self-check: node fetch_data.mjs --self-test  (no network, exits before fetching)
if (process.argv[2] === '--self-test') {
  const { strict: a } = await import('node:assert');
  a.deepEqual([...titleTokens('Cannot import  the Postman collection!!')], ['import', 'postman', 'collection']);
  a.equal(jaccard(titleTokens('dark mode toggle broken'), titleTokens('Dark mode toggle is broken')), 1);
  a.ok(jaccard(titleTokens('grpc support'), titleTokens('websocket support')) < SIM_THRESHOLD);
  const cl = nearDuplicateClusters([
    { number: 1, title: 'Cannot import Postman collection' },
    { number: 2, title: 'cannot import postman collection!' },
    { number: 3, title: 'Add gRPC support' },
  ]);
  a.equal(cl.length, 1);
  a.deepEqual(cl[0].map(i => i.number), [1, 2]);
  console.log('self-test ok');
  process.exit(0);
}

// ------------------------------------------------------------------ main
const login = u => (u && u.login) || null;
const keepLogin = l => !!l && !(DROP_BOTS && BOT_RE.test(l));

// state=all is capped at page 100 and under-delivers; walking each state separately and
// unioning gets materially more (measured on usebruno/bruno: 1271 open vs 1042 via state=all).
// Pages come back short and sometimes empty on big repos, so neither walk can be trusted alone.
const walks = [];
for (const state of ['open', 'closed', 'all']) {
  const { rows } = await paginate(`/repos/${OWNER}/${REPO}/issues`, { state });
  walks.push(...rows);
}
let raw = [...new Map(walks.map(i => [i.id, i])).values()];
console.log(`  union of state walks: ${raw.length} unique items (${walks.length} fetched)`);
// The list endpoints drop items on large repos (short pages, empty pages, a hard 422 past
// page 100). Issue numbers are dense and shared with PRs, so every hole is fetchable directly.
// This is what makes the open/closed counts exact rather than "most of them".
if (BACKFILL_GAPS && raw.length) {
  const known = new Set(raw.map(i => i.number));
  const highest = Math.max(...known);
  const missing = [];
  for (let n = 1; n <= highest; n++) if (!known.has(n)) missing.push(n);
  console.log(`  backfill: ${missing.length} numbers missing below #${highest}, fetching with ${BACKFILL_CONC} workers`);

  const repoUrl = `https://api.github.com/repos/${OWNER}/${REPO}`.toLowerCase();
  let added = 0, gone = 0, failed = 0, moved = 0;
  const queue = missing.slice();
  await Promise.all(Array.from({ length: BACKFILL_CONC }, async () => {
    while (queue.length) {
      const n = queue.shift();
      try {
        const res = await req(`https://api.github.com/repos/${OWNER}/${REPO}/issues/${n}`, 0, [404, 410]);
        if (!res.ok) { gone++; continue; }       // deleted or never existed
        const item = await res.json();
        // An issue transferred to another repo still answers on its OLD url, but the object
        // returned belongs to the repo it moved to — different issue, different number, often
        // still open there. Keep only issues that actually still live in this repo.
        if (String(item.repository_url || '').toLowerCase() !== repoUrl) { moved++; continue; }
        raw.push(item);
        added++;
      } catch (e) {
        failed++;
        if (failed === 1) console.log(`  backfill: first failure — ${e.message.split('\n')[0]}`);
      }
      const done = added + gone + failed + moved;
      if (done % 500 === 0) console.log(`  backfill: ${done}/${missing.length} (${added} recovered)`);
    }
  }));
  console.log(`  backfill: recovered ${added}, ${gone} gone (404/410), ${moved} transferred to another repo, ${failed} failed`);
}

// One record per issue NUMBER, keeping the freshest. The state walks run minutes apart, so an
// issue closed mid-run comes back from both the open walk and the closed walk; deduping by id
// does not catch that when the two payloads differ, and the issue then inflates BOTH counts.
{
  const byNum = new Map();
  for (const it of raw) {
    const prev = byNum.get(it.number);
    if (!prev || Date.parse(it.updated_at || 0) >= Date.parse(prev.updated_at || 0)) byNum.set(it.number, it);
  }
  if (byNum.size !== raw.length) console.log(`  deduped ${raw.length - byNum.size} repeated issue numbers (state changed mid-run)`);
  raw = [...byNum.values()];
}

const issues = raw.filter(i => !i.pull_request);   // PRs are issues in this API; drop them
console.log(`  issues: ${issues.length} (dropped ${raw.length - issues.length} pull requests)`);

// Completeness gate. The list endpoint is flaky on big repos, so compare against the
// Search API and refuse to write a dashboard that is missing most of its data.
const expectedIssues = await searchCount('is:issue');
if (expectedIssues != null) {
  const pct = expectedIssues ? Math.round(issues.length / expectedIssues * 100) : 100;
  console.log(`  completeness: fetched ${issues.length} of ${expectedIssues} issues the search API reports (${pct}%)`);
  if (issues.length < expectedIssues * 0.5) throw new Error(
    `only got ${issues.length} of ~${expectedIssues} issues — refusing to write a half-empty data.json. Run again.`);
  if (issues.length < expectedIssues * 0.95) console.log('  WARNING: issue list looks short; rerun if the numbers matter');
}

const issueNums = new Set(issues.map(i => i.number));
const byNumber  = new Map(issues.map(i => [i.number, i]));

const { rows: rawComments } = await paginate(`/repos/${OWNER}/${REPO}/issues/comments`);
const { rows: rawEvents, capped: eventsCapped } = await paginate(`/repos/${OWNER}/${REPO}/issues/events`);

// comments: keep only those whose issue_url resolves to a known non-PR issue
const commentsBy = new Map();
const internalCommentsOn = new Map();   // issue number -> comments from an INTERNAL login
const commentersOn = new Map();         // issue number -> unique logins who commented
let prComments = 0;
for (const c of rawComments) {
  const n = +String(c.issue_url || '').split('/').pop();
  if (!issueNums.has(n)) { prComments++; continue; }
  const l = login(c.user);
  if (!keepLogin(l)) continue;
  commentsBy.set(l, (commentsBy.get(l) || 0) + 1);
  if (isInternal(l)) internalCommentsOn.set(n, (internalCommentsOn.get(n) || 0) + 1);
  if (!commentersOn.has(n)) commentersOn.set(n, new Set());
  commentersOn.get(n).add(l);
}
console.log(`  comments: kept ${[...commentsBy.values()].reduce((a, b) => a + b, 0)}, dropped ${prComments} on PRs/unknown issues`);

// close events: latest closer per unique issue
const closerOf = new Map(); // issue number -> { login, at }
for (const e of rawEvents) {
  if (e.event !== 'closed' || !e.issue || e.issue.pull_request) continue;
  if (!issueNums.has(e.issue.number)) continue;
  const prev = closerOf.get(e.issue.number);
  if (!prev || e.created_at > prev.at) closerOf.set(e.issue.number, { login: login(e.actor), at: e.created_at });
}
const eventsSince = eventsCapped
  ? rawEvents.map(e => e.created_at).sort()[0] || null   // oldest event we could reach
  : null;
console.log(`  close events: ${closerOf.size} unique issues with a known closer`
  + (eventsCapped ? ` (capped by GitHub: only events since ${eventsSince} are reachable)` : ''));

// ------------------------------------------------------------- aggregate
const now = Date.now();
const staleCut = now - STALE_DAYS * 864e5;

const people = new Map();
const person = l => {
  if (!people.has(l)) people.set(l, { login: l, internal: isInternal(l), assigned_total: 0,
    assigned_open: 0, comments: 0, closed_by_them: 0, self_closed: 0, authored: 0, authored_closed: 0 });
  return people.get(l);
};
INTERNAL.forEach(person);                                  // internal logins always present, even at zero
for (const [l, n] of commentsBy) person(l).comments = n;

let open = 0, closed = 0, unanswered = 0, open_bugs = 0, stale = 0;

for (const i of issues) {
  const isOpen = i.state === 'open';
  const labels = (i.labels || []).map(l => l.name || l);
  if (isOpen) {
    open++;
    // unanswered: no INTERNAL reply. With INTERNAL unset there is nobody to be "internal",
    // so it degrades to the plain zero-comments reading rather than flagging every open issue.
    if (INTERNAL.length ? (internalCommentsOn.get(i.number) || 0) === 0 : i.comments === 0) unanswered++;
    if (labels.some(l => BUG_LABEL_RE.test(l))) open_bugs++;
    if (Date.parse(i.updated_at) < staleCut) stale++;
  } else closed++;

  const author = login(i.user);
  if (keepLogin(author)) {
    const p = person(author);
    p.authored++;
    if (!isOpen) p.authored_closed++;
  }
  for (const a of i.assignees || []) {
    const l = login(a);
    if (!keepLogin(l)) continue;
    const p = person(l);
    p.assigned_total++;
    if (isOpen) p.assigned_open++;
  }
}

for (const [num, { login: closer }] of closerOf) {
  if (!keepLogin(closer)) continue;
  person(closer).closed_by_them++;
  if (closer === login(byNumber.get(num)?.user)) person(closer).self_closed++;
}

// ------------------------------------------------------------ issue table
const slim = i => ({
  number: i.number, title: i.title, state: i.state,
  labels: (i.labels || []).map(l => l.name || l),
  author: login(i.user), assignees: (i.assignees || []).map(login).filter(Boolean),
  comments: i.comments, internal_comments: internalCommentsOn.get(i.number) || 0,
  commenters: [...(commentersOn.get(i.number) || [])],
  created_at: i.created_at, updated_at: i.updated_at,
  closed_at: i.closed_at, state_reason: i.state_reason || null,
  closed_by: closerOf.get(i.number)?.login || null, url: i.html_url,
});

const openIssues   = issues.filter(i => i.state === 'open');
const closedIssues = issues.filter(i => i.state !== 'open')
  .sort((a, b) => Date.parse(b.closed_at || b.updated_at) - Date.parse(a.closed_at || a.updated_at))
  .slice(0, MAX_CLOSED_KEPT);
const exported = [...openIssues, ...closedIssues].map(slim);
if (closed > closedIssues.length) console.log(`  table capped: kept ${closedIssues.length} of ${closed} closed issues (counts still exact)`);

// ------------------------------------------------------------- duplicates
const duplicates = [];
for (const i of exported) {
  // one finding per issue: an issue carrying both the label and a duplicate state_reason
  // is reported once, as 'label', with the state_reason kept in detail.
  const byLabel  = i.labels.some(l => DUP_LABEL_RE.test(l));
  const byReason = !!i.state_reason && /duplicate|not_planned/i.test(i.state_reason);
  if (byLabel || byReason)
    duplicates.push({ reason: byLabel ? 'label' : 'state_reason', detail: i.state_reason || undefined,
                      members: [{ number: i.number, title: i.title, state: i.state }] });
}
for (const g of nearDuplicateClusters(exported))
  duplicates.push({ reason: 'title-similarity', threshold: SIM_THRESHOLD,
    members: g.map(i => ({ number: i.number, title: i.title, state: i.state })) });

// ------------------------------------------------------------------ write
const data = {
  meta: { repo: `${OWNER}/${REPO}`, generated_at: new Date().toISOString(), source: 'live',
          internal: INTERNAL, definitions: DEF,
          // GitHub caps /issues/events at 30,000 (newest first), so close attribution only
          // reaches back to events_since. Closes older than that have no known actor.
          events_capped: !!eventsCapped, events_since: eventsSince,
          counts: { issues_total: issues.length, expected_issues: expectedIssues,
                    closed_kept: closedIssues.length, prs_excluded: raw.length - issues.length } },
  summary: { open, closed, unanswered, open_bugs, stale },
  issues: exported,
  people: [...people.values()].sort((a, b) => b.assigned_total - a.assigned_total || a.login.localeCompare(b.login)),
  duplicates,
};

await (await import('node:fs/promises')).writeFile(OUT, JSON.stringify(data, null, 2));
console.log(`wrote ${OUT}: ${data.summary.open} open / ${data.summary.closed} closed, ` +
            `${data.people.length} people, ${duplicates.length} duplicate findings`);
