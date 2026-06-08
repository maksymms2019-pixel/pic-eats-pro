## Фінальне покращення — фокус на 4 речах

Найважливіше зараз — щоб **брендовані продукти** (Snickers, Coca-Cola, M&M's, Roshen тощо) рахувались не "на око", а за точними даними з пакування / бази Open Food Facts. Решта — шліфовка.

---

### 1. Брендовий режим: AI визначає → беремо точні значення з бази (головне)

**Сервер `src/routes/api/analyze-food.ts`:**
- Розширюємо tool-схему: AI повертає додаткові поля
  ```
  is_branded_packaged: boolean
  brand: string         // "Snickers", "Coca-Cola"
  product_name_clean: string   // "Snickers Classic 50g"
  search_query: string  // оптимізована для OFF
  package_grams: number // якщо видно вагу на упаковці
  ```
- У системному промпті явно: "Якщо це фабрично упакований брендовий продукт (батончик, чіпси, шоколад, газований напій, йогурт у баночці) — НЕ вгадуй ккал на око. Постав is_branded_packaged=true, дай чистий бренд+назву. Підрахунок зробить додаток через офіційну базу."
- Після виклику AI: якщо `is_branded_packaged=true`:
  1. Шукаємо в Open Food Facts: `GET https://world.openfoodfacts.org/cgi/search.pl?search_terms={query}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,brands,nutriments,quantity,image_url`.
  2. Якщо знаходимо продукт з валідним `energy-kcal_100g` — **підміняємо** калорії/Б/Ж/В на значення з OFF, перераховуємо на `package_grams` (або 100г якщо не видно).
  3. У відповіді додаємо `source: "openfoodfacts"` + `source_url`, щоб UI показав "За даними бази продуктів".
  4. Якщо в OFF нічого не знайдено — fallback до AI-оцінки + `confidence: "low"` + clarification: "Не знайшов у базі — скільки грамів?"
- Окремий шлях `body.barcode`: якщо вже є штрих-код (з режиму barcode) → одразу OFF без AI.

**UI `scan.tsx`:** коли `source: "openfoodfacts"` — бейдж "📦 За даними виробника" замість "Впевненість". Прибираємо валідатор Б·4+В·4+Ж·9 для брендів (там і так точно).

### 2. Мульти-фото лайтбокс із свайпами (а не вертикальний скрол)

**`today.tsx`** → новий компонент `<PhotoLightbox urls indexInitial onClose />`:
- Горизонтальні свайпи (touch + клавіші ←/→), точки-індикатор, лічильник "2/4".
- Pinch-zoom не робимо (overkill), але `object-contain` + tap-to-close.
- Замість поточного вертикального стовпчика з `overflow-y-auto`.

### 3. Edit/duplicate запису в щоденнику

**`today.tsx`** — у картці запису додаємо кнопку "⋯" → меню:
- "Змінити порцію" → інлайн-слайдер грамів, перераховуємо ккал/Б/Ж/В пропорційно, UPDATE в БД.
- "Повторити" → INSERT копії з `consumed_at = now()` (швидке додавання).
- Кнопки ♥/🗑 лишаються.

### 4. Точність + дрібниці

**`analyze-food.ts`:**
- У промпт додаю явну заборону: "Для рукотворних страв (борщ, плов, паста) — оцінюй на око. Для брендованих упаковок — НЕ оцінюй, поверни is_branded_packaged=true."
- Додаю якорі для популярних брендів-снеків (Snickers 50г ~250 ккал, Mars 51г ~230, Twix 50г ~250, KitKat 41.5г ~210, Coca-Cola 330мл ~140, Pepsi 330мл ~140, Red Bull 250мл ~115) — як підказку коли OFF недоступний.
- Виправляю баг: коли користувач передає `name_only` без фото — `images.length === 0` пропускає валідацію, але `userParts` все одно містить лише text → це ОК, але треба не передавати порожній масив у Gemini. Перевірю — поки нормально.

**`scan.tsx`:**
- Коли `result.source === "openfoodfacts"` → грами автоматично = `package_grams` (повна упаковка), не 100.
- Прибрати дубль input refs (cameraInput/extraCameraInput роблять одне й те ж — об'єднати в один).

**`AppLayout.tsx`:** активний стан кнопки "Скан" — додати `scale-105` коли на /scan.

**Без змін:** онбординг, профіль, BMR/TDEE, auth, barcode-режим (він і так через OFF).

### 5. Без міграцій БД

Все вкладається в існуючі поля (`source` вже text, `photo_urls` вже масив).

---

## Технічні файли

- `src/routes/api/analyze-food.ts` — OFF lookup, нові поля в tool-схемі, новий промпт
- `src/routes/scan.tsx` — рендер бейджа "За даними виробника", автогрейми з пакування
- `src/routes/today.tsx` — `<PhotoLightbox>` з свайпами, меню "⋯" з edit/duplicate
- `src/components/AppLayout.tsx` — active scale на Скан

Без нових залежностей, без міграцій.
