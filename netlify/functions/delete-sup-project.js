import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

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

async function getProfile(user) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, account_type')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data || {
    id: user.id,
    email: user.email,
    role: 'user',
    account_type: 'user',
  }
}

function isOwner(user, profile) {
  return normalizeEmail(user.email) === normalizeEmail(ownerEmail)
    || profile?.account_type === 'owner'
    || ['owner', 'admin'].includes(profile?.role)
}

async function getProjectAccess(projectId, userId) {
  const { data, error } = await supabase
    .from('sup_project_members')
    .select('access_level')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.access_level || 'none'
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
    const projectId = String(body.project_id || '').trim()

    if (!projectId) {
      return jsonResponse(400, { error: 'Не выбран проект для удаления.' })
    }

    const profile = await getProfile(user)
    const ownerCanDelete = isOwner(user, profile)
    const accessLevel = await getProjectAccess(projectId, user.id)

    if (!ownerCanDelete && accessLevel !== 'admin') {
      return jsonResponse(403, { error: 'Удалить проект может только Бударин или администратор проекта.' })
    }

    const { data: project, error: projectError } = await supabase
      .from('sup_projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle()

    if (projectError) {
      throw projectError
    }

    if (!project) {
      return jsonResponse(404, { error: 'Проект не найден.' })
    }

    const { error: deleteError } = await supabase
      .from('sup_projects')
      .delete()
      .eq('id', projectId)

    if (deleteError) {
      return jsonResponse(500, {
        error: 'Не удалось удалить проект.',
        details: deleteError.message,
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
