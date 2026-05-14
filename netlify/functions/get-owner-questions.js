import { createClient } from '@supabase/supabase-js'
import { attachChatMessageFiles } from './_utils/attachments.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const closedStatuses = ['approved', 'edited', 'manual_reply', 'rejected']

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        body: JSON.stringify({
          error: 'Method not allowed',
        }),
      }
    }

    const authHeader = event.headers.authorization || event.headers.Authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'Пользователь не авторизован.',
        }),
      }
    }

    const accessToken = authHeader.replace('Bearer ', '')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken)

    if (userError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'Не удалось проверить пользователя.',
        }),
      }
    }

    if (user.email !== ownerEmail) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'Доступ разрешён только владельцу.',
        }),
      }
    }

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false })

    if (questionsError) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Не удалось загрузить вопросы.',
          details: questionsError.message,
        }),
      }
    }

    const userIds = [...new Set(questions.map((question) => question.user_id))]

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, name, public_id, is_important_contact')
      .in('id', userIds)

    if (profilesError) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Не удалось загрузить профили пользователей.',
          details: profilesError.message,
        }),
      }
    }

    const profilesById = Object.fromEntries(
      profiles.map((profile) => [profile.id, profile])
    )

    const sourceMessagesWithFiles = await attachChatMessageFiles({
      supabase,
      messages: questions
        .filter((question) => question.source_message_id)
        .map((question) => ({ id: question.source_message_id })),
    })
    const attachmentsByMessageId = Object.fromEntries(
      sourceMessagesWithFiles.map((message) => [message.id, message.attachments || []])
    )

    const enrichedQuestions = questions.map((question) => {
      const profile = profilesById[question.user_id] || null

      return {
        ...question,
        user_profile: profile,
        attachments: question.source_message_id ? attachmentsByMessageId[question.source_message_id] || [] : [],
        is_closed: closedStatuses.includes(question.status),
      }
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        questions: enrichedQuestions,
      }),
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Внутренняя ошибка сервера.',
        details: error.message,
      }),
    }
  }
}
