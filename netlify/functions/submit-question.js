import { createClient } from '@supabase/supabase-js'
import { createOwnerQuestionFromUser } from './_utils/owner-question-flow.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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
    const result = await createOwnerQuestionFromUser({
      supabase,
      userId: user.id,
      questionText: body.question_text,
      urgencyLevel: body.urgency_level,
    })

    if (result.error) {
      return jsonResponse(result.statusCode || 500, {
        error: result.error,
        details: result.details,
      })
    }

    return jsonResponse(200, {
      success: true,
      question_id: result.question_id,
      status: result.status,
      final_importance: result.final_importance,
      warning: result.warning,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
