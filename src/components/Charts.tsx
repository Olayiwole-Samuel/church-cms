"use client";

import { useState } from "react";

/** One series of horizontal bars, labelled directly. */
export function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r) => (
        <div className="bar-row" key={r.label} title={`${r.label}: ${r.value}`}>
          <span>{r.label}</span>
          <div className="bar-track">
            {r.value > 0 && <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />}
          </div>
          <span className="num">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Two-part share bars, with a legend and a table view for reading exact numbers. */
export function StackedBars(props: {
  rows: { label: string; a: number; b: number }[];
  aLabel: string;
  bLabel: string;
}) {
  const max = Math.max(1, ...props.rows.map((r) => r.a + r.b));
  return (
    <div>
      <div className="legend">
        <span><i />{props.aLabel}</span>
        <span><i className="s2" />{props.bLabel}</span>
      </div>
      {props.rows.map((r) => (
        <div className="bar-row" key={r.label} title={`${r.label}: ${r.a} ${props.aLabel.toLowerCase()}, ${r.b} ${props.bLabel.toLowerCase()}`}>
          <span>{r.label}</span>
          <div className="bar-track">
            {r.a > 0 && <div className="bar-fill" style={{ width: `${(r.a / max) * 100}%` }} />}
            {r.b > 0 && <div className="bar-fill s2" style={{ width: `${(r.b / max) * 100}%` }} />}
          </div>
          <span className="num">{r.a + r.b > 0 ? `${Math.round((r.a / (r.a + r.b)) * 100)}%` : "—"}</span>
        </div>
      ))}
      <details>
        <summary>Show as table</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th className="num">{props.aLabel}</th><th className="num">{props.bLabel}</th></tr></thead>
            <tbody>
              {props.rows.map((r) => (
                <tr key={r.label}><td>{r.label}</td><td className="num">{r.a}</td><td className="num">{r.b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** One series over time, with a crosshair and tooltip. The title names the series. */
export function LineChart({ points, wide, unit = "present" }: { points: { date: string; label: string; value: number }[]; wide?: boolean; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Sized close to the rendered card width, so axis text stays readable when scaled.
  const W = wide ? 760 : 360;
  const H = wide ? 240 : 170;
  const pad = { l: 30, r: 10, t: 12, b: 24 };
  // Rounded up to an even number, so the middle gridline is a true whole number.
  const max = Math.max(2, Math.ceil(Math.max(...points.map((p) => p.value)) / 2) * 2);
  const x = (i: number) => pad.l + (points.length < 2 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  return (
    <div
      className="line-chart"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - box.left) / box.width) * W;
        let best = 0;
        points.forEach((_, i) => {
          if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
        });
        setHover(best);
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${points.length} points, latest ${points[points.length - 1]?.value ?? 0} ${unit}, peak ${Math.max(...points.map((p) => p.value))}`}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(max * t)}</text>
          </g>
        ))}
        {points.length > 0 && (
          <>
            <text x={x(0)} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor={points.length < 2 ? "middle" : "start"}>{points[0].label}</text>
            {points.length > 1 && <text x={x(points.length - 1)} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="end">{points[points.length - 1].label}</text>}
          </>
        )}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeWidth="1" />}
        {points.map((p, i) =>
          i === hover || points.length === 1 || i === points.length - 1 ? (
            <circle key={p.date} cx={x(i)} cy={y(p.value)} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
          ) : null,
        )}
      </svg>
      {hover !== null && points[hover] && (
        <div className="chart-tip" style={{ left: `${Math.min(84, Math.max(16, (x(hover) / W) * 100))}%` }}>
          {points[hover].label}: <b>{points[hover].value}</b> {unit}
        </div>
      )}
    </div>
  );
}
