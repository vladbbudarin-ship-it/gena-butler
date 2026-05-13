import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const ownerEmail = process.env.OWNER_EMAIL

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

async function getUserFromEvent(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Пользователь не авторизован.' }
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)

  if (error || !user) {
    return { error: 'Не удалось проверить пользователя.' }
  }

  return { user }
}

async function getProfile(user) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, account_type')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

function isOwner(user, profile) {
  return profile?.account_type === 'owner'
    || ['owner', 'admin'].includes(profile?.role)
    || normalizeEmail(user.email) === normalizeEmail(ownerEmail)
}

async function getProjectMember(projectId, userId) {
  const { data, error } = await supabase
    .from('sup_project_members')
    .select('access_level')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent(event)

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    const body = JSON.parse(event.body || '{}')
    const suggestionId = body.suggestion_id

    if (!suggestionId) {
      return jsonResponse(400, { error: 'Не передан suggestion_id.' })
    }

    const { data: suggestion, error: suggestionError } = await supabase
      .from('sup_ai_suggestions')
      .select('id, project_id, requested_by')
      .eq('id', suggestionId)
      .maybeSingle()

    if (suggestionError) {
      return jsonResponse(500, {
        error: 'Не удалось загрузить AI-ответ.',
        details: suggestionError.message,
      })
    }

    if (!suggestion) {
      return jsonResponse(404, { error: 'AI-ответ не найден.' })
    }

    const profile = await getProfile(user)
    const member = await getProjectMember(suggestion.project_id, user.id)
    const canDelete = isOwner(user, profile)
      || suggestion.requested_by === user.id
      || ['admin', 'manager'].includes(member?.access_level)

    if (!canDelete) {
      return jsonResponse(403, { error: 'Нет доступа к удалению этого AI-ответа.' })
    }

    const { error: updateError } = await supabase
      .from('sup_ai_suggestions')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq('id', suggestion.id)

    if (updateError) {
      return jsonResponse(500, {
        error: 'Не удалось удалить AI-ответ. Проверьте, что выполнен SQL supabase/ai-history-delete-schema.sql.',
        details: updateError.message,
      })
    }

    return jsonResponse(200, { success: true })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
