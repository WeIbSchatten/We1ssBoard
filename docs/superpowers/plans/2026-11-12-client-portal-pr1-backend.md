# Личный кабинет — PR 1: данные, вход, API кабинета, фильтр подписки

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** серверная основа кабинета: учётные данные клиента, вход (свой пароль и LDAP), токены приложения, веб-сессии, API `/portal/api/*` на подписочном сервере и фильтр скрытых ключей во всех форматах подписки.

**Architecture:** новый пакет `internal/web/service/portal` владеет данными кабинета (вход, токены, скрытые ключи) и не знает про HTTP. Подписочный сервер (`internal/sub`) получает контроллер кабинета и фильтр в `SubService`. Ограничитель перебора выносится из контроллера панели в общий пакет. Конфиг Xray не меняется, `runtime.Runtime` не участвует.

**Tech Stack:** Go 1.27, Gin, GORM (SQLite/PostgreSQL), gin-contrib/sessions (cookie store), bcrypt и SHA-256 из `internal/util/crypto`, `internal/util/ldap`.

**Spec:** `docs/superpowers/specs/2026-11-12-client-portal-design.md` (разделы 3–6, 10, 11). Админка, Telegram, страница кабинета и We1ssConnect — следующие планы (PR 2–4).

## Global Constraints

- Комментарии в Go: не больше 2 строк на блок, только «почему».
- Тесты: только stdlib `testing`, table-driven, `t.Run`, `t.Helper()`; БД — `dbtest.InitDB(t, filepath.Join(t.TempDir(), "we1ssboard.db"))`; HTTP — `httptest`. Проверять точные значения, не `err != nil`.
- TDD: тест падает по заявленной причине до кода; тест, написанный после, доказывается откатом кода.
- Миграция БД — в `internal/database/db.go`; новые модели также в списке `internal/database/migrate_data.go`.
- Коммиты: `type(area): summary` + тело с «почему»; **без** строк `Co-Authored-By`.
- Рефакторинг — отдельным коммитом от функциональности.
- `make verify` зелёный перед PR; `make race` — пакет `internal/sub` и `internal/web/service/portal`.
- Логин = `email` клиента; пароль кабинета ≥ 8 символов; токен — 32 случайных байта в base64url, в БД только `crypto.HashTokenSHA256`.
- Ограничитель: 5 неудач за 5 минут → блокировка на 15 минут, ключ «IP + логин» (значения как у админа).
- Ответы ошибок (спека, раздел 10): 401 общий текст на неверный логин/пароль; 429 + `Retry-After`; 404 при выключенном кабинете; 403 `must_change_password`; 403 `client_disabled`; 400 на скрытие последнего/чужого ключа и на смену пароля LDAP-клиентом; 401 на отозванный токен.
- Отзыв токенов и сессий при выключении `portalEnabled`, выдаче временного пароля и «Отозвать доступ» — в PR 2 вместе с переключателем и кнопками админки; здесь только при смене пароля клиентом.
- PR 1 не виден пользователю (настройка `portalEnabled` пока без переключателя в UI) — записей в CHANGELOG нет; они идут в PR 2.

## Review Focus

1. Один `subId` у нескольких клиентов: скрытие у одного не трогает ключи другого. — тест в Task 5.
2. Клиент отвязан и снова привязан к инбаунду: прежнее скрытие не действует. — тест в Task 4.
3. Логин в другом регистре (`A.Smirnova` вместо `a.smirnova`) входит; если без учёта регистра совпадают два клиента — отказ общим 401. — тест в Task 3.
4. Админ удалил последний видимый хост клиента: подписка выдаётся целиком, а не пустой. — тест в Task 5.
5. `Authorization` без схемы `Bearer`, пустой или с чужим токеном — 401, без паники. — тест в Task 6.

---

### Task 1: Вынести ограничитель перебора в общий пакет (refactor)

**Files:**

- Create: `internal/util/loginlimit/limiter.go` (перенос `internal/web/controller/login_limiter.go`)
- Move test: `internal/web/controller/login_limiter_test.go` → `internal/util/loginlimit/limiter_test.go`
- Modify: `internal/web/controller/index.go` (и другие пользователи `defaultLoginLimiter`)

**Interfaces:**

- Produces: `loginlimit.New(maxFailures int, window, cooldown time.Duration) *Limiter`; методы `Allow(ip, user string) (time.Time, bool)`, `RegisterFailure(ip, user string) (time.Time, bool)`, `RegisterSuccess(ip, user string)`; поле для тестов `SetClock(func() time.Time)`. Константы `MaxFailures = 5`, `Window = 5*time.Minute`, `Cooldown = 15*time.Minute`.

- [ ] **Step 1:** Перенести тип и тесты в новый пакет, экспортировать методы; в контроллере `var defaultLoginLimiter = loginlimit.New(loginlimit.MaxFailures, loginlimit.Window, loginlimit.Cooldown)`.
- [ ] **Step 2:** Run: `make test-go` (или `go test ./internal/util/loginlimit/ ./internal/web/controller/`). Expected: PASS, те же тесты, что до переноса.
- [ ] **Step 3:** Commit `refactor(auth): move the login limiter into a shared package` — тело: кабинету клиента нужен тот же ограничитель.

### Task 2: Модель, миграция, настройка и вход по своему паролю

**Files:**

- Modify: `internal/database/model/model.go` — поля `ClientRecord`, модели `ClientPortalToken`, `ClientSubHidden`
- Modify: `internal/database/db.go` (список AutoMigrate), `internal/database/migrate_data.go`
- Modify: `internal/web/service/setting.go` — ключи `portalEnabled` (`"false"`), `portalSecret` (`random.Seq(32)`), геттеры
- Create: `internal/web/service/portal/auth.go`
- Test: `internal/web/service/portal/auth_test.go`

**Interfaces:**

- Produces (model): в `ClientRecord`: `PortalPasswordHash string` (`json:"-" gorm:"column:portal_password_hash;default:''"`), `PortalMustChange bool` (`json:"portalMustChange" gorm:"column:portal_must_change;default:false"`), `PortalSessionEpoch int64` (`json:"-" gorm:"column:portal_session_epoch;default:0"`).
  `ClientPortalToken{Id int; ClientId int (index); TokenHash string (size:64, uniqueIndex); DeviceName string; CreatedAt int64 (autoCreateTime:milli); LastUsedAt int64}` → таблица `client_portal_tokens`.
  `ClientSubHidden{ClientId, InboundId, HostId int (составной PK); CreatedAt int64 (autoCreateTime:milli)}` → таблица `client_sub_hidden`.
- Produces (settings): `SettingService.GetPortalEnabled() (bool, error)`, `GetPortalSecret() ([]byte, error)` (как `GetSecret`: генерирует и сохраняет при пустом), `GetLdapConfig() (ldap.Config, bool, error)` — собирает конфиг тем же набором геттеров, что `ldap_sync_job.go:75-88`, второй результат — `GetLdapEnable`.
- Produces (portal): `type Method int` (`MethodLocal`, `MethodLDAP`); `var ErrInvalidCredentials, ErrDisabled = errors.New(...)`;
  `type Service struct{ Settings *service.SettingService; LdapAuth func(ldap.Config, string, string) (bool, error) }`, `func New(s *service.SettingService) *Service` (`LdapAuth = ldap.AuthenticateUser`);
  `func (s *Service) Authenticate(login, password string) (*model.ClientRecord, Method, error)`.

- [ ] **Step 1: Failing tests** `TestAuthenticate` (table): клиент `a.smirnova` с хэшем `HashPasswordAsBcrypt("correct-horse")`:
  - верный пароль → `MethodLocal`, `rec.Email == "a.smirnova"`;
  - неверный пароль → `ErrInvalidCredentials`;
  - неизвестный логин → `ErrInvalidCredentials` (тот же error);
  - `A.Smirnova` + верный пароль → успех;
  - два клиента `x@a` и `X@a` (без учёта регистра совпадают), логин `x@A` → `ErrInvalidCredentials`;
  - клиент без хэша, LDAP выключен → `ErrInvalidCredentials`;
  - клиент без хэша, LDAP включён, `LdapAuth` возвращает `true` только для `("a.smirnova","dir-pass")` → `MethodLDAP`; для другого пароля → `ErrInvalidCredentials`;
  - `LdapAuth` возвращает ошибку → `ErrInvalidCredentials`.
- [ ] **Step 2:** Run: `go test ./internal/web/service/portal/ -run TestAuthenticate -v`. Expected: FAIL (пакет/поля не существуют).
- [ ] **Step 3:** Модели и миграция; настройки; `Authenticate`: поиск `WHERE LOWER(email) = LOWER(?)`, ровно одна строка, иначе `ErrInvalidCredentials`; хэш не пуст → `crypto.CheckPasswordHash`; иначе LDAP только при `enabled`.
- [ ] **Step 4:** Run тот же тест. Expected: PASS. Плюс `go test ./internal/database/...` PASS (миграция на шаблоне `dbtest`).
- [ ] **Step 5:** Commit `feat(portal): client portal credentials and password/LDAP login`.

### Task 3: Токены приложения и смена пароля

**Files:**

- Create: `internal/web/service/portal/token.go`, `internal/web/service/portal/password.go`
- Test: `internal/web/service/portal/token_test.go`, `password_test.go`

**Interfaces:**

- Consumes: модели и `Service` из Task 2.
- Produces: `var ErrInvalidToken, ErrLDAPManaged, ErrWeakPassword`; `type Device struct{ ID int; Name string; CreatedAt, LastUsedAt int64 }`;
  `IssueToken(clientID int, device string) (string, error)`; `ClientByToken(token string) (*model.ClientRecord, int /*tokenID*/, error)` — обновляет `LastUsedAt`;
  `ListDevices(clientID int) ([]Device, error)`; `RevokeDevice(clientID, tokenID int) error` (чужой токен → `ErrInvalidToken`);
  `ChangePassword(clientID int, current, next string) (newEpoch int64, err error)` — `len(next) < 8` → `ErrWeakPassword`; без своего хэша → `ErrLDAPManaged`; неверный `current` → `ErrInvalidCredentials`; иначе новый хэш, `PortalMustChange=false`, `PortalSessionEpoch++`, удалить все токены клиента.

- [ ] **Step 1: Failing tests:**
  - `TestClientByToken_ResolvesAndTouches`: выданный токен возвращает клиента, `LastUsedAt > 0`; в БД `TokenHash == crypto.HashTokenSHA256(token)`, а сам токен в БД не встречается.
  - `TestClientByToken_RejectsReusedClientID`: токен выдан клиенту, клиент удалён, новый клиент создан с тем же `Id` (явная вставка), `CreatedAt` новее токена → `ErrInvalidToken`.
  - `TestClientByToken_Unknown` → `ErrInvalidToken`.
  - `TestRevokeDevice_OtherClient` → `ErrInvalidToken`, токен жив.
  - `TestChangePassword` (table): короткий → `ErrWeakPassword`; LDAP-клиент → `ErrLDAPManaged`; неверный текущий → `ErrInvalidCredentials`; успех → эпоха +1, `PortalMustChange == false`, `ClientByToken` на старый токен → `ErrInvalidToken`, `Authenticate` с новым паролем проходит.
- [ ] **Step 2:** Run: `go test ./internal/web/service/portal/ -v`. Expected: FAIL (функций нет).
- [ ] **Step 3:** Реализация. Проверка токена: `JOIN clients ON clients.id = t.client_id AND clients.created_at <= t.created_at`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(portal): device tokens and password change`.

### Task 4: Ключи клиента и набор скрытых

**Files:**

- Create: `internal/web/service/portal/hidden.go`
- Test: `internal/web/service/portal/hidden_test.go`

**Interfaces:**

- Produces: `type Key struct{ InboundID, HostID int }` (`json:"inboundId"`, `json:"hostId"`);
  `type KeyInfo struct{ Key; Remark, Protocol string; Hidden bool }`;
  `type HiddenSet map[string]map[Key]struct{}` (ключ — `strings.ToLower(email)`), метод `(h HiddenSet) Has(email string, k Key) bool`;
  `ClientKeys(clientID int) ([]KeyInfo, error)` — инбаунды из `client_inbounds` с `enable = true` и `exclude_from_sub = false`, по `sub_sort_index, id`; для каждого включённые хосты (`is_disabled = false`, по `sort_order, id`) → `Key{inbound, host.Id}`, `Remark = host.Remark` или `inbound.Remark`; без хостов — `Key{inbound, 0}`, `Remark = inbound.Remark`; `Protocol = string(inbound.Protocol)`;
  `ReplaceHidden(clientID int, keys []Key) error` — `ErrForeignKey` если ключа нет в `ClientKeys`, `ErrNothingVisible` если скрыты все; в транзакции удалить записи клиента и вставить новые;
  `HiddenBySubID(subID string) (HiddenSet, error)` — только действующие записи (правило из спеки, раздел 3).

- [ ] **Step 1: Failing tests:**
  - `TestClientKeys`: инбаунд A без хостов, B с хостами h1, h2 (h2 выключен), C с `ExcludeFromSub` → ровно `[{A,0},{B,h1}]` с ремарками.
  - `TestReplaceHidden` (table): `[{B,h1}]` ок; все ключи → `ErrNothingVisible`; `{C,0}` → `ErrForeignKey`; повторный вызов `[]` очищает.
  - `TestHiddenBySubID_IgnoresStaleRows`: скрыт `{A,0}`; клиент отвязан от A и привязан заново (новая строка `client_inbounds` с более поздним `created_at`) → `Has` = false. Отдельно: скрыт `{B,h1}`, хост h1 удалён → `Has` = false.
  - `TestHiddenBySubID_PerClient`: два клиента с одним `subId`, скрыто только у первого → `Has(second, k)` = false.
- [ ] **Step 2:** Run: `go test ./internal/web/service/portal/ -run 'TestClientKeys|TestReplaceHidden|TestHiddenBySubID' -v`. Expected: FAIL.
- [ ] **Step 3:** Реализация. `HiddenBySubID` — один запрос: `client_sub_hidden h JOIN clients c ON c.id = h.client_id AND c.sub_id = ? JOIN client_inbounds ci ON ci.client_id = h.client_id AND ci.inbound_id = h.inbound_id AND ci.created_at <= h.created_at LEFT JOIN hosts ho ON ho.id = h.host_id AND ho.inbound_id = h.inbound_id WHERE h.host_id = 0 OR (ho.id IS NOT NULL AND ho.created_at <= h.created_at)`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(portal): per-client hidden subscription keys`.

### Task 5: Фильтр скрытых ключей в подписке

**Files:**

- Modify: `internal/sub/host_sub.go` — в `hostToExternalProxyMap` добавить `"hostId": h.Id`; функция `filterHostEps`
- Modify: `internal/sub/service.go` (`getSubs`, цикл с 486), `internal/sub/json_service.go` (цикл с 140), `internal/sub/clash_service.go` (цикл с 62)
- Test: `internal/sub/portal_hidden_test.go`

**Interfaces:**

- Consumes: `portal.HiddenSet`, `portal.Key`, `(*portal.Service).HiddenBySubID` (Task 4).
- Produces: `func filterHostEps(eps []map[string]any, hidden portal.HiddenSet, email string, inboundID int) []map[string]any`; `func visibleForClient(...)` по выбору исполнителя. `SubService` получает поле `portal *portal.Service` (инициализация там же, где `inboundService`).

Правила (спека, раздел 6): набор загружается один раз на запрос `subId`; для клиента с хостами — отфильтровать эпы, пусто → пропустить клиента в этом инбаунде; без хостов — пропустить, если скрыт `{inbound,0}`; в JSON/Clash вызывать `injectExternalProxy` с отфильтрованными эпами внутри цикла по клиентам; клиент всё равно попадает в `seenEmails`. Если у клиента скрыто всё, что осталось видимым, — его набор игнорируется.

- [ ] **Step 1: Failing tests** (`initSubDB`, клиент `a.smirnova` на VLESS-инбаунде с хостами h1, h2 и на Trojan без хостов):
  - `TestSubs_HidesKeyInEveryFormat` (table по `raw|json|clash`): скрыт `{vless,h1}` → вывод не содержит адреса h1, содержит адрес h2 и Trojan-ссылку; скрыт `{trojan,0}` → нет `trojan://` (raw) / нет outbound/proxy с протоколом trojan (json/clash).
  - `TestSubs_SharedSubIDHidesOnlyOwner`: второй клиент с тем же `subId` на тех же инбаундах; скрыт `{vless,h1}` у первого → ссылка h1 второго клиента в выводе есть.
  - `TestSubs_AllRemainingHiddenShowsEverything`: скрыт `{vless,h1}`, видимы h2 и trojan; удалить h2 и отвязать trojan → вывод содержит h1 (набор проигнорирован), а не пуст.
  - `TestSubs_HiddenClientStillCountsInUserinfo`: у клиента скрыт ключ одного из двух инбаундов → `traffic` из `getSubs` равен значению без скрытия.
  - `TestPanelLinks_IgnoreHidden`: `LinkProvider.LinksForClient` для скрытого ключа возвращает ссылку h1.
- [ ] **Step 2:** Run: `go test ./internal/sub/ -run 'TestSubs_|TestPanelLinks_IgnoreHidden' -v`. Expected: FAIL (ключ h1 присутствует).
- [ ] **Step 3:** Реализация по правилам выше.
- [ ] **Step 4:** Run эти тесты, затем весь пакет: `go test ./internal/sub/`. Expected: PASS, golden-тесты без изменений (поле `hostId` не попадает в вывод).
- [ ] **Step 5:** Commit `feat(sub): drop client-hidden keys from raw, JSON and Clash`.

### Task 6: API кабинета на подписочном сервере

**Files:**

- Modify: `internal/sub/controller.go` — сначала вынести тело raw-ветки `subs` (строки ~486–520) в `serveRawBody(c *gin.Context) bool` (отдельный refactor-коммит)
- Create: `internal/sub/portal_controller.go`
- Modify: `internal/sub/sub.go` — регистрация группы `/portal` после `NewSUBController`
- Test: `internal/sub/portal_controller_test.go`

**Interfaces:**

- Consumes: всё из Task 1–5; `session.EnsureCSRFToken` / `session.ValidateCSRFToken` (`internal/web/session/csrf.go`).
- Produces: `func NewPortalController(g *gin.RouterGroup, sub *SUBController, svc *portal.Service, settings *service.SettingService) *PortalController`; JSON-тип ответа `/me`:
  `PortalProfile{Email string; Enable bool; ExpiryTime int64; TotalGB int64; Up, Down int64; Group string; SubURL string; MustChange bool; LDAP bool; Keys []portal.KeyInfo; Devices []portal.Device; CSRFToken string}` (теги camelCase).

Маршруты и поведение — спека, раздел 5 (без `GET /portal`: страница — PR 3). Детали, которые решены здесь:

- Группа `/portal` получает `sessions.Sessions("We1ssBoardPortal", cookie.NewStore(GetPortalSecret()))` с `HttpOnly`, `SameSite=Strict`, `Secure` при HTTPS — только на этой группе.
- Middleware по порядку: `portalEnabled` иначе 404 (читается на каждый запрос) → аутентификация: `Authorization: Bearer <t>` → `ClientByToken`; иначе сессия `{clientId, epoch}`, эпоха сверяется с `PortalSessionEpoch` → `must_change` пропускает только `password`/`logout` → для `PUT hidden` и `DELETE devices` клиент с `Enable=false` или истёкшим `ExpiryTime` → 403 `client_disabled` → CSRF для изменяющих запросов с cookie-сессией (не для Bearer).
- `login`: `loginlimit` на «IP + логин» с теми же константами; `client:"app"` → `{token}`, `device` обязателен (≤ 64 символов); `client:"web"` → сессия + `{mustChange, csrfToken}`.
- `password`: при успехе текущая веб-сессия получает новую эпоху.
- `sub`: только Bearer; `subId` клиента пуст → 404; подставить `c.Params` `subid` и вызвать `enforceHwid`, затем `serveRawBody` / `serveJsonBody` / `serveClashBody` по `format` (по умолчанию `raw`); неизвестный `format` → 400.

- [ ] **Step 1: Refactor** `serveRawBody`, run `go test ./internal/sub/` PASS, commit `refactor(sub): extract the raw subscription body writer`.
- [ ] **Step 2: Failing tests** (`httptest` + `gin` engine c `/portal` поверх `initSubDB`):
  - `TestPortal_DisabledIs404`: `portalEnabled=false` → `POST /portal/api/login` 404.
  - `TestPortal_LoginWebAndMe`: вход web → cookie; `GET /me` 200, `Email`, `Keys` совпадают с `ClientKeys`.
  - `TestPortal_LoginSameErrorForUnknownAndWrong`: тела и коды ответов на неизвестный логин и неверный пароль байт в байт равны (401).
  - `TestPortal_LoginRateLimited`: 5 неудач → шестой запрос 429 с заголовком `Retry-After`.
  - `TestPortal_MustChangeGate`: `PortalMustChange=true` → `/me` 403 `must_change_password`; `POST /password` 200; после него `/me` 200.
  - `TestPortal_PasswordChangeKillsOldSession`: две cookie-сессии; смена пароля в первой → вторая получает 401, первая работает.
  - `TestPortal_HiddenRules`: `PUT /hidden` со всеми ключами → 400; с чужим → 400; без CSRF-заголовка → 403; корректный → 204, затем `/portal/api/sub` не содержит скрытого ключа.
  - `TestPortal_DisabledClientReadOnly`: `Enable=false` → `/me` 200, `PUT /hidden` 403 `client_disabled`, `POST /password` 200.
  - `TestPortal_AppTokenSub` (table по `format`): вход `app` → токен; `GET /portal/api/sub?format=X` с Bearer → тело и заголовок `Subscription-Userinfo` равны ответу `/sub/<subId>` того же формата.
  - `TestPortal_BadAuthorization` (table): нет заголовка, `Basic xxx`, `Bearer ` (пусто), `Bearer чужой` → 401, без паники.
  - `TestPortal_RevokeDevice`: `DELETE /devices/:id` своего токена → 204, тот же токен на `/sub` → 401.
  - `TestPortal_Logout` (table): cookie-сессия → `POST /logout` 204, затем `/me` 401; Bearer → `POST /logout` 204, тот же токен на `/sub` → 401 (`RevokeDevice` по `tokenID` из `ClientByToken`).
- [ ] **Step 3:** Run: `go test ./internal/sub/ -run TestPortal_ -v`. Expected: FAIL (маршрутов нет, 404 на всё кроме первого теста).
- [ ] **Step 4:** Реализация контроллера и регистрация в `sub.go`.
- [ ] **Step 5:** Run `go test ./internal/sub/ ./internal/web/service/portal/` PASS; `go test -race ./internal/sub/ ./internal/web/service/portal/` PASS.
- [ ] **Step 6:** Commit `feat(sub): client portal API on the subscription server`.

### Task 7: Документация и проверка ветки

**Files:**

- Modify: `docs/architecture.md` — в таблице серверов и §5.6 строка про `/portal/api/*` и фильтр скрытых ключей; в индексе «симптом → файл»: «ключ пропал из подписки клиента» → `internal/web/service/portal/hidden.go`, `internal/sub/host_sub.go`.

- [ ] **Step 1:** Правка `docs/architecture.md`.
- [ ] **Step 2:** Run: `make verify`. Expected: все стадии зелёные (`gen-check` без изменений — эндпоинтов панели нет).
- [ ] **Step 3:** Run: `make race` (минимум пакеты из Task 5–6). Expected: PASS.
- [ ] **Step 4:** Commit `docs(architecture): map the client portal`.
