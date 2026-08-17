# Тесты и состязания

Платформа для своих тестов: подготовка в соло и дуэль с другом (таймер, очки за скорость).

## Стек

- **Frontend:** React + Vite (деплой на Vercel)
- **API:** Vercel Serverless Functions (`/api/*`)
- **БД + Auth + Realtime:** Supabase

## Быстрый старт

### 1. Supabase

1. Создайте проект на [supabase.com](https://supabase.com).
2. В **SQL Editor** выполните скрипт [`supabase/schema.sql`](supabase/schema.sql).
3. Для уже существующей БД выполните [`supabase/quizzes-migration.sql`](supabase/quizzes-migration.sql) (и при необходимости `room-settings-migration.sql`).
4. Realtime: нижняя часть `schema.sql` **или** Dashboard → **Database → Publications → supabase_realtime** — таблицы `rooms` и `room_players`.
5. Скопируйте URL, `anon key` и `service_role key`.

### 2. Переменные окружения

Скопируйте `.env.example` в `.env`:

```bash
cp .env.example .env
```

Заполните:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — для фронтенда
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — для API на Vercel

**Важно:** URL — только корень проекта (`https://xxx.supabase.co`), **без** `/rest/v1/`.

### 3. Локально

```bash
npm install
npm run dev          # только фронт (API нужен отдельно)
npx vercel dev       # фронт + API вместе (рекомендуется)
```

### 4. Деплой на Vercel

1. Импортируйте репозиторий в [vercel.com](https://vercel.com).
2. Добавьте env-переменные из `.env.example` в **Project Settings → Environment Variables**.
3. Deploy.

## Как пользоваться

1. Регистрация / вход.
2. **Кабинет** (`/me/quizzes`) — создать тест, добавить вопросы или импортировать JSON.
3. **Опубликовать** тест.
4. **Соло** — подготовка со своей скоростью и разбором.
5. **Дуэль** — комната по коду, 2 игрока, таймер и очки.

Справочник правильных ответов доступен только автору теста.

## API (кратко)

### Тесты

- `GET /api/quizzes` — список своих тестов
- `POST /api/quizzes` — создать черновик
- `GET /api/quizzes/:id` — тест с вопросами (только автор)
- `PUT /api/quizzes/:id` — сохранить / опубликовать
- `DELETE /api/quizzes/:id` — удалить
- `POST /api/quizzes/:id/duplicate` — копия
- `GET|POST /api/quizzes/:id/attempt` — попытки соло

### Комнаты

- `POST /api/rooms/create` — `{ quizId, settings }`
- `POST /api/rooms/join` — войти по коду
- `GET /api/rooms/state?roomId=` — состояние комнаты
- `POST /api/game/start` — старт (только хост)
- `POST /api/game/answer` — отправить ответ
- `POST /api/game/timeout` — истечение таймера
- `POST /api/game/advance` — следующий вопрос (хост, после reveal)
- `POST /api/game/end` — досрочно завершить игру (хост)
- `POST /api/rooms/leave` — выйти из комнаты
- `POST /api/rooms/settings` — настройки лобби (хост)

Все запросы требуют `Authorization: Bearer <supabase_access_token>`.

При старте дуэли вопросы копируются в комнату (`questions_snapshot`), поэтому правки теста не ломают текущий матч.

## Скрипты

```bash
npm run dev      # Vite dev server
npm run build    # production build → dist/
npm run preview  # preview build
```
