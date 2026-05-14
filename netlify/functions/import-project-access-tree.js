import { createClient } from '@supabase/supabase-js'
import {
  accessLevelFromRole,
  assertProjectMember,
  canManageProjectAccess,
  getUserFromEvent,
  jsonResponse,
  loadProjectMembersWithRelations,
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
    const sourceProjectId = String(body.source_project_id || '').trim()
    const targetProjectId = String(body.target_project_id || '').trim()
    const options = body.options || {}

    if (!sourceProjectId || !targetProjectId) {
      return jsonResponse(400, { error: 'Передайте source_project_id и target_project_id.' })
    }

    if (sourceProjectId === targetProjectId) {
      return jsonResponse(400, { error: 'Выберите другой проект-источник.' })
    }

    if (!(await canManageProjectAccess({ supabase, projectId: targetProjectId, user }))) {
      return jsonResponse(403, { error: 'Нет прав управлять целевым проектом.' })
    }

    const sourceAccess = await assertProjectMember({ supabase, projectId: sourceProjectId, user })

    if (sourceAccess.error) {
      return jsonResponse(sourceAccess.statusCode || 403, { error: 'Нет прав читать проект-источник.' })
    }

    const sourceMembers = await loadProjectMembersWithRelations({ supabase, projectId: sourceProjectId })

    if (options.replace_existing) {
      const { error: deleteError } = await supabase
        .from('sup_project_member_relations')
        .delete()
        .eq('project_id', targetProjectId)

      if (deleteError) {
        return jsonResponse(500, {
          error: 'Не удалось очистить текущую структуру доступа.',
          details: deleteError.message,
        })
      }
    }

    const memberRows = sourceMembers.map((member) => ({
      project_id: targetProjectId,
      user_id: member.user_id,
      position_title: member.position_title,
      access_level: options.import_roles === false
        ? member.access_level
        : accessLevelFromRole(member.role_in_project),
    }))

    if (memberRows.length > 0) {
      const { error: memberError } = await supabase
        .from('sup_project_members')
        .upsert(memberRows, { onConflict: 'project_id,user_id' })

      if (memberError) {
        return jsonResponse(500, {
          error: 'Не удалось импортировать участников.',
          details: memberError.message,
        })
      }
    }

    const importedUserIds = new Set(sourceMembers.map((member) => member.user_id))
    const relationRows = sourceMembers.map((member) => ({
      project_id: targetProjectId,
      user_id: member.user_id,
      manager_user_id: options.import_relations === false || !importedUserIds.has(member.manager_user_id)
        ? null
        : member.manager_user_id,
      role_in_project: options.import_roles === false ? 'member' : member.role_in_project,
      task_visibility: options.import_task_visibility === false ? 'own' : member.task_visibility,
      updated_at: new Date().toISOString(),
    }))

    if (relationRows.length > 0) {
      const { error: relationError } = await supabase
        .from('sup_project_member_relations')
        .upsert(relationRows, { onConflict: 'project_id,user_id' })

      if (relationError) {
        return jsonResponse(500, {
          error: 'Не удалось импортировать структуру доступа.',
          details: relationError.message,
        })
      }
    }

    return jsonResponse(200, {
      success: true,
      imported_members: sourceMembers.length,
    })
  } catch (error) {
    return jsonResponse(500, {
      error: 'Внутренняя ошибка сервера.',
      details: error.message,
    })
  }
}
