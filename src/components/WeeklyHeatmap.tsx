import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const DOW = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export function WeeklyHeatmap({ goal = 2000 }: { goal?: number }) {
  const { session } = useAuth();
  const { data } = useQuery({
    queryKey: ["heatmap_7d", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      const fromISO = from.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("food_entries")
        .select("entry_date,calories")
        .gte("entry_date", fromISO);
      const map = new Map<string, number>();
      for (const r of data ?? []) {
        map.set(r.entry_date, (map.get(r.entry_date) ?? 0) + Number(r.calories));
      }
      const days: { iso: string; dow: string; cal: number; isToday: boolean }[] = [];
      const todayISO = new Date().toISOString().slice(0, 10);
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        days.push({
          iso,
          dow: DOW[d.getDay()],
          cal: Math.round(map.get(iso) ?? 0),
          isToday: iso === todayISO,
        });
      }
      return days;
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Останні 7 днів
        </h2>
        <span className="text-[10px] text-muted-foreground">ціль {goal} ккал</span>
      </div>
      <div className="flex items-end justify-between gap-1.5">
        {(data ?? Array.from({ length: 7 }).map(() => null)).map((d, i) => {
          if (!d) return <div key={i} className="h-16 flex-1 rounded-md bg-muted/40" />;
          const pct = Math.min(1.1, d.cal / goal);
          const h = d.cal === 0 ? 6 : Math.max(8, Math.round(pct * 56));
          const over = d.cal > goal;
          return (
            <div key={d.iso} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-16 w-full items-end">
                <div
                  className={`w-full rounded-md transition-all ${
                    d.cal === 0
                      ? "bg-muted"
                      : over
                        ? "bg-orange-500/80"
                        : "bg-primary/80"
                  } ${d.isToday ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}
                  style={{ height: `${h}px` }}
                  title={`${d.cal} ккал`}
                />
              </div>
              <span className={`text-[10px] ${d.isToday ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                {d.dow}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}