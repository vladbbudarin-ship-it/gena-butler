import { createClient } from '@supabase/supabase-js'

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
    if (event.httpMethod !== 'GET') {
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

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select(
        [
          'id',
          'question_text',
          'urgency_level',
          'final_importance',
          'status',
          'final_answer_ru',
          'final_answer_zh',
          'created_at',
          'closed_at',
        ].join(', ')
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (questionsError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить ваши вопросы.',
        details: questionsError.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      questions,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
