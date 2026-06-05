import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type PrevItem = {
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};
type PrevResult = {
  name?: string;
  items?: PrevItem[];
  grams?: number;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  assumptions?: string;
};

export const Route = createFileRoute("/api/analyze-food")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: auth } } }
        );
        const { data: u, error: ue } = await supabase.auth.getUser();
        if (ue || !u.user) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const body = (await request.json()) as {
          imageBase64?: string;
          hint?: string;
          previous?: PrevResult;
          name_only?: string;
          name_only_grams?: number;
        };
        if (!body.imageBase64 && !body.name_only) {
          return new Response(JSON.stringify({ error: "no image" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Pull user weight/sex for portion scale reference
        const { data: prof } = await supabase
          .from("profiles")
          .select("sex,weight_kg,height_cm")
          .eq("id", u.user.id)
          .maybeSingle();

        const sys = `Ти професійний дієтолог-аналітик з 15-річним досвідом оцінки калорійності страв за фотографією. Твоя ціль — МАКСИМАЛЬНА ТОЧНІСТЬ.

АЛГОРИТМ:
1. Спочатку перерахуй ВСІ видимі компоненти страви окремо (м'ясо, гарнір, овочі, соус, олія, хліб тощо).
2. Для кожного компонента оціни вагу в грамах. Використовуй референси розміру: стандартна тарілка ~26см, виделка ~20см, чашка ~250мл, ложка ~15г.
3. Враховуй спосіб приготування (смажене на олії додає +50-100 ккал, відварене — без додатків).
4. Для кожного компонента порахуй ккал та БЖВ. Сума по компонентах = total.
5. ВАЖЛИВО: перевір, що калорії узгоджуються з БЖВ за формулою (Б×4 + В×4 + Ж×9 ≈ ккал, допустима похибка ±10%).
6. Якщо страва неоднозначна (вид м'яса, тип олії, наявність цукру/соусу) — постав needs_clarification=true та сформулюй конкретне коротке питання.

Якщо користувач надав уточнення — ДОВІРЯЙ ЙОМУ і використовуй як основу, не оспорюй.
Якщо на фото немає їжі — name="" і needs_clarification=true.

Контекст про користувача (для оцінки масштабу на фото): ${prof ? `${prof.sex ?? "?"}, ${prof.weight_kg ?? "?"}кг, ${prof.height_cm ?? "?"}см` : "невідомо"}.

Назви — українською. Відповідай ТІЛЬКИ через виклик інструмента submit_nutrition.`;

        let userText = "Проаналізуй фото страви.";
        if (body.name_only) {
          userText = `Користувач каже, що це: "${body.name_only}". Порція ~${body.name_only_grams ?? 100} г. Розрахуй калорії та БЖВ для цієї страви та порції (фото може бути не репрезентативним або відсутнім).`;
        } else if (body.hint && body.previous) {
          userText = `Попередня моя відповідь була: ${JSON.stringify({
            name: body.previous.name,
            grams: body.previous.grams,
            calories: body.previous.calories,
            assumptions: body.previous.assumptions,
          })}.
Користувач ВИПРАВЛЯЄ мене: "${body.hint}".
Перерахуй ПОВНІСТЮ з урахуванням цього уточнення. Користувач знає краще за тебе — довіряй його опису продуктів та порцій.`;
        } else if (body.hint) {
          userText = `Підказка від користувача: "${body.hint}". Врахуй її.`;
        }

        const userParts: Array<unknown> = [{ type: "text", text: userText }];
        if (body.imageBase64) {
          userParts.push({ type: "image_url", image_url: { url: body.imageBase64 } });
        }

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [
              { role: "system", content: sys },
              { role: "user", content: userParts },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "submit_nutrition",
                  description: "Returns precise nutrition breakdown for a food photo",
                  parameters: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      grams: { type: "number" },
                      calories: { type: "number" },
                      protein_g: { type: "number" },
                      carbs_g: { type: "number" },
                      fat_g: { type: "number" },
                      confidence: { type: "string", enum: ["low", "medium", "high"] },
                      notes: { type: "string" },
                      assumptions: { type: "string" },
                      needs_clarification: { type: "boolean" },
                      clarification_question: { type: "string" },
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            grams: { type: "number" },
                            calories: { type: "number" },
                            protein_g: { type: "number" },
                            carbs_g: { type: "number" },
                            fat_g: { type: "number" },
                          },
                          required: ["name", "grams", "calories", "protein_g", "carbs_g", "fat_g"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["name", "grams", "calories", "protein_g", "carbs_g", "fat_g", "confidence"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "submit_nutrition" } },
          }),
        });

        if (!resp.ok) {
          const t = await resp.text();
          const status = resp.status === 429 || resp.status === 402 ? resp.status : 500;
          return new Response(JSON.stringify({ error: t || "AI error" }), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }

        const data = (await resp.json()) as {
          choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
        };
        const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (!args) {
          return new Response(JSON.stringify({ error: "no result" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const parsed = JSON.parse(args);
          return new Response(JSON.stringify(parsed), {
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ error: "parse error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});