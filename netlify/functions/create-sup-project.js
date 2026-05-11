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

  if (data) {
    return data
  }

  return {
    id: user.id,
    email: user.email,
    role: 'user',
    account_type: 'user',
  }
}

function canCreateProject(user, profile) {
  const isOwnerByEmail = normalizeEmail(user.email) === normalizeEmail(ownerEmail)

  return isOwnerByEmail
    || profile?.account_type === 'owner'
    || profile?.account_type === 'user_plus'
    || ['owner', 'admin', 'user_plus'].includes(profile?.role)
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

    if (!canCreateProject(user, profile)) {
      return jsonResponse(403, { error: 'Создавать проекты могут только Пользователь+ и Бударин.' })
    }

    const body = JSON.parse(event.body || '{}')
    const title = String(body.title || '').trim()
    const description = String(body.description || '').trim()
    const status = ['active', 'paused', 'done', 'archived'].includes(body.status)
      ? body.status
      : 'active'
    const aiContext = String(body.ai_context || '').trim()

    if (!title) {
      return jsonResponse(400, { error: 'Введите название проекта.' })
    }

    const { data: project, error: projectError } = await supabase
      .from('sup_projects')
      .insert({
        title,
        description: description || null,
        status,
        ai_context: aiContext || null,
        created_by: user.id,
      })
      .select('*')
      .single()

    if (projectError) {
      return jsonResponse(500, {
        error: 'Не удалось создать проект. Проверьте, что SQL-файл supabase/project-management-schema.sql выполнен в Supabase.',
        details: projectError.message,
      })
    }

    const { error: memberError } = await supabase
      .from('sup_project_members')
      .insert({
        project_id: project.id,
        user_id: user.id,
        position_title: 'Создатель',
        access_level: 'admin',
      })

    if (memberError) {
      await supabase.from('sup_projects').delete().eq('id', project.id)

      return jsonResponse(500, {
        error: 'Проект создан, но не удалось добавить создателя в участники.',
        details: memberError.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      project,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
