import OpenAI from 'openai'

const openaiApiKey = process.env.OPENAI_API_KEY
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const allowedUrgencyLevels = ['normal', 'important', 'urgent']

const urgencyScores = {
  normal: 1,
  important: 2,
  urgent: 3,
}

const aiScores = {
  low: 1,
  medium: 2,
  high: 3,
}

function getFinalImportance(priorityScore) {
  if (priorityScore >= 6) {
    return 'high'
  }

  if (priorityScore >= 4) {
    return 'medium'
  }

  return 'low'
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)

    if (!match) {
      throw new Error('AI вернул ответ не в JSON-формате.')
    }

    return JSON.parse(match[0])
  }
}

function isMissingSchemaColumn(error) {
  return error?.code === 'PGRST204'
    || /column|schema cache/i.test(error?.message || '')
}

async function generateAiDraft({ questionText, urgencyLevel }) {
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
          'Ты помощник сервиса "Дворецкий Гена". Стиль ответа: вежливый дворецкий, немного элитный, но без чрезмерной театральности. Всегда отвечай строго валидным JSON без markdown.',
      },
      {
        role: 'user',
        content: `
Оцени вопрос пользователя и подготовь черновик ответа.

Данные:
- Вопрос пользователя: ${questionText}
- Срочность от пользователя: ${urgencyLevel}

Верни строго JSON такого вида:
{
  "ai_importance": "low | medium | high",
  "ai_reason": "короткое объяснение на русском",
  "draft_ru": "черновик ответа на русском",
  "draft_zh": "перевод draft_ru на китайский"
}

Правила:
- ai_importance может быть только low, medium или high.
- draft_ru должен быть вежливым ответом от имени дворецкого Гены.
- draft_zh должен быть китайским переводом draft_ru.
- Не отправляй ответ пользователю напрямую.
- Не добавляй markdown.
        `,
      },
    ],
  })

  return safeJsonParse(response.output_text)
}

async function getOrCreateOwnerConversation({ supabase, userId }) {
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

export async function saveOwnerDialogMessageFromUser({
  supabase,
  userId,
  messageText,
}) {
  const normalizedMessageText = String(messageText || '').trim()

  if (!normalizedMessageText) {
    return {
      error: 'Введите текст сообщения.',
      statusCode: 400,
    }
  }

  if (normalizedMessageText.length > 3000) {
    return {
      error: 'Сообщение слишком длинное. Максимум 3000 символов.',
      statusCode: 400,
    }
  }

  const conversation = await getOrCreateOwnerConversation({ supabase, userId })

  const { data: message, error: messageError } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversation.id,
      sender_id: userId,
      sender_role: 'user',
      body: normalizedMessageText,
      importance: 'normal',
    })
    .select('id, conversation_id')
    .single()

  if (messageError) {
    return {
      error: 'Не удалось сохранить сообщение в чат.',
      details: messageError.message,
      statusCode: 500,
    }
  }

  return {
    success: true,
    conversation,
    message,
  }
}

async function createQuestionRecord({ supabase, questionData }) {
  const { data: question, error } = await supabase
    .from('questions')
    .insert(questionData)
    .select('id, status')
    .single()

  if (!error) {
    return { data: question, error: null }
  }

  if (!isMissingSchemaColumn(error)) {
    return { data: null, error }
  }

  const fallbackQuestionData = { ...questionData }
  delete fallbackQuestionData.conversation_id
  delete fallbackQuestionData.source_message_id
  delete fallbackQuestionData.source_channel
  delete fallbackQuestionData.telegram_chat_id
  delete fallbackQuestionData.telegram_message_id

  return supabase
    .from('questions')
    .insert(fallbackQuestionData)
    .select('id, status')
    .single()
}

async function updateQuestionMessageLink({ supabase, questionId, messageId }) {
  if (!messageId) {
    return
  }

  const { error } = await supabase
    .from('chat_messages')
    .update({ source_question_id: questionId })
    .eq('id', messageId)

  if (error) {
    throw error
  }
}

export async function createOwnerQuestionFromUser({
  supabase,
  userId,
  questionText,
  urgencyLevel = 'normal',
  sourceChannel = 'web',
  telegramChatId = null,
  telegramMessageId = null,
}) {
  const normalizedQuestionText = String(questionText || '').trim()

  if (!normalizedQuestionText) {
    return {
      error: 'Введите текст вопроса.',
      statusCode: 400,
    }
  }

  if (normalizedQuestionText.length > 3000) {
    return {
      error: 'Вопрос слишком длинный. Максимум 3000 символов.',
      statusCode: 400,
    }
  }

  if (!allowedUrgencyLevels.includes(urgencyLevel)) {
    return {
      error: 'Некорректный уровень срочности.',
      statusCode: 400,
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_important_contact')
    .eq('id', userId)
    .maybeSingle()

  const isImportantContact = Boolean(profile?.is_important_contact)
  const conversation = await getOrCreateOwnerConversation({ supabase, userId })

  const { data: message, error: messageError } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversation.id,
      sender_id: userId,
      sender_role: 'user',
      body: normalizedQuestionText,
      importance: urgencyLevel,
    })
    .select('id, conversation_id')
    .single()

  if (messageError) {
    return {
      error: 'Не удалось сохранить сообщение в чат.',
      details: messageError.message,
      statusCode: 500,
    }
  }

  const { data: question, error: insertError } = await createQuestionRecord({
    supabase,
    questionData: {
      user_id: userId,
      conversation_id: conversation.id,
      source_message_id: message.id,
      question_text: normalizedQuestionText,
      urgency_level: urgencyLevel,
      status: 'ai_processing',
      source_channel: sourceChannel,
      telegram_chat_id: telegramChatId,
      telegram_message_id: telegramMessageId,
    },
  })

  if (insertError) {
    await supabase
      .from('chat_messages')
      .delete()
      .eq('id', message.id)

    return {
      error: 'Не удалось сохранить вопрос.',
      details: insertError.message,
      statusCode: 500,
    }
  }

  const questionId = question.id

  try {
    await updateQuestionMessageLink({
      supabase,
      questionId,
      messageId: message.id,
    })
  } catch (messageLinkError) {
    console.error('Failed to link question message:', messageLinkError.message)
  }

  try {
    const aiResult = await generateAiDraft({
      questionText: normalizedQuestionText,
      urgencyLevel,
    })

    if (!['low', 'medium', 'high'].includes(aiResult.ai_importance)) {
      throw new Error('AI вернул некорректную важность.')
    }

    const urgencyScore = urgencyScores[urgencyLevel]
    const aiScore = aiScores[aiResult.ai_importance]
    const contactBonus = isImportantContact ? 1 : 0
    const priorityScore = urgencyScore + aiScore + contactBonus
    const finalImportance = getFinalImportance(priorityScore)

    const { error: updateError } = await supabase
      .from('questions')
      .update({
        ai_importance: aiResult.ai_importance,
        ai_reason: aiResult.ai_reason,
        draft_ru: aiResult.draft_ru,
        draft_zh: aiResult.draft_zh,
        priority_score: priorityScore,
        final_importance: finalImportance,
        status: 'draft_ready',
        ai_error_message: null,
      })
      .eq('id', questionId)

    if (updateError) {
      throw new Error(updateError.message)
    }

    return {
      success: true,
      conversation,
      message,
      question_id: questionId,
      status: 'draft_ready',
      final_importance: finalImportance,
    }
  } catch (aiError) {
    await supabase
      .from('questions')
      .update({
        status: 'ai_error',
        ai_error_message: aiError.message,
      })
      .eq('id', questionId)

    return {
      success: true,
      conversation,
      message,
      question_id: questionId,
      status: 'ai_error',
      warning: 'Вопрос сохранён, но AI-черновик не был подготовлен.',
    }
  }
}
