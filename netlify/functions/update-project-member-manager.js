import { createClient } from '@supabase/supabase-js'
import {
  canManageProjectAccess,
  ensureRelationRow,
  getProjectMember,
  getUserFromEvent,
  jsonResponse,
  loadProjectMembersWithRelations,
  wouldCreateCycle,
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
    const managerUserId = body.manager_user_id ? String(body.manager_user_id).trim() : null

    if (!projectId || !userId) {
      return jsonResponse(400, { error: 'Передайте project_id и user_id.' })
    }

    if (userId === managerUserId) {
      return jsonResponse(400, { error: 'Пользователь не может быть руководителем самому себе.' })
    }

    if (!(await canManageProjectAccess({ supabase, projectId, user }))) {
      return jsonResponse(403, { error: 'Нет прав управлять структурой проекта.' })
    }

    const targetMember = await getProjectMember({ supabase, projectId, userId })

    if (!targetMember) {
      return jsonResponse(404, { error: 'Участник проекта не найден.' })
    }

    if (managerUserId) {
      const managerMember = await getProjectMember({ supabase, projectId, userId: managerUserId })

      if (!managerMember) {
        return jsonResponse(404, { error: 'Руководитель должен быть участником этого проекта.' })
      }
    }

    const members = await loadProjectMembersWithRelations({ supabase, projectId })

    if (wouldCreateCycle({ members, userId, managerUserId })) {
      return jsonResponse(400, { error: 'Нельзя создать циклическое подчинение.' })
    }

    const current = await ensureRelationRow({ supabase, projectId, member: targetMember })
    const { data, error } = await supabase
      .from('sup_project_member_relations')
      .upsert({
        project_id: projectId,
        user_id: userId,
        manager_user_id: managerUserId,
        role_in_project: current.role_in_project,
        task_visibility: current.task_visibility,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,user_id' })
      .select('*')
      .single()

    if (error) {
      return jsonResponse(500, {
        error: 'Не удалось обновить руководителя.',
        details: error.message,
      })
    }

    return jsonResponse(200, {
      success: true,
      relation: data,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
