import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/coach")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response("unauthorized", { status: 401 });
        }
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: auth } } }
        );
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return new Response("unauthorized", { status: 401 });

        const body = (await request.json()) as {
          messages: Array<{ role: "user" | "assistant"; content: string }>;
        };

        // Pull context: profile + today entries
        const today = new Date().toISOString().slice(0, 10);
        const [{ data: prof }, { data: entries }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
          supabase.from("food_entries").select("name,grams,calories,protein_g,carbs_g,fat_g,meal").eq("entry_date", today),
        ]);
        const eaten = (entries ?? []).reduce(
          (a, e) => ({
            c: a.c + Number(e.calories),
            p: a.p + Number(e.protein_g),
            cb: a.cb + Number(e.carbs_g),
            f: a.f + Number(e.fat_g),
          }),
          { c: 0, p: 0, cb: 0, f: 0 }
        );
        const sys = `Ти AI-нутриціолог. Відповідай українською коротко й по-суті, у форматі Markdown. Контекст про користувача:
- Ціль: ${prof?.goal ?? "невідомо"}, активність: ${prof?.activity ?? "невідомо"}
- Денна ціль: ${prof?.target_calories ?? "?"} ккал / Б ${prof?.target_protein_g ?? "?"} / Ж ${prof?.target_fat_g ?? "?"} / В ${prof?.target_carbs_g ?? "?"}
- Сьогодні з'їдено: ${Math.round(eaten.c)} ккал / Б ${Math.round(eaten.p)} / Ж ${Math.round(eaten.f)} / В ${Math.round(eaten.cb)}
- Залишилось: ${Math.max(0, (prof?.target_calories ?? 0) - eaten.c)} ккал
Записи за сьогодні: ${(entries ?? []).map((e) => `${e.name} (${Math.round(Number(e.calories))} ккал)`).join(", ") || "немає"}`;

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "system", content: sys }, ...body.messages],
            stream: true,
          }),
        });
        if (!resp.ok || !resp.body) {
          const t = await resp.text();
          const s = resp.status === 429 || resp.status === 402 ? resp.status : 500;
          return new Response(t || "AI error", { status: s });
        }
        return new Response(resp.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});