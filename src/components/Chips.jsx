// `bits` is [kind, value, onRemove][] built by the caller.
export default function Chips({ bits }) {
  if (!bits.length) return null;
  return (
    <div className="chips">
      {bits.map(([k, v], n) => (
        <span key={n} className="chip">
          {k}: {v}
          <button aria-label="Remove" onClick={bits[n][2]}>×</button>
        </span>
      ))}
    </div>
  );
}
