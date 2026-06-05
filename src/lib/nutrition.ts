export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";
export type BmrMethod = "mifflin" | "katch";
export type WorkoutType = "none" | "strength" | "cardio" | "mixed";
export type MacroPreset = "balanced" | "high_protein" | "keto" | "low_fat" | "custom";

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

// kcal per minute for a 70kg person; scales with weight
const WORKOUT_MET: Record<WorkoutType, number> = {
  none: 0,
  strength: 5, // MET-ish
  cardio: 8,
  mixed: 6.5,
};

export interface CalcInput {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: Activity;
  goal: Goal;
  bmr_method?: BmrMethod;
  body_fat_pct?: number | null;
  workout_type?: WorkoutType;
  workout_frequency?: number; // per week
  workout_duration_min?: number; // per session
  macro_preset?: MacroPreset;
  protein_per_kg?: number | null;
  calorie_delta?: number | null; // user override of deficit/surplus
  custom_macros?: { protein_pct: number; fat_pct: number; carbs_pct: number } | null;
}

export interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface CalcBreakdown extends MacroTargets {
  bmr: number;
  activity_kcal: number;
  workout_kcal: number;
  tdee: number;
  delta: number;
  age_adjustment: number;
}

function computeBMR(i: CalcInput): number {
  if (
    i.bmr_method === "katch" &&
    typeof i.body_fat_pct === "number" &&
    i.body_fat_pct > 3 &&
    i.body_fat_pct < 60
  ) {
    const lbm = i.weight_kg * (1 - i.body_fat_pct / 100);
    return 370 + 21.6 * lbm;
  }
  return i.sex === "male"
    ? 10 * i.weight_kg + 6.25 * i.height_cm - 5 * i.age + 5
    : 10 * i.weight_kg + 6.25 * i.height_cm - 5 * i.age - 161;
}

function computeWorkoutKcal(i: CalcInput): number {
  const type = i.workout_type ?? "none";
  const freq = i.workout_frequency ?? 0;
  const dur = i.workout_duration_min ?? 0;
  if (type === "none" || freq === 0 || dur === 0) return 0;
  const met = WORKOUT_MET[type];
  // kcal per session ≈ MET * weight_kg * dur/60
  const perSession = met * i.weight_kg * (dur / 60);
  // Spread across 7 days
  return (perSession * freq) / 7;
}

function macroSplit(preset: MacroPreset): { p: number; f: number; c: number } {
  switch (preset) {
    case "high_protein":
      return { p: 0.4, f: 0.25, c: 0.35 };
    case "keto":
      return { p: 0.25, f: 0.7, c: 0.05 };
    case "low_fat":
      return { p: 0.3, f: 0.2, c: 0.5 };
    case "balanced":
    default:
      return { p: 0.3, f: 0.3, c: 0.4 };
  }
}

export function computeBreakdown(i: CalcInput): CalcBreakdown {
  const bmr = computeBMR(i);
  // Age adjustment: −2% per decade over 30 (cumulative)
  const decadesOver30 = Math.max(0, (i.age - 30) / 10);
  const ageAdjFactor = Math.max(0.85, 1 - 0.02 * decadesOver30);
  const adjustedBmr = bmr * ageAdjFactor;

  // Activity component (non-workout). If user picks workout-driven activity,
  // we use base activity factor for daily NEAT only and add explicit workout kcal.
  const activityFactor = ACTIVITY_FACTOR[i.activity];
  const activityKcal = adjustedBmr * (activityFactor - 1);
  const workoutKcal = computeWorkoutKcal(i);

  const tdee = adjustedBmr + activityKcal + workoutKcal;

  const delta =
    typeof i.calorie_delta === "number" ? i.calorie_delta : GOAL_DELTA[i.goal];

  const calories = Math.max(1200, Math.round(tdee + delta));

  // Macros
  let proteinG: number;
  if (typeof i.protein_per_kg === "number" && i.protein_per_kg > 0) {
    proteinG = Math.round(i.protein_per_kg * i.weight_kg);
  } else {
    const split = macroSplit(i.macro_preset ?? "balanced");
    proteinG = Math.round((calories * split.p) / 4);
  }
  const split = macroSplit(i.macro_preset ?? "balanced");
  const proteinKcal = proteinG * 4;
  const remaining = Math.max(0, calories - proteinKcal);
  // distribute remaining between fat/carbs by their preset ratio
  const fcSum = split.f + split.c || 1;
  const fatKcal = remaining * (split.f / fcSum);
  const carbsKcal = remaining * (split.c / fcSum);
  const fatG = Math.round(fatKcal / 9);
  const carbsG = Math.round(carbsKcal / 4);

  return {
    calories,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
    bmr: Math.round(adjustedBmr),
    activity_kcal: Math.round(activityKcal),
    workout_kcal: Math.round(workoutKcal),
    tdee: Math.round(tdee),
    delta: Math.round(delta),
    age_adjustment: Math.round((1 - ageAdjFactor) * 100),
  };
}

export function computeTargets(i: CalcInput): MacroTargets {
  const b = computeBreakdown(i);
  return {
    calories: b.calories,
    protein_g: b.protein_g,
    carbs_g: b.carbs_g,
    fat_g: b.fat_g,
  };
}

// Validate consistency: 4*P + 4*C + 9*F should be within ±15% of stated kcal
export function validateMacros(m: {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): { ok: boolean; computed: number; drift_pct: number } {
  const computed = m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
  const drift = m.calories > 0 ? Math.abs(computed - m.calories) / m.calories : 0;
  return { ok: drift <= 0.15, computed: Math.round(computed), drift_pct: +(drift * 100).toFixed(1) };
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