"use client";

import { useRef, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from "recharts";

export interface DonutSlice {
  key: string;
  label: string;
  count: number;
  color: string;
}

// Recharts' pie legend renders each label in its slice's own saturated color
// at 16px; the app's charts use a smaller, muted label instead.
const LEGEND_WRAPPER_STYLE: React.CSSProperties = { fontSize: 12 };
function renderLegendLabel(value: string) {
  return <span style={{ color: "var(--foreground)", opacity: 0.7 }}>{value}</span>;
}

// Half the legend row's height — the donut (and the total in its hole) is
// centred in the space above the legend, not the whole box.
const LEGEND_HEIGHT = 36;

/**
 * The status-breakdown donut. Hovering a slice eases it outward and fades
 * the others back, and a tooltip follows the cursor itself — Recharts' own
 * pie tooltip instead jumps between fixed anchor points per slice, which
 * felt stuck rather than tracking the mouse.
 */
export default function StatusDonut({
  data,
  total,
  totalLabel,
  onSliceClick,
}: {
  data: DonutSlice[];
  total: number;
  totalLabel: string;
  onSliceClick: (slice: DonutSlice) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // Which slice is under the cursor (drives the highlight and visibility),
  // and which one the tooltip is describing — kept separately so the
  // tooltip keeps its text while fading out instead of emptying instantly.
  const [hovered, setHovered] = useState<number | null>(null);
  const [described, setDescribed] = useState(0);

  // Moves the tooltip straight through the DOM on every mouse move rather
  // than via state, so following the cursor doesn't re-render the chart.
  function followMouse(e: React.MouseEvent) {
    const box = boxRef.current?.getBoundingClientRect();
    const tip = tipRef.current;
    if (!box || !tip) return;
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    // Flip to the other side of the cursor rather than run off the card.
    const left = x + 16 + w > box.width ? x - 16 - w : x + 16;
    const top = Math.max(0, y - h - 10);
    tip.style.transform = `translate(${left}px, ${top}px)`;
  }

  const slice = data[described];
  const sum = data.reduce((acc, d) => acc + d.count, 0);

  return (
    <div
      ref={boxRef}
      className="relative h-full"
      onMouseMove={followMouse}
      onMouseLeave={() => setHovered(null)}
    >
      {/* debounce throttles ResponsiveContainer's ResizeObserver callback —
          without it, a resize triggered mid-animation can retrigger another
          render before the browser settles, spiraling into a hang. */}
      <ResponsiveContainer width="100%" height="100%" debounce={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            // Recharts' own entrance animation gets stuck mid-arc in this
            // layout — the hover motion below is plain CSS instead.
            isAnimationActive={false}
            onMouseEnter={(_, index) => {
              setHovered(index);
              setDescribed(index);
            }}
            onMouseLeave={() => setHovered(null)}
          >
            {data.map((row, i) => (
              <Cell
                key={row.key}
                fill={row.color}
                stroke="none"
                cursor="pointer"
                onClick={() => onSliceClick(row)}
                style={{
                  transformBox: "view-box",
                  transformOrigin: `50% calc(50% - ${LEGEND_HEIGHT / 2}px)`,
                  transform: hovered === i ? "scale(1.06)" : "scale(1)",
                  opacity: hovered === null || hovered === i ? 1 : 0.4,
                  transition: "transform 220ms ease-out, opacity 220ms ease-out",
                  outline: "none",
                }}
              />
            ))}
          </Pie>
          <Legend
            verticalAlign="bottom"
            height={LEGEND_HEIGHT}
            wrapperStyle={LEGEND_WRAPPER_STYLE}
            formatter={renderLegendLabel}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* The total, in the donut's hole. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        style={{ transform: `translateY(-${LEGEND_HEIGHT / 2}px)` }}
      >
        <span className="text-2xl font-bold text-foreground">{total}</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/40">{totalLabel}</span>
      </div>

      <div
        ref={tipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground shadow-lg"
        style={{
          opacity: hovered === null ? 0 : 1,
          // A short glide so it trails the cursor smoothly instead of
          // snapping pixel to pixel.
          transition: "opacity 150ms ease-out, transform 90ms ease-out",
        }}
      >
        {slice && (
          <>
            <div className="flex items-center gap-2 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
              {slice.label}
            </div>
            <div className="mt-0.5 text-foreground/70">
              {slice.count} · {sum ? Math.round((slice.count / sum) * 100) : 0}%
            </div>
          </>
        )}
      </div>
    </div>
  );
}
