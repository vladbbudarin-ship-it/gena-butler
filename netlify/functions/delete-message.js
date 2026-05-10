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
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent(event)

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    const body = JSON.parse(event.body || '{}')
    const messageId = body.message_id

    if (!messageId) {
      return jsonResponse(400, { error: 'Не передан message_id.' })
    }

    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .select('id, sender_id, sender_role, source_question_id, deleted_at')
      .eq('id', messageId)
      .single()

    if (messageError || !message) {
      return jsonResponse(404, { error: 'Сообщение не найдено.' })
    }

    if (message.sender_id !== user.id) {
      return jsonResponse(403, { error: 'Можно удалить только своё сообщение.' })
    }

    if (message.sender_role === 'ai' || (message.sender_role === 'owner' && message.source_question_id)) {
      return jsonResponse(400, { error: 'Это служебное сообщение нельзя удалить.' })
    }

    if (message.deleted_at) {
      return jsonResponse(200, { success: true })
    }

    const { error: updateError } = await supabase
      .from('chat_messages')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq('id', messageId)

    if (updateError) {
      return jsonResponse(500, {
        error: 'Не удалось удалить сообщение.',
        details: updateError.message,
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
