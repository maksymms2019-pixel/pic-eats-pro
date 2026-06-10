import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Flame } from "lucide-react";

function computeStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const set = new Set(dates);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Якщо сьогодні немає запису, починаємо рахунок з учора (щоб не «зривати» streak зранку)
  const start = new Date(today);
  const todayISO = today.toISOString().slice(0, 10);
  if (!set.has(todayISO)) start.setDate(start.getDate() - 1);
  let streak = 0;
  const cur = new Date(start);
  while (set.has(cur.toISOString().slice(0, 10))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export function StreakBadge() {
  const { session } = useAuth();
  const { data } = useQuery({
    queryKey: ["streak_dates", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 60);
      const { data } = await supabase
        .from("food_entries")
        .select("entry_date")
        .gte("entry_date", since.toISOString().slice(0, 10));
      const uniq = Array.from(new Set((data ?? []).map((r: { entry_date: string }) => r.entry_date)));
      return uniq;
    },
  });
  const streak = computeStreak(data ?? []);
  if (streak === 0) return null;
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
      <Flame className="h-3.5 w-3.5 fill-orange-500/40" />
      {streak} {streak === 1 ? "день" : streak < 5 ? "дні" : "днів"} поспіль
    </div>
  );
}