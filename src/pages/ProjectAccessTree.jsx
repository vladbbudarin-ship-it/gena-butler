import { useEffect, useMemo, useState } from 'react'
import {
  getProjectAccessTree,
  updateProjectMemberAccess,
  updateProjectMemberManager,
  updateSupProjectMember,
} from '../lib/api'

const accessLabels = {
  admin: 'Администратор',
  manager: 'Менеджер',
  member: 'Участник',
  viewer: 'Наблюдатель',
}

const roleLabels = {
  owner: 'Владелец',
  manager: 'Руководитель',
  member: 'Участник',
  observer: 'Наблюдатель',
}

const taskVisibilityLabels = {
  own: 'Только свои задачи',
  own_and_subordinates: 'Свои + подчинённые',
  subtree: 'Вся ветка подчинения',
  project: 'Все задачи проекта',
  custom: 'Индивидуально',
}

const accessToRole = {
  admin: 'owner',
  manager: 'manager',
  member: 'member',
  viewer: 'observer',
}

function getInitials(member) {
  const value = member.name || member.public_id || member.email || 'Пользователь'
  const parts = value.trim().split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return value.slice(0, 2).toUpperCase()
}

function getIdentity(member) {
  return member.email || (member.public_id ? `ID ${member.public_id}` : 'ID не указан')
}

function normalize(value) {
  return String(value || '').toLowerCase().trim()
}

function getMemberName(member) {
  return member?.name || member?.public_id || 'Пользователь'
}

function memberMatchesSearch(member, query) {
  const search = normalize(query)

  if (!search) {
    return true
  }

  return [
    member.name,
    member.email,
    member.public_id,
    member.position_title,
    member.access_level,
    member.role_in_project,
    accessLabels[member.access_level],
    roleLabels[member.role_in_project],
  ].some((value) => normalize(value).includes(search))
}

function buildTree(members) {
  const byId = new Map()

  for (const member of members) {
    byId.set(member.user_id, {
      ...member,
      children: [],
    })
  }

  const roots = []

  for (const node of byId.values()) {
    if (node.manager_user_id && byId.has(node.manager_user_id) && node.manager_user_id !== node.user_id) {
      byId.get(node.manager_user_id).children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => getMemberName(a).localeCompare(getMemberName(b), 'ru'))
    nodes.forEach((node) => sortNodes(node.children))
  }

  sortNodes(roots)

  return roots
}

function filterTree(nodes, query, roleFilter) {
  return nodes
    .map((node) => {
      const children = filterTree(node.children || [], query, roleFilter)
      const matchesRole = roleFilter === 'all' || node.access_level === roleFilter || node.role_in_project === roleFilter
      const matchesSearch = memberMatchesSearch(node, query)

      if ((matchesRole && matchesSearch) || children.length > 0) {
        return {
          ...node,
          children,
        }
      }

      return null
    })
    .filter(Boolean)
}

function collectUserIds(nodes, result = []) {
  for (const node of nodes) {
    result.push(node.user_id)
    collectUserIds(node.children || [], result)
  }

  return result
}

function getDirectReports(members, userId) {
  return members
    .filter((member) => member.manager_user_id === userId)
    .sort((a, b) => getMemberName(a).localeCompare(getMemberName(b), 'ru'))
}

function getManagerName(membersById, managerUserId) {
  if (!managerUserId) {
    return 'Без руководителя'
  }

  return getMemberName(membersById.get(managerUserId))
}

function TreeNode({ node, depth, selectedUserId, expandedIds, onToggle, onSelect }) {
  const isExpanded = expandedIds.has(node.user_id)
  const hasChildren = (node.children || []).length > 0

  return (
    <div className="access-hierarchy-node">
      <button
        className={`access-tree-node${selectedUserId === node.user_id ? ' active' : ''}`}
        style={{ '--depth': depth }}
        type="button"
        onClick={() => onSelect(node.user_id)}
      >
        <span className="access-tree-indent" aria-hidden="true" />
        <span className="access-avatar">{getInitials(node)}</span>
        <span className="access-tree-copy">
          <strong>{getMemberName(node)}</strong>
          <small>{node.position_title || 'Без должности'}</small>
        </span>
        <span className={`access-role-badge access-role-${node.access_level}`}>
          <span>{roleLabels[node.role_in_project] || accessLabels[node.access_level] || 'Участник'}</span>
        </span>
        <span className="access-task-count">{node.accessible_task_count || 0} задач</span>
      </button>

      {hasChildren && (
        <button className="access-tree-toggle" type="button" onClick={() => onToggle(node.user_id)}>
          {isExpanded ? 'Свернуть ветку' : `Показать подчинённых (${node.children.length})`}
        </button>
      )}

      {hasChildren && isExpanded && (
        <div className="access-tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.user_id}
              node={child}
              depth={depth + 1}
              selectedUserId={selectedUserId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProjectAccessTree({
  projectId,
  canManageProject = false,
  onAddMemberClick,
  onMessage,
  onChanged,
}) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [editForm, setEditForm] = useState({
    managerUserId: '',
    positionTitle: '',
    accessLevel: 'member',
    roleInProject: 'member',
    taskVisibility: 'own',
  })

  async function loadTree() {
    if (!projectId) {
      setMembers([])
      return
    }

    try {
      setLoading(true)
      const result = await getProjectAccessTree(projectId)
      const nextMembers = result.members || []
      const roots = buildTree(nextMembers)
      setMembers(nextMembers)
      setExpandedIds(new Set(collectUserIds(roots)))

      const nextSelectedId = selectedUserId && nextMembers.some((member) => member.user_id === selectedUserId)
        ? selectedUserId
        : nextMembers[0]?.user_id || null
      setSelectedUserId(nextSelectedId)
    } catch (error) {
      setMembers([])
      onMessage?.(error.message || 'Не удалось загрузить дерево доступа.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTree()
  }, [projectId])

  const membersById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members])
  const selectedMember = selectedUserId ? membersById.get(selectedUserId) : null
  const directReports = useMemo(() => getDirectReports(members, selectedUserId), [members, selectedUserId])
  const tree = useMemo(() => filterTree(buildTree(members), search, roleFilter), [members, search, roleFilter])

  const stats = useMemo(() => ({
    total: members.length,
    roots: members.filter((member) => !member.manager_user_id || !membersById.has(member.manager_user_id)).length,
    managers: members.filter((member) => getDirectReports(members, member.user_id).length > 0).length,
  }), [members, membersById])

  useEffect(() => {
    if (!selectedMember) {
      return
    }

    setEditForm({
      managerUserId: selectedMember.manager_user_id || '',
      positionTitle: selectedMember.position_title || '',
      accessLevel: selectedMember.access_level || 'member',
      roleInProject: selectedMember.role_in_project || accessToRole[selectedMember.access_level] || 'member',
      taskVisibility: selectedMember.task_visibility || 'own',
    })
  }, [selectedMember])

  function toggleNode(userId) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  async function handleSaveSelected() {
    if (!canManageProject || !selectedMember) {
      return
    }

    try {
      setBusy(true)
      await updateProjectMemberManager({
        projectId,
        userId: selectedMember.user_id,
        managerUserId: editForm.managerUserId || null,
      })
      await updateProjectMemberAccess({
        projectId,
        userId: selectedMember.user_id,
        roleInProject: editForm.roleInProject,
        taskVisibility: editForm.taskVisibility,
      })
      await updateSupProjectMember({
        projectId,
        userId: selectedMember.user_id,
        positionTitle: editForm.positionTitle,
        accessLevel: editForm.accessLevel,
      })
      await loadTree()
      await onChanged?.()
      onMessage?.('Структура доступа обновлена.')
    } catch (error) {
      onMessage?.(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (!projectId) {
    return (
      <section className="project-access-tree">
        <p className="notice">Выберите проект, чтобы увидеть дерево доступа.</p>
      </section>
    )
  }

  return (
    <section className="project-access-tree">
      <div className="access-hero">
        <div>
          <h3>Дерево доступа</h3>
          <p>Структура подчинения участников проекта и их доступ к задачам.</p>
        </div>

        <div className="access-toolbar">
          <label className="access-search">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по участникам"
            />
          </label>

          <div className="access-filter-wrap">
            <button className="secondary" type="button" onClick={() => setShowFilters((current) => !current)}>
              Фильтры
            </button>
            {showFilters && (
              <div className="access-filter-menu">
                {[
                  ['all', 'Все'],
                  ['admin', 'Администраторы'],
                  ['manager', 'Менеджеры'],
                  ['member', 'Участники'],
                  ['viewer', 'Наблюдатели'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={roleFilter === value ? 'active' : 'secondary'}
                    type="button"
                    onClick={() => {
                      setRoleFilter(value)
                      setShowFilters(false)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {canManageProject && (
            <button type="button" onClick={onAddMemberClick}>
              + Добавить участника
            </button>
          )}
        </div>
      </div>

      <div className="access-subordination-layout">
        <div className="access-tree-card">
          <div className="access-tree-card-head">
            <strong>Структура проекта</strong>
            <small>Прокручивается внутри блока, если дерево широкое или длинное.</small>
          </div>

          {loading ? (
            <p className="notice">Загрузка дерева доступа...</p>
          ) : tree.length === 0 ? (
            <p className="notice">Участники не найдены.</p>
          ) : (
            <div className="access-tree-scroll">
              <div className="access-root-label">Без руководителя</div>
              {tree.map((node) => (
                <TreeNode
                  key={node.user_id}
                  node={node}
                  depth={0}
                  selectedUserId={selectedUserId}
                  expandedIds={expandedIds}
                  onToggle={toggleNode}
                  onSelect={setSelectedUserId}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="access-user-card">
          <strong>Карточка участника</strong>

          {!selectedMember ? (
            <p className="notice">Выберите участника в дереве.</p>
          ) : (
            <>
              <div className="access-selected-person">
                <span className="access-avatar">{getInitials(selectedMember)}</span>
                <div>
                  <h4>{getMemberName(selectedMember)}</h4>
                  <p>{getIdentity(selectedMember)}</p>
                </div>
              </div>

              <dl>
                <dt>Текущий руководитель</dt>
                <dd>{getManagerName(membersById, selectedMember.manager_user_id)}</dd>

                <dt>Прямые подчинённые</dt>
                <dd>{directReports.length > 0 ? directReports.map(getMemberName).join(', ') : 'Нет подчинённых'}</dd>

                <dt>Роль в проекте</dt>
                <dd>{roleLabels[selectedMember.role_in_project] || accessLabels[selectedMember.access_level]}</dd>

                <dt>Видимость задач</dt>
                <dd>{taskVisibilityLabels[selectedMember.task_visibility] || taskVisibilityLabels.own}</dd>
              </dl>

              {canManageProject ? (
                <div className="access-edit-form">
                  <label>
                    <span>Руководитель</span>
                    <select
                      value={editForm.managerUserId}
                      onChange={(event) => setEditForm((current) => ({ ...current, managerUserId: event.target.value }))}
                    >
                      <option value="">Без руководителя</option>
                      {members
                        .filter((member) => member.user_id !== selectedMember.user_id)
                        .map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {getMemberName(member)}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label>
                    <span>Должность</span>
                    <input
                      value={editForm.positionTitle}
                      onChange={(event) => setEditForm((current) => ({ ...current, positionTitle: event.target.value }))}
                      placeholder="Без должности"
                    />
                  </label>

                  <label>
                    <span>Роль в проекте</span>
                    <select
                      value={editForm.roleInProject}
                      onChange={(event) => {
                        const role = event.target.value
                        const accessLevel = role === 'owner'
                          ? 'admin'
                          : role === 'observer'
                            ? 'viewer'
                            : role
                        setEditForm((current) => ({ ...current, roleInProject: role, accessLevel }))
                      }}
                    >
                      {Object.entries(roleLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Доступ к задачам</span>
                    <select
                      value={editForm.taskVisibility}
                      onChange={(event) => setEditForm((current) => ({ ...current, taskVisibility: event.target.value }))}
                    >
                      {Object.entries(taskVisibilityLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <button type="button" onClick={handleSaveSelected} disabled={busy}>
                    Сохранить
                  </button>
                </div>
              ) : (
                <p className="notice">Управлять деревом может только владелец или администратор проекта.</p>
              )}
            </>
          )}
        </aside>
      </div>

      <div className="access-stats">
        <span>Всего: {stats.total} участников</span>
        <span>Без руководителя: {stats.roots}</span>
        <span>Руководителей: {stats.managers}</span>
      </div>
    </section>
  )
}
