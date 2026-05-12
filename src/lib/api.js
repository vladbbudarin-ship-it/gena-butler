import { supabase } from './supabaseClient'

function getApiError(result, fallbackMessage) {
  if (result?.details) {
    return `${result.error || fallbackMessage} ${result.details}`
  }

  return result?.error || fallbackMessage
}

export async function submitQuestion({ questionText, urgencyLevel }) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/submit-question', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      question_text: questionText,
      urgency_level: urgencyLevel,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось отправить вопрос.'))
  }

  return result
}

export async function getOwnerQuestions() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-owner-questions', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить вопросы.'))
  }

  return result.questions
}

export async function getMyQuestions() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-my-questions', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить ваши вопросы.'))
  }

  return result.questions
}

export async function getMyChat() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-my-chat', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить чат.'))
  }

  return result
}

export async function getMyProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-my-profile', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить профиль.'))
  }

  return result.profile
}

export async function createInviteCode() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/create-invite-code', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось создать invite-код.'))
  }

  return {
    code: result.code,
    expiresAt: result.expires_at,
  }
}

export async function createTelegramLinkCode() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/create-telegram-link-code', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось создать Telegram-код.'))
  }

  return {
    code: result.code,
    expiresAt: result.expires_at,
    botUsername: result.bot_username,
  }
}

export async function createPlusInviteCode() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/create-plus-invite-code', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось создать код Пользователь+.'))
  }

  return {
    code: result.code,
    expiresAt: result.expires_at,
  }
}

export async function getPlusInviteCodes() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-plus-invite-codes', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить коды Пользователь+.'))
  }

  return result.codes || []
}

export async function registerWithInvite({
  name,
  email,
  password,
  inviteCode,
}) {
  const response = await fetch('/.netlify/functions/register-with-invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      email,
      password,
      invite_code: inviteCode,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось зарегистрироваться.'))
  }

  return result
}

export async function getDirectChats() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-direct-chats', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить личные чаты.'))
  }

  return result.conversations
}

export async function startDirectChat(publicId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/start-direct-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      public_id: publicId,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось начать чат.'))
  }

  return result.conversation
}

export async function getDirectChat(conversationId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const params = new URLSearchParams({
    conversation_id: conversationId,
  })

  const response = await fetch(`/.netlify/functions/get-direct-chat?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить личный чат.'))
  }

  return result
}

export async function sendDirectMessage({
  conversationId,
  body,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/send-direct-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      body,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось отправить сообщение.'))
  }

  return result
}

export async function deleteChat(conversationId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/delete-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось удалить чат.'))
  }

  return result
}

export async function deleteMessage(messageId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/delete-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      message_id: messageId,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось удалить сообщение.'))
  }

  return result
}

export async function getOwnerChats() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/get-owner-chats', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить диалоги.'))
  }

  return result.conversations
}

export async function getOwnerChat(conversationId) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const params = new URLSearchParams({
    conversation_id: conversationId,
  })

  const response = await fetch(`/.netlify/functions/get-owner-chat?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось загрузить диалог.'))
  }

  return result
}

export async function sendChatMessage({
  body,
  importance = 'normal',
  conversationId,
  senderRole,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/send-chat-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      body,
      importance,
      conversation_id: conversationId,
      sender_role: senderRole,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось отправить сообщение.'))
  }

  return result
}

export async function ownerAction({
  questionId,
  action,
  finalAnswerRu,
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  const response = await fetch('/.netlify/functions/owner-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      question_id: questionId,
      action,
      final_answer_ru: finalAnswerRu,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось выполнить действие.'))
  }

  return result
}

async function getRequiredSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Сначала войдите в аккаунт.')
  }

  return session
}

async function loadProfilesByIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]

  if (ids.length === 0) {
    return {}
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, public_id, role')
    .in('id', ids)

  if (error) {
    throw new Error(`Не удалось загрузить профили. ${error.message}`)
  }

  return Object.fromEntries((data || []).map((profile) => [profile.id, profile]))
}

export async function getSupProjects() {
  await getRequiredSession()

  const { data, error } = await supabase
    .from('sup_projects')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Не удалось загрузить проекты. ${error.message}`)
  }

  const projectIds = (data || []).map((project) => project.id)
  const { data: members, error: membersError } = await supabase
    .from('sup_project_members')
    .select('project_id, user_id, position_title, access_level')
    .in('project_id', projectIds.length ? projectIds : ['00000000-0000-0000-0000-000000000000'])

  if (membersError) {
    throw new Error(`Не удалось загрузить участников. ${membersError.message}`)
  }

  const profilesById = await loadProfilesByIds((members || []).map((member) => member.user_id))
  const membersByProject = {}

  for (const member of members || []) {
    if (!membersByProject[member.project_id]) {
      membersByProject[member.project_id] = []
    }
    membersByProject[member.project_id].push({
      ...member,
      profile: profilesById[member.user_id] || null,
    })
  }

  return (data || []).map((project) => ({
    ...project,
    members: membersByProject[project.id] || [],
  }))
}

export async function createSupProject({ title, description, status, aiContext }) {
  const session = await getRequiredSession()

  const response = await fetch('/.netlify/functions/create-sup-project', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      title,
      description,
      status,
      ai_context: aiContext,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось создать проект.'))
  }

  return result.project
}

export async function updateSupProject(projectId, { title, description, status, aiContext }) {
  await getRequiredSession()

  const { data, error } = await supabase
    .from('sup_projects')
    .update({
      title,
      description,
      status,
      ai_context: aiContext,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .select('*')
    .single()

  if (error) {
    throw new Error(`Не удалось обновить проект. ${error.message}`)
  }

  return data
}

export async function addSupProjectMember({ projectId, userPublicId, positionTitle, accessLevel }) {
  await getRequiredSession()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('public_id', userPublicId)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Не удалось найти пользователя. ${profileError.message}`)
  }

  if (!profile) {
    throw new Error('Пользователь с таким ID не найден.')
  }

  const { error } = await supabase
    .from('sup_project_members')
    .upsert({
      project_id: projectId,
      user_id: profile.id,
      position_title: positionTitle,
      access_level: accessLevel,
    }, { onConflict: 'project_id,user_id' })

  if (error) {
    throw new Error(`Не удалось добавить участника. ${error.message}`)
  }

  return { success: true }
}

export async function updateSupProjectMember({ projectId, userId, positionTitle, accessLevel }) {
  await getRequiredSession()

  const { error } = await supabase
    .from('sup_project_members')
    .update({
      position_title: positionTitle,
      access_level: accessLevel,
    })
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Не удалось обновить участника. ${error.message}`)
  }

  return { success: true }
}

export async function removeSupProjectMember({ projectId, userId }) {
  await getRequiredSession()

  const { error } = await supabase
    .from('sup_project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Не удалось удалить участника. ${error.message}`)
  }

  return { success: true }
}

export async function getSupProjectDetails(projectId) {
  await getRequiredSession()

  const [projectResult, membersResult, tasksResult, filesResult, suggestionsResult] = await Promise.all([
    supabase
      .from('sup_projects')
      .select('*')
      .eq('id', projectId)
      .single(),
    supabase
      .from('sup_project_members')
      .select('user_id, position_title, access_level')
      .eq('project_id', projectId),
    supabase
      .from('sup_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('sup_project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('sup_ai_suggestions')
      .select('*')
      .eq('project_id', projectId)
      .is('task_id', null)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (projectResult.error) {
    throw new Error(`Не удалось открыть проект. ${projectResult.error.message}`)
  }

  if (membersResult.error) {
    throw new Error(`Не удалось загрузить участников. ${membersResult.error.message}`)
  }

  if (tasksResult.error) {
    throw new Error(`Не удалось загрузить задачи. ${tasksResult.error.message}`)
  }

  const profileIds = [
    ...(membersResult.data || []).map((member) => member.user_id),
    ...(tasksResult.data || []).map((task) => task.assignee_id),
    ...(tasksResult.data || []).map((task) => task.created_by),
  ]
  const profilesById = await loadProfilesByIds(profileIds)

  return {
    project: projectResult.data,
    members: (membersResult.data || []).map((member) => ({
      ...member,
      profile: profilesById[member.user_id] || null,
    })),
    tasks: (tasksResult.data || []).map((task) => ({
      ...task,
      assignee: profilesById[task.assignee_id] || null,
      creator: profilesById[task.created_by] || null,
    })),
    files: filesResult.data || [],
    suggestions: suggestionsResult.data || [],
  }
}

export async function createSupTask({
  projectId,
  title,
  description,
  status = 'todo',
  priority = 'normal',
  visibility = 'project_public',
  assigneeId,
  dueDate,
  customUserIds = [],
}) {
  const session = await getRequiredSession()

  const response = await fetch('/.netlify/functions/create-sup-task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      project_id: projectId,
      title,
      description,
      status,
      priority,
      visibility,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      custom_user_ids: customUserIds,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось создать задачу.'))
  }

  return result.task
}

export async function updateSupTask(taskId, updates) {
  await getRequiredSession()

  const { data, error } = await supabase
    .from('sup_tasks')
    .update({
      title: updates.title,
      description: updates.description,
      status: updates.status,
      priority: updates.priority,
      visibility: updates.visibility,
      assignee_id: updates.assigneeId || null,
      due_date: updates.dueDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select('*')
    .single()

  if (error) {
    throw new Error(`Не удалось обновить задачу. ${error.message}`)
  }

  return data
}

export async function setSupTaskStatus(taskId, status) {
  await getRequiredSession()

  const patch = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'review') {
    patch.completed_at = new Date().toISOString()
  }

  if (status === 'done') {
    patch.accepted_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('sup_tasks')
    .update(patch)
    .eq('id', taskId)

  if (error) {
    throw new Error(`Не удалось изменить статус задачи. ${error.message}`)
  }

  return { success: true }
}

export async function getSupTaskDetails(taskId) {
  await getRequiredSession()

  const [taskResult, updatesResult, commentsResult, filesResult, suggestionsResult, visibleResult] = await Promise.all([
    supabase
      .from('sup_tasks')
      .select('*')
      .eq('id', taskId)
      .single(),
    supabase
      .from('sup_task_updates')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),
    supabase
      .from('sup_task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),
    supabase
      .from('sup_task_files')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),
    supabase
      .from('sup_ai_suggestions')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('sup_task_visible_members')
      .select('user_id')
      .eq('task_id', taskId),
  ])

  if (taskResult.error) {
    throw new Error(`Не удалось открыть задачу. ${taskResult.error.message}`)
  }

  const profilesById = await loadProfilesByIds([
    taskResult.data?.assignee_id,
    taskResult.data?.created_by,
    ...(updatesResult.data || []).map((row) => row.user_id),
    ...(commentsResult.data || []).map((row) => row.user_id),
  ])

  return {
    task: {
      ...taskResult.data,
      assignee: profilesById[taskResult.data?.assignee_id] || null,
      creator: profilesById[taskResult.data?.created_by] || null,
    },
    updates: (updatesResult.data || []).map((row) => ({
      ...row,
      profile: profilesById[row.user_id] || null,
    })),
    comments: (commentsResult.data || []).map((row) => ({
      ...row,
      profile: profilesById[row.user_id] || null,
    })),
    files: filesResult.data || [],
    suggestions: suggestionsResult.data || [],
    visibleUserIds: (visibleResult.data || []).map((row) => row.user_id),
  }
}

export async function addSupTaskUpdate(taskId, body) {
  const session = await getRequiredSession()

  const { error } = await supabase
    .from('sup_task_updates')
    .insert({
      task_id: taskId,
      user_id: session.user.id,
      body,
    })

  if (error) {
    throw new Error(`Не удалось добавить дополнение. ${error.message}`)
  }

  return { success: true }
}

export async function addSupTaskComment(taskId, body) {
  const session = await getRequiredSession()

  const { error } = await supabase
    .from('sup_task_comments')
    .insert({
      task_id: taskId,
      user_id: session.user.id,
      body,
    })

  if (error) {
    throw new Error(`Не удалось добавить комментарий. ${error.message}`)
  }

  return { success: true }
}

export async function uploadSupProjectFile(projectId, file) {
  const session = await getRequiredSession()
  const storagePath = `projects/${projectId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('sup-project-files')
    .upload(storagePath, file, { upsert: false })

  if (uploadError) {
    throw new Error(`Не удалось загрузить файл. ${uploadError.message}`)
  }

  const { error: insertError } = await supabase
    .from('sup_project_files')
    .insert({
      project_id: projectId,
      uploaded_by: session.user.id,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
    })

  if (insertError) {
    throw new Error(`Файл загружен, но запись не сохранена. ${insertError.message}`)
  }

  return { success: true }
}

export async function uploadSupTaskFile(taskId, file) {
  const session = await getRequiredSession()
  const storagePath = `tasks/${taskId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('sup-project-files')
    .upload(storagePath, file, { upsert: false })

  if (uploadError) {
    throw new Error(`Не удалось загрузить файл. ${uploadError.message}`)
  }

  const { error: insertError } = await supabase
    .from('sup_task_files')
    .insert({
      task_id: taskId,
      uploaded_by: session.user.id,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
    })

  if (insertError) {
    throw new Error(`Файл загружен, но запись не сохранена. ${insertError.message}`)
  }

  return { success: true }
}

export async function createSupAiSuggestion({ projectId, taskId, prompt }) {
  const session = await getRequiredSession()

  const response = await fetch('/.netlify/functions/sup-ai-assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      project_id: projectId,
      task_id: taskId,
      prompt,
    }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(getApiError(result, 'Не удалось получить AI-предложение.'))
  }

  return result.suggestion
}
