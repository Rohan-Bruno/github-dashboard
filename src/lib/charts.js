import { Chart } from 'chart.js/auto';
import { css, nf } from './format.js';

export { Chart };

export const palette = () => [css('--open'), css('--good'), css('--warn'), css('--bad'), css('--brand'), css('--closed')];

export function styleCharts() {
  Chart.defaults.font.family = "-apple-system, 'SF Pro Display', 'Segoe UI', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.font.weight = 500;
  Chart.defaults.color = css('--ink-2');
  Chart.defaults.borderColor = css('--line');
  Chart.defaults.plugins.tooltip.backgroundColor = css('--ink');
  Chart.defaults.plugins.tooltip.titleColor = css('--panel');
  Chart.defaults.plugins.tooltip.bodyColor = css('--panel');
  Chart.defaults.plugins.tooltip.titleFont = { weight: 700, family: "'JetBrains Mono', ui-monospace, monospace" };
  Chart.defaults.plugins.tooltip.padding = 11;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.displayColors = false;
}

// values printed inside doughnut slices — a 15-line plugin beats another CDN dependency
export const sliceValues = {
  id: 'sliceValues',
  afterDatasetsDraw(chart) {
    if (chart.config.type !== 'doughnut') return;
    const { ctx } = chart;
    chart.getDatasetMeta(0).data.forEach((arc, i) => {
      const v = chart.data.datasets[0].data[i];
      if (!v || arc.circumference < 0.25) return;      // skip slivers with no room for text
      const { x, y } = arc.getCenterPoint();
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.font = "600 13px -apple-system, sans-serif";
      ctx.fillText(nf.format(v), x, y);
      ctx.restore();
    });
  },
};

// Builds the Chart.js config object shared by every chart on the page: horizontal-bar
// auto-height past 14 labels, standard grid/legend/scale defaults, opts spread last so a
// caller's onClick/onHover/scales always win.
export function chartConfig(type, labels, datasets, opts = {}) {
  const horiz = type === 'bar' && labels.length > 14;
  const grid = { color: css('--line-2'), drawTicks: false };
  const count = { beginAtZero: true, ticks: { precision: 0, padding: 6 }, grid, border: { display: false } };
  const cat = { ticks: { padding: 6, autoSkip: false }, grid: { display: false }, border: { display: false } };
  return {
    horiz,
    height: horiz ? Math.max(300, labels.length * 26 + 70) : 300,
    config: {
      type, plugins: [sliceValues],
      data: { labels, datasets: datasets.map(d => ({ borderRadius: 5, borderWidth: 0, maxBarThickness: 34, borderSkipped: false, ...d })) },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: horiz ? 'y' : 'x',
        layout: { padding: { top: 4 } },
        plugins: { legend: { display: datasets.length > 1 || type === 'doughnut',
                             position: type === 'doughnut' ? 'right' : 'top', align: 'end',
                             labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 14 } } },
        scales: type === 'doughnut' ? {} : (horiz ? { x: count, y: cat } : { x: cat, y: count }),
        ...opts,
      },
    },
  };
}
