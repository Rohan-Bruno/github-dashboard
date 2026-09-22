export default function DupesList({ repo, list }) {
  if (!list.length) return <p className="hint">No duplicate findings.</p>;
  return (
    <>
      {list.slice(0, 300).map((c, ci) => (
        <div className="clu" key={ci}>
          <span className="tag">
            {c.reason}{c.detail ? ` · ${c.detail}` : ''}{c.threshold ? ` · jaccard ≥ ${c.threshold}` : ''}
          </span>
          <ul>
            {c.members.map(m => (
              <li key={m.number}>
                <a className="num" href={`https://github.com/${repo}/issues/${m.number}`} target="_blank" rel="noopener">
                  #{m.number}
                </a>{' '}
                {m.title} <span className={`pill ${m.state}`}>{m.state}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
