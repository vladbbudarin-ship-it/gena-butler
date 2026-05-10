import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

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

async function attachFinalImportance(messages) {
  const questionIds = [
    ...new Set(
      messages
        .map((message) => message.source_question_id)
        .filter(Boolean)
    ),
  ]

  if (questionIds.length === 0) {
    return messages.map((message) => ({
      ...message,
      final_importance: null,
    }))
  }

  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, final_importance')
    .in('id', questionIds)

  if (error) {
    throw error
  }

  const importanceByQuestionId = Object.fromEntries(
    questions.map((question) => [question.id, question.final_importance])
  )

  return messages.map((message) => ({
    ...message,
    final_importance: message.source_question_id
      ? importanceByQuestionId[message.source_question_id] || null
      : null,
  }))
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

    if (!(await isOwner(user))) {
      return jsonResponse(403, { error: 'Доступ разрешён только владельцу.' })
    }

    const conversationId = event.queryStringParameters?.conversation_id

    if (!conversationId) {
      return jsonResponse(400, { error: 'Не передан conversation_id.' })
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, user_id, status, owner_last_read_at, user_last_read_at, last_message_at, created_at, updated_at')
      .eq('id', conversationId)
      .eq('type', 'owner')
      .single()

    if (conversationError || !conversation) {
      return jsonResponse(404, { error: 'Диалог не найден.' })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, name, public_id, is_important_contact')
      .eq('id', conversation.user_id)
      .maybeSingle()

    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_id, sender_role, body, body_zh, importance, source_question_id, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить сообщения.',
        details: messagesError.message,
      })
    }

    const messagesWithImportance = await attachFinalImportance(messages || [])

    await supabase
      .from('conversations')
      .update({ owner_last_read_at: new Date().toISOString() })
      .eq('id', conversationId)

    return jsonResponse(200, {
      success: true,
      conversation: {
        ...conversation,
        user_profile: profile || null,
      },
      messages: messagesWithImportance,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
