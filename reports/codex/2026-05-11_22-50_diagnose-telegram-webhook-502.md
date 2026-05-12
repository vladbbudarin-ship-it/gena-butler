# Diagnose Telegram webhook 502

## 1. Название задачи

Diagnose Telegram webhook 502

## 2. Краткое описание задачи

Проверена причина отсутствия Telegram-сообщений: webhook установлен, но Telegram получает 502 от Netlify Function.

## 3. Что было изменено

- telegram-health теперь показывает наличие Supabase/OpenAI/OWNER_EMAIL переменных
- telegram-webhook переведен на ленивое создание Supabase-клиента, чтобы не падать 502 на загрузке модуля

## 4. Какие файлы были изменены

- netlify/functions/telegram-health.js
- netlify/functions/telegram-webhook.js

## 5. Какие ошибки были найдены

- Telegram getWebhookInfo показывает last_error_message: Wrong response from the webhook: 502 Bad Gateway
- telegram-webhook создавал Supabase client на уровне модуля, что может падать до handler при отсутствии SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY

## 6. Какие ошибки были исправлены

- Добавлена диагностика обязательных env для webhook
- Webhook больше не создает Supabase client до входа в handler

## 7. Какие проверки выполнены

- node --check telegram-webhook.js: успешно
- node --check telegram-health.js: успешно
- git grep conflict markers: чисто
- npm run build: успешно

## 8. Результат npm run build

Успешно: vite build completed, 66 modules transformed.

## 9. Результат тестов, если они есть

E2E не запускались: правка Netlify Functions, синтаксис функций и build проверены.

## 10. Что нужно проверить вручную

- После deploy открыть telegram-health и проверить hasSupabaseUrl/hasSupabaseServiceRoleKey/hasOpenaiApiKey/hasOwnerEmail
- В Netlify Functions logs проверить telegram-webhook при отправке сообщения боту
- Отправить /start в Telegram и обычное сообщение

## 11. Риски и важные замечания

- Если в Netlify не заданы SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY, бот не сможет связаться с Supabase
- Если OPENAI_API_KEY отсутствует, вопрос сохранится с ai_error или обработка AI не пройдет

## 12. Следующий рекомендуемый шаг

Задеплоить изменения и повторно открыть telegram-health.
