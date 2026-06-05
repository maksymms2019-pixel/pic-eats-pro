import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { MacroRings } from "@/components/MacroRings";
import { todayISO } from "@/lib/nutrition";
import { Trash2, Camera, Scale } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/today")({
  head: () => ({ meta: [{ title: "Сьогодні — CalorAI" }] }),
  component: () => (
    <AppLayout>
      <TodayPage />
    </AppLayout>
  ),
});

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Сніданок",
  lunch: "Обід",
  dinner: "Вечеря",
  snack: "Перекус",
};

function TodayPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const date = todayISO();

  const { data: profile } = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session!.user.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["entries", date],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("food_entries")
        .select("*")
        .eq("entry_date", date)
        .order("consumed_at", { ascending: true });
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("food_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entries", date] });
      toast.success("Видалено");
    },
  });

  const totals = (entries ?? []).reduce(
    (a, e) => ({
      calories: a.calories + Number(e.calories),
      protein: a.protein + Number(e.protein_g),
      carbs: a.carbs + Number(e.carbs_g),
      fat: a.fat + Number(e.fat_g),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const tc = profile?.target_calories ?? 2000;
  const tp = profile?.target_protein_g ?? 150;
  const tcb = profile?.target_carbs_g ?? 200;
  const tf = profile?.target_fat_g ?? 65;

  const grouped = (entries ?? []).reduce<Record<string, typeof entries>>((acc, e) => {
    (acc[e.meal] ??= [] as never).push(e as never);
    return acc;
  }, {});

  const { data: lastWeight } = useQuery({
    queryKey: ["last_weight", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("weight_logs")
        .select("weight_kg, logged_at")
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const [weightOpen, setWeightOpen] = useState(false);
  const [weightVal, setWeightVal] = useState<string>("");

  const logWeight = async () => {
    const w = parseFloat(weightVal);
    if (!session || !w || w < 30 || w > 300) {
      toast.error("Введи коректну вагу");
      return;
    }
    const { error } = await supabase.from("weight_logs").insert({
      user_id: session.user.id,
      weight_kg: w,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("profiles").update({ weight_kg: w }).eq("id", session.user.id);
    toast.success("Вага записана");
    setWeightOpen(false);
    setWeightVal("");
    qc.invalidateQueries({ queryKey: ["last_weight"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-2xl font-bold">Привіт{profile?.display_name ? `, ${profile.display_name}` : ""}!</h1>
      </header>

      <MacroRings
        calories={totals.calories}
        caloriesTarget={tc}
        protein={totals.protein}
        proteinTarget={tp}
        carbs={totals.carbs}
        carbsTarget={tcb}
        fat={totals.fat}
        fatTarget={tf}
      />

      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
            <Scale className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Вага</div>
            <div className="text-sm font-semibold">
              {lastWeight
                ? `${Number(lastWeight.weight_kg).toFixed(1)} кг · ${new Date(lastWeight.logged_at).toLocaleDateString("uk-UA")}`
                : "Ще не записано"}
            </div>
          </div>
          {!weightOpen ? (
            <Button size="sm" variant="outline" onClick={() => setWeightOpen(true)}>
              Записати
            </Button>
          ) : (
            <div className="flex gap-1">
              <Input
                type="number"
                step="0.1"
                placeholder="кг"
                value={weightVal}
                onChange={(e) => setWeightVal(e.target.value)}
                className="h-9 w-20"
              />
              <Button size="sm" onClick={logWeight}>OK</Button>
            </div>
          )}
        </div>
      </div>

      {(["breakfast", "lunch", "dinner", "snack"] as const).map((meal) => (
        <section key={meal}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {MEAL_LABEL[meal]}
            </h2>
            <span className="text-xs text-muted-foreground">
              {Math.round(
                (grouped[meal] ?? []).reduce((s, e) => s + Number(e.calories), 0)
              )}{" "}
              ккал
            </span>
          </div>
          <div className="space-y-2">
            {(grouped[meal] ?? []).length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Поки порожньо
              </div>
            )}
            {(grouped[meal] ?? []).map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                {e.photo_url ? (
                  <img
                    src={e.photo_url}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-xl">
                    🍽️
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {Math.round(Number(e.grams))} г · Б {Math.round(Number(e.protein_g))} ·
                    Ж {Math.round(Number(e.fat_g))} · В {Math.round(Number(e.carbs_g))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{Math.round(Number(e.calories))}</div>
                  <div className="text-[10px] text-muted-foreground">ккал</div>
                </div>
                <button
                  onClick={() => del.mutate(e.id)}
                  className="p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Видалити"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      <Link
        to="/scan"
        className="flex items-center justify-center gap-2 rounded-xl bg-primary p-4 text-primary-foreground shadow-sm transition active:scale-[0.98]"
      >
        <Camera className="h-5 w-5" />
        Сфотографувати їжу
      </Link>
    </div>
  );
}