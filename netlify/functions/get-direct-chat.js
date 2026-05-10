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

    const conversationId = event.queryStringParameters?.conversation_id

    if (!conversationId) {
      return jsonResponse(400, { error: 'Не передан conversation_id.' })
    }

    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (participantError) {
      return jsonResponse(500, {
        error: 'Не удалось проверить доступ к чату.',
        details: participantError.message,
      })
    }

    if (!participant) {
      return jsonResponse(403, { error: 'Нет доступа к этому чату.' })
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, type, direct_key, last_message_at, created_at, updated_at')
      .eq('id', conversationId)
      .eq('type', 'direct')
      .single()

    if (conversationError || !conversation) {
      return jsonResponse(404, { error: 'Чат не найден.' })
    }

    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_id, sender_role, body, body_zh, importance, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить сообщения.',
        details: messagesError.message,
      })
    }

    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)

    return jsonResponse(200, {
      success: true,
      conversation,
      messages,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
