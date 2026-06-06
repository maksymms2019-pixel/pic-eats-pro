import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Camera, Barcode, Image as ImageIcon, Loader2, X, AlertTriangle, Sparkles, Heart, Check } from "lucide-react";
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
  assumptions?: string;
  needs_clarification?: boolean;
  clarification_question?: string;
  items?: Array<{
    name: string;
    grams: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>;
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
  const [hint, setHint] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualGrams, setManualGrams] = useState(150);
  const [showManual, setShowManual] = useState(false);
  const [savingFav, setSavingFav] = useState(false);
  const [favSaved, setFavSaved] = useState(false);

  const onPick = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setFavSaved(false);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const analyze = async (opts?: { hint?: string; previous?: AnalyzeResult; nameOnly?: string; nameOnlyGrams?: number }) => {
    if (!session) return;
    if (!preview && !opts?.nameOnly) return;
    setAnalyzing(true);
    try {
      const resp = await fetch("/api/analyze-food", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          imageBase64: preview ?? undefined,
          hint: opts?.hint,
          previous: opts?.previous,
          name_only: opts?.nameOnly,
          name_only_grams: opts?.nameOnlyGrams,
        }),
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
      setHint("");
      setShowManual(false);
      setFavSaved(false);
    } finally {
      setAnalyzing(false);
    }
  };

  const removeItem = (idx: number) => {
    if (!result?.items) return;
    const items = result.items.filter((_, i) => i !== idx);
    const totals = items.reduce(
      (a, it) => ({
        grams: a.grams + Number(it.grams),
        calories: a.calories + Number(it.calories),
        protein_g: a.protein_g + Number(it.protein_g),
        carbs_g: a.carbs_g + Number(it.carbs_g),
        fat_g: a.fat_g + Number(it.fat_g),
      }),
      { grams: 0, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    setResult({
      ...result,
      items,
      grams: totals.grams || result.grams,
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
    });
    setGrams(Math.round(totals.grams) || grams);
  };

  const save = async () => {
    if (!result || !session) return;
    setSaving(true);
    try {
      const photoUrl = await uploadPhoto();
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

  const uploadPhoto = async (): Promise<string | null> => {
    if (!file || !session) return null;
    const path = `${session.user.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("food-photos").upload(path, file, {
      contentType: file.type,
    });
    if (upErr) return null;
    const { data: signed } = await supabase.storage
      .from("food-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? null;
  };

  const saveAsFavorite = async () => {
    if (!result || !session) return;
    setSavingFav(true);
    try {
      const photoUrl = await uploadPhoto();
      const { error } = await supabase.from("favorites").insert({
        user_id: session.user.id,
        name: result.name,
        grams: Math.round(result.grams) || 100,
        calories: Math.round(result.calories),
        protein_g: +result.protein_g.toFixed(1),
        carbs_g: +result.carbs_g.toFixed(1),
        fat_g: +result.fat_g.toFixed(1),
        photo_url: photoUrl,
      });
      if (error) throw error;
      setFavSaved(true);
      toast.success("Збережено в Мої страви");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не вдалося зберегти");
    } finally {
      setSavingFav(false);
    }
  };

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
          <div className="rounded-xl border border-dashed border-border bg-card p-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Або без фото — за назвою:</div>
            <div className="space-y-2">
              <Input
                placeholder="напр. куряче філе з рисом"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
              <div className="flex items-baseline justify-between text-xs">
                <Label>Порція</Label>
                <span className="font-semibold">{manualGrams} г</span>
              </div>
              <Input
                type="range"
                min={20}
                max={800}
                step={10}
                value={manualGrams}
                onChange={(e) => setManualGrams(parseInt(e.target.value))}
              />
              <Button
                className="w-full"
                disabled={!manualName.trim() || analyzing}
                onClick={() =>
                  analyze({ nameOnly: manualName.trim(), nameOnlyGrams: manualGrams })
                }
              >
                {analyzing ? "Рахую…" : "Розрахувати"}
              </Button>
            </div>
          </div>
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

              {result.items && result.items.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Компоненти страви</Label>
                  <div className="space-y-1">
                    {result.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 rounded-lg bg-accent/40 px-2.5 py-1.5 text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{it.name}</div>
                          <div className="text-muted-foreground">
                            {Math.round(it.grams)}г · {Math.round(it.calories)} ккал
                          </div>
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Прибрати"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.assumptions && (
                <div className="rounded-lg border border-dashed border-border p-2.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">AI припустив: </span>
                  {result.assumptions}
                </div>
              )}

              {result.needs_clarification && result.clarification_question && (
                <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                  <span>{result.clarification_question}</span>
                </div>
              )}

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

              {(() => {
                const fromMacros =
                  result.protein_g * 4 + result.carbs_g * 4 + result.fat_g * 9;
                const ok = fromMacros > 0 && Math.abs(result.calories - fromMacros) / fromMacros <= 0.1;
                return (
                  <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                    <Check className={`h-3 w-3 ${ok ? "text-primary" : "text-muted-foreground"}`} />
                    Б·4+В·4+Ж·9 = {Math.round(fromMacros)} ккал {ok ? "✓" : "≈"}
                  </div>
                );
              })()}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={savingFav || favSaved}
                onClick={saveAsFavorite}
              >
                <Heart className={`mr-1.5 h-4 w-4 ${favSaved ? "fill-primary text-primary" : ""}`} />
                {favSaved ? "У моїх стравах" : savingFav ? "Зберігаю…" : "Зберегти як мою страву"}
              </Button>

              <div className="space-y-1.5 rounded-lg bg-primary/5 p-2.5">
                <Label className="text-xs">
                  <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                  Уточнити для AI (підвищить точність)
                </Label>
                <Input
                  placeholder="напр. це індичка ~150г, гречка ~120г, без олії"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    disabled={!hint.trim() || analyzing}
                    onClick={() => analyze({ hint, previous: result })}
                  >
                    Перерахувати з підказкою
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManual((s) => !s)}
                  className="text-xs text-muted-foreground underline"
                >
                  {showManual ? "Сховати" : "Це зовсім інша страва →"}
                </button>
                {showManual && (
                  <div className="space-y-2 pt-1">
                    <Input
                      placeholder="Точна назва страви"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                    />
                    <div className="flex items-baseline justify-between text-xs">
                      <Label>Порція</Label>
                      <span className="font-semibold">{manualGrams} г</span>
                    </div>
                    <Input
                      type="range"
                      min={20}
                      max={800}
                      step={10}
                      value={manualGrams}
                      onChange={(e) => setManualGrams(parseInt(e.target.value))}
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!manualName.trim() || analyzing}
                      onClick={() =>
                        analyze({ nameOnly: manualName.trim(), nameOnlyGrams: manualGrams })
                      }
                    >
                      Розрахувати за назвою
                    </Button>
                  </div>
                )}
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
    let stop = () => {};
    let cancelled = false;
    (async () => {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (cancelled || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
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
    })();
    return () => {
      cancelled = true;
      stop();
    };
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