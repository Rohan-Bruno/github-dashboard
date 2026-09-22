import { useEffect, useRef, useState } from 'react';

// Custom-styled dropdown replacing native <select> - the OS-native option list can't
// be styled and renders its own way per browser/platform, clashing with the pill UI.
export default function Dropdown({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="dd" ref={ref}>
      <button type="button" className="dd-btn" aria-haspopup="listbox" aria-expanded={open}
              aria-label={ariaLabel} onClick={() => setOpen(o => !o)}>
        {current?.label}
      </button>
      {open && (
        <ul className="dd-menu" role="listbox">
          {options.map(o => (
            <li key={o.value} role="option" aria-selected={o.value === value}
                className={o.value === value ? 'on' : ''}
                onClick={() => { onChange(o.value); setOpen(false); }}>
              <span>{o.label}</span>
              {o.desc && <small>{o.desc}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
