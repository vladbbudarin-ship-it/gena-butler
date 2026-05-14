const ownerEmail = process.env.OWNER_EMAIL

export const legacyProjectVisibility = 'project_public'
export const legacyAssignedVisibility = 'assigned_only'

export const taskVisibilityValues = [
  'own',
  'own_and_subordinates',
  'subtree',
  'project',
  'custom',
  legacyProjectVisibility,
  legacyAssignedVisibility,
]

export const roleValues = ['owner', 'manager', 'member', 'observer']
export const taskAccessLevels = ['view', 'comment', 'edit', 'admin']

export function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
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

export async function getProfile({ supabase, userId }) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, public_id, role, account_type')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export function isOwnerUser({ user, profile }) {
  return profile?.account_type === 'owner'
    || ['owner', 'admin'].includes(profile?.role)
    || normalizeEmail(user?.email) === normalizeEmail(ownerEmail)
}

export function memberDefaults(member) {
  const accessLevel = member?.access_level || 'member'

  return {
    role_in_project: accessLevel === 'admin'
      ? 'owner'
      : accessLevel === 'manager'
        ? 'manager'
        : accessLevel === 'viewer'
          ? 'observer'
          : 'member',
    task_visibility: accessLevel === 'admin' ? 'project' : 'own',
  }
}

export async function getProjectMember({ supabase, projectId, userId }) {
  const { data, error } = await supabase
    .from('sup_project_members')
    .select('project_id, user_id, position_title, access_level')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function assertProjectMember({ supabase, projectId, user }) {
  const profile = await getProfile({ supabase, userId: user.id })

  if (isOwnerUser({ user, profile })) {
    return { profile, accessLevel: 'admin', isOwner: true }
  }

  const member = await getProjectMember({ supabase, projectId, userId: user.id })

  if (!member) {
    return { error: 'Нет доступа к проекту.', statusCode: 403 }
  }

  return {
    profile,
    accessLevel: member.access_level,
    member,
    isOwner: false,
  }
}

export async function canManageProjectAccess({ supabase, projectId, user }) {
  const access = await assertProjectMember({ supabase, projectId, user })

  if (access.error) {
    return false
  }

  return access.isOwner || access.accessLevel === 'admin'
}

export async function loadProjectMembersWithRelations({ supabase, projectId }) {
  const [membersResult, relationsResult] = await Promise.all([
    supabase
      .from('sup_project_members')
      .select('project_id, user_id, position_title, access_level, created_at')
      .eq('project_id', projectId),
    supabase
      .from('sup_project_member_relations')
      .select('project_id, user_id, manager_user_id, role_in_project, task_visibility, updated_at')
      .eq('project_id', projectId),
  ])

  if (membersResult.error) {
    throw membersResult.error
  }

  if (relationsResult.error && relationsResult.error.code !== '42P01') {
    throw relationsResult.error
  }

  const members = membersResult.data || []
  const relationsByUser = Object.fromEntries((relationsResult.data || []).map((relation) => [relation.user_id, relation]))
  const profiles = await loadProfilesByIds({
    supabase,
    userIds: members.map((member) => member.user_id),
  })

  return members.map((member) => {
    const defaults = memberDefaults(member)
    const relation = relationsByUser[member.user_id] || {}

    return {
      ...member,
      profile: profiles[member.user_id] || null,
      manager_user_id: relation.manager_user_id || null,
      role_in_project: relation.role_in_project || defaults.role_in_project,
      task_visibility: relation.task_visibility || defaults.task_visibility,
    }
  })
}

export async function loadProfilesByIds({ supabase, userIds }) {
  const ids = [...new Set((userIds || []).filter(Boolean))]

  if (ids.length === 0) {
    return {}
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, public_id, role, account_type')
    .in('id', ids)

  if (error) {
    throw error
  }

  return Object.fromEntries((data || []).map((profile) => [profile.id, profile]))
}

export function buildSubtreeUserIds({ members, rootUserId, directOnly = false }) {
  const childrenByManager = {}

  for (const member of members || []) {
    if (!member.manager_user_id) {
      continue
    }

    if (!childrenByManager[member.manager_user_id]) {
      childrenByManager[member.manager_user_id] = []
    }

    childrenByManager[member.manager_user_id].push(member.user_id)
  }

  const result = new Set()
  const queue = [...(childrenByManager[rootUserId] || [])]

  while (queue.length > 0) {
    const nextUserId = queue.shift()

    if (result.has(nextUserId)) {
      continue
    }

    result.add(nextUserId)

    if (!directOnly) {
      queue.push(...(childrenByManager[nextUserId] || []))
    }
  }

  return result
}

export async function getUserProjectSubtree({ supabase, projectId, userId }) {
  const members = await loadProjectMembersWithRelations({ supabase, projectId })
  return [...buildSubtreeUserIds({ members, rootUserId: userId })]
}

export function wouldCreateCycle({ members, userId, managerUserId }) {
  if (!managerUserId) {
    return false
  }

  if (userId === managerUserId) {
    return true
  }

  const nextMembers = (members || []).map((member) => (
    member.user_id === userId
      ? { ...member, manager_user_id: managerUserId }
      : member
  ))

  const subtree = buildSubtreeUserIds({
    members: nextMembers,
    rootUserId: userId,
  })

  return subtree.has(userId)
}

export async function canViewTask({ supabase, projectId, task, userId, profile = null, user = null }) {
  if (!task) {
    return false
  }

  if (profile && user && isOwnerUser({ user, profile })) {
    return true
  }

  const members = await loadProjectMembersWithRelations({ supabase, projectId })
  const member = members.find((item) => item.user_id === userId)

  if (!member) {
    return false
  }

  if (member.role_in_project === 'owner' || member.access_level === 'admin') {
    return true
  }

  if (task.created_by === userId || task.assignee_id === userId) {
    return true
  }

  if (['project', legacyProjectVisibility].includes(task.visibility)) {
    return true
  }

  const { data: accessRow, error: accessError } = await supabase
    .from('sup_task_access')
    .select('id, access_level')
    .eq('task_id', task.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (accessError && accessError.code !== '42P01') {
    throw accessError
  }

  if (accessRow) {
    return true
  }

  const { data: legacyAccess, error: legacyAccessError } = await supabase
    .from('sup_task_visible_members')
    .select('task_id')
    .eq('task_id', task.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (legacyAccessError) {
    throw legacyAccessError
  }

  if (legacyAccess) {
    return true
  }

  if (['own_and_subordinates', legacyAssignedVisibility].includes(task.visibility)) {
    const directSubordinates = buildSubtreeUserIds({ members, rootUserId: userId, directOnly: true })
    return directSubordinates.has(task.created_by) || directSubordinates.has(task.assignee_id)
  }

  if (task.visibility === 'subtree') {
    const subtree = buildSubtreeUserIds({ members, rootUserId: userId })
    return subtree.has(task.created_by) || subtree.has(task.assignee_id)
  }

  return false
}

export async function getAccessibleTasks({ supabase, projectId, userId, profile = null, user = null }) {
  const { data: tasks, error } = await supabase
    .from('sup_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  const visible = []

  for (const task of tasks || []) {
    if (await canViewTask({ supabase, projectId, task, userId, profile, user })) {
      visible.push(task)
    }
  }

  return visible
}

export async function ensureRelationRow({ supabase, projectId, member }) {
  const defaults = memberDefaults(member)
  const { data: relation } = await supabase
    .from('sup_project_member_relations')
    .select('manager_user_id, role_in_project, task_visibility')
    .eq('project_id', projectId)
    .eq('user_id', member.user_id)
    .maybeSingle()

  return {
    manager_user_id: relation?.manager_user_id || null,
    role_in_project: relation?.role_in_project || defaults.role_in_project,
    task_visibility: relation?.task_visibility || defaults.task_visibility,
  }
}

export function accessLevelFromRole(role) {
  if (role === 'owner') {
    return 'admin'
  }

  if (role === 'manager') {
    return 'manager'
  }

  if (role === 'observer') {
    return 'viewer'
  }

  return 'member'
}
