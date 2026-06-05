import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { computeTargets, type Activity, type Goal, type Sex } from "@/lib/nutrition";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Профіль — CalorAI" }] }),
  component: () => (
    <AppLayout>
      <ProfilePage />
    </AppLayout>
  ),
});

function ProfilePage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

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

  const [name, setName] = useState("");
  const [weight, setWeight] = useState(70);
  const [height, setHeight] = useState(175);
  const [age, setAge] = useState(25);
  const [sex, setSex] = useState<Sex>("male");
  const [activity, setActivity] = useState<Activity>("moderate");
  const [goal, setGoal] = useState<Goal>("maintain");

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name ?? "");
    setWeight(Number(profile.weight_kg ?? 70));
    setHeight(Number(profile.height_cm ?? 175));
    setAge(Number(profile.age ?? 25));
    setSex((profile.sex as Sex) ?? "male");
    setActivity((profile.activity as Activity) ?? "moderate");
    setGoal((profile.goal as Goal) ?? "maintain");
  }, [profile]);

  const save = async () => {
    if (!session) return;
    const t = computeTargets({ sex, age, height_cm: height, weight_kg: weight, activity, goal });
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name,
        sex,
        age,
        height_cm: height,
        weight_kg: weight,
        activity,
        goal,
        target_calories: t.calories,
        target_protein_g: t.protein_g,
        target_carbs_g: t.carbs_g,
        target_fat_g: t.fat_g,
      })
      .eq("id", session.user.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Збережено");
      qc.invalidateQueries({ queryKey: ["profile"] });
    }
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const t = computeTargets({ sex, age, height_cm: height, weight_kg: weight, activity, goal });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Профіль</h1>
        <p className="text-sm text-muted-foreground">{session?.user.email}</p>
      </header>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label>Ім'я</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(["male", "female"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={`rounded-lg border p-2 text-sm font-medium ${
                sex === s ? "border-primary bg-primary/10 text-primary" : "border-border"
              }`}
            >
              {s === "male" ? "Чоловік" : "Жінка"}
            </button>
          ))}
        </div>

        <RangeRow label="Вік" v={age} set={setAge} min={10} max={100} suffix="років" />
        <RangeRow label="Зріст" v={height} set={setHeight} min={100} max={230} suffix="см" />
        <RangeRow label="Вага" v={weight} set={(n) => setWeight(n)} min={30} max={250} step={0.1} suffix="кг" />

        <div className="space-y-1.5">
          <Label>Активність</Label>
          <select
            value={activity}
            onChange={(e) => setActivity(e.target.value as Activity)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="sedentary">Сидячий</option>
            <option value="light">Легка</option>
            <option value="moderate">Помірна</option>
            <option value="active">Висока</option>
            <option value="very_active">Дуже висока</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Ціль</Label>
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value as Goal)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="lose">Схуднути</option>
            <option value="maintain">Підтримувати</option>
            <option value="gain">Набрати</option>
          </select>
        </div>

        <div className="rounded-xl bg-accent/50 p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Розрахована денна ціль
          </div>
          <div className="mt-1 grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-primary">{t.calories}</div>
              <div className="text-[10px]">ккал</div>
            </div>
            <div>
              <div className="text-lg font-bold">{t.protein_g}</div>
              <div className="text-[10px]">Б, г</div>
            </div>
            <div>
              <div className="text-lg font-bold">{t.fat_g}</div>
              <div className="text-[10px]">Ж, г</div>
            </div>
            <div>
              <div className="text-lg font-bold">{t.carbs_g}</div>
              <div className="text-[10px]">В, г</div>
            </div>
          </div>
        </div>

        <Button className="w-full" onClick={save}>
          Зберегти
        </Button>
      </div>

      <Button variant="outline" className="w-full" onClick={signOut}>
        Вийти
      </Button>
    </div>
  );
}

function RangeRow({
  label,
  v,
  set,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  v: number;
  set: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="font-semibold">
          {v} <span className="text-xs text-muted-foreground">{suffix}</span>
        </span>
      </div>
      <Input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={v}
        onChange={(e) => set(parseFloat(e.target.value))}
      />
    </div>
  );
}