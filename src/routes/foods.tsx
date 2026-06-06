import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Utensils } from "lucide-react";
import { macrosForGrams, todayISO } from "@/lib/nutrition";

export const Route = createFileRoute("/foods")({
  head: () => ({ meta: [{ title: "Продукти — CalorAI" }] }),
  component: () => (
    <AppLayout>
      <FoodsPage />
    </AppLayout>
  ),
});

function FoodsPage() {
  const [tab, setTab] = useState<"my" | "favs" | "add">("my");
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Продукти</h1>
        <p className="text-sm text-muted-foreground">База, улюблені та власні страви</p>
      </header>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["my", "Мої"],
            ["favs", "Улюблені"],
            ["add", "Додати"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              tab === k ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "my" && <MyFoods />}
      {tab === "favs" && <Favs />}
      {tab === "add" && <AddFood />}
    </div>
  );
}

function MyFoods() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["custom_foods"],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("custom_foods")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_foods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_foods"] }),
  });

  const log = async (
    f: NonNullable<typeof data>[number],
    grams: number
  ) => {
    if (!session) return;
    const m = macrosForGrams(
      {
        c: Number(f.calories_per_100g),
        p: Number(f.protein_per_100g),
        cb: Number(f.carbs_per_100g),
        f: Number(f.fat_per_100g),
      },
      grams
    );
    const { error } = await supabase.from("food_entries").insert({
      user_id: session.user.id,
      meal: "snack",
      name: f.name,
      grams,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      entry_date: todayISO(),
      source: "custom",
    });
    if (error) toast.error(error.message);
    else toast.success(`+ ${f.name}`);
  };

  return (
    <div className="space-y-2">
      {(data ?? []).length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Поки немає. Додай свій продукт у вкладці «Додати».
        </p>
      )}
      {(data ?? []).map((f) => (
        <div key={f.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium">{f.name}</div>
              {f.brand && <div className="text-xs text-muted-foreground">{f.brand}</div>}
              <div className="mt-1 text-xs text-muted-foreground">
                {Math.round(Number(f.calories_per_100g))} ккал / 100 г · Б{" "}
                {Number(f.protein_per_100g).toFixed(1)} · Ж{" "}
                {Number(f.fat_per_100g).toFixed(1)} · В{" "}
                {Number(f.carbs_per_100g).toFixed(1)}
              </div>
            </div>
            <button
              onClick={() => del.mutate(f.id)}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="Видалити"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            {[50, 100, 200].map((g) => (
              <Button key={g} variant="outline" size="sm" onClick={() => log(f, g)}>
                + {g} г
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Favs() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["favorites"],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("favorites")
        .select("*")
        .order("use_count", { ascending: false })
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const log = async (f: NonNullable<typeof data>[number]) => {
    if (!session) return;
    const { error } = await supabase.from("food_entries").insert({
      user_id: session.user.id,
      meal: "snack",
      name: f.name,
      grams: f.grams,
      calories: f.calories,
      protein_g: f.protein_g,
      carbs_g: f.carbs_g,
      fat_g: f.fat_g,
      source: "favorite",
    });
    if (error) toast.error(error.message);
    else {
      await supabase
        .from("favorites")
        .update({ use_count: (f.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
        .eq("id", f.id);
      qc.invalidateQueries({ queryKey: ["favorites"] });
      toast.success(`+ ${f.name}`);
    }
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("favorites").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["favorites"] });
  };
  return (
    <div className="space-y-2">
      {(data ?? []).length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Сфотографуй страву → «Зберегти як мою страву», і вона з'явиться тут для миттєвого повторного додавання.
        </p>
      )}
      {(data ?? []).map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5"
        >
          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            {f.photo_url ? (
              <img src={f.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Utensils className="h-5 w-5" />
              </div>
            )}
          </div>
          <button
            onClick={() => log(f)}
            className="flex-1 min-w-0 text-left active:opacity-70"
          >
            <div className="truncate font-medium">{f.name}</div>
            <div className="text-xs text-muted-foreground">
              {Math.round(Number(f.grams))} г · {Math.round(Number(f.calories))} ккал · Б{Number(f.protein_g).toFixed(0)} Ж{Number(f.fat_g).toFixed(0)} В{Number(f.carbs_g).toFixed(0)}
            </div>
          </button>
          <button
            onClick={() => log(f)}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            aria-label="Додати"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            onClick={() => del(f.id)}
            className="p-1 text-muted-foreground hover:text-destructive"
            aria-label="Видалити"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AddFood() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [cal, setCal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    const { error } = await supabase.from("custom_foods").insert({
      user_id: session.user.id,
      name,
      brand: brand || null,
      calories_per_100g: parseFloat(cal) || 0,
      protein_per_100g: parseFloat(p) || 0,
      carbs_per_100g: parseFloat(c) || 0,
      fat_per_100g: parseFloat(f) || 0,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Збережено");
    setName("");
    setBrand("");
    setCal("");
    setP("");
    setC("");
    setF("");
    qc.invalidateQueries({ queryKey: ["custom_foods"] });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="space-y-1.5">
        <Label>Назва</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Бренд (опц.)</Label>
        <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">Значення на 100 грамів:</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Калорії</Label>
          <Input value={cal} onChange={(e) => setCal(e.target.value)} inputMode="decimal" required />
        </div>
        <div className="space-y-1.5">
          <Label>Білки, г</Label>
          <Input value={p} onChange={(e) => setP(e.target.value)} inputMode="decimal" />
        </div>
        <div className="space-y-1.5">
          <Label>Вуглеводи, г</Label>
          <Input value={c} onChange={(e) => setC(e.target.value)} inputMode="decimal" />
        </div>
        <div className="space-y-1.5">
          <Label>Жири, г</Label>
          <Input value={f} onChange={(e) => setF(e.target.value)} inputMode="decimal" />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "…" : "Зберегти"}
      </Button>
    </form>
  );
}