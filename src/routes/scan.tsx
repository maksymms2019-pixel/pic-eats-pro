import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Camera, Barcode, Image as ImageIcon, Loader2, X, AlertTriangle, Sparkles, Heart, Check, Plus } from "lucide-react";
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
  source?: string;
  source_url?: string;
  brand?: string;
  is_branded_packaged?: boolean;
  package_grams?: number;
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

type Photo = { file: File; preview: string };

const MAX_PHOTOS = 4;

function PhotoScan() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const extraCameraInput = useRef<HTMLInputElement>(null);
  const extraGalleryInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
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

  const readAsDataURL = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(f);
    });

  const addPhotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const room = MAX_PHOTOS - photos.length;
    const slice = Array.from(files).slice(0, room);
    const next: Photo[] = [];
    for (const f of slice) {
      try {
        const preview = await readAsDataURL(f);
        next.push({ file: f, preview });
      } catch {}
    }
    if (next.length) {
      setPhotos((p) => [...p, ...next]);
      setResult(null);
      setFavSaved(false);
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((p) => p.filter((_, i) => i !== idx));
    setResult(null);
  };

  const resetAll = () => {
    setPhotos([]);
    setResult(null);
    setFavSaved(false);
  };

  const analyze = async (opts?: { hint?: string; previous?: AnalyzeResult; nameOnly?: string; nameOnlyGrams?: number }) => {
    if (!session) return;
    if (photos.length === 0 && !opts?.nameOnly) return;
    setAnalyzing(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        toast.error("Відсутній VITE_GEMINI_API_KEY у налаштуваннях");
        setAnalyzing(false);
        return;
      }

            let prompt = `Ти — професійний фітнес-дієтолог та експерт із підрахунку калорій. 
Твоє завдання — детально проаналізувати страву на фотографії (або за наданою назвою) та розрахувати:
1. Загальну вагу цієї порції у грамах (grams).
2. Калорійність (calories) у ккал для ВСІЄЇ порції.
3. Макронутрієнти у грамах для ВСІЄЇ порції: білки (protein_g), вуглеводи (carbs_g), жири (fat_g).

КРИТИЧНО ВАЖЛИВО: 
- НЕ ПОВЕРТАЙ нулі (0) для calories, protein_g, carbs_g, fat_g, якщо на фото є їжа.
- Проаналізуй кожен інгредієнт окремо (наприклад: яйця, олія для смаження, хліб), згадай їхню стандартну калорійність на 100г, оціни їхню вагу на око і сумуй показники.
- Навіть якщо точна вага невідома, зроби максимально реалістичне експертне припущення. Значення обов'язково мають бути більшими за нуль!
- Назва страви (name) має бути українською мовою.`;

      if (opts?.hint) prompt += `\nДодатковий контекст від користувача: "${opts.hint}"`;
      if (opts?.nameOnly) prompt += `\nНазва страви: "${opts.nameOnly}", очікувана вага порції: ${opts.nameOnlyGrams || 150}г. Розрахуй макроси саме для цієї ваги.`;

      let responseText = "";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const geminiConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Назва страви українською мовою" },
            grams: { type: "INTEGER", description: "Загальна вага порції в грамах, наприклад 180" },
            calories: { type: "INTEGER", description: "Калорійність всієї порції в ккал, строго більше 0" },
            protein_g: { type: "NUMBER", description: "Білки в грамах для всієї порції, строго більше 0" },
            carbs_g: { type: "NUMBER", description: "Вуглеводи в грамах для всієї порції, строго більше 0" },
            fat_g: { type: "NUMBER", description: "Жири в грамах для всієї порції, строго більше 0" },
            confidence: { type: "STRING" },
            assumptions: { type: "STRING", description: "Опис припущень та розрахунків інгредієнтів" },
            needs_clarification: { type: "BOOLEAN" },
            clarification_question: { type: "STRING" }
          },
          required: ["name", "grams", "calories", "protein_g", "carbs_g", "fat_g"]
        }
      };

      if (opts?.nameOnly) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: geminiConfig
          })
        });
        if (!response.ok) throw new Error("Gemini Error");
        const data = await response.json();
        responseText = data.candidates[0].content.parts[0].text;
      } else {
        const inlineDataParts = photos.map((p) => ({
          inlineData: { data: p.preview.split(",")[1], mimeType: p.file.type || "image/jpeg" }
        }));

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, ...inlineDataParts] }],
            generationConfig: geminiConfig
          })
        });
        if (!response.ok) throw new Error("Gemini Error");
        const data = await response.json();
        responseText = data.candidates[0].content.parts[0].text;
      }

      const j = JSON.parse(responseText.trim()) as AnalyzeResult;
      setResult(j);
      setGrams(Math.round(j.package_grams || j.grams) || 100);
      setHint("");
      setShowManual(false);
      setFavSaved(false);
    } catch (error) {
      console.error(error);
      toast.error("Не вдалося розпізнати страву. Перевір ключ або інтернет.");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveLog = async () => {
    if (!session || !result) return;
    setSaving(true);
    try {
      const mul = grams / (result.package_grams || result.grams || 100);
      const { error } = await supabase.from("nutrition_logs").insert({
        user_id: session.user.id,
        meal_type: meal,
        food_name: result.name,
        grams: grams,
        calories: Math.round(result.calories * mul),
        protein_g: Number((result.protein_g * mul).toFixed(1)),
        carbs_g: Number((result.carbs_g * mul).toFixed(1)),
        fat_g: Number((result.fat_g * mul).toFixed(1)),
        logged_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Страву успішно додано до щоденника!");
      navigate({ to: "/today" });
    } catch (e) {
      console.error(e);
      toast.error("Помилка при збереженні");
    } finally {
      setSaving(false);
    }
  };

  const saveToFav = async () => {
    if (!session || !result) return;
    setSavingFav(true);
    try {
      const baseGrams = result.package_grams || result.grams || 100;
      const { error } = await supabase.from("favorite_foods").insert({
        user_id: session.user.id,
        name: result.name,
        calories_per_100g: Math.round((result.calories / baseGrams) * 100),
        protein_per_100g: Number(((result.protein_g / baseGrams) * 100).toFixed(1)),
        carbs_per_100g: Number(((result.carbs_g / baseGrams) * 100).toFixed(1)),
        fat_per_100g: Number(((result.fat_g / baseGrams) * 100).toFixed(1)),
      });
      if (error) throw error;
      toast.success("Додано в улюблені!");
      setFavSaved(true);
    } catch (e) {
      console.error(e);
      toast.error("Не вдалося додати в обране");
    } finally {
      setSavingFav(false);
    }
  };

  const currentMacros = result ? macrosForGrams(result, grams) : null;

  return (
    <div className="space-y-6 pb-24">
      {photos.length === 0 && !result && !showManual && (
        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed"
            onClick={() => cameraInput.current?.click()}
          >
            <Camera className="h-6 w-6 text-primary" />
            <span className="text-xs">Зробити photo</span>
            <input type="file" accept="image/*" capture="environment" ref={cameraInput} className="hidden" onChange={(e) => addPhotos(e.target.files)} />
          </Button>
          <Button
            variant="outline"
            className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed"
            onClick={() => galleryInput.current?.click()}
          >
            <ImageIcon className="h-6 w-6 text-primary" />
            <span className="text-xs">З галереї</span>
            <input type="file" accept="image/*" multiple ref={galleryInput} className="hidden" onChange={(e) => addPhotos(e.target.files)} />
          </Button>
          <Button variant="link" className="col-span-2 text-xs text-muted-foreground" onClick={() => setShowManual(true)}>
            Ввести назву вручну
          </Button>
        </div>
      )}

      {showManual && !result && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-sm">Пошук страви через AI</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowManual(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Що ви з'їли?</Label>
            <Input placeholder="Наприклад: гречка з куркою та огірком" value={manualName} onChange={(e) => setManualName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Приблизна вага (грамів)</Label>
            <Input type="number" value={manualGrams} onChange={(e) => setManualGrams(Number(e.target.value))} />
          </div>
          <Button className="w-full gap-2" disabled={analyzing || !manualName} onClick={() => analyze({ nameOnly: manualName, nameOnlyGrams: manualGrams })}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Проаналізувати
          </Button>
        </div>
      )}

      {photos.length > 0 && !result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {photos.map((p, idx) => (
              <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-muted group">
                <img src={p.preview} alt="food preview" className="h-full w-full object-cover" />
                <button
                  onClick={() => removePhoto(idx)}
                  className="absolute top-2 right-2 p-1 rounded-full bg-background/80 hover:bg-background text-foreground shadow-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <div className="grid grid-cols-1 gap-2 aspect-square">
                <Button variant="outline" className="flex flex-col h-full border-dashed items-center justify-center gap-1 p-2" onClick={() => extraCameraInput.current?.click()}>
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Камера</span>
                  <input type="file" accept="image/*" capture="environment" ref={extraCameraInput} className="hidden" onChange={(e) => addPhotos(e.target.files)} />
                </Button>
                <Button variant="outline" className="flex flex-col h-full border-dashed items-center justify-center gap-1 p-2" onClick={() => extraGalleryInput.current?.click()}>
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Галерея</span>
                  <input type="file" accept="image/*" multiple ref={extraGalleryInput} className="hidden" onChange={(e) => addPhotos(e.target.files)} />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="hint" className="text-xs">Уточнення або контекст (необов'язково)</Label>
            <Input id="hint" placeholder="Наприклад: кава на мигдалевому молоці" value={hint} onChange={(e) => setHint(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resetAll} disabled={analyzing}>Очистити</Button>
            <Button className="flex-[2] gap-2" onClick={() => analyze({ hint })} disabled={analyzing}>
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Аналізувати
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{result.name}</h2>
                {result.brand && <p className="text-xs text-muted-foreground font-medium">{result.brand}</p>}
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  Точність: <span className={result.confidence === "Висока" ? "text-emerald-500 font-semibold" : "text-amber-500 font-semibold"}>{result.confidence || "Середня"}</span>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={resetAll}>Новий скан</Button>
            </div>

            {result.assumptions && (
              <div className="rounded-lg bg-muted p-2 text-xs text-muted-foreground flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p>{result.assumptions}</p>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-primary/5 p-2">
                <p className="text-xl font-bold text-primary">{currentMacros?.calories || 0}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase">Ккал</p>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <p className="text-sm font-bold">{currentMacros?.protein_g || 0}г</p>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Білки</p>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <p className="text-sm font-bold">{currentMacros?.carbs_g || 0}г</p>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Вугл</p>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <p className="text-sm font-bold">{currentMacros?.fat_g || 0}г</p>
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Жири</p>
              </div>
            </div>

            {result.items && result.items.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground px-0.5">Склад страви:</p>
                {result.items.map((it, i) => (
                  <div key={i} className="flex justify-between items-center text-xs bg-muted/30 p-2 rounded-lg">
                    <span className="font-medium truncate max-w-[180px]">{it.name}</span>
                    <span className="text-muted-foreground font-mono shrink-0">{it.grams}г • {it.calories} ккал</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4 border-t pt-4">
              <div className="flex gap-4 items-center">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="weight" className="text-xs font-semibold">Скільки ви з'їли (грамів)?</Label>
                  <Input id="weight" type="number" value={grams} onChange={(e) => setGrams(Number(e.target.value))} className="font-semibold" />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-semibold">Прийом їжі</Label>
                  <select
                    value={meal}
                    onChange={(e: any) => setMeal(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                  >
                    <option value="breakfast">Сніданок</option>
                    <option value="lunch">Обід</option>
                    <option value="dinner">Вечеря</option>
                    <option value="snack">Перекус</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="icon" onClick={saveToFav} disabled={savingFav || favSaved} className="shrink-0 h-11 w-11">
                  {favSaved ? <Check className="h-4 w-4 text-emerald-500" /> : <Heart className="h-4 w-4" />}
                </Button>
                <Button className="flex-1 h-11 gap-2 font-medium shadow-sm" onClick={saveLog} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Додати в щоденник
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BarcodeScan() {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground space-y-2">
      <Barcode className="h-8 w-8 mx-auto text-muted-foreground/60" />
      <p className="text-sm font-medium">Сканування штрих-кодів незабаром</p>
      <p className="text-xs text-muted-foreground/80">Використовуйте вкладку Фото для аналізу страв за допомогою AI.</p>
    </div>
  );
}