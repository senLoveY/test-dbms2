# test-dbms2

Тест по MS SQL Server: соло-режим и **мультиплеер-дуэль** (2 игрока, таймер, очки за скорость).

## Стек

- **Frontend:** React + Vite (деплой на Vercel)
- **API:** Vercel Serverless Functions (`/api/*`)
- **БД + Auth + Realtime:** Supabase

## Быстрый старт

### 1. Supabase

1. Создайте проект на [supabase.com](https://supabase.com).
2. В **SQL Editor** выполните скрипт [`supabase/schema.sql`](supabase/schema.sql).
3. В **Database → Replication** включите таблицы `rooms` и `room_players` для Realtime.
4. Скопируйте URL, `anon key` и `service_role key`.

### 2. Переменные окружения

Скопируйте `.env.example` в `.env`:

```bash
cp .env.example .env
```

Заполните:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — для фронтенда
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — для API на Vercel

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

## Режимы

| Режим | Путь | Описание |
|--------|------|----------|
| Соло | `/solo` | 20 вопросов, один на экран |
| Ответы | `/answers` | Справочник правильных ответов |
| Мультиплеер | `/multi/create`, `/multi/join` | Комната по коду, 2 игрока |

## Мультиплеер

1. Регистрация / вход.
2. **Создать комнату** → код (например `ABC123`).
3. Друг входит по коду.
4. Хост нажимает **Начать игру**.
5. На каждый вопрос — таймер (30 с). Быстрый правильный ответ даёт больше очков (до 1000).
6. После раунда — показ правильного ответа, затем следующий вопрос.

## API (кратко)

- `POST /api/rooms/create` — создать комнату
- `POST /api/rooms/join` — войти по коду
- `GET /api/rooms/state?roomId=` — состояние комнаты
- `POST /api/game/start` — старт (только хост)
- `POST /api/game/answer` — отправить ответ
- `POST /api/game/timeout` — истечение таймера
- `POST /api/game/advance` — следующий вопрос (хост, после reveal)

Все запросы (кроме публичных) требуют заголовок `Authorization: Bearer <supabase_access_token>`.

## Скрипты

```bash
npm run dev      # Vite dev server
npm run build    # production build → dist/
npm run preview  # preview build
```
