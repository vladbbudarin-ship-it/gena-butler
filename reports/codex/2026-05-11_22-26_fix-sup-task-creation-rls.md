# Fix SUP task creation RLS

## 1. Название задачи

Fix SUP task creation RLS

## 2. Краткое описание задачи

Исправлена ошибка создания задач в СУП, когда прямой INSERT из frontend блокировался RLS таблицы sup_tasks.

## 3. Что было изменено

- Добавлена Netlify Function create-sup-task с backend-проверкой прав owner/user_plus/admin/manager
- Frontend createSupTask переведен на вызов серверной функции вместо прямой записи в sup_tasks

## 4. Какие файлы были изменены

- netlify/functions/create-sup-task.js
- src/lib/api.js

## 5. Какие ошибки были найдены

- Создание задачи из браузера падало с new row violates row-level security policy for table sup_tasks

## 6. Какие ошибки были исправлены

- Задача создается через backend с service role и явной проверкой доступа к проекту
- Обычный user без прав получает понятную ошибку 403

## 7. Какие проверки выполнены

- git grep conflict markers: чисто
- node --check create-sup-task.js: успешно
- npm run build: успешно

## 8. Результат npm run build

Успешно: vite build completed, 66 modules transformed.

## 9. Результат тестов, если они есть

E2E не запускались: точечная backend/frontend правка, сборка и синтаксис функции проверены.

## 10. Что нужно проверить вручную

- После deploy создать задачу под owner
- Создать задачу под user_plus, который admin или manager проекта
- Проверить, что member/viewer и обычный user не могут создать задачу

## 11. Риски и важные замечания

- Функция начнет работать на опубликованном сайте только после deploy
- Если в Netlify отсутствуют SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY, функция вернет серверную ошибку

## 12. Следующий рекомендуемый шаг

Задеплоить изменения и повторить создание задачи в СУП.
