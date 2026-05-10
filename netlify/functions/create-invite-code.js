import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

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

function generateInviteCode() {
  const digits = String(randomInt(0, 10000)).padStart(4, '0')
  const letters = `${String.fromCharCode(65 + randomInt(0, 26))}${String.fromCharCode(65 + randomInt(0, 26))}`

  return `${digits}${letters}`
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

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = generateInviteCode()

      const { data, error } = await supabase
        .from('invite_codes')
        .insert({
          code,
          created_by: user.id,
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

      if (error.code === '23505') {
        continue
      }

      return jsonResponse(500, {
        error: 'Не удалось создать invite-код. Проверьте, что SQL-файл supabase/invite-codes-schema.sql выполнен в Supabase.',
        details: error.message,
      })
    }

    return jsonResponse(500, {
      error: 'Не удалось создать уникальный invite-код. Попробуйте ещё раз.',
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
