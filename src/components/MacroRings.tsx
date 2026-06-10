import { useEffect, useState } from "react";

interface MacroRingsProps {
  calories: number;
  caloriesTarget: number;
  protein: number;
  proteinTarget: number;
  carbs: number;
  carbsTarget: number;
  fat: number;
  fatTarget: number;
}

function useCountUp(target: number, ms = 600) {
  const [v, setV] = useState(target);
  useEffect(() => {
    const from = v;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

function Ring({
  value,
  target,
  size = 200,
  stroke = 14,
  color = "var(--primary)",
  label,
}: {
  value: number;
  target: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="var(--muted)"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        fill="none"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      {label && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
          className="fill-foreground text-xs"
        >
          {label}
        </text>
      )}
    </svg>
  );
}

export function MacroRings(p: MacroRingsProps) {
  const remaining = Math.max(0, p.caloriesTarget - p.calories);
  const over = p.calories > p.caloriesTarget;
  const animCal = useCountUp(Math.round(p.calories));
  // Прогноз: екстраполяція темпу до 21:00
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const ref = Math.max(8, Math.min(21, hour));
  const pace = ref > 8 ? p.calories / (ref - 6) : 0;
  const predicted = Math.round(Math.max(p.calories, p.calories + pace * Math.max(0, 21 - ref)));
  const showPred = hour >= 11 && hour < 21 && p.calories > 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-6">
        <div className="relative">
          <Ring value={p.calories} target={p.caloriesTarget} color={over ? "var(--chart-3)" : "var(--primary)"} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold tabular-nums">{animCal}</div>
            <div className="text-xs text-muted-foreground">з {p.caloriesTarget} ккал</div>
            <div className={`mt-1 text-xs ${over ? "text-orange-500" : "text-primary"}`}>
              {over
                ? `+${p.calories - p.caloriesTarget} понад ціль`
                : remaining > 0
                  ? `−${remaining} залишилось`
                  : "ціль виконана"}
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <MacroBar label="Білки" value={p.protein} target={p.proteinTarget} color="var(--chart-3)" />
          <MacroBar label="Жири" value={p.fat} target={p.fatTarget} color="var(--chart-2)" />
          <MacroBar label="Вуглеводи" value={p.carbs} target={p.carbsTarget} color="var(--chart-4)" />
        </div>
      </div>
      {showPred && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Прогноз до 21:00 при цьому темпі:</span>
          <span className={`font-semibold tabular-nums ${predicted > p.caloriesTarget ? "text-orange-500" : "text-primary"}`}>
            ~{predicted} ккал
          </span>
        </div>
      )}
    </div>
  );
}

function MacroBar({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {Math.round(value)} / {target} г
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}