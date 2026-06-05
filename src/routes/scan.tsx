import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Camera, Barcode, Image as ImageIcon, Loader2 } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { macrosForGrams } from "@/lib/nutrition";

export const Route = createFileRoute("/scan")({
  head: () => ({ meta: [{ title: "Сканувати — CalorAI" }] }),
  component: () => (
    <AppLayout>
      <ScanPage />
    </AppLayout>
  ),
});

type AnalyzeResult = {
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence?: string;
  notes?: string;
};

function ScanPage() {
  const [mode, setMode] = useState<"photo" | "barcode">("photo");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Додати їжу</h1>
        <p className="text-sm text-muted-foreground">AI визначить страву й порахує БЖВ</p>
      </header>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setMode("photo")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium ${
            mode === "photo" ? "bg-card shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Camera className="h-4 w-4" /> Фото
        </button>
        <button
          onClick={() => setMode("barcode")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium ${
            mode === "barcode" ? "bg-card shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Barcode className="h-4 w-4" /> Штрих-код
        </button>
      </div>
      {mode === "photo" ? <PhotoScan /> : <BarcodeScan />}
    </div>
  );
}

function PhotoScan() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [grams, setGrams] = useState(100);
  const [meal, setMeal] = useState<"breakfast" | "lunch" | "dinner" | "snack">("snack");
  const [saving, setSaving] = useState(false);

  const onPick = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const analyze = async (hint?: string) => {
    if (!preview || !session) return;
    setAnalyzing(true);
    try {
      const resp = await fetch("/api/analyze-food", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ imageBase64: preview, hint }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        if (resp.status === 429) toast.error("Забагато запитів. Спробуй через хвилину.");
        else if (resp.status === 402) toast.error("Закінчились кредити AI. Поповни план Lovable.");
        else toast.error(t || "Помилка AI");
        return;
      }
      const j = (await resp.json()) as AnalyzeResult;
      setResult(j);
      setGrams(Math.round(j.grams) || 100);
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!result || !session) return;
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      if (file) {
        const path = `${session.user.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("food-photos").upload(path, file, {
          contentType: file.type,
        });
        if (!upErr) {
          const { data: signed } = await supabase.storage
            .from("food-photos")
            .createSignedUrl(path, 60 * 60 * 24 * 365);
          photoUrl = signed?.signedUrl ?? null;
        }
      }
      const k = grams / (result.grams || 100);
      const { error } = await supabase.from("food_entries").insert({
        user_id: session.user.id,
        meal,
        name: result.name,
        grams,
        calories: Math.round(result.calories * k),
        protein_g: +(result.protein_g * k).toFixed(1),
        carbs_g: +(result.carbs_g * k).toFixed(1),
        fat_g: +(result.fat_g * k).toFixed(1),
        photo_url: photoUrl,
        source: "photo_ai",
      });
      if (error) throw error;
      toast.success("Додано до щоденника");
      navigate({ to: "/today" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSaving(false);
    }
  };

  const k = result ? grams / (result.grams || 100) : 1;

  return (
    <div className="space-y-4">
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />

      {!preview ? (
        <div className="space-y-3">
          <button
            onClick={() => cameraInput.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-10 transition hover:border-primary"
          >
            <Camera className="h-10 w-10 text-primary" />
            <span className="text-base font-medium">Зробити фото</span>
            <span className="text-xs text-muted-foreground">Камера телефона</span>
          </button>
          <button
            onClick={() => galleryInput.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium"
          >
            <ImageIcon className="h-4 w-4" /> Вибрати з галереї
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
            <img src={preview} alt="" className="aspect-square w-full object-cover" />
          </div>

          {!result && !analyzing && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
              >
                Інше фото
              </Button>
              <Button className="flex-1" onClick={() => analyze()}>
                Аналізувати
              </Button>
            </div>
          )}

          {analyzing && (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-accent/40 p-6 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              AI вивчає фото…
            </div>
          )}

          {result && (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Розпізнано
                </div>
                <div className="text-lg font-semibold">{result.name}</div>
                {result.confidence && (
                  <div className="mt-1 inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    Впевненість: {result.confidence}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label>Порція</Label>
                  <span className="text-lg font-semibold">{grams} г</span>
                </div>
                <Input
                  type="range"
                  min={10}
                  max={1000}
                  step={10}
                  value={grams}
                  onChange={(e) => setGrams(parseInt(e.target.value))}
                />
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <Stat v={Math.round(result.calories * k)} l="ккал" big />
                <Stat v={(result.protein_g * k).toFixed(1)} l="Б" />
                <Stat v={(result.fat_g * k).toFixed(1)} l="Ж" />
                <Stat v={(result.carbs_g * k).toFixed(1)} l="В" />
              </div>

              <div className="space-y-1.5">
                <Label>Прийом їжі</Label>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      ["breakfast", "Сніданок"],
                      ["lunch", "Обід"],
                      ["dinner", "Вечеря"],
                      ["snack", "Перекус"],
                    ] as const
                  ).map(([k2, l]) => (
                    <button
                      key={k2}
                      onClick={() => setMeal(k2)}
                      className={`rounded-md py-1.5 text-xs font-medium transition ${
                        meal === k2
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setResult(null);
                    setPreview(null);
                    setFile(null);
                  }}
                >
                  Скасувати
                </Button>
                <Button className="flex-1" onClick={save} disabled={saving}>
                  {saving ? "Зберігаю…" : "Додати"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ v, l, big }: { v: number | string; l: string; big?: boolean }) {
  return (
    <div>
      <div className={big ? "text-xl font-bold text-primary" : "text-base font-semibold"}>{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div>
    </div>
  );
}

interface OffProduct {
  product_name?: string;
  brands?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
}

function BarcodeScan() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [product, setProduct] = useState<OffProduct | null>(null);
  const [grams, setGrams] = useState(100);
  const [meal, setMeal] = useState<"breakfast" | "lunch" | "dinner" | "snack">("snack");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    const reader = new BrowserMultiFormatReader();
    let stop = () => {};
    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (result, _err, controls) => {
        stop = () => controls.stop();
        if (result) {
          controls.stop();
          setScanning(false);
          lookup(result.getText());
        }
      })
      .catch((e) => {
        toast.error("Не вдалося відкрити камеру: " + (e instanceof Error ? e.message : ""));
        setScanning(false);
      });
    return () => stop();
  }, [scanning]);

  const lookup = async (code: string) => {
    setBarcode(code);
    setLoading(true);
    setProduct(null);
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
      const j = (await r.json()) as { status?: number; product?: OffProduct };
      if (j.status === 1 && j.product) {
        setProduct(j.product);
      } else {
        toast.error("Продукт не знайдено в базі Open Food Facts");
      }
    } catch {
      toast.error("Помилка пошуку");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!product || !session) return;
    const n = product.nutriments;
    if (!n) return;
    setSaving(true);
    const m = macrosForGrams(
      {
        c: n["energy-kcal_100g"] ?? 0,
        p: n.proteins_100g ?? 0,
        cb: n.carbohydrates_100g ?? 0,
        f: n.fat_100g ?? 0,
      },
      grams
    );
    const { error } = await supabase.from("food_entries").insert({
      user_id: session.user.id,
      meal,
      name: product.product_name || "Продукт",
      grams,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      source: `barcode:${barcode}`,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Додано");
      navigate({ to: "/today" });
    }
  };

  return (
    <div className="space-y-4">
      {!scanning && !product && (
        <>
          <button
            onClick={() => setScanning(true)}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-10 transition hover:border-primary"
          >
            <Barcode className="h-10 w-10 text-primary" />
            <span className="text-base font-medium">Сканувати штрих-код</span>
          </button>
          <div className="space-y-2">
            <Label>Або введи код вручну</Label>
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="напр. 5901234123457"
              />
              <Button onClick={() => barcode && lookup(barcode)} disabled={loading}>
                Знайти
              </Button>
            </div>
          </div>
        </>
      )}

      {scanning && (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-2xl border border-border bg-black">
            <video ref={videoRef} className="aspect-square w-full object-cover" />
          </div>
          <Button variant="outline" className="w-full" onClick={() => setScanning(false)}>
            Скасувати
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-accent/40 p-6 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Шукаю…
        </div>
      )}

      {product && product.nutriments && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{product.brands}</div>
            <div className="text-lg font-semibold">{product.product_name || "Продукт"}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              На 100 г: {Math.round(product.nutriments["energy-kcal_100g"] ?? 0)} ккал · Б{" "}
              {(product.nutriments.proteins_100g ?? 0).toFixed(1)} · Ж{" "}
              {(product.nutriments.fat_100g ?? 0).toFixed(1)} · В{" "}
              {(product.nutriments.carbohydrates_100g ?? 0).toFixed(1)}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label>Порція</Label>
              <span className="text-lg font-semibold">{grams} г</span>
            </div>
            <Input
              type="range"
              min={10}
              max={1000}
              step={5}
              value={grams}
              onChange={(e) => setGrams(parseInt(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Прийом їжі</Label>
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  ["breakfast", "Сніданок"],
                  ["lunch", "Обід"],
                  ["dinner", "Вечеря"],
                  ["snack", "Перекус"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setMeal(k)}
                  className={`rounded-md py-1.5 text-xs font-medium transition ${
                    meal === k
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setProduct(null);
                setBarcode("");
              }}
            >
              Інший
            </Button>
            <Button className="flex-1" onClick={save} disabled={saving}>
              {saving ? "…" : "Додати"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}