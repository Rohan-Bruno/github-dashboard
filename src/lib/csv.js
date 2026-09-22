export function toCSV(rows, cols) {
  const field = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.map(c => field(c[0])).join(','), ...rows.map(r => cols.map(c => field(c[1](r))).join(','))].join('\n');
}

// Builds a descriptive CSV filename from the active filters, e.g. "open-bugs_alice-bob_2024-01-01_to_2024-02-01.csv".
export function exportFilename(base, { label, names, from, to } = {}) {
  const slug = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const parts = [base];
  if (label) parts.push(slug(label));
  if (names?.length) parts.push(names.slice(0, 5).map(slug).join('-') + (names.length > 5 ? `-+${names.length - 5}` : ''));
  if (from || to) parts.push(`${from || 'start'}_to_${to || 'now'}`);
  return `${parts.join('_')}.csv`;
}

export function downloadCSV(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
