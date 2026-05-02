function ValuesHistogram({
  values,
  secondaryValues,
  onValueClick,
  className = "",
}: {
  values: number[];
  secondaryValues?: number[];
  onValueClick?: (index: number) => void;
  className?: string;
}) {
  const pointsCount = secondaryValues ? Math.min(values.length, secondaryValues.length) : values.length;
  if (pointsCount === 0) return null;

  const height = 64;
  const barWidth = 2;
  const width = pointsCount * barWidth;
  const baseline = height / 2;
  const maxBarHeight = height / 2 - 4;
  const limit = 300;
  const pixelsPerUnit = maxBarHeight / limit;

  const BLACK_COLOR = "#000000";
  const WHITE_COLOR = "#ffffff";
  const WHITE_COMPENSATION_COLOR = "#e99";
  const BLACK_COMPENSATION_COLOR = "#611";
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full h-8 ${onValueClick ? "cursor-pointer" : ""} ${className}`.trim()}
      aria-label="Values histogram"
      role="img"
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={width} height={baseline} fill={BLACK_COLOR} />
      <rect x="0" y={baseline} width={width} height={baseline} fill={WHITE_COLOR} />
      {values.slice(0, pointsCount).map(function renderBar(value, index) {
        const normalizedValue = Math.max(-limit, Math.min(limit, value));
        const normalizedSecondaryValue = Math.max(-limit, Math.min(limit, secondaryValues?.[index] ?? value));
        const hasSameSign =
          normalizedValue !== 0 &&
          normalizedSecondaryValue !== 0 &&
          Math.sign(normalizedValue) === Math.sign(normalizedSecondaryValue);
        const primaryValue = hasSameSign
          ? Math.sign(normalizedValue) * Math.min(Math.abs(normalizedValue), Math.abs(normalizedSecondaryValue))
          : 0;
        const compensationValue = hasSameSign
          ? Math.sign(
              Math.abs(normalizedValue) >= Math.abs(normalizedSecondaryValue)
                ? normalizedValue
                : normalizedSecondaryValue,
            ) * Math.max(Math.abs(normalizedValue), Math.abs(normalizedSecondaryValue))
          : 0;

        return (
          <g
            key={index}
            onClick={
              onValueClick
                ? function handleClick() {
                    onValueClick(index);
                  }
                : undefined
            }
          >
            {hasSameSign && primaryValue !== 0 && (
              <rect
                x={index * barWidth}
                y={baseline - Math.max(primaryValue, 0) * pixelsPerUnit}
                width={barWidth}
                height={Math.abs(primaryValue) * pixelsPerUnit}
                fill={primaryValue > 0 ? WHITE_COLOR : BLACK_COLOR}
              />
            )}
            {hasSameSign && compensationValue !== primaryValue && (
              <rect
                x={index * barWidth}
                y={baseline - Math.max(primaryValue, compensationValue) * pixelsPerUnit}
                width={barWidth}
                height={Math.abs(compensationValue - primaryValue) * pixelsPerUnit}
                fill={
                  normalizedValue - normalizedSecondaryValue >= 0 ? WHITE_COMPENSATION_COLOR : BLACK_COMPENSATION_COLOR
                }
              />
            )}
            {!hasSameSign && normalizedValue !== 0 && (
              <rect
                x={index * barWidth}
                y={baseline - Math.max(normalizedValue, 0) * pixelsPerUnit}
                width={barWidth}
                height={Math.abs(normalizedValue) * pixelsPerUnit}
                fill={normalizedValue > 0 ? WHITE_COMPENSATION_COLOR : BLACK_COMPENSATION_COLOR}
              />
            )}
            {!hasSameSign && normalizedSecondaryValue !== 0 && (
              <rect
                x={index * barWidth}
                y={baseline - Math.max(normalizedSecondaryValue, 0) * pixelsPerUnit}
                width={barWidth}
                height={Math.abs(normalizedSecondaryValue) * pixelsPerUnit}
                fill={normalizedValue > 0 ? WHITE_COMPENSATION_COLOR : BLACK_COMPENSATION_COLOR}
              />
            )}
            {onValueClick && (
              <rect x={index * barWidth} y={0} width={barWidth} height={height} fill="transparent" />
            )}
          </g>
        );
      })}
      <line x1="0" y1={baseline} x2={width} y2={baseline} stroke="#9ca3af" strokeWidth="1" />
    </svg>
  );
}

export default ValuesHistogram;
