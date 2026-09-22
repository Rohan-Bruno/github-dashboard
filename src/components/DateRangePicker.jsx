import { useEffect, useRef, useState } from 'react';

const iso = d => d.toISOString().slice(0, 10);
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const monthStart = () => { const n = new Date(); return iso(new Date(n.getFullYear(), n.getMonth(), 1)); };
const today = () => iso(new Date());
const EARLIEST_YEAR = 2008; // GitHub's founding year - lower bound for the year segment

const PRESETS = [
  ['Last 7 days', () => ({ from: daysAgo(7), to: today() })],
  ['Last 30 days', () => ({ from: daysAgo(30), to: today() })],
  ['This month', () => ({ from: monthStart(), to: today() })],
];

const splitISO = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? { y: m[1], m: m[2], d: m[3] } : { y: '', m: '', d: '' };
};

// Three plain digit inputs (DD/MM/YYYY) instead of <input type=date> - the native date
// widget's year segment has no digit cap and just keeps accepting keystrokes, which read as
// "broken" to anyone typing a year. maxLength on a real input is the only way to actually stop
// the 5th digit.
function DateField({ value, onChange, onDirty, label }) {
  const [parts, setParts] = useState(() => splitISO(value));
  const mRef = useRef(null);
  const yRef = useRef(null);
  const calRef = useRef(null);
  useEffect(() => setParts(splitISO(value)), [value]);

  function openCalendar() {
    const el = calRef.current;
    if (!el) return;
    if (el.showPicker) el.showPicker(); else el.click();
  }

  function commit(next) {
    setParts(next);
    onDirty?.(!!(next.d || next.m || next.y));
    if (!next.d && !next.m && !next.y) { onChange(''); return; }
    if (next.d.length === 2 && next.m.length === 2 && next.y.length === 4) {
      const day = +next.d, mon = +next.m, yr = +next.y;
      if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31 && yr >= EARLIEST_YEAR) {
        onChange(`${next.y}-${next.m}-${next.d}`);
      }
    }
  }

  const digits = (raw, max) => raw.replace(/\D/g, '').slice(0, max);

  return (
    <span className="dr-field" aria-label={label}>
      <input type="text" inputMode="numeric" placeholder="DD" maxLength={2} value={parts.d}
             onChange={e => {
               const d = digits(e.target.value, 2);
               commit({ ...parts, d });
               if (d.length === 2) mRef.current?.focus();
             }} />
      <span className="dr-sep">/</span>
      <input ref={mRef} type="text" inputMode="numeric" placeholder="MM" maxLength={2} value={parts.m}
             onChange={e => {
               const m = digits(e.target.value, 2);
               commit({ ...parts, m });
               if (m.length === 2) yRef.current?.focus();
             }} />
      <span className="dr-sep">/</span>
      <input ref={yRef} type="text" inputMode="numeric" placeholder="YYYY" maxLength={4} value={parts.y}
             onChange={e => commit({ ...parts, y: digits(e.target.value, 4) })} />
      <button type="button" className="dr-cal" aria-label={`Open calendar for ${label}`} onClick={openCalendar}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input ref={calRef} type="date" className="dr-cal-input" tabIndex={-1} aria-hidden="true"
             min={`${EARLIEST_YEAR}-01-01`} max={today()}
             value={parts.d && parts.m && parts.y ? `${parts.y}-${parts.m}-${parts.d}` : ''}
             onChange={e => e.target.value && commit(splitISO(e.target.value))} />
    </span>
  );
}

export default function DateRangePicker({ from, to, onChange }) {
  const [clearTick, setClearTick] = useState(0);
  const [fromDirty, setFromDirty] = useState(false);
  const [toDirty, setToDirty] = useState(false);

  function clear() {
    setFromDirty(false); setToDirty(false);
    setClearTick(t => t + 1); // forces DateField to remount and drop any half-typed digits
    onChange({ from: '', to: '' });
  }

  return (
    <div className="dr">
      <div className="dr-fields">
        <DateField key={`from-${clearTick}`} value={from} label="From date" onDirty={setFromDirty}
                   onChange={v => onChange({ from: v, to })} />
        <span className="dr-arrow">→</span>
        <DateField key={`to-${clearTick}`} value={to} label="To date" onDirty={setToDirty}
                   onChange={v => onChange({ from, to: v })} />
      </div>
      <div className="dr-presets">
        {PRESETS.map(([label, fn]) => (
          <button key={label} type="button" onClick={() => onChange(fn())}>{label}</button>
        ))}
        <button type="button" className="dr-clear" disabled={!from && !to && !fromDirty && !toDirty}
                onClick={clear}>
          Clear
        </button>
      </div>
    </div>
  );
}
