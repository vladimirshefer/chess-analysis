function ValuesHistogram({ values, className = "" }: { values: number[]; className?: string }) {
  if (values.length === 0) return null;

  const height = 64;
  const width = values.length * 2;
  const baseline = height / 2;
  const maxBarHeight = height / 2 - 4;
  const limit = 600;

  const BLACK_COLOR = "#000000";
  const WHITE_COLOR = "#ffffff";
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full h-8 ${className}`.trim()}
      aria-label="Values histogram"
      role="img"
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={width} height={baseline} fill={BLACK_COLOR} />
      <rect x="0" y={baseline} width={width} height={baseline} fill={WHITE_COLOR} />
      <line x1="0" y1={baseline} x2={width} y2={baseline} stroke="#9ca3af" strokeWidth="1" />
      {values.map(function renderBar(value, index) {
        const normalizedValue = Math.max(-limit, Math.min(limit, value));
        const barHeight = (Math.abs(normalizedValue) / limit) * maxBarHeight;
        const y = normalizedValue >= 0 ? baseline - barHeight : baseline;

        return (
          <rect
            key={index}
            x={index * 2 - 0.1}
            y={y}
            width="2.2"
            height={barHeight}
            fill={normalizedValue >= 0 ? WHITE_COLOR : BLACK_COLOR}
          />
        );
      })}
    </svg>
  );
}

export default ValuesHistogram;
