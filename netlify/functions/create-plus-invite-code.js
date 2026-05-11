import { createClient } from '@supabase/supabase-js'
import { generatePlusInviteCode } from './_utils/codes.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL

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

async function isOwner(user) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, account_type')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  return profile?.account_type === 'owner'
    || ['owner', 'admin'].includes(profile?.role)
    || normalizeEmail(user.email) === normalizeEmail(ownerEmail)
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

    if (!(await isOwner(user))) {
      return jsonResponse(403, { error: 'Создавать коды Пользователь+ может только Бударин.' })
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generatePlusInviteCode()

      const { data, error } = await supabase
        .from('plus_invite_codes')
        .insert({
          code,
          created_by: user.id,
          expires_at: expiresAt,
        })
        .select('code, expires_at')
        .single()

      if (!error) {
        return jsonResponse(200, {
          success: true,
          code: data.code,
          expires_at: data.expires_at,
        })
      }

      if (error.code !== '23505') {
        return jsonResponse(500, {
          error: 'Не удалось создать код Пользователь+. Проверьте, что SQL-файл supabase/plus-invite-codes-schema.sql выполнен в Supabase.',
          details: error.message,
        })
      }
    }

    return jsonResponse(500, { error: 'Не удалось создать уникальный код. Попробуйте ещё раз.' })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
