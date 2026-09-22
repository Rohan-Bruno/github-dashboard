import { useEffect, useState } from 'react';

// No., Issue, Title(flex), State, Author, Assignees, Comments, Updated - widths tuned to each
// column's typical content so header labels sit an even distance apart instead of drifting
// with leftover whitespace in the wider fixed-width columns.
const COLS = [56, 82, null, 104, 130, 136, 80, 100];
const PAGE_SIZE = 20;

export default function IssueTable({ rows, emptyMessage }) {
  const [page, setPage] = useState(1);
  // ponytail: resets on row *count* change, not content - a filter tweak that keeps the same
  // count won't snap back to page 1. Acceptable; revisit if it's ever noticed in practice.
  useEffect(() => setPage(1), [rows.length]);

  if (!rows.length && emptyMessage) return <p className="hint">{emptyMessage}</p>;

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="tablewrap">
      <div className="thead-wrap">
        <table className="thead-only">
          <colgroup>{COLS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
          <thead>
            <tr>
              <th className="rownum">No.</th><th>Issue</th><th>Title</th><th className="col-center">State</th>
              <th>Author</th><th>Assignees</th><th className="col-center">Comments</th><th>Updated</th>
            </tr>
          </thead>
        </table>
      </div>
      <div className="tablebox">
        <table>
          <colgroup>{COLS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
          <tbody>
            {pageRows.map((i, n) => (
              <tr key={i.number}>
                <td className="rownum num">{(safePage - 1) * PAGE_SIZE + n + 1}</td>
                <td><a className="num" href={i.url} target="_blank" rel="noopener">#{i.number}</a></td>
                <td>
                  {i.title}
                  {i.labels.slice(0, 3).map(l => <span key={l} className="lbl">{l}</span>)}
                </td>
                <td className="col-center"><span className={`pill ${i.state}`}>{i.state}</span></td>
                <td>{i.author ?? ''}</td>
                <td>{i.assignees.join(', ')}</td>
                <td className="num col-center">{i.comments}</td>
                <td className="num">{(i.updated_at || '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="pager">
          <button type="button" className="ghost slim" disabled={safePage <= 1}
                  onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="hint">Page {safePage} of {pageCount}</span>
          <button type="button" className="ghost slim" disabled={safePage >= pageCount}
                  onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
