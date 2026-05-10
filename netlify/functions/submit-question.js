import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiApiKey = process.env.OPENAI_API_KEY
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const openai = new OpenAI({
  apiKey: openaiApiKey,
})

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

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }
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

async function generateAiDraft({ questionText, urgencyLevel }) {
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY не найден в переменных окружения.')
  }

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

async function saveQuestionToChat({ userId, questionId, questionText, urgencyLevel }) {
  const conversation = await getOrCreateConversation(userId)

  await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversation.id,
      sender_id: userId,
      sender_role: 'user',
      body: questionText,
      importance: urgencyLevel,
      source_question_id: questionId,
    })
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

    const body = JSON.parse(event.body || '{}')
    const questionText = String(body.question_text || '').trim()
    const urgencyLevel = body.urgency_level

    if (!questionText) {
      return jsonResponse(400, {
        error: 'Введите текст вопроса.',
      })
    }

    if (questionText.length > 3000) {
      return jsonResponse(400, {
        error: 'Вопрос слишком длинный. Максимум 3000 символов.',
      })
    }

    if (!allowedUrgencyLevels.includes(urgencyLevel)) {
      return jsonResponse(400, {
        error: 'Некорректный уровень срочности.',
      })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_important_contact')
      .eq('id', user.id)
      .single()

    const isImportantContact = Boolean(profile?.is_important_contact)

    const { data: question, error: insertError } = await supabase
      .from('questions')
      .insert({
        user_id: user.id,
        question_text: questionText,
        urgency_level: urgencyLevel,
        status: 'ai_processing',
      })
      .select('id, status')
      .single()

    if (insertError) {
      return jsonResponse(500, {
        error: 'Не удалось сохранить вопрос.',
        details: insertError.message,
      })
    }

    const createdQuestionId = question.id

    try {
      await saveQuestionToChat({
        userId: user.id,
        questionId: createdQuestionId,
        questionText,
        urgencyLevel,
      })
    } catch (chatError) {
      console.error('Failed to save question to chat:', chatError.message)
    }

    try {
      const aiResult = await generateAiDraft({
        questionText,
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
        .eq('id', createdQuestionId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      return jsonResponse(200, {
        success: true,
        question_id: createdQuestionId,
        status: 'draft_ready',
        final_importance: finalImportance,
      })
    } catch (aiError) {
      await supabase
        .from('questions')
        .update({
          status: 'ai_error',
          ai_error_message: aiError.message,
        })
        .eq('id', createdQuestionId)

      return jsonResponse(200, {
        success: true,
        question_id: createdQuestionId,
        status: 'ai_error',
        warning: 'Вопрос сохранён, но AI-черновик не был подготовлен.',
      })
    }
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
