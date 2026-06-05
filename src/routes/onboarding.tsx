import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeBreakdown,
  type Activity,
  type Goal,
  type Sex,
  type BmrMethod,
  type WorkoutType,
  type MacroPreset,
} from "@/lib/nutrition";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Налаштування — CalorAI" }] }),
  component: Onboarding,
});

function Onboarding() {
  const { session, loading: aLoad } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState(25);
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(70);
  const [activity, setActivity] = useState<Activity>("moderate");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [bodyFat, setBodyFat] = useState<number | null>(null);
  const [workoutType, setWorkoutType] = useState<WorkoutType>("none");
  const [workoutFreq, setWorkoutFreq] = useState(0);
  const [workoutDur, setWorkoutDur] = useState(45);
  const [macroPreset, setMacroPreset] = useState<MacroPreset>("balanced");
  const [proteinPerKg, setProteinPerKg] = useState<number | null>(null);
  const [calorieDelta, setCalorieDelta] = useState<number | null>(null);
  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!aLoad && !session) navigate({ to: "/auth", replace: true });
  }, [session, aLoad, navigate]);

  const finish = async () => {
    if (!session) return;
    setSaving(true);
    const t = computeBreakdown({
      sex,
      age,
      height_cm: height,
      weight_kg: weight,
      activity,
      goal,
      bmr_method: (bodyFat ? "katch" : "mifflin") as BmrMethod,
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
        target_weight_kg: targetWeight,
        target_calories: t.calories,
        target_protein_g: t.protein_g,
        target_carbs_g: t.carbs_g,
        target_fat_g: t.fat_g,
        onboarded: true,
      })
      .eq("id", session.user.id);
    if (!error && targetWeight) {
      await supabase.from("weight_logs").insert({
        user_id: session.user.id,
        weight_kg: weight,
      });
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/today", replace: true });
  };

  const steps = [
    {
      title: "Стать",
      body: (
        <div className="grid grid-cols-2 gap-3">
          {(["male", "female"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={`rounded-xl border p-6 text-center text-lg font-medium transition ${
                sex === s ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
              }`}
            >
              {s === "male" ? "Чоловік" : "Жінка"}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Параметри",
      body: (
        <div className="space-y-4">
          <Field label="Вік" value={age} onChange={setAge} min={10} max={100} suffix="років" />
          <Field label="Зріст" value={height} onChange={setHeight} min={100} max={230} suffix="см" />
          <Field
            label="Вага"
            value={weight}
            onChange={setWeight}
            min={30}
            max={250}
            step={0.1}
            suffix="кг"
          />
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <Label>% жиру в тілі (опц., точніше)</Label>
              <span className="text-sm font-semibold">
                {bodyFat ? `${bodyFat}%` : "не знаю"}
              </span>
            </div>
            <Input
              type="range"
              min={0}
              max={50}
              step={1}
              value={bodyFat ?? 0}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setBodyFat(v === 0 ? null : v);
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Якщо знаєш — увімкнеться точніша формула Katch-McArdle
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Активність",
      body: (
        <div className="space-y-2">
          {(
            [
              ["sedentary", "Сидячий спосіб життя"],
              ["light", "Легка (ходьба, легка робота)"],
              ["moderate", "Помірна (на ногах щодня)"],
              ["active", "Висока (фізична робота)"],
              ["very_active", "Дуже висока (важка фіз. праця)"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setActivity(k)}
              className={`w-full rounded-xl border p-4 text-left text-sm transition ${
                activity === k ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              {l}
            </button>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Це повсякденна активність БЕЗ тренувань — їх додамо окремо.
          </p>
        </div>
      ),
    },
    {
      title: "Тренування",
      body: (
        <div className="space-y-3">
          <div>
            <Label>Тип</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  ["none", "Немає"],
                  ["strength", "Силові"],
                  ["cardio", "Кардіо"],
                  ["mixed", "Змішане"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setWorkoutType(k)}
                  className={`rounded-lg border p-2.5 text-sm font-medium transition ${
                    workoutType === k ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {workoutType !== "none" && (
            <>
              <Field
                label="Разів на тиждень"
                value={workoutFreq}
                onChange={setWorkoutFreq}
                min={0}
                max={14}
                suffix="раз"
              />
              <Field
                label="Тривалість сесії"
                value={workoutDur}
                onChange={setWorkoutDur}
                min={10}
                max={180}
                step={5}
                suffix="хв"
              />
            </>
          )}
        </div>
      ),
    },
    {
      title: "Ціль",
      body: (
        <div className="space-y-3">
          {(
            [
              ["lose", "Схуднути", "−500 ккал/день"],
              ["maintain", "Підтримувати вагу", "TDEE"],
              ["gain", "Набрати масу", "+350 ккал/день"],
            ] as const
          ).map(([k, l, h]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setGoal(k);
                setCalorieDelta(null);
              }}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
                goal === k ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <span className="font-medium">{l}</span>
              <span className="text-xs text-muted-foreground">{h}</span>
            </button>
          ))}

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-1 flex items-baseline justify-between">
              <Label className="text-xs">Кастомний дефіцит/профіцит</Label>
              <span className="text-sm font-semibold">
                {calorieDelta !== null ? `${calorieDelta > 0 ? "+" : ""}${calorieDelta} ккал` : "за замовч."}
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
            <p className="mt-1 text-[11px] text-muted-foreground">
              −500 ≈ −0.5 кг/тиждень. Менше за 1500 ккал — небезпечно.
            </p>
          </div>

          {goal !== "maintain" && (
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <Label>Цільова вага (опц.)</Label>
                <span className="text-sm font-semibold">
                  {targetWeight ? `${targetWeight} кг` : "—"}
                </span>
              </div>
              <Input
                type="range"
                min={0}
                max={150}
                step={0.5}
                value={targetWeight ?? 0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setTargetWeight(v === 0 ? null : v);
                }}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Макроси",
      body: (
        <div className="space-y-2">
          {(
            [
              ["balanced", "Збалансовано", "30Б/30Ж/40В"],
              ["high_protein", "Високий білок", "40Б/25Ж/35В"],
              ["keto", "Кето", "25Б/70Ж/5В"],
              ["low_fat", "Низький жир", "30Б/20Ж/50В"],
            ] as const
          ).map(([k, l, h]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMacroPreset(k)}
              className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                macroPreset === k ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <span className="font-medium text-sm">{l}</span>
              <span className="text-xs text-muted-foreground">{h}</span>
            </button>
          ))}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-1 flex items-baseline justify-between">
              <Label className="text-xs">Білок за вагою (точніше)</Label>
              <span className="text-sm font-semibold">
                {proteinPerKg ? `${proteinPerKg} г/кг` : "за пресетом"}
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
            <p className="mt-1 text-[11px] text-muted-foreground">
              1.6–2.2 г/кг для дефіциту або набору м'язів
            </p>
          </div>
        </div>
      ),
    },
  ];

  const t = computeBreakdown({
    sex,
    age,
    height_cm: height,
    weight_kg: weight,
    activity,
    goal,
    bmr_method: (bodyFat ? "katch" : "mifflin") as BmrMethod,
    body_fat_pct: bodyFat,
    workout_type: workoutType,
    workout_frequency: workoutFreq,
    workout_duration_min: workoutDur,
    macro_preset: macroPreset,
    protein_per_kg: proteinPerKg,
    calorie_delta: calorieDelta,
  });

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex gap-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
        <h1 className="mb-1 text-2xl font-bold">{steps[step].title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">Крок {step + 1} з {steps.length}</p>
        {steps[step].body}
        {step === steps.length - 1 && (
          <div className="mt-6 space-y-3 rounded-xl bg-accent/50 p-4 text-sm">
            <div>
              <div className="font-medium">Твоя денна ціль:</div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                <Stat label="Ккал" value={t.calories} />
                <Stat label="Б" value={`${t.protein_g}г`} />
                <Stat label="Ж" value={`${t.fat_g}г`} />
                <Stat label="В" value={`${t.carbs_g}г`} />
              </div>
            </div>
            <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
              BMR <b className="text-foreground">{t.bmr}</b> + активність{" "}
              <b className="text-foreground">{t.activity_kcal}</b>
              {t.workout_kcal > 0 && (
                <> + тренування <b className="text-foreground">{t.workout_kcal}</b></>
              )}{" "}
              ={" "}
              <b className="text-foreground">{t.tdee}</b>{" "}
              {t.delta !== 0 && (
                <>
                  {t.delta > 0 ? "+" : "−"}
                  <b className="text-foreground">{Math.abs(t.delta)}</b>
                </>
              )}{" "}
              = <b className="text-primary">{t.calories} ккал</b>
              {t.age_adjustment > 0 && (
                <div className="mt-0.5">Корекція за вік: −{t.age_adjustment}%</div>
              )}
            </div>
            {t.calories < 1500 && (
              <div className="rounded-lg bg-destructive/10 p-2 text-[11px] text-destructive">
                Норма нижче 1500 ккал — це небезпечно. Зменш дефіцит.
              </div>
            )}
          </div>
        )}
        <div className="mt-8 flex gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
              Назад
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} className="flex-1">
              Далі
            </Button>
          ) : (
            <Button onClick={finish} className="flex-1" disabled={saving}>
              {saving ? "Зберігаю…" : "Готово"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="text-lg font-semibold">
          {value} <span className="text-xs text-muted-foreground">{suffix}</span>
        </span>
      </div>
      <Input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}