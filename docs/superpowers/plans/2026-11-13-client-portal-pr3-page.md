# Личный кабинет — PR 3: страница кабинета

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** клиент открывает `https://<сервер подписки>/portal`, входит, при временном пароле сразу задаёт свой, видит профиль, включает/выключает свои ключи, управляет устройствами и меняет пароль.

**Architecture:** четвёртая сборка Vite `portal.html` (`src/entries/portal.tsx`, `src/pages/portal/`) в стиле страницы подписки: тот же `ThemeProvider`, шапка с языком и темой (`SubHeader`), блок статуса (`SubHero`). Данные — только API кабинета из PR 1 (`/portal/api/*`) через `fetch` с cookie и CSRF-заголовком. Go отдаёт страницу маршрутом `GET /portal` в `PortalController` и встраивает `window.__PORTAL__ = {basePath, subTitle}`.

**Tech Stack:** React 19, Ant Design 6, TanStack Query, React Hook Form + Zod (`useZodForm`, `FormField`), Gin.

**Spec:** `docs/superpowers/specs/2026-11-12-client-portal-design.md` §5 (API), §8 (экраны), §10 (ошибки).

## Global Constraints

- Правила CLAUDE.md / `frontend/CLAUDE.md`: комментарии ≤ 2 строк; формы — `useZodForm` + `FormField`, схемы в `src/schemas/`, сообщения — ключи i18n; `no-explicit-any`; без фейковых тестов; TDD; коммиты без `Co-Authored-By`.
- Новые i18n-ключи — во всех 13 файлах с переводом, каждый используется (`i18n-dead-keys`). Язык страницы хранится в той же области, что у страницы подписки (`LanguageManager` scope `subscription`).
- Пароль ≥ 8 символов (как `portal.MinPasswordLength`); ошибки API сопоставляются по коду `error` из PR 1: `invalid_credentials`, `too_many_attempts` (+`Retry-After`), `must_change_password`, `weak_password`, `wrong_password`, `ldap_managed`, `nothing_visible`, `foreign_key`, `client_disabled`, `csrf`, `unauthorized`.
- Маршрут `GET /portal` — на подписочном сервере (вне `TestRouteRegistryContract`); 404 при выключенном кабинете обеспечивает существующий `requireEnabled`.
- CHANGELOG: в `[Unreleased] → Added` уточнить пункт кабинета (страница доступна по `/portal`), обе версии.
- Проверка: `mingw32-make verify`; затем живой прогон страницы на локальной тестовой панели (admin/admin только на localhost).

## Review Focus

1. Сессия истекла или эпоха сменилась (пароль сменён на другом устройстве): любой запрос 401 → экран входа, без бесконечных ошибок. — тест в Task 3.
2. Временный пароль: после входа показывается только смена пароля; после смены — профиль без перезагрузки. — тест в Task 3.
3. Попытка выключить последний видимый ключ: переключатель не даёт этого сделать, а ответ 400 `nothing_visible` (гонка с другой вкладкой) показывает понятную ошибку и возвращает состояние. — тест в Task 4.
4. Выключенный клиент: профиль виден, переключатели и «Выйти» на устройствах неактивны с пояснением. — тест в Task 4.
5. 429 при входе: показывается время ожидания из `Retry-After`. — тест в Task 3.

---

### Task 1: Маршрут `GET /portal` в Go

**Files:**

- Modify: `internal/sub/portal_controller.go` — поле `readPage func() ([]byte, error)` (по умолчанию: `internal/web/dist/portal.html` с диска, иначе `distFS`), маршрут `g.GET("", a.page)` и `g.GET("/", a.page)` до `/api`; ответ — HTML с `<script>window.__PORTAL__={"basePath":…,"subTitle":…};</script>` перед `</head>`, заголовки как у `serveSubPage` (`setNoCacheHeaders`)
- Test: `internal/sub/portal_controller_test.go`

- [ ] **Step 1: Failing test** `TestPortal_PageServed`: включённый кабинет, `readPage` подменён на `<html><head></head><body></body></html>` → `GET /portal` 200, `Content-Type` text/html, тело содержит `window.__PORTAL__=` и `"subTitle":"` с заголовком из настройки `subTitle`; выключенный → 404.
- [ ] **Step 2:** Run `go test ./internal/sub/ -run TestPortal_PageServed -v` → FAIL (404).
- [ ] **Step 3:** Реализация; JSON через `json.Marshal`, затем замена `<` на `<` (защита от `</script>` в заголовке).
- [ ] **Step 4:** Run → PASS; весь `TestPortal_` PASS.
- [ ] **Step 5:** Commit `feat(sub): serve the client portal page`.

### Task 2: Клиент API кабинета и сборка Vite

**Files:**

- Create: `frontend/portal.html`, `frontend/src/entries/portal.tsx` (по образцу `subpage.*`); Modify: `frontend/vite.config.js` — вход `portal`
- Create: `frontend/src/pages/portal/portalApi.ts` — `class PortalApiError extends Error { code: string; status: number; retryAfter?: number }`; функции `login(login, password)`, `logout()`, `me()`, `changePassword(current, next)`, `replaceHidden(keys)`, `revokeDevice(id)`; базовый путь из `window.__PORTAL__.basePath` (по умолчанию `/portal`); `credentials: 'same-origin'`; CSRF-токен из ответов `login`/`me` хранится в модуле и уходит в `X-CSRF-Token`
- Create: `frontend/src/schemas/portal.ts` — Zod-схемы ответов (`PortalProfile`, `PortalKey`, `PortalDevice`) и форм (`LoginForm`, `ChangePasswordForm` с проверкой длины ≥ 8 и совпадения повтора)
- Modify: `frontend/src/types/global.d.ts` (или где объявлен `__SUB_PAGE_DATA__`) — `__PORTAL__`
- Test: `frontend/src/test/portal-api.test.ts`

- [ ] **Step 1: Failing tests** (`vi.spyOn(globalThis, 'fetch')`): `login` шлёт POST `/portal/api/login` с `{login,password,client:"web"}` и запоминает `csrfToken` → следующий `replaceHidden` содержит заголовок `X-CSRF-Token`; 429 с `Retry-After: 30` → `PortalApiError{code:'too_many_attempts', retryAfter:30}`; 401 `{error:'unauthorized'}` → `code:'unauthorized'`; `me()` валидирует ответ схемой (лишнее поле не мешает, отсутствие `email` → ошибка).
- [ ] **Step 2:** Run `npx vitest run src/test/portal-api.test.ts` → FAIL.
- [ ] **Step 3:** Реализация + вход Vite + HTML.
- [ ] **Step 4:** Run → PASS; `npm run typecheck`, `npm run build` (появился `internal/web/dist/portal.html`).
- [ ] **Step 5:** Commit `feat(portal): portal page bundle and API client`.

### Task 3: Вход, смена временного пароля и оболочка страницы

**Files:**

- Create: `frontend/src/pages/portal/PortalPage.tsx` (оболочка: `ConfigProvider` + RTL, `Layout`, `Card`, `SubHeader` без `sId`, выбор экрана по состоянию), `PortalLogin.tsx`, `PortalChangePassword.tsx`, `PortalPage.css` (переиспользует классы `SubPage.css`)
- Test: `frontend/src/test/portal-page.test.tsx`

Поведение: на старте `me()`; 401 → экран входа; 403 `must_change_password` → экран смены; успех → профиль (Task 4). Любой 401 позже возвращает на вход (сброс кэша Query). Кнопка «Выйти» в шапке профиля.

- [ ] **Step 1: Failing tests:** нет сессии → форма входа; неверный пароль → текст `invalid` под формой; 429 → текст с `30`; вход с `mustChange:true` → форма смены (поле текущего пароля, нового, повтора); короткий пароль → ошибка валидации без запроса; успешная смена → профиль с email; 401 из `me` после входа → снова вход.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализация + ключи i18n (`portal.*` для входа/смены/выхода).
- [ ] **Step 4:** Run → PASS; typecheck, lint.
- [ ] **Step 5:** Commit `feat(portal): portal login and temporary password change`.

### Task 4: Профиль, ключи, устройства, безопасность

**Files:**

- Create: `frontend/src/pages/portal/PortalProfile.tsx` (`SubHero` по данным `me`: статус через `resolveSubStatus`, размеры через существующий форматтер размеров; ссылка подписки с копированием и QR — `SubQrButton`), `PortalKeys.tsx`, `PortalDevices.tsx`, `PortalSecurity.tsx`
- Test: `frontend/src/test/portal-profile.test.tsx`

Поведение (спека §8): ключи — список «название · протокол» с `Switch`; последний включённый неактивен с подсказкой; изменение сразу шлёт `PUT /hidden` со всем набором выключенных; ошибка → `message.error` и откат. Выключенный/просроченный клиент (`enable:false` или `expiryTime` в прошлом) — переключатели и «Выйти» неактивны, `Alert` с пояснением. Устройства — имя, последний вход (или «никогда»), «Выйти» с подтверждением. Безопасность — форма смены пароля; при `ldap:true` вместо формы текст «Пароль управляется каталогом компании».

- [ ] **Step 1: Failing tests:** выключение ключа шлёт `PUT /portal/api/hidden` с `{keys:[{inboundId,hostId}]}`; последний включённый ключ — `Switch` disabled; ответ 400 `nothing_visible` → переключатель вернулся во включённое; выключенный клиент — все `Switch` disabled и виден текст пояснения; «Выйти» на устройстве после подтверждения шлёт `DELETE /portal/api/devices/7`; `ldap:true` — нет поля текущего пароля, есть текст про каталог.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализация + ключи i18n.
- [ ] **Step 4:** Run → PASS; полный `npx vitest run src/test`, typecheck, lint.
- [ ] **Step 5:** Commit `feat(portal): profile, keys, devices and security in the portal`.

### Task 5: CHANGELOG, документация, проверка

**Files:**

- Modify: `CHANGELOG.md`, `CHANGELOG.ru_RU.md` — пункт кабинета: страница по адресу `/portal` на сервере подписки; убрать «страница появится позже»
- Modify: `docs/architecture.md` — четвёртая сборка `portal.html` в разделе фронтенда

- [ ] **Step 1:** Правки.
- [ ] **Step 2:** `mingw32-make verify` (Storybook-проект в браузере без Chromium — сообщить).
- [ ] **Step 3:** Живая проверка: собрать панель, включить кабинет, выдать клиенту временный пароль в карточке, открыть `http://localhost:<subPort>/portal`, войти, сменить пароль, выключить ключ и убедиться, что он пропал из `/sub/<subId>`.
- [ ] **Step 4:** Commit `docs(portal): changelog and architecture for the portal page`.
