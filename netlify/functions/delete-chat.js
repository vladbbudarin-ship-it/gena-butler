import { createClient } from '@supabase/supabase-js'

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

async function isOwner(user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return profile?.role === 'owner'
    || normalizeEmail(user.email) === normalizeEmail(ownerEmail)
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
    const conversationId = body.conversation_id

    if (!conversationId) {
      return jsonResponse(400, { error: 'Не передан conversation_id.' })
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, type')
      .eq('id', conversationId)
      .single()

    if (conversationError || !conversation) {
      return jsonResponse(404, { error: 'Чат не найден.' })
    }

    if (conversation.type === 'owner') {
      if (!(await isOwner(user))) {
        return jsonResponse(400, { error: 'Чат с Будариным удалить нельзя.' })
      }

      const { error: hideOwnerChatError } = await supabase
        .from('conversations')
        .update({ owner_hidden_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('type', 'owner')

      if (hideOwnerChatError) {
        return jsonResponse(500, {
          error: 'Не удалось скрыть чат из списка. Проверьте, что SQL-файл supabase/chat-delete-schema.sql выполнен в Supabase.',
          details: hideOwnerChatError.message,
        })
      }

      return jsonResponse(200, { success: true })
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

    const { error: updateError } = await supabase
      .from('conversation_participants')
      .update({ deleted_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)

    if (updateError) {
      return jsonResponse(500, {
        error: 'Не удалось удалить чат из списка. Проверьте, что SQL-файл supabase/chat-delete-schema.sql выполнен в Supabase.',
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
