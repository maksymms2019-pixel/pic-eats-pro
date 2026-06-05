export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_DELTA: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 350,
};

export interface CalcInput {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: Activity;
  goal: Goal;
}

export interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function computeTargets(i: CalcInput): MacroTargets {
  const bmr =
    i.sex === "male"
      ? 10 * i.weight_kg + 6.25 * i.height_cm - 5 * i.age + 5
      : 10 * i.weight_kg + 6.25 * i.height_cm - 5 * i.age - 161;
  const tdee = bmr * ACTIVITY_FACTOR[i.activity];
  const calories = Math.max(1200, Math.round(tdee + GOAL_DELTA[i.goal]));
  // 30% protein, 40% carbs, 30% fat (default split)
  const protein_g = Math.round((calories * 0.3) / 4);
  const carbs_g = Math.round((calories * 0.4) / 4);
  const fat_g = Math.round((calories * 0.3) / 9);
  return { calories, protein_g, carbs_g, fat_g };
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function macrosForGrams(per100: { c: number; p: number; cb: number; f: number }, grams: number) {
  const k = grams / 100;
  return {
    calories: Math.round(per100.c * k),
    protein_g: +(per100.p * k).toFixed(1),
    carbs_g: +(per100.cb * k).toFixed(1),
    fat_g: +(per100.f * k).toFixed(1),
  };
}