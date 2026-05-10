import { createClient } from '@supabase/supabase-js'
import { OwnerActionError, performOwnerQuestionAction } from './_utils/owner-actions.js'

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

async function isOwner(user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return ['owner', 'admin'].includes(profile?.role)
    || normalizeEmail(user.email) === normalizeEmail(ownerEmail)
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

    if (!(await isOwner(user))) {
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

    const result = await performOwnerQuestionAction({
      supabase,
      ownerId: user.id,
      questionId,
      action,
      finalAnswerRu: body.final_answer_ru,
    })

    return jsonResponse(200, {
      success: true,
      status: result.status,
    })
  } catch (error) {
    if (error instanceof OwnerActionError) {
      return jsonResponse(error.statusCode, {
        error: error.message,
        details: error.details,
      })
    }

    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
