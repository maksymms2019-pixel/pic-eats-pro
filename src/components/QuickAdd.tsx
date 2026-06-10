import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Zap, Plus } from "lucide-react";
import { toast } from "sonner";
import { todayISO } from "@/lib/nutrition";

type Fav = {
  id: string;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  photo_url: string | null;
};

function currentMeal(): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

export function QuickAdd() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const date = todayISO();

  const { data: favs } = useQuery({
    queryKey: ["favorites_quick", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("favorites")
        .select("id,name,grams,calories,protein_g,carbs_g,fat_g,photo_url")
        .order("use_count", { ascending: false })
        .limit(6);
      return (data ?? []) as Fav[];
    },
  });

  const add = useMutation({
    mutationFn: async (f: Fav) => {
      const meal = currentMeal();
      const { error } = await supabase.from("food_entries").insert({
        user_id: session!.user.id,
        meal,
        name: f.name,
        grams: Number(f.grams),
        calories: Number(f.calories),
        protein_g: Number(f.protein_g),
        carbs_g: Number(f.carbs_g),
        fat_g: Number(f.fat_g),
        photo_url: f.photo_url,
        photo_urls: f.photo_url ? [f.photo_url] : [],
        source: "favorite_quick",
      });
      if (error) throw error;
      // оновлюємо last_used_at, щоб порядок жив
      await supabase
        .from("favorites")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", f.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entries", date] });
      qc.invalidateQueries({ queryKey: ["favorites_quick"] });
      toast.success("Додано");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Помилка"),
  });

  if (!favs || favs.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Швидко додати
        </h2>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {favs.map((f) => (
          <button
            key={f.id}
            onClick={() => add.mutate(f)}
            disabled={add.isPending}
            className="group relative flex w-[140px] flex-shrink-0 flex-col gap-1 overflow-hidden rounded-xl border border-border bg-card p-2 text-left transition active:scale-[0.97] disabled:opacity-50"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-accent">
              {f.photo_url ? (
                <img src={f.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl">🍽️</div>
              )}
              <div className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                <Plus className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="truncate text-xs font-medium">{f.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {Math.round(Number(f.calories))} ккал · {Math.round(Number(f.grams))} г
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}