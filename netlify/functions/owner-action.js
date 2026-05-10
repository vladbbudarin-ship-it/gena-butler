import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL
const openaiApiKey = process.env.OPENAI_API_KEY
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const closedStatuses = ['approved', 'edited', 'manual_reply', 'rejected']

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

async function translateRuToZh(textRu) {
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY не найден в переменных окружения.')
  }

  const openai = new OpenAI({
    apiKey: openaiApiKey,
  })

  const response = await openai.responses.create({
    model: openaiModel,
    input: [
      {
        role: 'system',
        content:
          'Ты профессиональный переводчик. Переводи русский текст на китайский язык точно, естественно и вежливо. Не добавляй объяснений, markdown или кавычек. Верни только перевод.',
      },
      {
        role: 'user',
        content: textRu,
      },
    ],
  })

  return String(response.output_text || '').trim()
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

function isMissingSchemaColumn(error) {
  return error?.code === 'PGRST204'
    || /column|schema cache/i.test(error?.message || '')
}

async function getQuestion(questionId) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, user_id, status, draft_ru, draft_zh, conversation_id, source_message_id, final_message_id')
    .eq('id', questionId)
    .single()

  if (!error) {
    return { question: data, error: null }
  }

  if (!isMissingSchemaColumn(error)) {
    return { question: null, error }
  }

  const fallback = await supabase
    .from('questions')
    .select('id, user_id, status, draft_ru, draft_zh')
    .eq('id', questionId)
    .single()

  return {
    question: fallback.data,
    error: fallback.error,
  }
}

async function setQuestionFinalMessageId({ questionId, messageId }) {
  if (!messageId) {
    return
  }

  const { error } = await supabase
    .from('questions')
    .update({ final_message_id: messageId })
    .eq('id', questionId)

  if (error && !isMissingSchemaColumn(error)) {
    throw error
  }
}

async function saveOwnerAnswerToChat({ ownerId, question, finalAnswerRu, finalAnswerZh }) {
  const conversation = question.conversation_id
    ? { id: question.conversation_id }
    : await getOrCreateConversation(question.user_id)

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversation.id,
      sender_id: ownerId,
      sender_role: 'owner',
      body: finalAnswerRu,
      body_zh: finalAnswerZh || null,
      importance: 'normal',
      source_question_id: question.id,
    })
    .select('id')
    .single()

  if (!error) {
    await setQuestionFinalMessageId({
      questionId: question.id,
      messageId: message.id,
    })
    return message
  }

  if (error.code !== '23505') {
    throw error
  }

  const { data: existingMessage, error: existingError } = await supabase
    .from('chat_messages')
    .select('id')
    .eq('source_question_id', question.id)
    .eq('sender_role', 'owner')
    .maybeSingle()

  if (existingError || !existingMessage) {
    throw existingError || error
  }

  const { error: updateError } = await supabase
    .from('chat_messages')
    .update({
      body: finalAnswerRu,
      body_zh: finalAnswerZh || null,
    })
    .eq('id', existingMessage.id)

  if (updateError) {
    throw updateError
  }

  await setQuestionFinalMessageId({
    questionId: question.id,
    messageId: existingMessage.id,
  })

  return existingMessage
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, {
        error: 'Method not allowed',
      })
    }

    const authHeader = event.headers.authorization || event.headers.Authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(401, {
        error: 'Пользователь не авторизован.',
      })
    }

    const accessToken = authHeader.replace('Bearer ', '')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken)

    if (userError || !user) {
      return jsonResponse(401, {
        error: 'Не удалось проверить пользователя.',
      })
    }

    if (normalizeEmail(user.email) !== normalizeEmail(ownerEmail)) {
      return jsonResponse(403, {
        error: 'Доступ разрешён только владельцу.',
      })
    }

    const body = JSON.parse(event.body || '{}')
    const questionId = body.question_id
    const action = body.action

    if (!questionId) {
      return jsonResponse(400, {
        error: 'Не передан question_id.',
      })
    }

    if (!['approve', 'reject', 'edit', 'manual_reply'].includes(action)) {
      return jsonResponse(400, {
        error: 'Некорректное действие владельца.',
      })
    }

    const { question, error: questionError } = await getQuestion(questionId)

    if (questionError || !question) {
      return jsonResponse(404, {
        error: 'Вопрос не найден.',
      })
    }

    if (closedStatuses.includes(question.status)) {
      return jsonResponse(400, {
        error: 'Этот вопрос уже закрыт.',
      })
    }

    if (action === 'approve') {
      if (!question.draft_ru) {
        return jsonResponse(400, {
          error: 'Нельзя утвердить вопрос без AI-черновика.',
        })
      }

      const { error: updateError } = await supabase
        .from('questions')
        .update({
          status: 'approved',
          final_answer_ru: question.draft_ru,
          final_answer_zh: question.draft_zh,
          closed_at: new Date().toISOString(),
        })
        .eq('id', questionId)

      if (updateError) {
        return jsonResponse(500, {
          error: 'Не удалось утвердить вопрос.',
          details: updateError.message,
        })
      }

      await saveOwnerAnswerToChat({
        ownerId: user.id,
        question,
        finalAnswerRu: question.draft_ru,
        finalAnswerZh: question.draft_zh,
      })

      return jsonResponse(200, {
        success: true,
        status: 'approved',
      })
    }

    if (action === 'edit') {
      const finalAnswerRu = String(body.final_answer_ru || '').trim()

      if (!finalAnswerRu) {
        return jsonResponse(400, {
          error: 'Введите отредактированный ответ на русском.',
        })
      }

      const finalAnswerZh = await translateRuToZh(finalAnswerRu)

      const { error: updateError } = await supabase
        .from('questions')
        .update({
          status: 'edited',
          final_answer_ru: finalAnswerRu,
          final_answer_zh: finalAnswerZh,
          closed_at: new Date().toISOString(),
        })
        .eq('id', questionId)

      if (updateError) {
        return jsonResponse(500, {
          error: 'Не удалось сохранить отредактированный ответ.',
          details: updateError.message,
        })
      }

      await saveOwnerAnswerToChat({
        ownerId: user.id,
        question,
        finalAnswerRu,
        finalAnswerZh,
      })

      return jsonResponse(200, {
        success: true,
        status: 'edited',
      })
    }

    if (action === 'manual_reply') {
      const finalAnswerRu = String(body.final_answer_ru || '').trim()

      if (!finalAnswerRu) {
        return jsonResponse(400, {
          error: 'Введите личный ответ на русском.',
        })
      }

      const finalAnswerZh = await translateRuToZh(finalAnswerRu)

      const { error: updateError } = await supabase
        .from('questions')
        .update({
          status: 'manual_reply',
          final_answer_ru: finalAnswerRu,
          final_answer_zh: finalAnswerZh,
          closed_at: new Date().toISOString(),
        })
        .eq('id', questionId)

      if (updateError) {
        return jsonResponse(500, {
          error: 'Не удалось сохранить личный ответ.',
          details: updateError.message,
        })
      }

      await saveOwnerAnswerToChat({
        ownerId: user.id,
        question,
        finalAnswerRu,
        finalAnswerZh,
      })

      return jsonResponse(200, {
        success: true,
        status: 'manual_reply',
      })
    }

    if (action === 'reject') {
      const { error: updateError } = await supabase
        .from('questions')
        .update({
          status: 'rejected',
          closed_at: new Date().toISOString(),
        })
        .eq('id', questionId)

      if (updateError) {
        return jsonResponse(500, {
          error: 'Не удалось отклонить вопрос.',
          details: updateError.message,
        })
      }

      return jsonResponse(200, {
        success: true,
        status: 'rejected',
      })
    }

    return jsonResponse(400, {
      error: 'Действие не обработано.',
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
