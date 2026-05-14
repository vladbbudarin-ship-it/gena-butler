import { createClient } from '@supabase/supabase-js'
import { attachChatMessageFiles } from './_utils/attachments.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const safeQuestionFields = [
  'id',
  'status',
  'final_answer_ru',
  'final_answer_zh',
  'closed_at',
]

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }
}

function isMissingSchemaColumn(error) {
  return error?.code === 'PGRST204'
    || /column|schema cache/i.test(error?.message || '')
}

async function loadChatMessages(conversationId) {
  const withDeleteFields = await supabase
    .from('chat_messages')
    .select('id, conversation_id, sender_id, sender_role, body, body_zh, importance, source_question_id, created_at, deleted_at, deleted_by')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (!withDeleteFields.error) {
    return withDeleteFields
  }

  if (!isMissingSchemaColumn(withDeleteFields.error)) {
    return withDeleteFields
  }

  return supabase
    .from('chat_messages')
    .select('id, conversation_id, sender_id, sender_role, body, body_zh, importance, source_question_id, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
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

async function attachQuestionStatuses(messages) {
  const questionIds = [
    ...new Set(
      (messages || [])
        .map((message) => message.source_question_id)
        .filter(Boolean)
    ),
  ]

  if (questionIds.length === 0) {
    return messages || []
  }

  const { data: questions, error } = await supabase
    .from('questions')
    .select(safeQuestionFields.join(', '))
    .in('id', questionIds)

  if (error) {
    throw error
  }

  const questionsById = Object.fromEntries(
    (questions || []).map((question) => [question.id, question])
  )

  return (messages || []).map((message) => {
    if (!message.source_question_id) {
      return message
    }

    const question = questionsById[message.source_question_id]

    return {
      ...message,
      question_status: question?.status || null,
      final_answer_ru: question?.final_answer_ru || null,
      final_answer_zh: question?.final_answer_zh || null,
      question_closed_at: question?.closed_at || null,
    }
  })
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

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, user_id, type, status, owner_last_read_at, user_last_read_at, last_message_at, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('type', 'owner')
      .maybeSingle()

    if (conversationError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить чат.',
        details: conversationError.message,
      })
    }

    if (!conversation) {
      return jsonResponse(200, {
        success: true,
        conversation: null,
        messages: [],
      })
    }

    const { data: messages, error: messagesError } = await loadChatMessages(conversation.id)

    if (messagesError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить сообщения.',
        details: messagesError.message,
      })
    }

    const messagesWithQuestionStatuses = await attachQuestionStatuses(messages || [])
    const messagesWithFiles = await attachChatMessageFiles({
      supabase,
      messages: messagesWithQuestionStatuses,
    })

    await supabase
      .from('conversations')
      .update({ user_last_read_at: new Date().toISOString() })
      .eq('id', conversation.id)

    return jsonResponse(200, {
      success: true,
      conversation,
      messages: messagesWithFiles,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
