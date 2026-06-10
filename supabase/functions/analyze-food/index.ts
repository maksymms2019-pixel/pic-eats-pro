// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Простий in-memory кеш для стабільності: однаковий запит → однакова відповідь
// (в межах часу життя одного інстансу edge-функції). Знімає випадковість моделі.
const CACHE = new Map<string, { at: number; data: unknown }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 хв
const CACHE_MAX = 200;

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function cacheGet(key: string) {
  const v = CACHE.get(key);
  if (!v) return undefined;
  if (Date.now() - v.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return undefined;
  }
  return v.data;
}

function cacheSet(key: string, data: unknown) {
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest) CACHE.delete(oldest);
  }
  CACHE.set(key, { at: Date.now(), data });
}

type OffNutriments = {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
};
type OffProduct = {
  product_name?: string;
  brands?: string;
  quantity?: string;
  image_url?: string;
  code?: string;
  nutriments?: OffNutriments;
};

function parseQuantityGrams(q?: string): number | undefined {
  if (!q) return undefined;
  const m = q.match(/(\d+(?:[.,]\d+)?)\s*(g|г|ml|мл|kg|кг|l|л)/i);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(",", "."));
  const u = m[2].toLowerCase();
  if (u === "g" || u === "г" || u === "ml" || u === "мл") return Math.round(n);
  if (u === "kg" || u === "кг" || u === "l" || u === "л") return Math.round(n * 1000);
  return undefined;
}

function pickBestOff(products: OffProduct[]): OffProduct | undefined {
  return products.find(
    (p) => p.nutriments && Number(p.nutriments["energy-kcal_100g"]) > 0
  );
}

function buildOffResult(p: OffProduct, packageGrams: number, fallbackName?: string) {
  const n = p.nutriments!;
  const per100 = {
    c: Number(n["energy-kcal_100g"]) || 0,
    p: Number(n.proteins_100g) || 0,
    cb: Number(n.carbohydrates_100g) || 0,
    f: Number(n.fat_100g) || 0,
  };
  const k = packageGrams / 100;
  const name =
    [p.brands?.split(",")[0]?.trim(), p.product_name].filter(Boolean).join(" ").trim() ||
    fallbackName ||
    "Продукт";
  return {
    name,
    grams: packageGrams,
    calories: Math.round(per100.c * k),
    protein_g: Math.round(per100.p * k * 10) / 10,
    carbs_g: Math.round(per100.cb * k * 10) / 10,
    fat_g: Math.round(per100.f * k * 10) / 10,
    confidence: "high",
    source: "openfoodfacts",
    source_url: p.code ? `https://world.openfoodfacts.org/product/${p.code}` : undefined,
    brand: p.brands?.split(",")[0]?.trim(),
    is_branded_packaged: true,
    package_grams: packageGrams,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } }
  );
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as {
    imageBase64?: string;
    imagesBase64?: string[];
    hint?: string;
    previous?: any;
    name_only?: string;
    name_only_grams?: number;
    barcode?: string;
  };

  if (body.barcode) {
    try {
      const r = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(body.barcode)}.json`
      );
      const j = (await r.json()) as { status?: number; product?: OffProduct };
      const off = j.status === 1 ? j.product : undefined;
      if (off?.nutriments) {
        const pg = parseQuantityGrams(off.quantity) ?? 100;
        return json(buildOffResult(off, pg));
      }
      return json({ error: "not found" }, 404);
    } catch {
      return json({ error: "OFF error" }, 500);
    }
  }

  const images: string[] = body.imagesBase64?.length
    ? body.imagesBase64
    : body.imageBase64
      ? [body.imageBase64]
      : [];
  if (images.length === 0 && !body.name_only) return json({ error: "no image" }, 400);

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return json({ error: "LOVABLE_API_KEY missing" }, 500);

  // Стабільність: кеш по hash(вхід). Підказка користувача змінює ключ.
  const cacheKey = await sha256Hex(
    JSON.stringify({
      imgs: images.map((i) => i.slice(0, 256) + ":" + i.length),
      hint: body.hint ?? null,
      previous: body.previous?.name ?? null,
      name_only: body.name_only ?? null,
      name_only_grams: body.name_only_grams ?? null,
    })
  );
  const cached = cacheGet(cacheKey);
  if (cached) return json(cached);

  const [{ data: prof }, { data: favs }, { data: recent }] = await Promise.all([
    supabase.from("profiles").select("sex,weight_kg,height_cm").eq("id", u.user.id).maybeSingle(),
    supabase.from("favorites").select("name,grams,calories,protein_g,carbs_g,fat_g").order("use_count", { ascending: false }).limit(20),
    supabase.from("food_entries").select("name,grams,calories,protein_g,carbs_g,fat_g").order("consumed_at", { ascending: false }).limit(8),
  ]);

  const favoritesBlock = favs && favs.length
    ? `\n\nВЛАСНА БАЗА КОРИСТУВАЧА:\n${favs.map((f: any) => {
        const g = Number(f.grams) || 100;
        const per100 = (v: number) => Math.round((Number(v) / g) * 100 * 10) / 10;
        return `- "${f.name}" → ${per100(Number(f.calories))} ккал/100г (Б${per100(Number(f.protein_g))} Ж${per100(Number(f.fat_g))} В${per100(Number(f.carbs_g))})`;
      }).join("\n")}`
    : "";

  const recentBlock = recent && recent.length
    ? `\n\nОСТАННІ СТРАВИ:\n${recent.map((e: any) => `- "${e.name}" ${Math.round(Number(e.grams))}г = ${Math.round(Number(e.calories))} ккал`).join("\n")}`
    : "";

  const multiPhotoBlock = images.length > 1
    ? `\n\nУВАГА: ${images.length} ФОТО. Перше — головне, решта — УТОЧНЮВАЛЬНІ. Якщо видно таблицю харчової цінності — використовуй САМЕ ЦІ значення.`
    : "";

  const sys = `Ти професійний дієтолог-аналітик. МАКСИМАЛЬНА ТОЧНІСТЬ і ДЕТЕРМІНОВАНІСТЬ.

-1. АНТИ-ГАЛЮЦИНАЦІЯ (НАЙВАЖЛИВІШЕ):
   • Рахуй ТІЛЬКИ те, що ВИДНО на фото. Не додавай "за асоціацією" (бутерброди ≠ печиво; кава ≠ цукор; салат ≠ олія, якщо не блищить).
   • Якщо на фото ОДНА страва (наприклад бутерброд, тарілка борщу, шматок піци) — items[] МАЄ бути ПУСТИЙ.
   • Не вигадуй гарніри, соуси, напої, фрукти. Лише видиме.
   • Якщо щось сумнівне (соус під сиром, олія в макаронах) — це йде в поле "assumptions" текстом, а не як окремий item.
0a. Якщо це ФАБРИЧНО УПАКОВАНИЙ БРЕНДОВИЙ ПРОДУКТ (Snickers, Coca-Cola, Pringles, Roshen тощо) — постав is_branded_packaged=true, дай brand, product_name_clean, search_query англ., package_grams.
   • ЗАБОРОНЕНО самостійно вигадувати ккал для брендового продукту — лише грубі orientiri в anchors; точні цифри підтягне база.
0. Якщо є етикетка — починай з неї.
1. Перерахуй ВИДИМІ компоненти, оціни вагу. Референси: тарілка ~26см, ложка ~15г олії, чашка ~250мл, філе ~150г, яйце ~55г, скиба хліба ~25г.
2. Якорі (ккал/100г, готовий): хліб білий 250, куряче філе варене 165 / смажене 210, рис варений 130, гречка 110, картопля смажена 190, макарони 130, сир твердий 350, олія 900, майонез 680, гранола 470, борщ 50, шаурма 220, піца 260, чіпси 530, шоколад 545, банан 90, яблуко 50.
   • Snickers 50г: 250 ккал; Mars 51г: 230; Twix 50г: 250; KitKat 41.5г: 210; Coca-Cola 330мл: 140; Red Bull 250мл: 115.
3. Б×4 + В×4 + Ж×9 ≈ ккал (≤10%). Інакше — перерахуй.
4. items[] — ТІЛЬКИ якщо чітко видно ≥2 РІЗНИХ страв/продуктів окремо (наприклад: котлета + пюре + салат). Для одного блюда — items[] ПУСТИЙ.
5. Якщо неоднозначно — needs_clarification=true + коротке питання.
6. Будь стабільним: на однаковому фото — однакова відповідь до грама.

Якщо користувач уточнив — ДОВІРЯЙ.
Якщо нема їжі — name="" needs_clarification=true.${multiPhotoBlock}

Контекст: ${prof ? `${prof.sex ?? "?"}, ${prof.weight_kg ?? "?"}кг` : "?"}.${favoritesBlock}${recentBlock}

Назви українською. ТІЛЬКИ через виклик інструмента submit_nutrition.`;

  let userText = "Проаналізуй фото страви.";
  if (images.length > 1) {
    userText = `Проаналізуй ${images.length} фото: 1-ше — головне, решта — уточнювальні.`;
  }
  if (body.name_only) {
    userText = `Це: "${body.name_only}". Порція ~${body.name_only_grams ?? 100}г.`;
  } else if (body.hint && body.previous) {
    userText = `Попередня відповідь: ${JSON.stringify({ name: body.previous.name, grams: body.previous.grams, calories: body.previous.calories })}.
Користувач ВИПРАВЛЯЄ: "${body.hint}". Перерахуй ПОВНІСТЮ.`;
  } else if (body.hint) {
    userText = `Підказка: "${body.hint}". Врахуй її.`;
  }

  const userParts: any[] = [{ type: "text", text: userText }];
  for (const img of images) userParts.push({ type: "image_url", image_url: { url: img } });

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      temperature: 0,
      seed: 42,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userParts },
      ],
      tools: [{
        type: "function",
        function: {
          name: "submit_nutrition",
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
              is_branded_packaged: { type: "boolean" },
              brand: { type: "string" },
              product_name_clean: { type: "string" },
              search_query: { type: "string" },
              package_grams: { type: "number" },
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
      }],
      tool_choice: { type: "function", function: { name: "submit_nutrition" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    const status = resp.status === 429 || resp.status === 402 ? resp.status : 500;
    return json({ error: t || "AI error" }, status);
  }

  const data = await resp.json() as any;
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return json({ error: "no result" }, 500);

  try {
    const parsed = JSON.parse(args) as any;

    if (parsed.is_branded_packaged) {
      const query = (parsed.search_query || `${parsed.brand ?? ""} ${parsed.product_name_clean ?? parsed.name}`.trim()).trim();
      if (query) {
        try {
          const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,brands,nutriments,quantity,image_url,code`;
          const r = await fetch(url, { headers: { "User-Agent": "CalorAI/1.0" } });
          if (r.ok) {
            const j = await r.json() as { products?: OffProduct[] };
            const best = pickBestOff(j.products ?? []);
            if (best?.nutriments && Number(best.nutriments["energy-kcal_100g"]) > 0) {
              const pg = parseQuantityGrams(best.quantity) ?? parsed.package_grams ?? Math.round(parsed.grams) ?? 100;
              return json(buildOffResult(best, pg, parsed.name));
            }
          }
        } catch { /* fallthrough */ }
      }
      parsed.confidence = "low";
      if (!parsed.clarification_question) {
        parsed.clarification_question = "Не знайшов цей продукт у базі — підкажи точну назву чи скільки грамів у пакуванні?";
        parsed.needs_clarification = true;
      }
    }

    const fromMacros = Number(parsed.protein_g) * 4 + Number(parsed.carbs_g) * 4 + Number(parsed.fat_g) * 9;
    if (fromMacros > 0 && Math.abs(parsed.calories - fromMacros) / fromMacros > 0.12) {
      parsed.calories = Math.round(fromMacros);
    } else {
      parsed.calories = Math.round(parsed.calories);
    }
    const g = Number(parsed.grams) || 0;
    if (g > 0) {
      const kpg = parsed.calories / g;
      if ((kpg > 9.0 || kpg < 0.2) && fromMacros > 0) parsed.calories = Math.round(fromMacros);
    }
    parsed.protein_g = Math.round(parsed.protein_g * 10) / 10;
    parsed.carbs_g = Math.round(parsed.carbs_g * 10) / 10;
    parsed.fat_g = Math.round(parsed.fat_g * 10) / 10;
    return json(parsed);
  } catch {
    return json({ error: "parse error" }, 500);
  }
});