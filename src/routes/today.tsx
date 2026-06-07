import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { MacroRings } from "@/components/MacroRings";
import { todayISO } from "@/lib/nutrition";
import { Trash2, Camera, Scale, Heart, X } from "lucide-react";
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
  const [lightbox, setLightbox] = useState<string[] | null>(null);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

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

  const saveFav = async (e: {
    id: string;
    name: string;
    grams: number | string;
    calories: number | string;
    protein_g: number | string;
    carbs_g: number | string;
    fat_g: number | string;
    photo_url: string | null;
    photo_urls?: string[] | null;
  }) => {
    if (!session || favIds.has(e.id)) return;
    const { error } = await supabase.from("favorites").insert({
      user_id: session.user.id,
      name: e.name,
      grams: Number(e.grams),
      calories: Number(e.calories),
      protein_g: Number(e.protein_g),
      carbs_g: Number(e.carbs_g),
      fat_g: Number(e.fat_g),
      photo_url: e.photo_url,
      photo_urls: e.photo_urls ?? (e.photo_url ? [e.photo_url] : []),
    });
    if (error) toast.error(error.message);
    else {
      setFavIds((s) => new Set(s).add(e.id));
      toast.success("В Мої страви");
    }
  };

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
                  <button
                    onClick={() => {
                      const urls = (e.photo_urls && e.photo_urls.length
                        ? e.photo_urls
                        : [e.photo_url]) as string[];
                      setLightbox(urls);
                    }}
                    className="active:scale-95"
                    aria-label="Переглянути фото"
                  >
                    <img
                      src={e.photo_url}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  </button>
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
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => saveFav(e as never)}
                    className={`p-1 ${favIds.has(e.id) ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                    aria-label="В улюблені"
                    disabled={favIds.has(e.id)}
                  >
                    <Heart className={`h-4 w-4 ${favIds.has(e.id) ? "fill-primary" : ""}`} />
                  </button>
                  <button
                    onClick={() => del.mutate(e.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Видалити"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
            aria-label="Закрити"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col gap-2 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.map((u, i) => (
              <img
                key={i}
                src={u}
                alt=""
                className="w-full rounded-xl object-contain"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}