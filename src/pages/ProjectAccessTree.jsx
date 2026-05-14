import { useEffect, useMemo, useState } from 'react'
import {
  getProjectAccessTree,
  importProjectAccessTree,
  updateProjectMemberAccess,
  updateProjectMemberManager,
} from '../lib/api'

const roleLabels = {
  owner: 'Владелец',
  manager: 'Руководитель',
  member: 'Участник',
  observer: 'Наблюдатель',
}

const visibilityLabels = {
  own: 'Только свои задачи',
  own_and_subordinates: 'Свои + задачи подчинённых',
  subtree: 'Вся ветка подчинения',
  project: 'Все задачи проекта',
  custom: 'Индивидуально',
}

function buildTree(members) {
  const byManager = {}

  for (const member of members) {
    const key = member.manager_user_id || 'root'

    if (!byManager[key]) {
      byManager[key] = []
    }

    byManager[key].push(member)
  }

  Object.values(byManager).forEach((items) => {
    items.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  })

  return byManager
}

function TreeBranch({ byManager, managerId = 'root', selectedUserId, onSelect, level = 0 }) {
  const members = byManager[managerId] || []

  if (members.length === 0) {
    return null
  }

  return (
    <div className="access-tree-branch">
      {members.map((member) => (
        <div key={member.user_id}>
          <button
            className={`access-tree-node${selectedUserId === member.user_id ? ' active' : ''}`}
            style={{ '--tree-level': level }}
            type="button"
            onClick={() => onSelect(member.user_id)}
          >
            <span>{member.name}</span>
            <small>{roleLabels[member.role_in_project] || member.role_in_project}</small>
            {member.children_count > 0 && <em>{member.children_count}</em>}
          </button>
          <TreeBranch
            byManager={byManager}
            managerId={member.user_id}
            selectedUserId={selectedUserId}
            onSelect={onSelect}
            level={level + 1}
          />
        </div>
      ))}
    </div>
  )
}

export default function ProjectAccessTree({
  projectId,
  projects = [],
  onMessage,
  onChanged,
}) {
  const [members, setMembers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [managerUserId, setManagerUserId] = useState('')
  const [roleInProject, setRoleInProject] = useState('member')
  const [taskVisibility, setTaskVisibility] = useState('own')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mobileTab, setMobileTab] = useState('tree')
  const [showImport, setShowImport] = useState(false)
  const [importForm, setImportForm] = useState({
    sourceProjectId: '',
    importRelations: true,
    importRoles: true,
    importTaskVisibility: true,
    replaceExisting: false,
  })

  const byManager = useMemo(() => buildTree(members), [members])
  const selectedMember = members.find((member) => member.user_id === selectedUserId) || members[0] || null
  const subordinates = selectedMember ? members.filter((member) => member.manager_user_id === selectedMember.user_id) : []
  const sourceProjects = projects.filter((project) => project.id !== projectId)

  async function loadTree() {
    if (!projectId) {
      return
    }

    try {
      setLoading(true)
      const result = await getProjectAccessTree(projectId)
      setMembers(result.members || [])

      const nextSelected = selectedUserId && result.members?.some((member) => member.user_id === selectedUserId)
        ? selectedUserId
        : result.members?.[0]?.user_id || null
      setSelectedUserId(nextSelected)
    } catch (error) {
      onMessage?.(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTree()
  }, [projectId])

  useEffect(() => {
    if (!selectedMember) {
      return
    }

    setManagerUserId(selectedMember.manager_user_id || '')
    setRoleInProject(selectedMember.role_in_project || 'member')
    setTaskVisibility(selectedMember.task_visibility || 'own')
  }, [selectedMember?.user_id])

  async function handleSave() {
    if (!selectedMember) {
      return
    }

    try {
      setBusy(true)
      await updateProjectMemberManager({
        projectId,
        userId: selectedMember.user_id,
        managerUserId: managerUserId || null,
      })
      await updateProjectMemberAccess({
        projectId,
        userId: selectedMember.user_id,
        roleInProject,
        taskVisibility,
      })
      await loadTree()
      await onChanged?.()
      onMessage?.('Структура проекта обновлена.')
    } catch (error) {
      onMessage?.(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(event) {
    event.preventDefault()

    if (!importForm.sourceProjectId) {
      onMessage?.('Выберите проект-источник.')
      return
    }

    const confirmed = window.confirm('Импорт изменит структуру доступа этого проекта. Задачи, сообщения и файлы не будут удалены.')

    if (!confirmed) {
      return
    }

    try {
      setBusy(true)
      await importProjectAccessTree({
        sourceProjectId: importForm.sourceProjectId,
        targetProjectId: projectId,
        options: {
          import_relations: importForm.importRelations,
          import_roles: importForm.importRoles,
          import_task_visibility: importForm.importTaskVisibility,
          replace_existing: importForm.replaceExisting,
        },
      })
      setShowImport(false)
      await loadTree()
      await onChanged?.()
      onMessage?.('Структура доступа импортирована.')
    } catch (error) {
      onMessage?.(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="notice">Загрузка структуры проекта...</p>
  }

  return (
    <section className="project-access-tree">
      <div className="sup-section-head">
        <div>
          <h4>Структура проекта</h4>
          <p>Управляйте подчинением и доступом к задачам.</p>
        </div>
        <button className="secondary" type="button" onClick={() => setShowImport(true)}>
          Импортировать дерево
        </button>
      </div>

      <div className="access-mobile-tabs">
        {[
          ['tree', 'Дерево'],
          ['user', 'Пользователь'],
          ['access', 'Доступы'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={mobileTab === id ? 'active' : 'secondary'}
            type="button"
            onClick={() => setMobileTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="access-tree-layout">
        <div className={`access-panel access-panel-tree ${mobileTab === 'tree' ? 'mobile-active' : ''}`}>
          <strong>Дерево</strong>
          <TreeBranch
            byManager={byManager}
            selectedUserId={selectedMember?.user_id}
            onSelect={setSelectedUserId}
          />
          {(byManager.root || []).length === 0 && <p className="notice">Участников без руководителя нет.</p>}
        </div>

        <div className={`access-panel ${mobileTab === 'user' ? 'mobile-active' : ''}`}>
          <strong>Пользователь</strong>
          {selectedMember ? (
            <div className="access-user-card">
              <h4>{selectedMember.name}</h4>
              <p>{selectedMember.position_title || 'Без должности'}</p>
              <span>{selectedMember.public_id || 'ID не указан'}</span>
              <dl>
                <dt>Роль</dt>
                <dd>{roleLabels[selectedMember.role_in_project]}</dd>
                <dt>Руководитель</dt>
                <dd>{members.find((member) => member.user_id === selectedMember.manager_user_id)?.name || 'Без руководителя'}</dd>
                <dt>Подчинённые</dt>
                <dd>{subordinates.length}</dd>
                <dt>Доступных задач</dt>
                <dd>{selectedMember.accessible_task_count}</dd>
              </dl>
              {selectedMember.public_id && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedMember.public_id)
                    onMessage?.('ID пользователя скопирован для открытия чата.')
                  }}
                >
                  Открыть чат
                </button>
              )}
            </div>
          ) : (
            <p className="notice">Выберите участника.</p>
          )}
        </div>

        <div className={`access-panel ${mobileTab === 'access' ? 'mobile-active' : ''}`}>
          <strong>Доступы</strong>
          {selectedMember && (
            <div className="sup-form compact">
              <label>
                Руководитель
                <select value={managerUserId} onChange={(event) => setManagerUserId(event.target.value)}>
                  <option value="">Без руководителя</option>
                  {members
                    .filter((member) => member.user_id !== selectedMember.user_id)
                    .map((member) => (
                      <option key={member.user_id} value={member.user_id}>{member.name}</option>
                    ))}
                </select>
              </label>
              <label>
                Роль в проекте
                <select value={roleInProject} onChange={(event) => setRoleInProject(event.target.value)}>
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Доступ к задачам
                <select value={taskVisibility} onChange={(event) => setTaskVisibility(event.target.value)}>
                  {Object.entries(visibilityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={handleSave} disabled={busy}>
                Сохранить
              </button>
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowImport(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-label="Импорт структуры" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Импортировать структуру из другого проекта</h3>
              <button className="secondary icon" type="button" onClick={() => setShowImport(false)}>×</button>
            </div>
            <form className="sup-form" onSubmit={handleImport}>
              <select
                value={importForm.sourceProjectId}
                onChange={(event) => setImportForm((current) => ({ ...current, sourceProjectId: event.target.value }))}
              >
                <option value="">Проект-источник</option>
                {sourceProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.title}</option>
                ))}
              </select>
              <label className="checkbox-row">
                <input type="checkbox" checked={importForm.importRelations} onChange={(event) => setImportForm((current) => ({ ...current, importRelations: event.target.checked }))} />
                структура подчинения
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={importForm.importRoles} onChange={(event) => setImportForm((current) => ({ ...current, importRoles: event.target.checked }))} />
                роли участников
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={importForm.importTaskVisibility} onChange={(event) => setImportForm((current) => ({ ...current, importTaskVisibility: event.target.checked }))} />
                правила видимости задач
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={importForm.replaceExisting} onChange={(event) => setImportForm((current) => ({ ...current, replaceExisting: event.target.checked }))} />
                заменить текущую структуру
              </label>
              <p className="notice">Импорт изменит структуру доступа этого проекта. Задачи, сообщения и файлы не будут удалены.</p>
              <div className="button-row">
                <button type="submit" disabled={busy}>Импортировать</button>
                <button className="secondary" type="button" onClick={() => setShowImport(false)} disabled={busy}>Отмена</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
