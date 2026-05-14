import { createClient } from '@supabase/supabase-js'
import {
  assertProjectMember,
  getAccessibleTasks,
  getUserFromEvent,
  jsonResponse,
  loadProjectMembersWithRelations,
} from './_utils/project-access.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function getDisplayName(profile) {
  return profile?.name || profile?.public_id || 'Пользователь'
}

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent({ supabase, event })

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    const projectId = event.queryStringParameters?.project_id

    if (!projectId) {
      return jsonResponse(400, { error: 'Не передан project_id.' })
    }

    const access = await assertProjectMember({ supabase, projectId, user })

    if (access.error) {
      return jsonResponse(access.statusCode || 403, { error: access.error })
    }

    const members = await loadProjectMembersWithRelations({ supabase, projectId })
    const taskCountByUser = {}

    for (const member of members) {
      const tasks = await getAccessibleTasks({
        supabase,
        projectId,
        userId: member.user_id,
      })
      taskCountByUser[member.user_id] = tasks.length
    }

    const childrenCountByManager = {}

    for (const member of members) {
      if (!member.manager_user_id) {
        continue
      }

      childrenCountByManager[member.manager_user_id] = (childrenCountByManager[member.manager_user_id] || 0) + 1
    }

    return jsonResponse(200, {
      success: true,
      can_manage_access: access.isOwner || access.accessLevel === 'admin',
      members: members.map((member) => ({
        user_id: member.user_id,
        name: getDisplayName(member.profile),
        email: access.isOwner || access.accessLevel === 'admin' ? member.profile?.email || null : null,
        public_id: member.profile?.public_id || null,
        position_title: member.position_title || '',
        access_level: member.access_level,
        manager_user_id: member.manager_user_id,
        role_in_project: member.role_in_project,
        task_visibility: member.task_visibility,
        children_count: childrenCountByManager[member.user_id] || 0,
        accessible_task_count: taskCountByUser[member.user_id] || 0,
      })),
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
