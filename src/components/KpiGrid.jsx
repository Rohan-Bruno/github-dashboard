import { nf } from '../lib/format.js';

// `tiles` is [key, label, value, accentVar][]. `focus` is the active drilldown key or null.
export default function KpiGrid({ tiles, focus, onToggle, unansExtra }) {
  return (
    <div className="kpis">
      {tiles.map(([key, label, value, accent]) => {
        const active = focus === key;
        const go = () => onToggle(key);
        return (
          <div key={key} className={`kpi click${active ? ' on' : ''}`} style={{ '--accent': accent }}
               role="button" tabIndex={0} onClick={go}
               onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
            <b className="num">{nf.format(value ?? 0)}</b>
            <span>{label}</span>
            <small>{key === 'unanswered' && active ? unansExtra : 'click to list'}</small>
          </div>
        );
      })}
    </div>
  );
}
