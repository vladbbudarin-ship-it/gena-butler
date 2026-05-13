import { createClient } from '@supabase/supabase-js'
import { TelegramAuthError, verifyTelegramAuthData } from './_utils/telegram-auth.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

async function deleteCreatedUser(userId) {
  if (!userId) {
    return
  }

  await supabase.auth.admin.deleteUser(userId)
}

export const handler = async (event) => {
  let createdUserId = null

  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const body = JSON.parse(event.body || '{}')
    const name = String(body.name || '').trim()
    const email = normalizeEmail(body.email)
    const password = String(body.password || '')
    const telegramAuth = verifyTelegramAuthData(body.telegram_auth_data)

    if (!name) {
      return jsonResponse(400, { error: 'Введите имя.' })
    }

    if (!email) {
      return jsonResponse(400, { error: 'Введите email.' })
    }

    if (password.length < 6) {
      return jsonResponse(400, { error: 'Пароль должен быть не короче 6 символов.' })
    }

    const { data: existingTelegramProfile, error: telegramProfileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('telegram_user_id', telegramAuth.telegram_user_id)
      .maybeSingle()

    if (telegramProfileError) {
      return jsonResponse(500, {
        error: 'Не удалось проверить Telegram. Проверьте, что SQL supabase/telegram-schema.sql выполнен.',
        details: telegramProfileError.message,
      })
    }

    if (existingTelegramProfile) {
      return jsonResponse(409, { error: 'Этот Telegram уже привязан к другому аккаунту.' })
    }

    const { data: existingEmailProfile, error: emailProfileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (emailProfileError) {
      return jsonResponse(500, {
        error: 'Не удалось проверить email.',
        details: emailProfileError.message,
      })
    }

    if (existingEmailProfile) {
      return jsonResponse(409, { error: 'Пользователь с таким email уже существует. Войдите или используйте другой email.' })
    }

    const {
      data: { user },
      error: createUserError,
    } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        telegram_username: telegramAuth.telegram_username,
      },
    })

    if (createUserError || !user) {
      return jsonResponse(400, {
        error: createUserError?.message || 'Не удалось создать пользователя.',
      })
    }

    createdUserId = user.id

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email,
        name,
        role: 'user',
        account_type: 'user',
        telegram_user_id: telegramAuth.telegram_user_id,
        telegram_username: telegramAuth.telegram_username,
        telegram_linked_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (profileError) {
      await deleteCreatedUser(createdUserId)

      return jsonResponse(500, {
        error: 'Пользователь создан не был: не удалось сохранить профиль с Telegram.',
        details: profileError.message,
      })
    }

    return jsonResponse(200, {
      success: true,
    })
  } catch (error) {
    if (createdUserId) {
      await deleteCreatedUser(createdUserId)
    }

    if (error instanceof TelegramAuthError) {
      return jsonResponse(error.statusCode, { error: error.message })
    }

    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
