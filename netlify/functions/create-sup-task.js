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

function canUseSup(profile, user) {
  return isOwner(user, profile)
    || profile?.account_type === 'user_plus'
    || profile?.role === 'user_plus'
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

function normalizeStatus(value) {
  return ['todo', 'in_progress', 'review', 'needs_changes', 'done', 'cancelled'].includes(value)
    ? value
    : 'todo'
}

function normalizePriority(value) {
  return ['low', 'normal', 'high', 'urgent'].includes(value)
    ? value
    : 'normal'
}

function normalizeVisibility(value) {
  return ['project_public', 'assigned_only', 'custom'].includes(value)
    ? value
    : 'project_public'
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

    const profile = await getProfile(user)

    if (!canUseSup(profile, user)) {
      return jsonResponse(403, { error: 'Создавать задачи могут только Пользователь+ и Бударин.' })
    }

    const body = JSON.parse(event.body || '{}')
    const projectId = String(body.project_id || '').trim()
    const title = String(body.title || '').trim()
    const description = String(body.description || '').trim()
    const status = normalizeStatus(body.status)
    const priority = normalizePriority(body.priority)
    const visibility = normalizeVisibility(body.visibility)
    const assigneeId = body.assignee_id ? String(body.assignee_id) : null
    const dueDate = body.due_date || null
    const customUserIds = Array.isArray(body.custom_user_ids)
      ? body.custom_user_ids.filter(Boolean)
      : []

    if (!projectId) {
      return jsonResponse(400, { error: 'Не выбран проект для задачи.' })
    }

    if (!title) {
      return jsonResponse(400, { error: 'Введите название задачи.' })
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
      return jsonResponse(404, { error: 'Проект не найден или недоступен.' })
    }

    const accessLevel = await getProjectAccess(projectId, user.id)
    const ownerCanManage = isOwner(user, profile)
    const projectCanManage = ['admin', 'manager'].includes(accessLevel)

    if (!ownerCanManage && !projectCanManage) {
      return jsonResponse(403, { error: 'Создавать задачи могут администратор или менеджер проекта.' })
    }

    const { data: task, error: taskError } = await supabase
      .from('sup_tasks')
      .insert({
        project_id: projectId,
        title,
        description: description || null,
        status,
        priority,
        visibility,
        created_by: user.id,
        assignee_id: assigneeId,
        due_date: dueDate || null,
      })
      .select('*')
      .single()

    if (taskError) {
      return jsonResponse(500, {
        error: 'Не удалось создать задачу.',
        details: taskError.message,
      })
    }

    if (visibility === 'custom' && customUserIds.length > 0) {
      const rows = [...new Set(customUserIds)].map((userId) => ({
        task_id: task.id,
        user_id: userId,
      }))

      const { error: visibilityError } = await supabase
        .from('sup_task_visible_members')
        .insert(rows)

      if (visibilityError) {
        return jsonResponse(500, {
          error: 'Задача создана, но доступы не сохранены.',
          details: visibilityError.message,
          task,
        })
      }
    }

    return jsonResponse(200, {
      success: true,
      task,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
