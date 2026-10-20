export type ChartPoint = { t: string; v: number };

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** Gráfico de linha em SVG, largura responsiva. `compact` = sparkline sem eixos. `band` = faixa de referência. */
export function LineChart({ points, band, unit, color = "var(--ink)", compact }: {
  points: ChartPoint[];
  band?: { low: number | null; high: number | null };
  unit: string;
  color?: string;
  compact?: boolean;
}) {
  const pts = [...points].sort((a, b) => a.t.localeCompare(b.t));
  if (!pts.length) return null;

  const W = 320;
  const H = compact ? 44 : 150;
  const padL = compact ? 4 : 34, padR = compact ? 4 : 10, padT = 8, padB = compact ? 8 : 22;
  const vals = pts.map((p) => p.v);
  const lows = [...vals, band?.low ?? Infinity].filter(Number.isFinite);
  const highs = [...vals, band?.high ?? -Infinity].filter(Number.isFinite);
  let lo = Math.min(...(compact ? vals : lows)), hi = Math.max(...(compact ? vals : highs));
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;

  const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts[pts.length - 1].t);
  const x = (t: string) => (t1 === t0 ? (padL + W - padR) / 2 : padL + ((Date.parse(t) - t0) / (t1 - t0)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];

  const bTop = band && (band.high ?? hi), bBot = band && (band.low ?? lo);
  const yTop = bTop != null ? y(Math.min(bTop, hi)) : 0;
  const yBot = bBot != null ? y(Math.max(bBot, lo)) : 0;

  return (
    <svg className={`linechart${compact ? " compact" : ""}`} viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`Gráfico, último valor ${fmt(last.v)} ${unit}`}>
      {band && !compact && yBot > yTop && (
        <rect x={padL} y={yTop} width={W - padL - padR} height={yBot - yTop} fill={color} opacity={0.1} />
      )}
      {!compact && (
        <g className="chart-axis">
          <text x={padL - 5} y={y(hi - pad) + 3} textAnchor="end">{fmt(hi - pad)}</text>
          <text x={padL - 5} y={y(lo + pad) + 3} textAnchor="end">{fmt(lo + pad)}</text>
          <text x={padL} y={H - 5}>{fmtDate(pts[0].t)}</text>
          {pts.length > 1 && <text x={W - padR} y={H - 5} textAnchor="end">{fmtDate(last.t)}</text>}
        </g>
      )}
      {pts.length > 1 && <path d={line} fill="none" stroke={color} strokeWidth={compact ? 1.6 : 2} strokeLinejoin="round" strokeLinecap="round" />}
      {(compact ? [last] : pts).map((p) => (
        <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={compact ? 2.5 : 3} fill={color}>
          <title>{`${fmtDate(p.t)}: ${fmt(p.v)} ${unit}`}</title>
        </circle>
      ))}
    </svg>
  );
}
