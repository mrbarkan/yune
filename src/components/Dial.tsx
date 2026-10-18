import type { DayData } from "@/lib/data";
import { hourOf, sameDay } from "@/lib/time";

/**
 * O dia como um relógio de 24h. Meia-noite no topo, meio-dia embaixo.
 * Anel externo: água (traços). Faixa principal: sono. Anel médio: movimento. Pontos: refeições.
 * Anel interno: progresso de calorias em relação à meta.
 */
const SIZE = 360;
const C = SIZE / 2;
const R_LABEL = 171;
const R_TICK = 150;
const R_SLEEP = 136;
const R_WATER = 116;
const R_MOVE = 102;
const R_FOOD = 82;
const R_GOAL = 64;

const angle = (h: number) => (h / 24) * Math.PI * 2 - Math.PI / 2;
const pt = (r: number, h: number) => [C + r * Math.cos(angle(h)), C + r * Math.sin(angle(h))] as const;

function arc(r: number, h0: number, h1: number) {
  const span = Math.max(0.0001, Math.min(h1 - h0, 23.999));
  const [x0, y0] = pt(r, h0);
  const [x1, y1] = pt(r, h0 + span);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${x1} ${y1}`;
}

type Props = {
  day: Date;
  data: DayData;
  kcalGoal: number;
  size?: number;
  minimal?: boolean;
  children?: React.ReactNode;
};

export function Dial({ day, data, kcalGoal, size = SIZE, minimal = false, children }: Props) {
  const now = new Date();
  const isToday = sameDay(day, now);
  const nowH = hourOf(now, day);
  const kcalIn = data.meals.reduce((s, m) => s + m.kcal, 0);
  const goalFrac = Math.min(kcalIn / Math.max(kcalGoal, 1), 1);
  const over = kcalIn > kcalGoal;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={size} height={size} className="dial" role="img"
      aria-label="Linha do tempo circular do dia">
      {/* mostrador */}
      {Array.from({ length: 96 }, (_, i) => {
        const h = i / 4;
        const major = i % 24 === 0;
        const hour = i % 4 === 0;
        if (minimal && !major) return null;
        const r1 = R_TICK;
        const r2 = r1 + (major ? 9 : hour ? 5 : 2.5);
        const [x1, y1] = pt(r1, h);
        const [x2, y2] = pt(r2, h);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={major ? "tick tick-major" : "tick"} />;
      })}
      {!minimal &&
        [0, 6, 12, 18].map((h) => {
          const [x, y] = pt(R_LABEL, h);
          return (
            <text key={h} x={x} y={y} className="dial-hour" textAnchor="middle" dominantBaseline="central">
              {String(h).padStart(2, "0")}
            </text>
          );
        })}

      {/* trilhos */}
      <circle cx={C} cy={C} r={R_SLEEP} className="track" strokeWidth={16} />
      <circle cx={C} cy={C} r={R_MOVE} className="track" strokeWidth={8} />
      <circle cx={C} cy={C} r={R_WATER} className="track hair" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_GOAL} className="track" strokeWidth={2} />

      {/* sono */}
      {data.sleep.map((s) => {
        const h0 = Math.max(hourOf(s.bed_at, day), 0);
        const h1 = s.wake_at ? Math.min(hourOf(s.wake_at, day), 24) : Math.min(nowH, 24);
        if (h1 <= h0) return null;
        return <path key={s.id} d={arc(R_SLEEP, h0, h1)} className={s.wake_at ? "sleep-arc" : "sleep-arc open"} strokeWidth={16} />;
      })}

      {/* movimento */}
      {data.activities.map((a) => {
        const h0 = hourOf(a.started_at, day);
        return <path key={a.id} d={arc(R_MOVE, h0, h0 + Math.max(a.duration_min, 12) / 60)} className="move-arc" strokeWidth={8} />;
      })}

      {/* refeições */}
      {data.meals.map((m) => {
        const [x, y] = pt(R_FOOD, hourOf(m.eaten_at, day));
        return <circle key={m.id} cx={x} cy={y} r={Math.min(3 + Math.sqrt(m.kcal) / 3.2, 13)} className="meal-dot" />;
      })}

      {/* água */}
      {data.water.map((w) => {
        const h = hourOf(w.drank_at, day);
        const [x1, y1] = pt(R_WATER - 4, h);
        const [x2, y2] = pt(R_WATER + Math.min(w.ml / 50, 10), h);
        return <line key={w.id} x1={x1} y1={y1} x2={x2} y2={y2} className="water-tick" />;
      })}

      {/* meta calórica */}
      {kcalIn > 0 && (
        <path d={arc(R_GOAL, 0, goalFrac * 24)} className={over ? "goal-arc over" : "goal-arc"} strokeWidth={2.5} />
      )}

      {/* agora */}
      {isToday && (
        <g className="now">
          <line x1={pt(R_GOAL + 6, nowH)[0]} y1={pt(R_GOAL + 6, nowH)[1]} x2={pt(R_TICK + 8, nowH)[0]} y2={pt(R_TICK + 8, nowH)[1]} />
          <circle cx={pt(R_TICK + 8, nowH)[0]} cy={pt(R_TICK + 8, nowH)[1]} r={3.5} />
        </g>
      )}

      {children && (
        <foreignObject x={C - 56} y={C - 44} width={112} height={88}>
          <div className="dial-center">{children}</div>
        </foreignObject>
      )}
    </svg>
  );
}
