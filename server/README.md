# Сервер Stick-it

Отдельный пакет Node.js + Fastify + TypeScript, PostgreSQL через `pg.Pool` и Drizzle ORM, Zod для окружения. Frontend подключён к API входа, профиля, администрирования, общих записок и push-подписок. Постоянная PostgreSQL отдельно не проверялась. Для ручного локального стенда с PGlite есть `npm.cmd run dev:local` из корня проекта. [Профиль, фото и оформление](docs/profile.md).

[Общая доска, адресаты, архив, перенос localStorage и два администратора из env](docs/shared-board.md).

[Вход, первый администратор, права, профиль и настройки cookie](docs/accounts.md).

Подробная [модель данных, ограничения БД и правила будущего сервисного слоя](docs/database-schema.md).

Для тестового Linux VPS подготовлен [Docker Compose: сборка образов вне VPS, SSH-туннель, миграции и резервное копирование](../deploy/README.md). Контейнеры не нужны для локальной разработки и тестов.

## Структура

```text
server/
├── .env.example
├── package.json / package-lock.json
├── tsconfig.json
├── tsconfig.check.json      # Проверка src, tests и drizzle.config.ts
├── drizzle.config.ts
├── drizzle/                 # Версионированные SQL-миграции и metadata Drizzle
├── docs/database-schema.md
├── src/
│   ├── app.ts               # Сборка приложения, ошибки, логирование
│   ├── index.ts             # HTTP и обработка SIGINT/SIGTERM
│   ├── config/env.ts        # Загрузка server/.env и Zod
│   ├── plugins/database.ts  # Пул, проверка соединения, декоратор app.db
│   ├── modules/health/routes.ts
│   └── db/
│       ├── schema.ts        # Таблицы, enum, FK, CHECK, индексы и типы
│       ├── relations.ts     # Связи для relational queries
│       ├── index.ts         # Общий экспорт схемы
│       └── check.ts         # Проверка подключения без HTTP
└── tests/                  # HTTP, ошибки, окружение, lifecycle
```

## Запуск

Нужен Node.js 22.12+; команды ниже выполняются из корня репозитория. В PowerShell используйте `npm.cmd`, если заблокирован `npm.ps1`.

```powershell
npm.cmd --prefix server ci
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
npm.cmd --prefix server run dev
```

Копируйте пример только при отсутствии собственного `.env`. Этот файл игнорируется Git. Настройки берутся из `server/.env` независимо от рабочего каталога; переменные процесса имеют приоритет. `DATABASE_URL` по умолчанию пустая: сервер запускается с предупреждением, без БД. Это позволяет проверить HTTP-каркас без установленной PostgreSQL.

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
npm.cmd --prefix server run build
npm.cmd --prefix server run typecheck
npm.cmd --prefix server start
npm.cmd --prefix server test
```

`GET /api/health` возвращает `{"status":"ok"}` и проверяет HTTP, а не готовность БД. API входа, профиля и администрирования описаны в [accounts.md](docs/accounts.md). При заданной `DATABASE_URL` сервер выполняет `SELECT 1` перед открытием порта; ошибка подключения прерывает запуск с ненулевым кодом. Отдельная проверка: `npm.cmd --prefix server run db:check`.

`Ctrl+C`/SIGINT или SIGTERM останавливают приём запросов, дожидаются текущих запросов и закрывают пул. Общий предел остановки — 15 секунд. Логи JSON идут в stdout/stderr и подходят для journald; `LOG_LEVEL` задаёт уровень. Строка подключения и входные значения конфигурации не выводятся.

Frontend запускается прежними командами `npm.cmd run dev` и `npm.cmd run build`; для входа и записок нужен работающий backend и применённые миграции. Vite проксирует `/api` на локальный сервер. CORS не включён: браузер работает через единый origin. Для Vite задайте `APP_ORIGIN=http://127.0.0.1:5173`, `COOKIE_SECURE=false`, `TRUST_PROXY=none` в `server/.env`.

## Локальная PostgreSQL

Если PostgreSQL отсутствует, установите её отдельно обычным установщиком для своей ОС, без Docker. Создание служб и установка БД автоматически этим проектом не выполняются. Подключитесь через `psql` под локальным администратором PostgreSQL и создайте отдельную роль и базу:

```sql
CREATE ROLE stickerboard LOGIN;
\password stickerboard
CREATE DATABASE stickerboard OWNER stickerboard;
```

`\password` интерактивно запросит ваш собственный пароль. Примерного рабочего пароля в проекте нет. Укажите в `server/.env` реальные имя роли, пароль, адрес, порт и базу:

```text
DATABASE_URL=postgresql://<role>:<encoded-password>@127.0.0.1:5432/<database>
```

Специальные символы логина/пароля должны быть URL-encoded. Затем выполните `db:check` и запустите сервер. Размер пула, таймаут соединения и запросов задаются переменными `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`, `DB_QUERY_TIMEOUT_MS`.

## Миграции

Drizzle Kit читает `server/drizzle.config.ts` и схему `src/db/schema.ts`. Генерация не требует БД или `DATABASE_URL`; применение использует реальную `DATABASE_URL` из окружения или `server/.env`:

```powershell
npm.cmd --prefix server run db:generate
# Просмотрите созданный SQL и включите его в контроль версий.
npm.cmd --prefix server run db:migrate
```

`0000_initial_schema.sql` создаёт исходные таблицы и enum. `0001` и `0002` добавляют доступ и revision, `0003` и `0004` расширяют профиль, `0005` добавляет хеш вложений, а `0006` — подписки Web Push. Данные автоматически не создаются. После ручного применения миграций выполните `npm.cmd --prefix server run admin:bootstrap` с двумя наборами `BOOTSTRAP_ADMIN_*` в `server/.env`. Существующие аккаунты не перезаписываются; пароли нужны только для новых админов.

## Дальнейшее развёртывание

Для VPS предусмотрены три контейнера в корневом `compose.yaml`: Nginx, Fastify и PostgreSQL. Только HTTP Nginx опубликован на loopback; доступ — через SSH-туннель. Ручной production-мигратор `src/db/migrate.ts` использует готовые SQL и runtime Drizzle без dev-зависимостей. Вход использует Argon2id, серверные сессии, HttpOnly-cookie, CSRF и роли; двух администраторов создают отдельной командой с bootstrap override. Инструкции: [accounts.md](docs/accounts.md) и [deploy](../deploy/README.md).

## Результат проверки каркаса

Серверные тесты запускают миграции и запросы на PostgreSQL-движке PGlite в памяти и проверяют реальный Argon2id, права, CSRF, блокировку, отзыв сессий, health и shutdown. Браузерные тесты используют тот же Fastify с тестовой БД и проверяют вход, админку, профиль и доску. PGlite — dev-зависимость, в production-образ не копируется. Постоянная PostgreSQL, Docker-сборки и развёртывание на VPS отдельно не проверены.

Документация используемых API: [Fastify lifecycle](https://fastify.dev/docs/latest/Reference/Server/), [Drizzle + node-postgres](https://orm.drizzle.team/docs/get-started-postgresql).
