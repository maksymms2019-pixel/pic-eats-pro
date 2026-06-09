// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return new Response("unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } }
  );
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) {
    return new Response("unauthorized", { status: 401, headers: corsHeaders });
  }

  const body = await req.json() as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: prof }, { data: entries }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
    supabase.from("food_entries").select("name,grams,calories,protein_g,carbs_g,fat_g,meal").eq("entry_date", today),
  ]);
  const eaten = (entries ?? []).reduce(
    (a: any, e: any) => ({
      c: a.c + Number(e.calories),
      p: a.p + Number(e.protein_g),
      cb: a.cb + Number(e.carbs_g),
      f: a.f + Number(e.fat_g),
    }),
    { c: 0, p: 0, cb: 0, f: 0 }
  );
  const sys = `Ти AI-нутриціолог. Відповідай українською коротко, у форматі Markdown.
- Ціль: ${prof?.goal ?? "?"}, активність: ${prof?.activity ?? "?"}
- Денна ціль: ${prof?.target_calories ?? "?"} ккал / Б ${prof?.target_protein_g ?? "?"} / Ж ${prof?.target_fat_g ?? "?"} / В ${prof?.target_carbs_g ?? "?"}
- Сьогодні з'їдено: ${Math.round(eaten.c)} ккал / Б ${Math.round(eaten.p)} / Ж ${Math.round(eaten.f)} / В ${Math.round(eaten.cb)}
- Залишилось: ${Math.max(0, (prof?.target_calories ?? 0) - eaten.c)} ккал
Записи: ${(entries ?? []).map((e: any) => `${e.name} (${Math.round(Number(e.calories))} ккал)`).join(", ") || "—"}`;

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, ...body.messages],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    const s = resp.status === 429 || resp.status === 402 ? resp.status : 500;
    return new Response(JSON.stringify({ error: t || "AI error" }), {
      status: s,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const j = await resp.json() as any;
  const content = j.choices?.[0]?.message?.content ?? "";
  return new Response(JSON.stringify({ content }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});