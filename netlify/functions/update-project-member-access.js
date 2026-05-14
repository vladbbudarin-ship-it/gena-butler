import { createClient } from '@supabase/supabase-js'
import {
  accessLevelFromRole,
  canManageProjectAccess,
  ensureRelationRow,
  getProjectMember,
  getUserFromEvent,
  jsonResponse,
  roleValues,
  taskVisibilityValues,
} from './_utils/project-access.js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const { user, error: authError } = await getUserFromEvent({ supabase, event })

    if (authError) {
      return jsonResponse(401, { error: authError })
    }

    const body = JSON.parse(event.body || '{}')
    const projectId = String(body.project_id || '').trim()
    const userId = String(body.user_id || '').trim()
    const roleInProject = String(body.role_in_project || '').trim()
    const taskVisibility = String(body.task_visibility || '').trim()

    if (!projectId || !userId) {
      return jsonResponse(400, { error: 'Передайте project_id и user_id.' })
    }

    if (!roleValues.includes(roleInProject)) {
      return jsonResponse(400, { error: 'Некорректная роль в проекте.' })
    }

    if (!taskVisibilityValues.includes(taskVisibility)) {
      return jsonResponse(400, { error: 'Некорректная видимость задач.' })
    }

    if (!(await canManageProjectAccess({ supabase, projectId, user }))) {
      return jsonResponse(403, { error: 'Нет прав управлять доступом проекта.' })
    }

    const targetMember = await getProjectMember({ supabase, projectId, userId })

    if (!targetMember) {
      return jsonResponse(404, { error: 'Участник проекта не найден.' })
    }

    const current = await ensureRelationRow({ supabase, projectId, member: targetMember })
    const accessLevel = accessLevelFromRole(roleInProject)

    const [relationResult, memberResult] = await Promise.all([
      supabase
        .from('sup_project_member_relations')
        .upsert({
          project_id: projectId,
          user_id: userId,
          manager_user_id: current.manager_user_id,
          role_in_project: roleInProject,
          task_visibility: taskVisibility,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'project_id,user_id' })
        .select('*')
        .single(),
      supabase
        .from('sup_project_members')
        .update({ access_level: accessLevel })
        .eq('project_id', projectId)
        .eq('user_id', userId),
    ])

    if (relationResult.error || memberResult.error) {
      return jsonResponse(500, {
        error: 'Не удалось обновить доступ участника.',
        details: relationResult.error?.message || memberResult.error?.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      relation: relationResult.data,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
