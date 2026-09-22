import { useEffect, useRef } from 'react';
import { Chart, chartConfig } from '../lib/charts.js';

// Mirrors the original vanilla `draw(id, type, labels, datasets, opts)` helper, which redrew
// every chart from scratch on every renderAll(). Same here: no dependency array, so this runs
// after every render and always rebuilds with fresh onClick/onHover closures over current
// filters — cheap enough for a handful of charts, and it avoids stale-closure bugs entirely.
export default function ChartCanvas({ type, labels, datasets, opts, className = '' }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const { horiz, height, config } = chartConfig(type, labels, datasets, opts);

  useEffect(() => {
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    return () => chartRef.current?.destroy();
  });

  return (
    <div className={className} style={{ position: 'relative', height: horiz ? height : 300 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
