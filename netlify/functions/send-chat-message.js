import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const allowedImportance = ['normal', 'important', 'urgent']

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
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
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return ['owner', 'admin'].includes(profile?.role) || normalizeEmail(user.email) === normalizeEmail(ownerEmail)
}

async function getOrCreateConversation(userId) {
  const { data: existing, error: existingError } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'owner')
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    return existing
  }

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ user_id: userId, type: 'owner' })
    .select('id')
    .single()

  if (createError) {
    throw createError
  }

  return created
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
    const messageBody = String(body.body || '').trim()
    const requestedImportance = body.importance || 'normal'
    const conversationId = body.conversation_id
    const ownerMode = body.sender_role === 'owner'

    if (!messageBody) {
      return jsonResponse(400, { error: 'Введите текст сообщения.' })
    }

    if (messageBody.length > 3000) {
      return jsonResponse(400, { error: 'Сообщение слишком длинное. Максимум 3000 символов.' })
    }

    if (ownerMode) {
      if (!(await isOwner(user))) {
        return jsonResponse(403, { error: 'Обычный пользователь не может отправлять сообщения от владельца.' })
      }

      if (!conversationId) {
        return jsonResponse(400, { error: 'Не передан conversation_id.' })
      }

      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .single()

      if (conversationError || !conversation) {
        return jsonResponse(404, { error: 'Диалог не найден.' })
      }

      const { data: message, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          sender_role: 'owner',
          body: messageBody,
          importance: 'normal',
        })
        .select('id, conversation_id, sender_id, sender_role, body, body_zh, importance, created_at')
        .single()

      if (messageError) {
        return jsonResponse(500, {
          error: 'Не удалось отправить сообщение.',
          details: messageError.message,
        })
      }

      return jsonResponse(200, {
        success: true,
        message,
      })
    }

    if (!allowedImportance.includes(requestedImportance)) {
      return jsonResponse(400, { error: 'Некорректная важность сообщения.' })
    }

    let conversation

    try {
      conversation = await getOrCreateConversation(user.id)
    } catch (conversationError) {
      return jsonResponse(500, {
        error: 'Не удалось создать или загрузить чат. Проверьте, что SQL-файл supabase/chat-schema.sql выполнен в Supabase.',
        details: conversationError.message,
      })
    }

    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversation.id,
        sender_id: user.id,
        sender_role: 'user',
        body: messageBody,
        importance: requestedImportance,
      })
      .select('id, conversation_id, sender_id, sender_role, body, body_zh, importance, created_at')
      .single()

    if (messageError) {
      return jsonResponse(500, {
        error: 'Не удалось отправить сообщение.',
        details: messageError.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      conversation,
      message,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
