import { useEffect, useMemo, useRef, useState } from 'react';
import { nf } from './lib/format.js';
import { loadData, FALLBACK } from './lib/data.js';
import {
  excluded, internalSet, hasInternal, teamOpened, isUnanswered,
  dateFilterOn, withDateFilter, makeFocus, CLOSED_METRICS,
  filtered, derivePeople, capGapNote, capped, CHART_TOP,
} from './lib/filters.js';
import { palette, styleCharts } from './lib/charts.js';
import { toCSV, downloadCSV, exportFilename } from './lib/csv.js';
import ChartCanvas from './components/ChartCanvas.jsx';
import IssueTable from './components/IssueTable.jsx';
import PersonCard from './components/PersonCard.jsx';
import Chips from './components/Chips.jsx';
import InfoPopover from './components/InfoPopover.jsx';
import DupesList from './components/DupesList.jsx';
import KpiGrid from './components/KpiGrid.jsx';
import Dropdown from './components/Dropdown.jsx';
import DateRangePicker from './components/DateRangePicker.jsx';

const TABLE_CAP = 1500;

const CLOSED_METRIC_OPTIONS = [
  ['self_closed', 'Self-closed', 'author closed their own'],
  ['authored_closed', 'Closed by author', 'their issues, any closer'],
  ['closed_by_others', 'Closed by someone else', 'their issues'],
  ['closed_by_them', 'Closed by this person', 'any author'],
];

export default function App() {
  const [D, setD] = useState(FALLBACK);
  const [activeTab, setActiveTab] = useState('overview');
  const tabStateRef = useRef({ overview: 'all', people: 'all', dupes: 'all' });
  const [stateFilter, setStateFilter] = useState('all');
  const [focus, setFocus] = useState(null);
  const [unansMode, setUnansMode] = useState('all');
  const [hideTeamOpened, setHideTeamOpened] = useState(false);
  const [asgSelected, setAsgSelected] = useState([]);
  const [asgSearch, setAsgSearch] = useState('');
  const [asgMode, setAsgMode] = useState('contains');
  const [internalOnly, setInternalOnly] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ovDateFrom, setOvDateFrom] = useState('');
  const [ovDateTo, setOvDateTo] = useState('');
  const [peopleFocus, setPeopleFocus] = useState(null); // { title, test, expected }
  const [closedMetric, setClosedMetric] = useState('self_closed');
  const [totalsType, setTotalsType] = useState('doughnut');
  const [dupeFilter, setDupeFilter] = useState('all');
  const [howInfoOpen, setHowInfoOpen] = useState(false);
  const [theme, setTheme] = useState(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  const tableCardRef = useRef(null);
  const peopleIssuesRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved) { document.documentElement.setAttribute('data-theme', saved); setTheme(saved); }
    } catch {}
    styleCharts();
    loadData().then(setD);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    setTheme(next);
    styleCharts();
    setD(d => ({ ...d })); // force chart colors to redraw from the new CSS vars
  }

  const INT = useMemo(() => internalSet(D.meta.internal), [D]);
  const FOCUS = useMemo(() => makeFocus(D, unansMode, hideTeamOpened, INT), [D, unansMode, hideTeamOpened, INT]);

  // assignees AND authors, so someone who only ever opened issues (never got assigned one)
  // is still selectable and shows up in the Authored Issues chart
  const peopleOptions = useMemo(() => [...new Set(D.issues.flatMap(i => [...i.assignees, i.author]).filter(Boolean))]
    .filter(a => !excluded(a)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())), [D]);

  const asgMatches = login => {
    if (internalOnly && !INT.has(login)) return false;
    const q = asgSearch.toLowerCase();
    if (!q) return true;
    const has = login.toLowerCase().includes(q);
    return asgMode === 'notcontains' ? !has : has;
  };
  const visiblePeople = peopleOptions.filter(asgMatches);

  function switchTab(tab) {
    tabStateRef.current[activeTab] = stateFilter;
    setActiveTab(tab);
    setStateFilter(tabStateRef.current[tab]);
  }

  function resetAll() {
    tabStateRef.current = { overview: 'all', people: 'all', dupes: 'all' };
    setStateFilter('all'); setFocus(null); setPeopleFocus(null);
    setAsgSearch(''); setAsgMode('contains'); setDateFrom(''); setDateTo(''); setInternalOnly(true);
    setUnansMode('all'); setHideTeamOpened(false); setAsgSelected([]); setOvDateFrom(''); setOvDateTo('');
  }

  function showPeopleIssues(title, test, expected = null) {
    setPeopleFocus({ title, test, expected });
    requestAnimationFrame(() => peopleIssuesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function showCommentedBy(login) {
    if (!D.issues.some(i => i.commenters)) {
      alert('This data.json predates commenter tracking - re-run fetch_data.mjs to enable it.');
      return;
    }
    const l = login.toLowerCase();
    showPeopleIssues(`Issues ${login} commented on`, withDateFilter(i => (i.commenters || []).some(c => c.toLowerCase() === l), dateFrom, dateTo));
  }

  // ---------------------------------------------------------------- overview
  const overviewRows = filtered(D, { state: stateFilter, focusTest: focus ? FOCUS[focus].test : null,
    peopleScope: false, withDate: true, from: ovDateFrom, to: ovDateTo });
  const openF = overviewRows.filter(i => i.state === 'open');
  const unansweredF = openF.filter(i => isUnanswered(i, D)).length;
  const unansLabel = hasInternal(D) ? 'Unanswered (no internal reply)' : 'Unanswered (0 comments)';
  const unansAll = D.issues.filter(i => isUnanswered(i, D));
  const silent = unansAll.filter(i => !i.comments).length;
  const community = unansAll.length - silent;
  const bugsCount = D.issues.filter(FOCUS.bugs.test).length;
  const enhancementsCount = D.issues.filter(FOCUS.enhancements.test).length;
  const KPI_TOTAL = { open: D.summary.open, closed: D.summary.closed, unanswered: D.summary.unanswered,
    bugs: bugsCount, enhancements: enhancementsCount, stale: D.summary.stale };

  const kpiTiles = [
    ['open', 'Open', D.summary.open, 'var(--open)'],
    ['closed', 'Closed', D.summary.closed, 'var(--closed)'],
    ['unanswered', hasInternal(D) ? 'Unanswered · no internal reply' : 'Unanswered · 0 comments', D.summary.unanswered, 'var(--warn)'],
    ['bugs', 'Open bugs', bugsCount, 'var(--bad)'],
    ['enhancements', 'Open enhancements', enhancementsCount, 'var(--good)'],
    ['stale', 'Stale open', D.summary.stale, 'var(--ink-3)'],
  ];

  function onKpiToggle(key) {
    setFocus(f => (f === key ? null : key));
    requestAnimationFrame(() => tableCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const p = palette();
  const ovDateOn = dateFilterOn(ovDateFrom, ovDateTo);
  const closedCount = (stateFilter === 'all' && !focus && !ovDateOn) ? D.summary.closed : overviewRows.length - openF.length;

  const closedKeptDefault = D.meta.counts?.closed_kept || 1500;
  const overviewExpected = focus ? KPI_TOTAL[focus] : null;
  const overviewGap = capGapNote(overviewExpected, overviewRows.length, 'card', closedKeptDefault);
  const tableNote = (overviewRows.length > TABLE_CAP
    ? `showing first ${nf.format(TABLE_CAP)} of ${nf.format(overviewRows.length)}` : `${nf.format(overviewRows.length)} rows`) + overviewGap;

  const unansBase = D.issues.filter(i => isUnanswered(i, D) && (!hideTeamOpened || !teamOpened(i, INT)));
  const unansCounts = { all: unansBase.length, silent: unansBase.filter(i => !i.comments).length };
  unansCounts.community = unansCounts.all - unansCounts.silent;
  const unansTeamOpened = D.issues.filter(i => isUnanswered(i, D) && teamOpened(i, INT)).length;

  // ------------------------------------------------------------------ people
  const chosen = asgSelected.length > 0;
  const inScope = l => !excluded(l) && (!internalOnly || INT.has(l));
  const peopleMatchRows = filtered(D, { state: stateFilter, asg: asgSelected, peopleScope: true, from: dateFrom, to: dateTo });
  const assignedCounts = new Map(); // login -> [open, closed]
  for (const i of peopleMatchRows) for (const a of i.assignees) {
    if (!assignedCounts.has(a)) assignedCounts.set(a, [0, 0]);
    assignedCounts.get(a)[i.state === 'open' ? 0 : 1]++;
  }
  const assignedRanked = [...assignedCounts].filter(([l]) => inScope(l) && asgSelected.includes(l))
    .sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1]));
  const assignedRows = assignedRanked.slice(0, CHART_TOP);

  const dateOn = dateFilterOn(dateFrom, dateTo);
  const peopleSource = dateOn
    ? derivePeople(filtered(D, { state: stateFilter, focusTest: focus ? FOCUS[focus].test : null, peopleScope: false, withDate: true, from: dateFrom, to: dateTo }), INT)
    : (D.people || []);
  const people = peopleSource.filter(q => inScope(q.login) && asgSelected.includes(q.login));
  const val = (q, key) => (CLOSED_METRICS[key] ? CLOSED_METRICS[key].get(q) : q[key]);
  const top = key => [...people].sort((a, b) => val(b, key) - val(a, key)).slice(0, CHART_TOP);

  const commentsTop = top('comments');
  const closedTop = top(closedMetric);
  const authoredTop = top('authored');
  const selectedPerson = asgSelected.length === 1
    ? peopleSource.find(q => q.login.toLowerCase() === asgSelected[0].toLowerCase()) : null;

  let personStats = [];
  if (selectedPerson) {
    const l = selectedPerson.login.toLowerCase();
    const is = v => String(v || '').toLowerCase() === l;
    const mine = i => i.assignees.some(a => is(a));
    const wdf = pred => withDateFilter(pred, dateFrom, dateTo);
    personStats = [
      ['Assigned total', selectedPerson.assigned_total, `Issues assigned to ${selectedPerson.login}`, wdf(mine)],
      ['Assigned open', selectedPerson.assigned_open, `Open issues assigned to ${selectedPerson.login}`, wdf(i => mine(i) && i.state === 'open')],
      ['Comments', selectedPerson.comments, `Issues ${selectedPerson.login} commented on`,
        wdf(i => (i.commenters || []).some(c => is(c))), false],
      ['Authored', selectedPerson.authored, `Issues opened by ${selectedPerson.login}`, wdf(i => is(i.author))],
      ['Closed by author', selectedPerson.authored_closed, `Closed issues opened by ${selectedPerson.login}`,
        wdf(i => is(i.author) && i.state === 'closed')],
      ['Self-closed', selectedPerson.self_closed, `Issues ${selectedPerson.login} opened and closed themselves`,
        wdf(i => is(i.author) && is(i.closed_by))],
      ['Closed by someone else', CLOSED_METRICS.closed_by_others.get(selectedPerson),
        `Issues ${selectedPerson.login} opened, closed by someone else`,
        wdf(i => is(i.author) && i.state === 'closed' && !is(i.closed_by))],
      ['Closed by this person', selectedPerson.closed_by_them, `Issues closed by ${selectedPerson.login}`, wdf(i => is(i.closed_by))],
    ];
  }

  // ------------------------------------------------------------------- dupes
  const dupeList = (D.duplicates || []).filter(c => dupeFilter === 'all' || c.reason === dupeFilter);
  const closedKept = D.meta.counts?.closed_kept;
  const closedGap = closedKept != null && D.summary.closed > closedKept
    ? ` · only searched the newest ${nf.format(closedKept)} of ${nf.format(D.summary.closed)} closed issues; older ones were not compared`
    : '';
  const dupeNote = `${nf.format(dupeList.length)} of ${nf.format((D.duplicates || []).length)}${closedGap}`;

  // -------------------------------------------------------------------- chips
  const chipBits = [];
  if (focus && activeTab === 'overview') chipBits.push(['focus', FOCUS[focus].label, () => setFocus(null)]);
  if (stateFilter !== 'all') chipBits.push(['state', stateFilter, () => setStateFilter('all')]);
  if (activeTab === 'overview' && ovDateOn)
    chipBits.push(['date', `${ovDateFrom} → ${ovDateTo}`, () => { setOvDateFrom(''); setOvDateTo(''); }]);
  if (activeTab === 'people') {
    if (dateFilterOn(dateFrom, dateTo))
      chipBits.push(['date', `${dateFrom} → ${dateTo}`, () => { setDateFrom(''); setDateTo(''); }]);
  }

  const fCount = activeTab === 'people'
    ? (chosen ? `${nf.format(asgSelected.length)} selected · ${nf.format(peopleMatchRows.length)} of their issues match` : 'nobody selected yet')
    : `${nf.format(overviewRows.length)} of ${nf.format(D.issues.length)} loaded issues match`;

  const src = D.meta.source || 'fallback';

  return (
    <>
      <header>
        <div className="bar">
          <div className="mark" aria-hidden="true">B</div>
          <div>
            <div className="repo-row">
              <span className="repo">Bruno GitHub Issues Dashboard</span>
              <span className={`badge ${src === 'live' ? 'live' : 'sample'}`}>{src}</span>
            </div>
            <div className="meta" id="stamp"
                 title={`${src} · ${D.meta.repo} · refreshed ${D.meta.generated_at ? new Date(D.meta.generated_at).toLocaleString() : 'n/a'} · ${nf.format((D.meta.internal || []).length)} internal logins`}>
              <span>{D.meta.repo}</span>
              <span className="dot"></span><span>refreshed {D.meta.generated_at ? new Date(D.meta.generated_at).toLocaleString() : 'n/a'}</span>
              <span className="dot"></span><span>{nf.format((D.meta.internal || []).length)} internal logins</span>
              {D.meta.counts?.expected_issues != null && (
                <>
                  <span className="dot"></span>
                  <span>{nf.format(D.summary.open + D.summary.closed)} of {nf.format(D.meta.counts.expected_issues)} issues indexed</span>
                </>
              )}
            </div>
          </div>
          <div className="bar-actions">
            <InfoPopover meta={D.meta} open={howInfoOpen} onToggle={() => setHowInfoOpen(o => !o)} onClose={() => setHowInfoOpen(false)} />
            <button className="icon-btn" title="Toggle theme" aria-label="Toggle theme" onClick={toggleTheme}>
              {theme === 'dark' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <nav id="tabs">
          {['overview', 'people', 'dupes'].map(t => (
            <button key={t} data-tab={t} aria-selected={activeTab === t} onClick={() => switchTab(t)}>
              {t === 'overview' ? 'Overview' : t === 'people' ? 'People' : 'Duplicates'}
            </button>
          ))}
        </nav>
      </header>

      <main>
        <div className="card filters-card">
          <header><h2>Filters</h2><span className="hint">{fCount}</span>
            <span className="spacer"></span><button className="ghost" onClick={resetAll}>Reset all</button></header>
          <div className="filters">
            <div className="field">
              <label>State</label>
              <div className="seg">
                {['all', 'open', 'closed'].map(v => (
                  <button key={v} aria-pressed={stateFilter === v} onClick={() => setStateFilter(v)}>
                    {v === 'all' ? 'All' : v === 'open' ? 'Open' : 'Closed'}
                  </button>
                ))}
              </div>
            </div>
            {activeTab === 'overview' && (
              <div className="field" id="overviewDateField">
                <label>Date range <span className="hint">(issue created)</span></label>
                <DateRangePicker from={ovDateFrom} to={ovDateTo}
                                 onChange={({ from, to }) => { setOvDateFrom(from); setOvDateTo(to); }} />
              </div>
            )}
            {activeTab === 'people' && (
              <div className="field grow" id="asgField">
                <label>Assignees &amp; authors <span className="hint"> ({nf.format(visiblePeople.length)} shown)</span></label>
                <div className="field-row asg-row">
                  <div className="seg" role="group" aria-label="Match mode">
                    {[['contains', 'Contains'], ['notcontains', 'Excludes']].map(([v, label]) => (
                      <button key={v} type="button" aria-pressed={asgMode === v} onClick={() => setAsgMode(v)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="search-wrap">
                    <input type="search" placeholder="Filter names…" autoComplete="off" value={asgSearch}
                           onChange={e => setAsgSearch(e.target.value)} />
                    {asgSearch && (
                      <button type="button" className="search-clear" aria-label="Clear filter" onClick={() => setAsgSearch('')}>×</button>
                    )}
                  </div>
                </div>
                <div className="people-actions">
                  <button className="ghost slim" type="button" disabled={!asgSearch}
                          onClick={() => setAsgSelected(prev => [...new Set([...prev, ...visiblePeople])])}>
                    Select shown
                  </button>
                  <button className="ghost slim" type="button" disabled={!asgSelected.length}
                          onClick={() => setAsgSelected([])}>
                    Clear selection
                  </button>
                  <span className="hint">{nf.format(asgSelected.length)} selected</span>
                </div>
                <div className="people-list" role="group" aria-label="People">
                  {visiblePeople.length === 0 && <div className="people-empty">No matches</div>}
                  {visiblePeople.map(l => {
                    const on = asgSelected.includes(l);
                    return (
                      <label key={l} className="people-opt">
                        <input type="checkbox" checked={on}
                               onChange={() => setAsgSelected(prev => on ? prev.filter(x => x !== l) : [...prev, l])} />
                        <span>{l}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {activeTab === 'people' && (
              <div className="field" id="internalField">
                <label>Scope</label>
                <label className="check slim">
                  <input type="checkbox" checked={internalOnly} onChange={e => {
                    const checked = e.target.checked;
                    setInternalOnly(checked);
                    if (checked) setAsgSelected(prev => prev.filter(l => INT.has(l)));
                  }} />
                  Bruno Team
                </label>
              </div>
            )}
            {activeTab === 'people' && (
              <div className="field" id="dateField">
                <label>Date range <span className="hint">(issue created)</span></label>
                <DateRangePicker from={dateFrom} to={dateTo}
                                 onChange={({ from, to }) => { setDateFrom(from); setDateTo(to); }} />
              </div>
            )}
          </div>
          <Chips bits={chipBits} />
        </div>

        {activeTab === 'overview' && (
          <section id="tab-overview">
            <KpiGrid tiles={kpiTiles} focus={focus} onToggle={onKpiToggle}
                     unansExtra={`${nf.format(silent)} no replies · ${nf.format(community)} community only`} />
            <div className="card">
              <header><h2>Total Issues</h2>
                <span className="spacer"></span>
                <Dropdown ariaLabel="Chart type" value={totalsType} onChange={setTotalsType}
                          options={[{ value: 'doughnut', label: 'Donut' }, { value: 'bar', label: 'Bar' }]} />
              </header>
              <ChartCanvas type={totalsType} labels={['Open', 'Closed', unansLabel]}
                           datasets={[{ label: 'issues in filter', data: [openF.length, closedCount, unansweredF],
                                        backgroundColor: [p[0], p[5], p[2]] }]} />
            </div>
            <div className="card" ref={tableCardRef}>
              <header><h2>{focus ? FOCUS[focus].label : 'Issues'}</h2><span className="hint">{tableNote}</span>
                <span className="spacer"></span>
                {focus && <button className="ghost" onClick={() => setFocus(null)}>Clear Selection</button>}
                <button className="ghost" onClick={() => downloadCSV(exportFilename('issues', {
                  label: focus ? FOCUS[focus].label : (stateFilter !== 'all' ? `${stateFilter} issues` : null),
                  from: ovDateFrom, to: ovDateTo,
                }), toCSV(overviewRows, [
                  ['Number', i => i.number], ['Title', i => i.title], ['State', i => i.state],
                  ['Author', i => i.author || ''], ['Assignees', i => i.assignees.join('; ')],
                  ['Labels', i => i.labels.join('; ')], ['Comments', i => i.comments],
                  ['Created', i => i.created_at || ''], ['Updated', i => i.updated_at || ''],
                  ['Closed', i => i.closed_at || ''], ['URL', i => i.url],
                ]))}>Export CSV</button>
              </header>
              {focus === 'unanswered' && (
                <div className="subbar" id="unansBar">
                  <div className="seg">
                    {[['all', 'All'], ['silent', 'No replies'], ['community', 'Community only']].map(([v, label]) => (
                      <button key={v} aria-pressed={unansMode === v} onClick={() => setUnansMode(v)}>
                        {label} {nf.format(unansCounts[v])}
                      </button>
                    ))}
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={hideTeamOpened} onChange={e => setHideTeamOpened(e.target.checked)} />
                    Hide issues the team opened
                  </label>
                  <span className="hint">
                    No replies = nobody commented at all. Community only = someone outside the team replied, nobody on the team did.
                    {' '}{nf.format(unansTeamOpened)} unanswered issues were opened by the team itself{hideTeamOpened ? ' (currently hidden)' : ''}.
                  </span>
                </div>
              )}
              <IssueTable rows={overviewRows.slice(0, TABLE_CAP)} />
            </div>
          </section>
        )}

        {activeTab === 'people' && (
          <section id="tab-people">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              <button className="ghost" disabled={!chosen}
                      onClick={() => chosen && downloadCSV(exportFilename('people', {
                        label: stateFilter !== 'all' ? `${stateFilter} issues` : null,
                        names: asgSelected, from: dateFrom, to: dateTo,
                      }), toCSV(people, [
                        ['Login', q => q.login], ['Internal', q => (q.internal ? 'yes' : 'no')],
                        ['Assigned total', q => q.assigned_total], ['Assigned open', q => q.assigned_open],
                        ['Comments', q => q.comments], ['Authored', q => q.authored], ['Authored closed', q => q.authored_closed],
                        ['Self closed', q => q.self_closed], ['Closed by them', q => q.closed_by_them],
                        ['Closed by others', q => CLOSED_METRICS.closed_by_others.get(q)],
                      ]))}>
                Export CSV
              </button>
            </div>
            {selectedPerson && (
              <PersonCard login={selectedPerson.login} internal={selectedPerson.internal} stats={personStats}
                          onDrill={showPeopleIssues} />
            )}
            {!chosen && (
              <div className="card">
                <div className="empty"><b>Pick someone to see their numbers</b>
                  Select one or more people in the filters above - the charts stay hidden until then.</div>
              </div>
            )}
            {chosen && (
              <div className="grid">
                <div className="card">
                  <header><h2>Assigned Issues</h2><span className="hint">Open vs Closed, once per assignee</span></header>
                  <div className="chartscroll">
                    <ChartCanvas type="bar" labels={assignedRows.map(r => r[0])}
                                 datasets={[
                                   { label: 'open', data: assignedRows.map(r => r[1][0]), backgroundColor: p[0] },
                                   { label: 'closed', data: assignedRows.map(r => r[1][1]), backgroundColor: p[5] },
                                 ]}
                                 opts={{
                                   onClick: (e, els, chart) => {
                                     if (!els.length) return;
                                     const who = chart.data.labels[els[0].index], l = who.toLowerCase();
                                     const state = els[0].datasetIndex === 0 ? 'open' : 'closed';
                                     showPeopleIssues(`${state === 'open' ? 'Open' : 'Closed'} issues assigned to ${who}`,
                                       withDateFilter(i => i.state === state && i.assignees.some(a => a.toLowerCase() === l), dateFrom, dateTo));
                                   },
                                   onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                                 }} />
                  </div>
                  <div className="hint" style={{ marginTop: 10 }}>{capped(assignedRows.length, assignedRanked.length)}</div>
                  <div className="chart-hint">Click a bar to list those issues.</div>
                </div>
                <div className="card">
                  <header><h2>Authored Issues</h2><span className="hint">Created vs closed, per author</span></header>
                  <div className="chartscroll">
                    <ChartCanvas type="bar" labels={authoredTop.map(q => q.login)}
                                 datasets={[
                                   { label: 'created', data: authoredTop.map(q => q.authored), backgroundColor: p[4] },
                                   { label: 'closed', data: authoredTop.map(q => q.authored_closed), backgroundColor: p[5] },
                                 ]}
                                 opts={{
                                   onClick: (e, els, chart) => {
                                     if (!els.length) return;
                                     const who = chart.data.labels[els[0].index], l = who.toLowerCase();
                                     const closedOnly = els[0].datasetIndex === 1;
                                     showPeopleIssues(`Issues authored by ${who}${closedOnly ? ' (closed)' : ''}`,
                                       withDateFilter(i => (i.author || '').toLowerCase() === l && (!closedOnly || i.state === 'closed'), dateFrom, dateTo));
                                   },
                                   onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                                 }} />
                  </div>
                  <div className="hint" style={{ marginTop: 10 }}>{capped(authoredTop.length, people.length)}</div>
                  <div className="chart-hint">Click a bar to list those issues.</div>
                </div>
                <div className="card">
                  <header><h2>Comments Per Person</h2><span className="hint">{nf.format(asgSelected.length)} selected</span></header>
                  <div className="chartscroll">
                    <ChartCanvas type="bar" labels={commentsTop.map(q => q.login)}
                                 datasets={[{ label: 'comments', data: commentsTop.map(q => q.comments), backgroundColor: p[1] }]}
                                 opts={{
                                   onClick: (e, els, chart) => { if (els.length) showCommentedBy(chart.data.labels[els[0].index]); },
                                   onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                                 }} />
                  </div>
                  <div className="hint" style={{ marginTop: 10 }}>
                    {capped(commentsTop.length, people.length)}
                    {dateOn ? ' · date-filtered: comments = issues touched, not total replies' : ' · whole-history totals'}
                  </div>
                  <div className="chart-hint">Click a bar to list the issues that person commented on.</div>
                </div>
                <div className="card">
                  <header><h2>Tickets Closed</h2>
                    <span className="spacer"></span>
                    <Dropdown ariaLabel="Closed metric" value={closedMetric} onChange={setClosedMetric}
                              options={CLOSED_METRIC_OPTIONS.map(([v, label, desc]) => ({ value: v, label, desc }))} />
                  </header>
                  <div className="chartscroll">
                    <ChartCanvas type="bar" labels={closedTop.map(q => q.login)}
                                 datasets={[{ label: CLOSED_METRIC_OPTIONS.find(([v]) => v === closedMetric)[1],
                                              data: closedTop.map(q => val(q, closedMetric)), backgroundColor: p[4] }]}
                                 opts={{
                                   onClick: (e, els, chart) => {
                                     if (!els.length) return;
                                     const who = chart.data.labels[els[0].index], l = who.toLowerCase();
                                     const is = v => String(v || '').toLowerCase() === l;
                                     const tests = {
                                       self_closed: i => is(i.author) && is(i.closed_by),
                                       authored_closed: i => is(i.author) && i.state === 'closed',
                                       closed_by_others: i => is(i.author) && i.state === 'closed' && !is(i.closed_by),
                                       closed_by_them: i => is(i.closed_by),
                                     };
                                     const names = { self_closed: 'self-closed by', authored_closed: 'opened and now closed, by',
                                       closed_by_others: 'opened by (closed by someone else)', closed_by_them: 'closed by' };
                                     showPeopleIssues(`Issues ${names[closedMetric]} ${who}`, withDateFilter(tests[closedMetric], dateFrom, dateTo));
                                   },
                                   onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                                 }} />
                  </div>
                  <div className="hint" style={{ marginTop: 10 }}>{capped(closedTop.length, people.length)} · {CLOSED_METRICS[closedMetric].note}</div>
                  <div className="chart-hint">Click a bar to list those issues.</div>
                </div>
              </div>
            )}
            <div ref={peopleIssuesRef}>
              {peopleFocus && (
                <div className="card">
                  <header><h2>{peopleFocus.title}</h2>
                    <span className="hint">
                      {(() => {
                        const rows = D.issues.filter(peopleFocus.test);
                        const gap = capGapNote(peopleFocus.expected, rows.length, 'tile', closedKeptDefault);
                        return (rows.length > TABLE_CAP ? `showing first ${nf.format(TABLE_CAP)} of ${nf.format(rows.length)}` : `${nf.format(rows.length)} rows`) + gap;
                      })()}
                    </span>
                    <span className="spacer"></span>
                    <button className="ghost" onClick={() => setPeopleFocus(null)}>Close</button>
                  </header>
                  <IssueTable rows={D.issues.filter(peopleFocus.test).slice(0, TABLE_CAP)}
                              emptyMessage="No issues in the loaded set match - older closed issues are outside the table cap." />
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'dupes' && (
          <section id="tab-dupes">
            <div className="note">Heuristic - title-similarity clusters <b>over-match</b>. Issues that merely share vocabulary
              ("crash on save" / "crash on export") can land together. Treat each cluster as a lead, not a verdict.</div>
            <div className="card" style={{ marginTop: 20 }}>
              <header><h2>Duplicate findings</h2><span className="hint">{dupeNote}</span>
                <span className="spacer"></span>
                <Dropdown ariaLabel="Filter by reason" value={dupeFilter} onChange={setDupeFilter}
                          options={[
                            { value: 'all', label: 'All reasons' },
                            { value: 'title-similarity', label: 'Title similarity' },
                            { value: 'label', label: 'Label' },
                            { value: 'state_reason', label: 'State reason' },
                          ]} />
              </header>
              <DupesList repo={D.meta.repo} list={dupeList} />
            </div>
          </section>
        )}
      </main>
    </>
  );
}
