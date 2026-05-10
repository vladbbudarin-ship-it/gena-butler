import { createClient } from '@supabase/supabase-js'
import { generateTelegramLinkCode } from './_utils/codes.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function getUserFromEvent(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Пользователь не авторизован.' }
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken)

  if (error || !user) {
    return { error: 'Не удалось проверить пользователя.' }
  }

  return { user }
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent(event)

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = generateTelegramLinkCode()

      const { data, error } = await supabase
        .from('profiles')
        .update({
          telegram_link_code: code,
          telegram_link_code_expires_at: expiresAt,
        })
        .eq('id', user.id)
        .select('telegram_link_code, telegram_link_code_expires_at')
        .single()

      if (!error) {
        return jsonResponse(200, {
          success: true,
          code: data.telegram_link_code,
          expires_at: data.telegram_link_code_expires_at,
          bot_username: telegramBotUsername || null,
        })
      }

      if (error.code === '23505') {
        continue
      }

      return jsonResponse(500, {
        error: 'Не удалось создать Telegram-код. Проверьте, что SQL-файл supabase/telegram-schema.sql выполнен в Supabase.',
        details: error.message,
      })
    }

    return jsonResponse(500, {
      error: 'Не удалось создать уникальный Telegram-код. Попробуйте ещё раз.',
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
