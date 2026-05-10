import { createClient } from '@supabase/supabase-js'
import { createOwnerQuestionFromUser } from './_utils/owner-question-flow.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const telegramLinkCodePattern = /^TG-[0-9]{4}[A-Z]{2}$/

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function getTelegramUsername(from) {
  return from?.username ? String(from.username) : null
}

async function sendTelegramMessage(chatId, text) {
  if (!telegramBotToken || !chatId || !text) {
    return
  }

  await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  })
}

async function handleStartLink({ chatId, from, code }) {
  const normalizedCode = String(code || '').trim().toUpperCase()

  if (!telegramLinkCodePattern.test(normalizedCode)) {
    await sendTelegramMessage(chatId, 'Код привязки неверный. Создайте новый код в профиле на сайте.')
    return
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, telegram_link_code_expires_at')
    .eq('telegram_link_code', normalizedCode)
    .maybeSingle()

  if (profileError) {
    await sendTelegramMessage(chatId, 'Не удалось проверить код. Попробуйте позже.')
    return
  }

  if (!profile) {
    await sendTelegramMessage(chatId, 'Код не найден. Создайте новый код в профиле на сайте.')
    return
  }

  if (!profile.telegram_link_code_expires_at || new Date(profile.telegram_link_code_expires_at).getTime() <= Date.now()) {
    await supabase
      .from('profiles')
      .update({
        telegram_link_code: null,
        telegram_link_code_expires_at: null,
      })
      .eq('id', profile.id)

    await sendTelegramMessage(chatId, 'Срок действия кода истёк. Создайте новый код в профиле на сайте.')
    return
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      telegram_user_id: from.id,
      telegram_username: getTelegramUsername(from),
      telegram_linked_at: new Date().toISOString(),
      telegram_link_code: null,
      telegram_link_code_expires_at: null,
    })
    .eq('id', profile.id)

  if (updateError) {
    await sendTelegramMessage(chatId, 'Не удалось привязать Telegram. Возможно, этот Telegram уже привязан к другому профилю.')
    return
  }

  await sendTelegramMessage(chatId, 'Telegram привязан к профилю.')
}

async function handleOwnerQuestionFromTelegram({ chatId, from, text }) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_user_id', from.id)
    .maybeSingle()

  if (profileError) {
    await sendTelegramMessage(chatId, 'Не удалось проверить привязку Telegram. Попробуйте позже.')
    return
  }

  if (!profile) {
    await sendTelegramMessage(chatId, 'Сначала привяжите Telegram в профиле на сайте.')
    return
  }

  const result = await createOwnerQuestionFromUser({
    supabase,
    userId: profile.id,
    questionText: text,
    urgencyLevel: 'normal',
  })

  if (result.error) {
    await sendTelegramMessage(chatId, result.error)
    return
  }

  if (result.status === 'ai_error') {
    await sendTelegramMessage(chatId, 'Сообщение принято. AI-черновик не подготовлен, Бударин увидит вопрос в кабинете.')
    return
  }

  await sendTelegramMessage(chatId, 'Сообщение принято. Бударин проверит ответ в кабинете.')
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const secret = event.queryStringParameters?.secret

    if (!telegramWebhookSecret || secret !== telegramWebhookSecret) {
      return jsonResponse(401, { error: 'Unauthorized' })
    }

    const update = JSON.parse(event.body || '{}')
    const message = update.message

    if (!message?.chat?.id || !message?.from?.id || typeof message.text !== 'string') {
      return jsonResponse(200, { success: true })
    }

    const chatId = message.chat.id
    const from = message.from
    const text = message.text.trim()
    const startMatch = text.match(/^\/start(?:@\w+)?\s+(TG-[0-9]{4}[A-Z]{2})$/i)

    if (startMatch) {
      await handleStartLink({
        chatId,
        from,
        code: startMatch[1],
      })

      return jsonResponse(200, { success: true })
    }

    if (text.startsWith('/start')) {
      await sendTelegramMessage(chatId, 'Сначала создайте код привязки в профиле на сайте и отправьте /start TG-1234AB.')
      return jsonResponse(200, { success: true })
    }

    await handleOwnerQuestionFromTelegram({
      chatId,
      from,
      text,
    })

    return jsonResponse(200, { success: true })
  } catch (error) {
    console.error('Telegram webhook error:', error.message)

    return jsonResponse(200, {
      success: false,
      error: 'Webhook handled with internal error.',
    })
  }
}
