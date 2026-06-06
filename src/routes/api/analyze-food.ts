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

        // Pull user context + favorites for stability
        const [{ data: prof }, { data: favs }] = await Promise.all([
          supabase
            .from("profiles")
            .select("sex,weight_kg,height_cm")
            .eq("id", u.user.id)
            .maybeSingle(),
          supabase
            .from("favorites")
            .select("name,grams,calories,protein_g,carbs_g,fat_g")
            .order("use_count", { ascending: false })
            .limit(20),
        ]);

        const favoritesBlock = favs && favs.length
          ? `\n\nВЛАСНА БАЗА КОРИСТУВАЧА (вже перевірені цим користувачем страви — якщо нова страва дуже схожа на одну з них, використовуй ТІ Ж значення на 100г для консистентності):\n${favs
              .map((f) => {
                const g = Number(f.grams) || 100;
                const per100 = (v: number) => Math.round((Number(v) / g) * 100 * 10) / 10;
                return `- "${f.name}" → ${per100(Number(f.calories))} ккал/100г (Б${per100(Number(f.protein_g))} Ж${per100(Number(f.fat_g))} В${per100(Number(f.carbs_g))})`;
              })
              .join("\n")}`
          : "";

        const sys = `Ти професійний дієтолог-аналітик з 15-річним досвідом оцінки калорійності страв за фотографією. Твоя ціль — МАКСИМАЛЬНА ТОЧНІСТЬ і ДЕТЕРМІНОВАНІСТЬ (однакове фото = однаковий результат).

АЛГОРИТМ (виконуй СУВОРО по кроках):
1. Перерахуй ВСІ видимі компоненти страви окремо (тісто/хліб, м'ясо, овочі, сир, соус, олія тощо).
2. Для кожного компонента оціни вагу в грамах. Референси: тарілка ~26см, столова ложка ~15г олії, чашка ~250мл, куряче філе середнє ~150г, яйце ~55г.
3. Спосіб приготування: смажене на олії додає 5-15г олії (45-135 ккал); запечене без олії — нічого.
4. Використовуй ЯКОРНІ значення (на 100г, готовий продукт):
   • Лаваш тонкий: 270 ккал (Б9 Ж1 В55)
   • Хліб білий: 250 ккал (Б8 Ж3 В49)
   • Куряче філе варене: 165 ккал (Б31 Ж3.6 В0); смажене: 210 ккал (Б29 Ж9 В0)
   • Куряче стегно з шкірою смажене: 230 ккал (Б24 Ж14 В0)
   • Свинина смажена: 290 ккал (Б25 Ж21 В0)
   • Яловичина варена: 250 ккал (Б26 Ж16 В0)
   • Риба біла запечена: 130 ккал (Б22 Ж4 В0)
   • Лосось смажений: 215 ккал (Б22 Ж13 В0)
   • Яйце варене: 155 ккал (Б13 Ж11 В1); смажене: 200 ккал
   • Рис варений: 130 ккал (Б2.7 Ж0.3 В28)
   • Гречка варена: 110 ккал (Б4 Ж1 В20)
   • Картопля варена: 87 ккал; смажена: 190 ккал
   • Макарони варені: 130 ккал (Б5 Ж1 В25)
   • Сир твердий: 350 ккал (Б25 Ж27 В2)
   • Сир м'який (моцарела/фета): 280 ккал (Б18 Ж22 В3)
   • Овочі свіжі (огірок/помідор/салат): 15-25 ккал
   • Олія соняшникова: 900 ккал (Ж100)
   • Майонез: 680 ккал (Ж75 В2)
   • Сметана 20%: 200 ккал (Б2.8 Ж20 В3)
5. ОБОВ'ЯЗКОВО: перевір, що Б×4 + В×4 + Ж×9 ≈ ккал (похибка ≤10%). Якщо не сходиться — перерахуй макроси, бо ВОНИ правдиві.
6. Якщо страва неоднозначна (вид м'яса, наявність олії/соусу) — needs_clarification=true + конкретне коротке питання.

Якщо користувач надав уточнення — ДОВІРЯЙ йому беззаперечно.
Якщо на фото немає їжі — name="" і needs_clarification=true.

Контекст про користувача: ${prof ? `${prof.sex ?? "?"}, ${prof.weight_kg ?? "?"}кг` : "невідомо"}.${favoritesBlock}

Назви страв — українською. Відповідай ТІЛЬКИ через виклик інструмента submit_nutrition.`;

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
            temperature: 0,
            seed: 42,
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
          const parsed = JSON.parse(args) as {
            name: string;
            grams: number;
            calories: number;
            protein_g: number;
            carbs_g: number;
            fat_g: number;
            [k: string]: unknown;
          };
          // Server-side energy balance normalization
          const fromMacros =
            Number(parsed.protein_g) * 4 +
            Number(parsed.carbs_g) * 4 +
            Number(parsed.fat_g) * 9;
          if (fromMacros > 0 && Math.abs(parsed.calories - fromMacros) / fromMacros > 0.12) {
            parsed.calories = Math.round(fromMacros);
          } else {
            parsed.calories = Math.round(parsed.calories);
          }
          parsed.protein_g = Math.round(parsed.protein_g * 10) / 10;
          parsed.carbs_g = Math.round(parsed.carbs_g * 10) / 10;
          parsed.fat_g = Math.round(parsed.fat_g * 10) / 10;
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