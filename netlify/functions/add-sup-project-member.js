import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.OWNER_EMAIL

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

const allowedAccessLevels = ['admin', 'manager', 'member', 'viewer']

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
    const publicId = String(body.public_id || '').trim()
    const positionTitle = String(body.position_title || '').trim()
    const accessLevel = String(body.access_level || 'member').trim()

    if (!projectId) {
      return jsonResponse(400, { error: 'Не передан project_id.' })
    }

    if (!/^[0-9]{10}$/.test(publicId)) {
      return jsonResponse(400, { error: 'Введите 10-значный ID пользователя.' })
    }

    if (!allowedAccessLevels.includes(accessLevel)) {
      return jsonResponse(400, { error: 'Некорректный уровень доступа.' })
    }

    const profile = await getProfile(user)
    const access = await getProjectAccess(projectId, user.id)

    if (!isOwner(user, profile) && access !== 'admin') {
      return jsonResponse(403, { error: 'Добавлять участников может только Бударин или администратор проекта.' })
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

    const { data: targetProfile, error: targetError } = await supabase
      .from('profiles')
      .select('id, name, email, public_id')
      .eq('public_id', publicId)
      .maybeSingle()

    if (targetError) {
      return jsonResponse(500, {
        error: 'Не удалось найти пользователя по ID.',
        details: targetError.message,
      })
    }

    if (!targetProfile) {
      return jsonResponse(404, { error: 'Пользователь с таким ID не найден.' })
    }

    const { error: upsertError } = await supabase
      .from('sup_project_members')
      .upsert({
        project_id: projectId,
        user_id: targetProfile.id,
        position_title: positionTitle,
        access_level: accessLevel,
      }, { onConflict: 'project_id,user_id' })

    if (upsertError) {
      return jsonResponse(500, {
        error: 'Не удалось добавить участника в проект.',
        details: upsertError.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      member: {
        project_id: projectId,
        user_id: targetProfile.id,
        position_title: positionTitle,
        access_level: accessLevel,
        profile: targetProfile,
      },
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
