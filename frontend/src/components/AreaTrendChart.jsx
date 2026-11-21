/**
 * A real trend chart (not just a sparkline) — smooth area curve with a
 * gradient fill under it, axis labels, matching the "Surplus Trend" panel
 * from the reference dashboards. Built by hand in SVG (no chart library
 * dependency) using Catmull-Rom-to-Bezier smoothing so the curve doesn't
 * look like a jagged sparkline blown up to full size.
 */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i === 0 ? 0 : i - 1];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`;
  }
  return d;
}

export default function AreaTrendChart({ data, labels, color = '#2C6E8E', height = 220 }) {
  const width = 640;
  const padTop = 16;
  const padBottom = 28;
  const plotH = height - padTop - padBottom;

  if (!data || data.length < 2 || data.every((v) => v === 0)) {
    return (
      <div className="flex items-center justify-center text-sm text-ink/35" style={{ height }}>
        Not enough history yet to chart a trend
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = 0; // area charts read best anchored at zero, not the data's own min
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => [i * step, padTop + plotH - ((v - min) / range) * plotH]);

  const linePath = smoothPath(points);
  const areaPath = `${linePath} L${width},${padTop + plotH} L0,${padTop + plotH} Z`;
  const gradientId = `area-${color.replace('#', '')}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* faint horizontal gridlines */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={width} y1={padTop + plotH * f} y2={padTop + plotH * f}
          stroke="#DAD6CB" strokeWidth="1" strokeDasharray="3 4" />
      ))}
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 3.5 : 0} fill={color} />
      ))}
      {labels && labels.map((l, i) => (
        <text key={l} x={i * step} y={height - 6} fontSize="11" fill="#1C2321" fillOpacity="0.4"
          textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontFamily="monospace">
          {l}
        </text>
      ))}
    </svg>
  );
}
