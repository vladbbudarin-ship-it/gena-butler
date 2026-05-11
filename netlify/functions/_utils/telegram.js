const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME
const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://gena-dvoretskiy.netlify.app'

export const TELEGRAM_SITE_URL = siteUrl

export function getBotUsername() {
  return telegramBotUsername || 'BOT_USERNAME'
}

export function truncateText(text, maxLength = 700) {
  const value = String(text || '').trim()

  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}…`
}

async function telegramApi(method, payload) {
  if (!telegramBotToken) {
    console.warn(`Telegram API ${method} skipped: TELEGRAM_BOT_TOKEN is not set.`)
    return { ok: false, missingToken: true }
  }

  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`Telegram API ${method} failed:`, body)
    return { ok: false, status: response.status, body }
  }

  return response
}

export async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!chatId || !text) {
    return null
  }

  return telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  })
}

export async function answerCallbackQuery(callbackQueryId, text = '') {
  if (!callbackQueryId) {
    return null
  }

  return telegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  })
}

export function mainMenuKeyboard({ isOwner = false } = {}) {
  const keyboard = [
    [{ text: 'Обычный диалог' }, { text: 'Срочный вопрос' }],
    [{ text: 'Открыть сайт' }],
  ]

  if (isOwner) {
    keyboard.push([{ text: 'Кабинет Бударина' }])
  }

  return {
    keyboard,
    resize_keyboard: true,
    one_time_keyboard: false,
  }
}

export function urgencyKeyboard() {
  return {
    keyboard: [
      [{ text: 'Обычный' }, { text: 'Важный' }, { text: 'Срочный' }],
      [{ text: 'Обычный диалог' }, { text: 'Открыть сайт' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  }
}

export function ownerCabinetKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Открытые', callback_data: 'owner_filter:open' },
        { text: 'Срочные', callback_data: 'owner_filter:urgent' },
      ],
      [
        { text: 'Важные', callback_data: 'owner_filter:important' },
        { text: 'Ошибки AI', callback_data: 'owner_filter:errors' },
      ],
      [
        { text: 'Закрытые', callback_data: 'owner_filter:closed' },
        { text: 'Обновить', callback_data: 'owner_filter:open' },
      ],
      [{ text: 'Открыть сайт', url: siteUrl }],
    ],
  }
}

export function questionActionKeyboard(questionId) {
  return {
    inline_keyboard: [
      [
        { text: 'Утвердить', callback_data: `owner_q:approve:${questionId}` },
        { text: 'Редактировать', callback_data: `owner_q:edit:${questionId}` },
      ],
      [
        { text: 'Ответить лично', callback_data: `owner_q:manual:${questionId}` },
        { text: 'Отклонить', callback_data: `owner_q:reject:${questionId}` },
      ],
      [{ text: 'Открыть сайт', url: siteUrl }],
    ],
  }
}

export function finalAnswerText({ finalAnswerRu, finalAnswerZh }) {
  return [
    'Бударин ответил:',
    '',
    finalAnswerRu || '',
    finalAnswerZh ? '' : null,
    finalAnswerZh ? '中文:' : null,
    finalAnswerZh || null,
  ].filter((line) => line !== null).join('\n')
}
