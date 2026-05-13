import { createClient } from '@supabase/supabase-js'
import { isOwnerUser } from './_utils/google-calendar.js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function getUserFromEvent(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Пользователь не авторизован.' }
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)

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

    if (!(await isOwnerUser({ supabase, user }))) {
      return jsonResponse(403, { error: 'Google Calendar может отключить только Бударин.' })
    }

    const { error } = await supabase
      .from('owner_google_connections')
      .delete()
      .eq('owner_id', user.id)

    if (error) {
      return jsonResponse(500, {
        error: 'Не удалось отключить Google Calendar.',
        details: error.message,
      })
    }

    return jsonResponse(200, { success: true })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
