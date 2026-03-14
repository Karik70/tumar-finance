# Тұмар Күзет — Финансовый дашборд

Многопользовательский финансовый дашборд для ТОО «Тұмар Күзет».

## Стек
- **Next.js 15** (App Router)
- **Supabase** (база данных + авторизация)
- **Recharts** (графики)
- **Vercel** (деплой)

## Быстрый старт

### 1. Supabase — создать проект
1. Зайти на [supabase.com](https://supabase.com) → New Project
2. В SQL Editor выполнить файл `supabase-schema.sql`
3. В Settings → API скопировать `Project URL` и `anon/public` ключ

### 2. Локальный запуск
```bash
cp .env.local.example .env.local
# Вставить ваши ключи в .env.local

npm install
npm run dev
# → http://localhost:3000
```

### 3. Создать пользователей в Supabase
В Supabase → Authentication → Users → Invite User:
- `buhgalter@tumar.kz`  (бухгалтер — вводит выписки)
- `sergey@tumar.kz`    (Сергей — вводит наличные)
- `kim@tumar.kz`       (директор — просмотр)

### 4. Деплой на Vercel
```bash
npm install -g vercel
vercel
```
Или:
1. Загрузить репозиторий на GitHub
2. В Vercel → New Project → выбрать репозиторий
3. В Environment Variables добавить:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy → готово!

## Страницы
| Страница | URL | Кто использует |
|---|---|---|
| Дашборд | `/dashboard` | Директор Ким А.А. |
| Выписка банка | `/entry/bank` | Бухгалтер |
| Расход наличных | `/entry/cash` | Сергей |
| Остатки (пятница) | `/entry/snapshot` | Бухгалтер |
| Аналитика | `/analytics` | Руководство |
| ЗП / Покрытие | `/salary` | Бухгалтер |

## Что делает дашборд автоматически
- Показывает хватает ли денег на ЗП (зелёный/красный)
- Предупреждает если Каспи не переведён на счёт
- Строит графики по 3/6/12 месяцев
- Рассчитывает 40% правило резерва ЗП
- Показывает структуру доходов и расходов в разрезе категорий
