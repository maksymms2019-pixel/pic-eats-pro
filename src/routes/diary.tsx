import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/diary")({
  head: () => ({ meta: [{ title: "Щоденник — CalorAI" }] }),
  component: () => (
    <AppLayout>
      <DiaryPage />
    </AppLayout>
  ),
});

function DiaryPage() {
  const { session } = useAuth();
  const [range, setRange] = useState<7 | 30>(7);

  const { data } = useQuery({
    queryKey: ["diary", range],
    enabled: !!session,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - (range - 1));
      const fromISO = from.toISOString().slice(0, 10);
      const { data } = await supabase
        .from("food_entries")
        .select("entry_date,calories,protein_g,carbs_g,fat_g")
        .gte("entry_date", fromISO);
      const byDay: Record<string, { date: string; cal: number; p: number; c: number; f: number }> = {};
      for (let i = 0; i < range; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        byDay[iso] = { date: iso, cal: 0, p: 0, c: 0, f: 0 };
      }
      for (const e of data ?? []) {
        if (!byDay[e.entry_date]) continue;
        byDay[e.entry_date].cal += Number(e.calories);
        byDay[e.entry_date].p += Number(e.protein_g);
        byDay[e.entry_date].c += Number(e.carbs_g);
        byDay[e.entry_date].f += Number(e.fat_g);
      }
      return Object.values(byDay)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          ...d,
          label: new Date(d.date).toLocaleDateString("uk-UA", { day: "numeric", month: "short" }),
        }));
    },
  });

  const { data: prof } = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("target_calories")
        .eq("id", session!.user.id)
        .maybeSingle();
      return data;
    },
  });

  const goal = prof?.target_calories ?? 2000;
  const avg =
    data && data.length ? Math.round(data.reduce((s, d) => s + d.cal, 0) / data.length) : 0;
  const hitDays = (data ?? []).filter((d) => d.cal > 0 && d.cal <= goal).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Щоденник</h1>
        <p className="text-sm text-muted-foreground">Твій прогрес за період</p>
      </header>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {([7, 30] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              range === r ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            {r} днів
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Box label="Сер./день" value={`${avg}`} sub="ккал" />
        <Box label="Ціль" value={`${goal}`} sub="ккал" />
        <Box label="В межах" value={`${hitDays}`} sub={`з ${range}`} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 text-sm font-medium">Калорії за день</div>
        <div className="h-48 w-full">
          <ResponsiveContainer>
            <LineChart data={data ?? []}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="cal"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">По днях</div>
        <div className="space-y-1.5">
          {(data ?? [])
            .slice()
            .reverse()
            .map((d) => {
              const pct = Math.min(100, (d.cal / goal) * 100);
              const ok = d.cal > 0 && d.cal <= goal;
              return (
                <div key={d.date} className="flex items-center gap-3">
                  <div className="w-20 text-xs text-muted-foreground">{d.label}</div>
                  <div className="flex-1">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: ok ? "var(--primary)" : "var(--chart-3)",
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-16 text-right text-xs font-medium">{Math.round(d.cal)}</div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function Box({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}