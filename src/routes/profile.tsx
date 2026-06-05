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
import {
  computeBreakdown,
  type Activity,
  type Goal,
  type Sex,
  type WorkoutType,
  type MacroPreset,
} from "@/lib/nutrition";

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
  const [bodyFat, setBodyFat] = useState<number | null>(null);
  const [workoutType, setWorkoutType] = useState<WorkoutType>("none");
  const [workoutFreq, setWorkoutFreq] = useState(0);
  const [workoutDur, setWorkoutDur] = useState(45);
  const [macroPreset, setMacroPreset] = useState<MacroPreset>("balanced");
  const [proteinPerKg, setProteinPerKg] = useState<number | null>(null);
  const [calorieDelta, setCalorieDelta] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name ?? "");
    setWeight(Number(profile.weight_kg ?? 70));
    setHeight(Number(profile.height_cm ?? 175));
    setAge(Number(profile.age ?? 25));
    setSex((profile.sex as Sex) ?? "male");
    setActivity((profile.activity as Activity) ?? "moderate");
    setGoal((profile.goal as Goal) ?? "maintain");
    setBodyFat(profile.body_fat_pct != null ? Number(profile.body_fat_pct) : null);
    setWorkoutType(((profile.workout_type as WorkoutType) ?? "none"));
    setWorkoutFreq(Number(profile.workout_frequency ?? 0));
    setWorkoutDur(Number(profile.workout_duration_min ?? 45));
    setMacroPreset(((profile.macro_preset as MacroPreset) ?? "balanced"));
    setProteinPerKg(profile.protein_per_kg != null ? Number(profile.protein_per_kg) : null);
    setCalorieDelta(profile.calorie_delta != null ? Number(profile.calorie_delta) : null);
  }, [profile]);

  const save = async () => {
    if (!session) return;
    const t = computeBreakdown({
      sex, age, height_cm: height, weight_kg: weight, activity, goal,
      bmr_method: bodyFat ? "katch" : "mifflin",
      body_fat_pct: bodyFat,
      workout_type: workoutType,
      workout_frequency: workoutFreq,
      workout_duration_min: workoutDur,
      macro_preset: macroPreset,
      protein_per_kg: proteinPerKg,
      calorie_delta: calorieDelta,
    });
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
        body_fat_pct: bodyFat,
        bmr_method: bodyFat ? "katch" : "mifflin",
        workout_type: workoutType,
        workout_frequency: workoutFreq,
        workout_duration_min: workoutDur,
        macro_preset: macroPreset,
        protein_per_kg: proteinPerKg,
        calorie_delta: calorieDelta,
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

  const t = computeBreakdown({
    sex, age, height_cm: height, weight_kg: weight, activity, goal,
    bmr_method: bodyFat ? "katch" : "mifflin",
    body_fat_pct: bodyFat,
    workout_type: workoutType,
    workout_frequency: workoutFreq,
    workout_duration_min: workoutDur,
    macro_preset: macroPreset,
    protein_per_kg: proteinPerKg,
    calorie_delta: calorieDelta,
  });

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

        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <Label>% жиру в тілі</Label>
            <span className="font-semibold">{bodyFat ? `${bodyFat}%` : "не знаю"}</span>
          </div>
          <Input
            type="range"
            min={0}
            max={50}
            value={bodyFat ?? 0}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              setBodyFat(v === 0 ? null : v);
            }}
          />
        </div>

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
          <Label>Тренування</Label>
          <select
            value={workoutType}
            onChange={(e) => setWorkoutType(e.target.value as WorkoutType)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="none">Немає</option>
            <option value="strength">Силові</option>
            <option value="cardio">Кардіо</option>
            <option value="mixed">Змішане</option>
          </select>
          {workoutType !== "none" && (
            <div className="grid grid-cols-2 gap-2 pt-2">
              <RangeRow label="Раз/тижд" v={workoutFreq} set={setWorkoutFreq} min={0} max={14} />
              <RangeRow label="Хв/сесія" v={workoutDur} set={setWorkoutDur} min={10} max={180} step={5} />
            </div>
          )}
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

        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <Label>Дефіцит/профіцит</Label>
            <span className="font-semibold">
              {calorieDelta !== null
                ? `${calorieDelta > 0 ? "+" : ""}${calorieDelta} ккал`
                : "за замовч."}
            </span>
          </div>
          <Input
            type="range"
            min={-1000}
            max={500}
            step={50}
            value={calorieDelta ?? 0}
            onChange={(e) => setCalorieDelta(parseInt(e.target.value))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Макро-пресет</Label>
          <select
            value={macroPreset}
            onChange={(e) => setMacroPreset(e.target.value as MacroPreset)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="balanced">Збалансовано</option>
            <option value="high_protein">Високий білок</option>
            <option value="keto">Кето</option>
            <option value="low_fat">Низький жир</option>
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <Label>Білок г/кг</Label>
            <span className="font-semibold">
              {proteinPerKg ? `${proteinPerKg}` : "пресет"}
            </span>
          </div>
          <Input
            type="range"
            min={0}
            max={3}
            step={0.1}
            value={proteinPerKg ?? 0}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setProteinPerKg(v === 0 ? null : v);
            }}
          />
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
          <div className="mt-2 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
            BMR {t.bmr} + актив. {t.activity_kcal}
            {t.workout_kcal > 0 && ` + трен. ${t.workout_kcal}`} = {t.tdee}{" "}
            {t.delta !== 0 && (t.delta > 0 ? `+${t.delta}` : `${t.delta}`)} ={" "}
            <b className="text-primary">{t.calories}</b>
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