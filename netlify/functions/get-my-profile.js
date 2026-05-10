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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, name, role, public_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить профиль. Проверьте, что SQL-файл supabase/direct-chats-schema.sql выполнен в Supabase.',
        details: profileError.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      profile: profile || {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || null,
        role: 'user',
        public_id: null,
      },
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
