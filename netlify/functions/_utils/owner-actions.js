import OpenAI from 'openai'
import { createOwnerCalendarEvent, normalizeCalendarAction } from './google-calendar.js'
import { finalAnswerText, sendTelegramMessage } from './telegram.js'

const openaiApiKey = process.env.OPENAI_API_KEY
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const closedStatuses = ['approved', 'edited', 'manual_reply', 'rejected']

export class OwnerActionError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message)
    this.name = 'OwnerActionError'
    this.statusCode = statusCode
    this.details = details
  }
}

function isMissingSchemaColumn(error) {
  return error?.code === 'PGRST204'
    || /column|schema cache/i.test(error?.message || '')
}

async function translateRuToZh(textRu) {
  if (!openaiApiKey) {
    throw new OwnerActionError('OPENAI_API_KEY не найден в переменных окружения.', 500)
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

async function getOrCreateConversation({ supabase, userId }) {
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

async function getQuestion({ supabase, questionId }) {
  const fullSelect = [
    'id',
    'user_id',
    'status',
    'draft_ru',
    'draft_zh',
    'conversation_id',
    'source_message_id',
    'final_message_id',
    'source_channel',
    'telegram_chat_id',
    'telegram_message_id',
    'calendar_action',
    'calendar_action_status',
    'calendar_event_id',
    'calendar_event_link',
  ].join(', ')

  const { data, error } = await supabase
    .from('questions')
    .select(fullSelect)
    .eq('id', questionId)
    .single()

  if (!error) {
    return data
  }

  if (!isMissingSchemaColumn(error)) {
    throw new OwnerActionError('Вопрос не найден.', 404, error.message)
  }

  const fallback = await supabase
    .from('questions')
    .select('id, user_id, status, draft_ru, draft_zh, conversation_id, source_message_id, final_message_id')
    .eq('id', questionId)
    .single()

  if (fallback.error || !fallback.data) {
    throw new OwnerActionError('Вопрос не найден.', 404, fallback.error?.message)
  }

  return fallback.data
}

async function setQuestionFinalMessageId({ supabase, questionId, messageId }) {
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

async function saveOwnerAnswerToChat({ supabase, ownerId, question, finalAnswerRu, finalAnswerZh }) {
  const conversation = question.conversation_id
    ? { id: question.conversation_id }
    : await getOrCreateConversation({ supabase, userId: question.user_id })

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
      supabase,
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
    supabase,
    questionId: question.id,
    messageId: existingMessage.id,
  })

  return existingMessage
}

async function notifyTelegramQuestionOwner({ supabase, question, finalAnswerRu, finalAnswerZh, rejected = false }) {
  let targetTelegramChatId = question.source_channel === 'telegram' ? question.telegram_chat_id : null

  if (!targetTelegramChatId && question.user_id) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('telegram_user_id')
      .eq('id', question.user_id)
      .maybeSingle()

    if (error) {
      console.warn('Telegram user notification skipped: profile lookup failed.', error.message)
    }

    targetTelegramChatId = profile?.telegram_user_id || null
  }

  if (!targetTelegramChatId) {
    return
  }

  if (rejected) {
    await sendTelegramMessage(targetTelegramChatId, 'Ваш вопрос был отклонён.')
    return
  }

  await sendTelegramMessage(targetTelegramChatId, finalAnswerText({
    finalAnswerRu,
    finalAnswerZh,
  }))
}

export async function performOwnerQuestionAction({
  supabase,
  ownerId,
  questionId,
  action,
  finalAnswerRu,
}) {
  if (!['approve', 'reject', 'edit', 'manual_reply'].includes(action)) {
    throw new OwnerActionError('Некорректное действие владельца.', 400)
  }

  const question = await getQuestion({ supabase, questionId })

  if (closedStatuses.includes(question.status)) {
    throw new OwnerActionError('Этот вопрос уже закрыт.', 400)
  }

  if (action === 'approve') {
    if (!question.draft_ru) {
      throw new OwnerActionError('Нельзя утвердить вопрос без AI-черновика.', 400)
    }

    const calendarAction = normalizeCalendarAction(question.calendar_action)
    const calendarEvent = calendarAction
      ? await createOwnerCalendarEvent({ supabase, calendarAction })
      : null

    const approveUpdate = {
      status: 'approved',
      final_answer_ru: question.draft_ru,
      final_answer_zh: question.draft_zh,
      closed_at: new Date().toISOString(),
    }

    if (calendarEvent) {
      approveUpdate.calendar_action_status = 'created'
      approveUpdate.calendar_event_id = calendarEvent.id
      approveUpdate.calendar_event_link = calendarEvent.htmlLink || null
    }

    const { error: updateError } = await supabase
      .from('questions')
      .update(approveUpdate)
      .eq('id', questionId)

    if (updateError) {
      throw new OwnerActionError('Не удалось утвердить вопрос.', 500, updateError.message)
    }

    await saveOwnerAnswerToChat({
      supabase,
      ownerId,
      question,
      finalAnswerRu: question.draft_ru,
      finalAnswerZh: question.draft_zh,
    })

    await notifyTelegramQuestionOwner({
      supabase,
      question,
      finalAnswerRu: question.draft_ru,
      finalAnswerZh: question.draft_zh,
    })

    return {
      success: true,
      status: 'approved',
      question,
      final_answer_ru: question.draft_ru,
      final_answer_zh: question.draft_zh,
    }
  }

  if (action === 'edit' || action === 'manual_reply') {
    const normalizedFinalAnswerRu = String(finalAnswerRu || '').trim()

    if (!normalizedFinalAnswerRu) {
      throw new OwnerActionError(
        action === 'edit'
          ? 'Введите отредактированный ответ на русском.'
          : 'Введите личный ответ на русском.',
        400
      )
    }

    const finalAnswerZh = await translateRuToZh(normalizedFinalAnswerRu)
    const nextStatus = action === 'edit' ? 'edited' : 'manual_reply'

    const { error: updateError } = await supabase
      .from('questions')
      .update({
        status: nextStatus,
        final_answer_ru: normalizedFinalAnswerRu,
        final_answer_zh: finalAnswerZh,
        closed_at: new Date().toISOString(),
      })
      .eq('id', questionId)

    if (updateError) {
      throw new OwnerActionError('Не удалось сохранить ответ.', 500, updateError.message)
    }

    await saveOwnerAnswerToChat({
      supabase,
      ownerId,
      question,
      finalAnswerRu: normalizedFinalAnswerRu,
      finalAnswerZh,
    })

    await notifyTelegramQuestionOwner({
      supabase,
      question,
      finalAnswerRu: normalizedFinalAnswerRu,
      finalAnswerZh,
    })

    return {
      success: true,
      status: nextStatus,
      question,
      final_answer_ru: normalizedFinalAnswerRu,
      final_answer_zh: finalAnswerZh,
    }
  }

  const { error: updateError } = await supabase
    .from('questions')
    .update({
      status: 'rejected',
      closed_at: new Date().toISOString(),
    })
    .eq('id', questionId)

  if (updateError) {
    throw new OwnerActionError('Не удалось отклонить вопрос.', 500, updateError.message)
  }

  await notifyTelegramQuestionOwner({
    supabase,
    question,
    rejected: true,
  })

  return {
    success: true,
    status: 'rejected',
    question,
  }
}
