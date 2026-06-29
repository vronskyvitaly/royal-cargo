# Royal Cargo — Редакция SEO-статей

Веб-приложение для автоматической генерации и публикации SEO-статей на основе расшифровок телефонных звонков. Руководитель и отдел маркетинга просматривают сгенерированный контент, редактируют, одобряют или отклоняют, после чего статьи публикуются на сайтах компании.

## Стек

| Слой | Технологии |
|---|---|
| Фронтенд | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Бэкенд | Express 5, Socket.io, TypeScript, tsx |
| База данных | PostgreSQL |
| AI | Claude Sonnet (Anthropic API) |
| Публикация | WordPress REST API, Megagroup API |

## Как это работает

```
Звонок в Bitrix24
      ↓
Расшифровка сохраняется в PostgreSQL (call_transcripts)
      ↓
Менеджер открывает звонок → нажимает «Создать статью»
      ↓
Claude Sonnet генерирует SEO-статью по транскрипту
      ↓
Руководитель / маркетинг редактирует → Одобряет или Отклоняет
      ↓
Публикация в WordPress или Megagroup
```

## Структура проекта

```
royal-cargo/
├── frontend/          # Next.js приложение
│   └── src/
│       ├── app/
│       │   ├── transcripts/        # Список звонков
│       │   ├── transcripts/[id]/   # Расшифровка звонка
│       │   ├── articles/           # Список статей
│       │   └── articles/[id]/      # Редактор статьи
│       ├── components/
│       └── lib/
│           ├── api.ts              # HTTP-клиент
│           └── socket.ts           # Socket.io клиент
└── server/            # Express API
    └── src/
        ├── routes/
        │   ├── transcripts.ts
        │   └── articles.ts
        └── services/
            ├── claude.ts           # Генерация статей
            ├── wordpress.ts        # Публикация в WP
            └── megagroup.ts        # Публикация в Megagroup
```

## Статусы статей

```
draft → approved → published
  ↓
rejected
```

| Статус | Описание |
|---|---|
| `draft` | Только что сгенерирована Claude |
| `approved` | Одобрена руководителем / маркетингом |
| `rejected` | Отклонена с комментарием |
| `published` | Опубликована на сайте |

## Запуск

### Требования

- Node.js 20+
- Доступ к PostgreSQL

### Установка

```bash
# Бэкенд
cd server
npm install

# Фронтенд
cd frontend
npm install
```

### Переменные окружения

**`server/.env`**
```env
DATABASE_URL=postgres://user:password@host:5432/dbname

CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6

WP_URL=https://your-site.ru
WP_USER=admin
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx

MEGAGROUP_API_URL=https://...
MEGAGROUP_API_KEY=...

PORT=4000
FRONTEND_URL=http://localhost:3000
```

**`frontend/.env`**
```env
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

### Запуск в режиме разработки

```bash
# Терминал 1 — сервер
cd server && npm run dev

# Терминал 2 — фронтенд
cd frontend && npm run dev
```

Приложение доступно на [http://localhost:3000](http://localhost:3000)

### Продакшн-сборка

```bash
cd server && npm run build && npm start
cd frontend && npm run build && npm start
```

## API

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/transcripts` | Список звонков |
| `GET` | `/api/transcripts/:id` | Звонок с расшифровкой |
| `GET` | `/api/articles` | Список статей |
| `GET` | `/api/articles/:id` | Статья |
| `POST` | `/api/articles/generate` | Сгенерировать статью из транскрипта |
| `PUT` | `/api/articles/:id` | Обновить / одобрить / отклонить |
| `POST` | `/api/articles/:id/publish` | Опубликовать на платформе |
| `DELETE` | `/api/articles/:id` | Удалить статью |

## Socket.io события

| Событие | Данные | Когда |
|---|---|---|
| `article:created` | `Article` | После генерации Claude |
| `article:updated` | `Article` | После правки / смены статуса |
| `article:published` | `Article` | После публикации |
| `article:deleted` | `{ id }` | После удаления |
