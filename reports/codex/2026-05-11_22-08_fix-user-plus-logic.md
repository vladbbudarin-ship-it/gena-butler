# Проверка и исправление логики Пользователь+

## 1. Название задачи

Проверка и исправление логики Пользователь+

## 2. Краткое описание задачи

Проверена и доработана логика user_plus: права owner/user_plus, Telegram-команда kodPlus, автоматическое добавление создателя проекта и интерфейс кодов в кабинете Бударина.

## 3. Что было изменено

- Создана функция get-plus-invite-codes для безопасного списка кодов; добавлен раздел Пользователи+ в кабинет Бударина; Telegram-команда теперь принимает /kodPlus Plus1234AB и kodPlus Plus1234AB; Telegram-активация меняет только account_type; создатель проекта добавляется как Владелец проекта с admin-доступом.

## 4. Какие файлы были изменены

- netlify/functions/get-plus-invite-codes.js; netlify/functions/create-sup-project.js; netlify/functions/telegram-webhook.js; src/lib/api.js; src/pages/OwnerDashboard.jsx; reports/codex/<new-report>.md

## 5. Какие ошибки были найдены

- Создатель проекта получал position_title Создатель вместо Владелец проекта; Telegram принимал только /kodPlus, но не kodPlus без слеша; Telegram-активация дополнительно меняла role на user_plus; в кабинете Бударина не было списка кодов Пользователь+.

## 6. Какие ошибки были исправлены

- position_title создателя проекта заменён на Владелец проекта; добавлен regex для команды kodPlus без слеша; роль больше не меняется, обновляется только account_type; добавлен backend и UI для просмотра кодов Пользователь+.

## 7. Какие проверки выполнены

- git grep -n -e <<<<<<< -e ======= -e >>>>>>>; rg conflict markers по всем файлам без node_modules/dist/test artifacts; node --check для изменённых Netlify Functions; npm.cmd run build.

## 8. Результат npm run build

Успешно: npm.cmd run build завершился без ошибок.

## 9. Результат тестов, если они есть

E2E не запускались в этом проходе; ранее Playwright-проверки печатали ok, но локальный Windows-процесс зависал после выполнения. Для этой задачи выполнены syntax checks и build.

## 10. Что нужно проверить вручную

- В Telegram отправить kodPlus Plus1234AB привязанным пользователем; создать код Пользователь+ из кабинета Бударина; проверить, что user_plus создаёт проект, а user не может; проверить список кодов и статусы активен/использован/истёк.

## 11. Риски и важные замечания

- Если SQL supabase/plus-invite-codes-schema.sql или supabase/project-management-schema.sql не выполнен в Supabase, функции вернут понятную ошибку; Google Drive копию отчёта нужно перенести вручную.

## 12. Следующий рекомендуемый шаг

Выполнить ручной тест выдачи user_plus через Telegram и создать один проект под user_plus.
