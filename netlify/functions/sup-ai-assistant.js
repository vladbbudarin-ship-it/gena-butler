import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiApiKey = process.env.OPENAI_API_KEY
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
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

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, account_type, name, public_id, email')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

function isOwner(profile) {
  return profile?.account_type === 'owner'
    || ['owner', 'admin'].includes(profile?.role)
}

async function getProjectMember(projectId, userId) {
  const { data, error } = await supabase
    .from('sup_project_members')
    .select('access_level, position_title')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

async function canViewProject(projectId, userId, profile) {
  if (isOwner(profile)) {
    return true
  }

  return Boolean(await getProjectMember(projectId, userId))
}

async function canViewTask(task, userId, profile) {
  if (isOwner(profile)) {
    return true
  }

  const member = await getProjectMember(task.project_id, userId)

  if (!member) {
    return false
  }

  if (task.visibility === 'project_public') {
    return true
  }

  if (['admin', 'manager'].includes(member.access_level)) {
    return true
  }

  if (task.created_by === userId || task.assignee_id === userId) {
    return true
  }

  const { data, error } = await supabase
    .from('sup_task_visible_members')
    .select('task_id')
    .eq('task_id', task.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}

function isMissingSchemaColumn(error) {
  return error?.code === 'PGRST204'
    || /column|schema cache/i.test(error?.message || '')
}

async function loadAiSuggestions({ projectId, taskId = null }) {
  const buildQuery = ({ includeDeletedFilter }) => {
    let query = supabase
      .from('sup_ai_suggestions')
      .select('prompt, suggestion, created_at, deleted_at')
      .eq('project_id', projectId)

    if (taskId) {
      query = query.eq('task_id', taskId)
    } else {
      query = query.is('task_id', null)
    }

    if (includeDeletedFilter) {
      query = query.is('deleted_at', null)
    }

    return query
      .order('created_at', { ascending: false })
      .limit(10)
  }

  const { data, error } = await buildQuery({ includeDeletedFilter: true })

  if (!error) {
    return data || []
  }

  if (!isMissingSchemaColumn(error)) {
    throw error
  }

  let fallbackQuery = supabase
    .from('sup_ai_suggestions')
    .select('prompt, suggestion, created_at')
    .eq('project_id', projectId)

  if (taskId) {
    fallbackQuery = fallbackQuery.eq('task_id', taskId)
  } else {
    fallbackQuery = fallbackQuery.is('task_id', null)
  }

  const fallback = await fallbackQuery
    .order('created_at', { ascending: false })
    .limit(10)

  if (fallback.error) {
    throw fallback.error
  }

  return fallback.data || []
}

async function buildContext({ projectId, taskId, user, profile }) {
  const { data: project, error: projectError } = await supabase
    .from('sup_projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return { error: 'Проект не найден.' }
  }

  if (!(await canViewProject(project.id, user.id, profile))) {
    return { error: 'Нет доступа к проекту.', statusCode: 403 }
  }

  let task = null
  let updates = []
  let comments = []
  let previousSuggestions = []

  if (taskId) {
    const { data: taskData, error: taskError } = await supabase
      .from('sup_tasks')
      .select('*')
      .eq('id', taskId)
      .eq('project_id', project.id)
      .single()

    if (taskError || !taskData) {
      return { error: 'Задача не найдена.' }
    }

    if (!(await canViewTask(taskData, user.id, profile))) {
      return { error: 'Нет доступа к задаче.', statusCode: 403 }
    }

    task = taskData

    const [updatesResult, commentsResult, suggestionsResult] = await Promise.all([
      supabase
        .from('sup_task_updates')
        .select('body, created_at')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true })
        .limit(30),
      supabase
        .from('sup_task_comments')
        .select('body, created_at')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true })
        .limit(30),
      loadAiSuggestions({ projectId: project.id, taskId: task.id }),
    ])

    updates = updatesResult.data || []
    comments = commentsResult.data || []
    previousSuggestions = suggestionsResult || []
  } else {
    previousSuggestions = await loadAiSuggestions({ projectId: project.id })
  }

  return {
    project,
    task,
    updates,
    comments,
    previousSuggestions,
  }
}

async function generateSuggestion({ prompt, context }) {
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY не найден в переменных окружения.')
  }

  const openai = new OpenAI({ apiKey: openaiApiKey })

  const response = await openai.responses.create({
    model: openaiModel,
    input: [
      {
        role: 'system',
        content: 'Ты AI-помощник модуля СУП сервиса "Дворецкий Гена". Дай практичный ответ на русском: кратко, структурно, без доступа к данным, которых нет в контексте.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          user_prompt: prompt,
          project: {
            title: context.project.title,
            description: context.project.description,
            status: context.project.status,
            ai_context: context.project.ai_context,
          },
          task: context.task ? {
            title: context.task.title,
            description: context.task.description,
            status: context.task.status,
            priority: context.task.priority,
            due_date: context.task.due_date,
          } : null,
          task_updates: context.updates,
          comments: context.comments,
          previous_ai_suggestions: context.previousSuggestions,
        }, null, 2),
      },
    ],
  })

  return response.output_text
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

    const profile = await getProfile(user.id)
    const body = JSON.parse(event.body || '{}')
    const projectId = body.project_id
    const taskId = body.task_id || null
    const prompt = String(body.prompt || '').trim()

    if (!projectId || !prompt) {
      return jsonResponse(400, { error: 'Передайте project_id и prompt.' })
    }

    const context = await buildContext({
      projectId,
      taskId,
      user,
      profile,
    })

    if (context.error) {
      return jsonResponse(context.statusCode || 404, { error: context.error })
    }

    const suggestionText = await generateSuggestion({ prompt, context })

    const { data: suggestion, error: insertError } = await supabase
      .from('sup_ai_suggestions')
      .insert({
        project_id: projectId,
        task_id: taskId,
        requested_by: user.id,
        prompt,
        suggestion: suggestionText,
      })
      .select('*')
      .single()

    if (insertError) {
      return jsonResponse(500, {
        error: 'AI ответ создан, но не удалось сохранить историю.',
        details: insertError.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      suggestion,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
