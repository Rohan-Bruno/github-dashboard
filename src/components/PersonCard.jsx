import { nf } from '../lib/format.js';

// `stats` is [label, value, drilldownTitle, testFn, countsIssues?][], pre-built by the caller
// (App) since the test predicates need to close over the current date-range filter.
export default function PersonCard({ login, internal, stats, onDrill }) {
  return (
    <div className="card">
      <header>
        <h2>{login}</h2>
        <span className="badge">{internal ? 'internal' : 'external'}</span>
        <span className="hint">every chart below is scoped to this person · click a tile to list its issues</span>
      </header>
      <div className="person">
        {stats.map(([label, value, title, test, countsIssues = true], n) => {
          const go = () => onDrill(title, test, countsIssues ? value : null);
          return (
            <div key={n} className="stat" role="button" tabIndex={0} onClick={go}
                 onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
              <b className="num">{nf.format(value || 0)}</b>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
