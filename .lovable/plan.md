План такий: переносимо застосунок з TanStack Start/server routes на звичайний React + Vite + Tailwind SPA, щоб `vite build` давав статичну папку `dist` без SSR, Nitro, worker/server runtime і без server functions.

1. Перебудувати основу проєкту під SPA
- Замінити Vite-конфіг на звичайний `@vitejs/plugin-react` + Tailwind + path alias `@`.
- Додати стандартний браузерний entrypoint (`src/main.tsx`) і SPA-shell.
- Прибрати залежність від `@tanstack/react-start`, `nitro`, server entry/start files і TanStack Start-specific root shell.
- Зберегти TanStack Router як client-side router або перейти на простий browser-router під SPA без серверної частини.

2. Прибрати локальні API-роути, які не працюють у static hosting
- Видалити/вивести з маршрутизації `src/routes/api/analyze-food.ts` і `src/routes/api/coach.ts`, бо у Vercel/Netlify static build вони не існують.
- Замінити виклики `/api/analyze-food` і `/api/coach` на виклики backend-функцій Lovable Cloud / бази, які доступні зі статичного фронтенду.
- Ключ AI залишити тільки на backend side; не переносити `LOVABLE_API_KEY` у frontend.

3. Відновити AI-аналіз їжі для статичного SPA
- Створити backend endpoint/function для аналізу їжі, який прийматиме фото/підказку/barcode, перевірятиме користувача, читатиме контекст профілю/обраного/останніх страв і викликатиме Lovable AI.
- Перенести поточну покращену логіку точності: анти-галюцинації, кілька фото, етикетки, branded product handling, Open Food Facts/barcode lookup.
- Оновити frontend `scan.tsx`, щоб він викликав цей backend endpoint/function напряму через Lovable Cloud client, а не `/api/analyze-food`.

4. Відновити AI-коуча для статичного SPA
- Перенести `/api/coach` у backend endpoint/function.
- Оновити `coach.tsx`, щоб працював у SPA без server route. Якщо streaming буде несумісний із простим static-hosting шляхом, зробити стабільну non-streaming відповідь із loader-state, щоб функція гарантовано працювала після deploy.

5. Пристосувати routing/deploy до static hosting
- Додати `public/_redirects` для Netlify і `vercel.json` тільки якщо без нього deep links у SPA не працюватимуть; якщо ціль строго “без складних конфігів”, конфіг буде мінімальним rewrite-to-index.
- Перевірити, щоб `/today`, `/scan`, `/coach`, `/foods`, `/profile`, `/auth` відкривались як client-side routes після refresh.

6. Очистити залежності й типи
- Оновити `package.json`/lockfile: прибрати Start/Nitro, залишити React, Vite, Tailwind, TanStack Router/Query, backend client, UI-залежності.
- Прибрати imports `HeadContent`, `Scripts`, `createRootRouteWithContext` shell-only patterns, server-only files із build include.
- Перевірити, що `vite build` генерує звичайний `dist`.

7. Точність калорій після міграції
- Додати додаткову валідацію відповіді AI на backend: не приймати невидимі items, sanity-check ккал/г, macro calories consistency, branded product override через Open Food Facts, стабільніші fallback anchors.
- Для випадків типу “бутерброди + AI додав печиво” зробити frontend-можливість швидко прибрати помилковий item уже є; додатково backend має менше створювати items без явних кількох видимих продуктів.

Результат: проєкт залишиться React/Vite/Tailwind SPA, `vite build` створюватиме `dist`, frontend буде deploy-friendly для Vercel/Netlify, а AI-секрети й аналіз залишаться безпечно на backend.