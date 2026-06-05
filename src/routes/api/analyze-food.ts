import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

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

        const body = (await request.json()) as { imageBase64?: string; hint?: string };
        if (!body.imageBase64) {
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

        const sys = `Ти експерт з харчування. Дивися на фото їжі і визначай:
- name: коротка назва страви українською
- grams: оцінювана вага порції в грамах (числом)
- calories: ккал в порції (числом)
- protein_g, carbs_g, fat_g: грами макронутрієнтів (числами)
- confidence: "low" | "medium" | "high"
- notes: коротка нотатка (опц.)
Якщо на фото немає їжі — повертай null для name.
Відповідай ТІЛЬКИ через виклик інструмента submit_nutrition.`;

        const userParts: Array<unknown> = [
          { type: "text", text: body.hint ? `Підказка: ${body.hint}` : "Що це за страва?" },
          {
            type: "image_url",
            image_url: { url: body.imageBase64 },
          },
        ];

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: sys },
              { role: "user", content: userParts },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "submit_nutrition",
                  description: "Returns nutrition estimate for a food photo",
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