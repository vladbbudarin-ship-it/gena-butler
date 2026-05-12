const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiApiKey = process.env.OPENAI_API_KEY
const ownerEmail = process.env.OWNER_EMAIL

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function telegramGet(method) {
  if (!telegramBotToken) {
    return null
  }

  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/${method}`)
  const data = await response.json().catch(() => null)

  return {
    ok: response.ok,
    status: response.status,
    data,
  }
}

export const handler = async (event) => {
  try {
    const secret = event.queryStringParameters?.secret

    if (!telegramWebhookSecret || secret !== telegramWebhookSecret) {
      return jsonResponse(401, { error: 'Unauthorized' })
    }

    const [botInfo, webhookInfo] = await Promise.all([
      telegramGet('getMe'),
      telegramGet('getWebhookInfo'),
    ])

    return jsonResponse(200, {
      success: true,
      env: {
        hasTelegramBotToken: Boolean(telegramBotToken),
        hasTelegramWebhookSecret: Boolean(telegramWebhookSecret),
        hasTelegramBotUsername: Boolean(telegramBotUsername),
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseServiceRoleKey: Boolean(supabaseServiceRoleKey),
        hasOpenaiApiKey: Boolean(openaiApiKey),
        hasOwnerEmail: Boolean(ownerEmail),
        botUsername: telegramBotUsername || null,
      },
      botInfo,
      webhookInfo,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Telegram diagnostics failed.',
      details: error.message,
    })
  }
}
