
-- Extend profiles with accuracy params
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS body_fat_pct numeric,
  ADD COLUMN IF NOT EXISTS bmr_method text NOT NULL DEFAULT 'mifflin',
  ADD COLUMN IF NOT EXISTS workout_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS workout_frequency integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workout_duration_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS target_date date,
  ADD COLUMN IF NOT EXISTS macro_preset text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS protein_per_kg numeric,
  ADD COLUMN IF NOT EXISTS calorie_delta integer;

-- Weight logs
CREATE TABLE IF NOT EXISTS public.weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  weight_kg numeric NOT NULL,
  logged_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_logs TO authenticated;
GRANT ALL ON public.weight_logs TO service_role;

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own weight_logs" ON public.weight_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS weight_logs_user_date_idx ON public.weight_logs (user_id, logged_at DESC);
