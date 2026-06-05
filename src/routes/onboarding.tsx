import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeTargets, type Activity, type Goal, type Sex } from "@/lib/nutrition";
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!aLoad && !session) navigate({ to: "/auth", replace: true });
  }, [session, aLoad, navigate]);

  const finish = async () => {
    if (!session) return;
    setSaving(true);
    const t = computeTargets({ sex, age, height_cm: height, weight_kg: weight, activity, goal });
    const { error } = await supabase
      .from("profiles")
      .update({
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
        onboarded: true,
      })
      .eq("id", session.user.id);
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
              ["light", "Легка активність 1–3 рази/тижд"],
              ["moderate", "Помірна 3–5 разів/тижд"],
              ["active", "Висока 6–7 разів/тижд"],
              ["very_active", "Дуже висока, спорт двічі/день"],
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
        </div>
      ),
    },
    {
      title: "Ціль",
      body: (
        <div className="space-y-2">
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
              onClick={() => setGoal(k)}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
                goal === k ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              <span className="font-medium">{l}</span>
              <span className="text-xs text-muted-foreground">{h}</span>
            </button>
          ))}
        </div>
      ),
    },
  ];

  const t = computeTargets({ sex, age, height_cm: height, weight_kg: weight, activity, goal });

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
          <div className="mt-6 rounded-xl bg-accent/50 p-4 text-sm">
            <div className="font-medium">Твоя денна ціль:</div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center">
              <Stat label="Ккал" value={t.calories} />
              <Stat label="Б" value={`${t.protein_g}г`} />
              <Stat label="Ж" value={`${t.fat_g}г`} />
              <Stat label="В" value={`${t.carbs_g}г`} />
            </div>
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