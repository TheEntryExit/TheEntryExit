const defaultColors = ['#2563eb', '#16a34a', '#f97316'];

function buildPath(points) {
  if (!points.length) {
    return '';
  }
  return points.reduce((path, point, index) => {
    const command = index === 0 ? 'M' : 'L';
    return `${path} ${command}${point.x},${point.y}`;
  }, '');
}

export default function LineChart({ series, height = 240 }) {
  const allPoints = series.flatMap((item) => item.points);
  if (!allPoints.length) {
    return <div className="chart chart--empty">No data yet.</div>;
  }

  const padding = 24;
  const width = 640;
  const minY = Math.min(...allPoints.map((point) => point.value));
  const maxY = Math.max(...allPoints.map((point) => point.value));
  const yRange = maxY - minY || 1;
  const maxX = Math.max(...allPoints.map((point) => point.index));

  const toSvgPoint = (point) => {
    const x = padding + (point.index / (maxX || 1)) * (width - padding * 2);
    const y = padding + (1 - (point.value - minY) / yRange) * (height - padding * 2);
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  };

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5f5" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#cbd5f5" />
        {series.map((item, index) => {
          const color = item.color || defaultColors[index % defaultColors.length];
          const points = item.points.map((point) => ({
            ...point,
            ...toSvgPoint(point)
          }));
          return (
            <g key={item.label}>
              <path d={buildPath(points)} fill="none" stroke={color} strokeWidth="2" />
              {points.map((point) => (
                <circle key={`${item.label}-${point.index}`} cx={point.x} cy={point.y} r="3" fill={color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="chart__legend">
        {series.map((item, index) => (
          <div key={item.label} className="chart__legend-item">
            <span
              className="chart__legend-swatch"
              style={{ backgroundColor: item.color || defaultColors[index % defaultColors.length] }}
            />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
