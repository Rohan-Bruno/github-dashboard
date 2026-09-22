import { useEffect, useRef } from 'react';

const ROWS = (d) => [
  ['Unanswered', 'KPI + totals chart', d.unanswered || 'Open issue with zero comments.'],
  ['Assigned', 'Assigned issues', d.assigned_scope || 'Open and closed, counted once per assignee.'],
  ['Authored', 'Authored issues', 'Issues opened by a login; "closed" counts those now closed, regardless of who closed them.'],
  ['Comments', 'Comments per person', d.comment_scope || 'Non-PR issue comments only.'],
  ['Close events', 'Tickets closed', d.close_events || 'Deduped to the most recent closer per issue.'],
  ['Duplicates', 'Duplicates tab', d.duplicates || 'Label, state reason, or title similarity.'],
];

// "How these are measured" — lives in the page header, visible on every tab.
export default function InfoPopover({ meta, open, onToggle, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = e => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [onClose]);

  const rows = ROWS(meta.definitions || {});

  return (
    <span ref={ref} className={`info${open ? ' open' : ''}`} id="howInfo" tabIndex={0} role="button"
          onClick={e => { if (!e.target.closest('.pop')) onToggle(); }}>
      <span className="info-text">How these are measured</span> <span className="i">i</span>
      <span className="pop defs">
        <div className="pop-head">How these are measured<span className="k">{meta.repo || ''}</span></div>
        <dl className="deflist">
          {rows.map(([k, where, text]) => (
            <div className="row" key={k}>
              <dt>{k}<small>{where}</small></dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        {meta.events_capped && (
          <div className="pop-foot">
            <span className="warn">&#9888;</span>
            <span>GitHub caps close-event history, so closes are only attributable since{' '}
              <b>{(meta.events_since || '').slice(0, 10)}</b> - anything closed before that has no known actor.</span>
          </div>
        )}
      </span>
    </span>
  );
}
