import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isMissingSchemaColumn(error) {
  return error?.code === 'PGRST204'
    || /column|schema cache/i.test(error?.message || '')
}

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
    if (event.httpMethod !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent(event)

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, name, role, account_type, public_id, telegram_user_id, telegram_username, telegram_linked_at')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError && isMissingSchemaColumn(profileError)) {
      const fallback = await supabase
        .from('profiles')
        .select('id, email, name, role, public_id')
        .eq('id', user.id)
        .maybeSingle()

      profile = fallback.data
      profileError = fallback.error
    }

    if (profileError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить профиль. Проверьте, что SQL-файл supabase/direct-chats-schema.sql выполнен в Supabase.',
        details: profileError.message,
      })
    }

    if (profile && normalizeEmail(user.email) === normalizeEmail(ownerEmail) && profile.account_type !== 'owner') {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({
          account_type: 'owner',
          role: 'owner',
        })
        .eq('id', user.id)
        .select('id, email, name, role, account_type, public_id, telegram_user_id, telegram_username, telegram_linked_at')
        .maybeSingle()

      if (!updateError && updatedProfile) {
        profile = updatedProfile
      }
    }

    return jsonResponse(200, {
      success: true,
      profile: profile || {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || null,
        role: 'user',
        account_type: 'user',
        public_id: null,
        telegram_user_id: null,
        telegram_username: null,
        telegram_linked_at: null,
      },
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
