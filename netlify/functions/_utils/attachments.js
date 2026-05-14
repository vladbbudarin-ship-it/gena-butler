const ownerEmail = process.env.OWNER_EMAIL

export function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function isMissingSchemaColumn(error) {
  return error?.code === 'PGRST204'
    || /column|schema cache/i.test(error?.message || '')
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export async function getUserFromEvent({ supabase, event }) {
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

export async function isOwner({ supabase, user }) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, account_type')
    .eq('id', user.id)
    .maybeSingle()

  return profile?.account_type === 'owner'
    || ['owner', 'admin'].includes(profile?.role)
    || normalizeEmail(user.email) === normalizeEmail(ownerEmail)
}

async function loadConversationParticipant({ supabase, conversationId, userId }) {
  const withDeletedAt = await supabase
    .from('conversation_participants')
    .select('conversation_id, deleted_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!withDeletedAt.error) {
    return {
      data: withDeletedAt.data?.deleted_at ? null : withDeletedAt.data,
      error: null,
    }
  }

  if (!isMissingSchemaColumn(withDeletedAt.error)) {
    return withDeletedAt
  }

  return supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()
}

async function canAccessConversation({ supabase, conversationId, user }) {
  if (await isOwner({ supabase, user })) {
    return true
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, type, user_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (conversationError || !conversation) {
    return false
  }

  if (conversation.type === 'owner' && conversation.user_id === user.id) {
    return true
  }

  const { data: participant } = await loadConversationParticipant({
    supabase,
    conversationId,
    userId: user.id,
  })

  return Boolean(participant)
}

async function getProjectAccessLevel({ supabase, projectId, user }) {
  if (await isOwner({ supabase, user })) {
    return 'admin'
  }

  const { data } = await supabase
    .from('sup_project_members')
    .select('access_level')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()

  return data?.access_level || 'none'
}

async function canAccessProject({ supabase, projectId, user }) {
  if (await isOwner({ supabase, user })) {
    return true
  }

  const { data } = await supabase
    .from('sup_project_members')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()

  return Boolean(data)
}

async function canAccessTask({ supabase, task, user }) {
  if (!task) {
    return false
  }

  const accessLevel = await getProjectAccessLevel({
    supabase,
    projectId: task.project_id,
    user,
  })

  if (accessLevel === 'none') {
    return false
  }

  if (task.visibility === 'project_public') {
    return true
  }

  if (['admin', 'manager'].includes(accessLevel)) {
    return true
  }

  if (task.created_by === user.id || task.assignee_id === user.id) {
    return true
  }

  const { data } = await supabase
    .from('sup_task_visible_members')
    .select('task_id')
    .eq('task_id', task.id)
    .eq('user_id', user.id)
    .maybeSingle()

  return Boolean(data)
}

async function canManageTaskFile({ supabase, task, file, user }) {
  if (file.uploaded_by === user.id || await isOwner({ supabase, user })) {
    return true
  }

  const accessLevel = await getProjectAccessLevel({
    supabase,
    projectId: task.project_id,
    user,
  })

  return ['admin', 'manager'].includes(accessLevel)
}

async function canManageProjectFile({ supabase, projectId, file, user }) {
  if (file.uploaded_by === user.id || await isOwner({ supabase, user })) {
    return true
  }

  const accessLevel = await getProjectAccessLevel({ supabase, projectId, user })

  return ['admin', 'manager'].includes(accessLevel)
}

async function loadChatMessageFile({ supabase, fileId }) {
  const withDeleteFields = await supabase
    .from('chat_message_files')
    .select('id, message_id, conversation_id, uploaded_by, storage_bucket, storage_path, file_name, mime_type, file_size, deleted_at')
    .eq('id', fileId)
    .maybeSingle()

  if (!withDeleteFields.error) {
    return withDeleteFields
  }

  if (!isMissingSchemaColumn(withDeleteFields.error)) {
    return withDeleteFields
  }

  const fallback = await supabase
    .from('chat_message_files')
    .select('id, message_id, conversation_id, uploaded_by, storage_bucket, storage_path, file_name, mime_type, file_size')
    .eq('id', fileId)
    .maybeSingle()

  return {
    data: fallback.data ? { ...fallback.data, deleted_at: null } : null,
    error: fallback.error,
  }
}

async function loadTaskFile({ supabase, fileId }) {
  const withDeleteFields = await supabase
    .from('sup_task_files')
    .select('id, task_id, uploaded_by, storage_path, file_name, mime_type, file_size, deleted_at')
    .eq('id', fileId)
    .maybeSingle()

  if (!withDeleteFields.error) {
    return withDeleteFields
  }

  if (!isMissingSchemaColumn(withDeleteFields.error)) {
    return withDeleteFields
  }

  const fallback = await supabase
    .from('sup_task_files')
    .select('id, task_id, uploaded_by, storage_path, file_name, mime_type, file_size')
    .eq('id', fileId)
    .maybeSingle()

  return {
    data: fallback.data ? { ...fallback.data, deleted_at: null } : null,
    error: fallback.error,
  }
}

async function loadProjectFile({ supabase, fileId }) {
  const withDeleteFields = await supabase
    .from('sup_project_files')
    .select('id, project_id, uploaded_by, storage_path, file_name, mime_type, file_size, deleted_at')
    .eq('id', fileId)
    .maybeSingle()

  if (!withDeleteFields.error) {
    return withDeleteFields
  }

  if (!isMissingSchemaColumn(withDeleteFields.error)) {
    return withDeleteFields
  }

  const fallback = await supabase
    .from('sup_project_files')
    .select('id, project_id, uploaded_by, storage_path, file_name, mime_type, file_size')
    .eq('id', fileId)
    .maybeSingle()

  return {
    data: fallback.data ? { ...fallback.data, deleted_at: null } : null,
    error: fallback.error,
  }
}

export async function loadAttachmentWithAccess({ supabase, kind, fileId, user }) {
  if (kind === 'chat_message') {
    const { data: file, error } = await loadChatMessageFile({ supabase, fileId })

    if (error || !file) {
      return { error: 'Файл не найден.', statusCode: 404 }
    }

    if (file.deleted_at) {
      return { error: 'Файл удалён.', statusCode: 410 }
    }

    const canAccess = await canAccessConversation({
      supabase,
      conversationId: file.conversation_id,
      user,
    })

    if (!canAccess) {
      return { error: 'Нет доступа к файлу.', statusCode: 403 }
    }

    return {
      file,
      bucket: file.storage_bucket || 'attachments',
      canDelete: file.uploaded_by === user.id || await isOwner({ supabase, user }),
    }
  }

  if (kind === 'sup_task') {
    const { data: file, error } = await loadTaskFile({ supabase, fileId })

    if (error || !file) {
      return { error: 'Файл не найден.', statusCode: 404 }
    }

    if (file.deleted_at) {
      return { error: 'Файл удалён.', statusCode: 410 }
    }

    const { data: task } = await supabase
      .from('sup_tasks')
      .select('id, project_id, visibility, created_by, assignee_id')
      .eq('id', file.task_id)
      .maybeSingle()

    if (!(await canAccessTask({ supabase, task, user }))) {
      return { error: 'Нет доступа к файлу задачи.', statusCode: 403 }
    }

    return {
      file,
      bucket: 'sup-project-files',
      canDelete: await canManageTaskFile({ supabase, task, file, user }),
    }
  }

  if (kind === 'sup_project') {
    const { data: file, error } = await loadProjectFile({ supabase, fileId })

    if (error || !file) {
      return { error: 'Файл не найден.', statusCode: 404 }
    }

    if (file.deleted_at) {
      return { error: 'Файл удалён.', statusCode: 410 }
    }

    if (!(await canAccessProject({ supabase, projectId: file.project_id, user }))) {
      return { error: 'Нет доступа к файлу проекта.', statusCode: 403 }
    }

    return {
      file,
      bucket: 'sup-project-files',
      canDelete: await canManageProjectFile({ supabase, projectId: file.project_id, file, user }),
    }
  }

  return { error: 'Неизвестный тип вложения.', statusCode: 400 }
}

export async function attachChatMessageFiles({ supabase, messages }) {
  const messageIds = [...new Set((messages || []).map((message) => message.id).filter(Boolean))]

  if (messageIds.length === 0) {
    return messages || []
  }

  const withDeleteFields = await supabase
    .from('chat_message_files')
    .select('id, message_id, uploaded_by, file_name, mime_type, file_size, created_at, deleted_at')
    .in('message_id', messageIds)
    .order('created_at', { ascending: true })

  let files = []

  if (!withDeleteFields.error) {
    files = withDeleteFields.data || []
  } else if (!isMissingSchemaColumn(withDeleteFields.error)) {
    throw withDeleteFields.error
  } else {
    return (messages || []).map((message) => ({
      ...message,
      attachments: [],
    }))
  }

  const activeFiles = files.filter((file) => !file.deleted_at)
  const filesByMessageId = {}

  for (const file of activeFiles) {
    if (!filesByMessageId[file.message_id]) {
      filesByMessageId[file.message_id] = []
    }

    filesByMessageId[file.message_id].push({
      ...file,
      kind: 'chat_message',
    })
  }

  return (messages || []).map((message) => ({
    ...message,
    attachments: filesByMessageId[message.id] || [],
  }))
}
