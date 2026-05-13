import { createClient } from '@supabase/supabase-js'
import { getGoogleCalendarConnection, getGoogleCalendarEnvStatus, isOwnerUser } from './_utils/google-calendar.js'

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
    if (event.httpMethod !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent(event)

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    if (!(await isOwnerUser({ supabase, user }))) {
      return jsonResponse(403, { error: 'Google Calendar доступен только Бударину.' })
    }

    const connection = await getGoogleCalendarConnection({ supabase, ownerId: user.id })

    return jsonResponse(200, {
      success: true,
      connected: Boolean(connection?.refresh_token || connection?.access_token),
      google_email: connection?.google_email || null,
      expires_at: connection?.expires_at || null,
      env: getGoogleCalendarEnvStatus(),
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Не удалось проверить Google Calendar.',
      details: error.message,
    })
  }
}
