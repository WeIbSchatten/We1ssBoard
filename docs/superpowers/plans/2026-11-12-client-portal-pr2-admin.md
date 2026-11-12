# Личный кабинет — PR 2: админка, настройка и Telegram

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** админ включает кабинет в настройках подписки, видит в карточке клиента статус доступа, выдаёт временный пароль (с отправкой в Telegram) и отзывает доступ; клиент сбрасывает пароль сам через Telegram-бота.

**Architecture:** операции над доступом — функции пакета `internal/web/service/portal` (PR 1). Панель зовёт их из нового контроллера-эндпоинтов в `internal/web/controller/client.go`; бот — из `internal/web/service/tgbot`. Выключение настройки отзывает все токены и веб-сессии в `SettingService.UpdateAllSetting` прямым запросом к БД (пакет `service` не может импортировать `portal`). Изменения не трогают Xray, `runtime.Runtime` не участвует.

**Tech Stack:** Go (Gin, GORM), React 19 + Ant Design 6 + TanStack Query, telego.

**Spec:** `docs/superpowers/specs/2026-11-12-client-portal-design.md` (разделы 2, 4, 7, 10). PR 1: `docs/superpowers/plans/2026-11-12-client-portal-pr1-backend.md`.

## Global Constraints

- Правила CLAUDE.md и `frontend/CLAUDE.md`: комментарии ≤ 2 строк; stdlib `testing`; без фейковых тестов; TDD; рефакторинг отдельным коммитом; коммиты без `Co-Authored-By`.
- Новый `g.GET`/`g.POST` → запись в `frontend/src/pages/api-docs/endpoints.ts` → `npm run gen` (`TestRouteRegistryContract`); новые структуры ответа — в `StructAllow` (`tools/openapigen/main.go`) с тегами `example:`; затем копия `frontend/public/openapi.json` → `docs/public/openapi.json` и `cd docs && node scripts/gen-openapi.ts`, после генерации `docs/node_modules/.bin/oxfmt` по изменённым MDX (иначе docs-ci падает на формате).
- Новые i18n-ключи — во всех 13 `internal/web/translation/*.json` с настоящим переводом, и каждый используется во `frontend/src` или Go в том же коммите (`i18n-dead-keys.test.ts`, запускать `npm test`).
- Пользовательское изменение → пункт в `## [Unreleased]` `CHANGELOG.md` и `CHANGELOG.ru_RU.md`.
- Временный пароль: 12 символов из алфавита без похожих знаков (`ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789`), `crypto/rand`; ставит `portal_must_change = true`, `portal_session_epoch + 1`, удаляет токены клиента.
- Эндпоинты по стилю файла — с `:email`: `GET /panel/api/clients/portal/:email`, `POST /panel/api/clients/portalPassword/:email`, `POST /panel/api/clients/portalRevoke/:email`.
- Локальная проверка: `mingw32-make verify` (в этом окружении нет `make`); Storybook-проект в браузере не запускается без Playwright Chromium — сообщить, не скрывать.

## Review Focus

1. Админ выдал временный пароль LDAP-клиенту: дальше работает только этот пароль (свой хэш имеет приоритет), клиент обязан его сменить. — тест в Task 1.
2. Выключение настройки при живых токенах и сессиях: после повторного включения старые токены и cookie не работают. — тест в Task 2.
3. Telegram выключен или у клиента нет `tgId`: выдача пароля всё равно успешна, `sentToTelegram=false`, пароль показан админу. — тест в Task 3.
4. Клиент жмёт сброс в боте на чужой email из устаревшей клавиатуры: отказ, пароль не меняется. — тест в Task 4.
5. Повторная выдача пароля: предыдущий временный пароль перестаёт подходить. — тест в Task 1.

---

### Task 1: Выдача временного пароля, отзыв и статус в `portal`

**Files:**

- Create: `internal/web/service/portal/admin.go`
- Test: `internal/web/service/portal/admin_test.go`

**Interfaces:**

- Consumes: `Service`, `Authenticate`, `ClientByToken`, `ClientKeys`, `ListDevices` (PR 1).
- Produces: `type AccessStatus string` с константами `AccessNone = "none"`, `AccessTemporary = "temporary"`, `AccessOwn = "own"`, `AccessLDAP = "ldap"`;
  `type Access struct{ Status AccessStatus; HiddenKeys, Devices int }`;
  `func (s *Service) IssueTemporaryPassword(clientID int) (string, error)`;
  `func (s *Service) RevokeAccess(clientID int) error` — стирает хэш, `must_change=false`, эпоха +1, удаляет токены и скрытые ключи не трогает;
  `func (s *Service) AccessOf(clientID int) (Access, error)` — хэш есть: `temporary` при `must_change`, иначе `own`; хэша нет: `ldap`, если LDAP включён, иначе `none`; `HiddenKeys` — число скрытых в `ClientKeys`, `Devices` — `len(ListDevices)`.

- [ ] **Step 1: Failing tests:**
  - `TestIssueTemporaryPassword`: пароль длиной 12 из заданного алфавита; `Authenticate(email, pw)` проходит, `rec.PortalMustChange == true`; старый токен → `ErrInvalidToken`; повторная выдача → прежний временный пароль даёт `ErrInvalidCredentials`.
  - `TestIssueTemporaryPassword_LDAPClient`: клиент без хэша, LDAP включён, `LdapAuth` принимает `dir-pass` → после выдачи `Authenticate(email, "dir-pass")` = `ErrInvalidCredentials`, временный проходит.
  - `TestRevokeAccess`: после отзыва `Authenticate` с прежним паролем = `ErrInvalidCredentials`, токен → `ErrInvalidToken`, эпоха выросла.
  - `TestAccessOf` (table): нет хэша/LDAP off → `none`; нет хэша/LDAP on → `ldap`; хэш + must_change → `temporary`; хэш → `own`; плюс `HiddenKeys == 1`, `Devices == 1` при одном скрытом ключе и одном токене.
- [ ] **Step 2:** Run `go test ./internal/web/service/portal/ -run 'TestIssueTemporary|TestRevokeAccess|TestAccessOf' -v`. Expected: FAIL (функций нет).
- [ ] **Step 3:** Реализация (`IssueTemporaryPassword` и `RevokeAccess` — в транзакции).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(portal): temporary passwords, revoke and access status`.

### Task 2: Настройка `portalEnabled` в панели и отзыв при выключении

**Files:**

- Modify: `internal/web/entity/entity.go` — `PortalEnabled bool \`json:"portalEnabled" form:"portalEnabled"\``рядом с`SubEnable`
- Modify: `internal/web/service/setting.go` — `UpdateAllSetting`: если было `true`, а приходит `false` → в той же операции `DELETE FROM client_portal_tokens` и `UPDATE clients SET portal_session_epoch = portal_session_epoch + 1`
- Modify: `frontend/src/pages/settings/SubscriptionGeneralTab.tsx` — переключатель по образцу `subEnable` (строки ~55–63)
- Modify: 13 файлов перевода — `pages.settings.portalEnabled`, `pages.settings.portalEnabledDesc`
- Test: `internal/web/service/setting_portal_test.go`

- [ ] **Step 1: Failing test** `TestUpdateAllSetting_DisablingPortalRevokesAccess`: включить, выдать токен клиенту и запомнить эпоху; `UpdateAllSetting` с `PortalEnabled=false` → токенов 0, эпоха +1; `UpdateAllSetting` с `true` → токенов по-прежнему 0 (повторное включение не воскрешает). Второй подтест: `false → false` не трогает эпоху.
- [ ] **Step 2:** Run `go test ./internal/web/service/ -run TestUpdateAllSetting_DisablingPortalRevokesAccess -v`. Expected: FAIL.
- [ ] **Step 3:** Реализация в `setting.go` и поле `AllSetting`; `npm run gen` (поле попадёт в схемы).
- [ ] **Step 4:** Run тест PASS; `cd frontend && npm run typecheck`.
- [ ] **Step 5:** Переключатель в UI + ключи переводов; `cd frontend && npm test -- i18n` PASS.
- [ ] **Step 6:** Commit `feat(portal): portal switch in subscription settings`.

### Task 3: Эндпоинты панели и вкладка «Личный кабинет» в карточке клиента

**Files:**

- Modify: `internal/web/controller/client.go` — поле `portal *portal.Service`, `tg tgbot.Tgbot`; маршруты из Global Constraints
- Create: структуры ответа `ClientPortalAccess{Status string; MustChange bool; HiddenKeys, Devices int; PortalEnabled bool}` и `ClientPortalPassword{Password string; SentToTelegram bool}` (в `internal/web/entity/`), теги `example:`; добавить в `StructAllow`
- Modify: `internal/web/service/tgbot/tgbot_send.go` (или новый `tgbot_portal.go`) — `func (t *Tgbot) SendPortalPassword(tgID int64, email, password string) bool`: `false`, если бот не запущен или `tgID == 0`
- Modify: `frontend/src/pages/api-docs/endpoints.ts` — три записи
- Create: `frontend/src/pages/clients/ClientPortalSection.tsx`; Modify: `ClientFormModal.tsx` — вкладка `portal` после `tgWebProxy`
- Create: `frontend/src/api/queries/useClientPortal.ts` (query + 2 mutation, ключи в `queryKeys.ts`)
- Test: `internal/web/controller/client_portal_test.go`, `frontend/src/test/client-portal-section.test.tsx`

Поведение (спека, раздел 7):

- `GET portal/:email` → `ClientPortalAccess`; неизвестный email → `success:false`.
- `POST portalPassword/:email` → `ClientPortalPassword`; при `tgId != 0` вызывает `SendPortalPassword` и пишет результат в `SentToTelegram`.
- `POST portalRevoke/:email` → `success:true`.
- Вкладка: для нового клиента — подсказка «сначала сохраните клиента»; при выключенной настройке — предупреждение со ссылкой-текстом на настройки подписки; иначе статус (тег), «Скрытых ключей: N», «Устройств: N», кнопки «Выдать временный пароль» и «Отозвать доступ» (`Popconfirm`). Выданный пароль показывается один раз в `Alert` с `Typography.Text copyable` и пометкой «отправлен в Telegram», если `sentToTelegram`.

- [ ] **Step 1: Failing Go tests** (`httptest`, `dbtest`): `TestClientPortalEndpoints` (table) — статус для клиента без доступа `none`; выдача → `Password` 12 символов, `SentToTelegram == false` (бот не запущен), затем статус `temporary`; отзыв → статус `none` (LDAP выключен); неизвестный email → `success:false`.
- [ ] **Step 2:** Run → FAIL (маршрутов нет). `go test ./internal/web/ -run TestRouteRegistryContract` → FAIL после добавления маршрутов, пока нет записей в `endpoints.ts`.
- [ ] **Step 3:** Контроллер, `SendPortalPassword`, структуры, `StructAllow`, `endpoints.ts`, `npm run gen`.
- [ ] **Step 4:** Run Go-тесты и `TestRouteRegistryContract` → PASS.
- [ ] **Step 5: Failing Vitest** `client-portal-section.test.tsx` (по образцу `client-tg-web-proxy-section.test.tsx`, моки `HttpUtil`): статус `own` показывает тег «Свой пароль»; клик «Выдать временный пароль» вызывает `POST /panel/api/clients/portalPassword/alice` и показывает пароль и пометку Telegram при `sentToTelegram:true`; без `email` — подсказка сохранить клиента; `portalEnabled:false` — предупреждение и нет кнопок.
- [ ] **Step 6:** Run `cd frontend && npx vitest run src/test/client-portal-section.test.tsx` → FAIL; реализовать секцию, хуки, вкладку, ключи переводов; → PASS; `npm run typecheck`, `npm run lint`.
- [ ] **Step 7:** Docs: копия `openapi.json`, `node scripts/gen-openapi.ts`, `oxfmt` по изменённым MDX; откатить MDX без смысловых изменений.
- [ ] **Step 8:** Commit `feat(portal): client card access tab and admin endpoints`.

### Task 4: Сброс пароля через Telegram-бота

**Files:**

- Modify: `internal/web/service/tgbot/tgbot_send.go` — кнопка `tgbot.buttons.portalPassword` → `client_portal_password` в клавиатуре клиента
- Modify: `internal/web/service/tgbot/tgbot_router.go` — `client_portal_password` (список своих клиентов, как `client_qr_links`), `client_portal_password <email>` (подтверждение), `client_portal_password_c <email>` (сброс); добавить в `isClientSelfCallback` / `splitClientLinkCallback`
- Create: `internal/web/service/tgbot/tgbot_portal.go` — `func (t *Tgbot) resetPortalPassword(chatID, tgUserID int64, email string)`
- Modify: 13 файлов перевода — `tgbot.buttons.portalPassword`, `tgbot.buttons.confirmPortalReset`, `tgbot.messages.portalResetConfirm`, `tgbot.messages.portalTempPassword` (`{{ .Email }}`, `{{ .Password }}` по формату соседних bot-строк), `tgbot.messages.portalDisabled`, `tgbot.messages.portalLdapManaged`
- Test: `internal/web/service/tgbot/tgbot_portal_test.go`

Правила: кабинет выключен → `portalDisabled`; у клиента нет своего пароля и LDAP включён → `portalLdapManaged`, пароль не создаётся; чужой email (не принадлежит `tgUserID`) → отказ существующей веткой `clientOwnedByTgUser`; иначе `IssueTemporaryPassword` и сообщение с паролем в этот чат.

- [ ] **Step 1: Failing tests** (по образцу `tgbot_client_links_authz_test.go`): `TestResetPortalPassword` (table) — выключен → сообщение `portalDisabled`, хэш пуст; LDAP-клиент → `portalLdapManaged`; свой клиент → хэш установлен, `must_change`, отправленный текст содержит пароль, который проходит `Authenticate`; `TestPortalResetCallback_ForeignEmail` — callback `client_portal_password_c <чужой>` от не-админа → пароль чужого клиента не изменился.
- [ ] **Step 2:** Run `go test ./internal/web/service/tgbot/ -run 'Portal' -v` → FAIL.
- [ ] **Step 3:** Реализация, ключи переводов.
- [ ] **Step 4:** Run → PASS; `go test ./internal/web/service/tgbot/` PASS.
- [ ] **Step 5:** Commit `feat(tgbot): clients reset their portal password from the bot`.

### Task 5: CHANGELOG, документация и проверка ветки

**Files:**

- Modify: `CHANGELOG.md`, `CHANGELOG.ru_RU.md` — `### Added` в `[Unreleased]`: кабинет клиента (вход по паролю/LDAP, скрытие ключей, токены устройств), включается в настройках подписки; выдача и отзыв доступа в карточке клиента; сброс через Telegram. Отметить, что страница кабинета и вход в We1ssConnect — в следующих версиях.
- Modify: `docs/architecture.md` — строка в §5.6 об админских операциях и отзыве при выключении.

- [ ] **Step 1:** Правки.
- [ ] **Step 2:** Run `mingw32-make verify`. Expected: всё зелёное, кроме Storybook-проекта без Chromium (сообщить).
- [ ] **Step 3:** Run `go test -race ./internal/web/service/portal/ ./internal/web/controller/ ./internal/web/service/tgbot/` PASS.
- [ ] **Step 4:** Commit `docs(portal): changelog and architecture for portal admin`.
