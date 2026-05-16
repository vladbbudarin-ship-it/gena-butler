import { useEffect, useMemo, useState } from 'react'
import {
  getProjectAccessTree,
  removeSupProjectMember,
  updateSupProjectMember,
} from '../lib/api'

const accessLabels = {
  admin: 'Администратор',
  manager: 'Менеджер',
  member: 'Участник',
  viewer: 'Наблюдатель',
}

const groupLabels = {
  admin: 'Администраторы',
  manager: 'Менеджеры',
  member: 'Участники',
  viewer: 'Наблюдатели',
}

const rightsLabels = {
  admin: 'Полный доступ',
  manager: 'Управление задачами',
  member: 'Свои и общие задачи',
  viewer: 'Только просмотр',
}

const roleHelp = {
  admin: 'Полный управляющий проекта. Может редактировать проект, менять AI-контекст, добавлять и удалять участников, менять их должности и доступ, создавать и редактировать задачи, принимать задачи или возвращать на доработку.',
  manager: 'Работает с задачами. Может создавать и редактировать задачи, назначать исполнителей, менять статусы задач, принимать задачи или возвращать их на доработку. Но управление участниками и настройками проекта обычно остаётся у администратора.',
  member: 'Обычный исполнитель внутри проекта. Видит доступные ему задачи, может работать со своими задачами, писать комментарии, добавлять дополнения и нажимать «Выполнено» по задаче, где он назначен исполнителем. Не управляет проектом и участниками.',
  viewer: 'Режим просмотра. Может видеть проект и доступные задачи, но не должен создавать, редактировать или менять статусы. Это роль “посмотреть, быть в курсе”.',
}

const roleOrder = ['admin', 'manager', 'member', 'viewer']

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
    accessLabels[member.access_level],
  ].some((value) => normalize(value).includes(search))
}

function getAdminCount(members) {
  return members.filter((member) => member.access_level === 'admin').length
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
  const [busyUserId, setBusyUserId] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [activeHelp, setActiveHelp] = useState(null)
  const [editingUserId, setEditingUserId] = useState(null)
  const [editForm, setEditForm] = useState({
    positionTitle: '',
    accessLevel: 'member',
  })
  const [expandedGroups, setExpandedGroups] = useState({
    admin: true,
    manager: true,
    member: true,
    viewer: false,
  })

  async function loadTree() {
    if (!projectId) {
      setMembers([])
      return
    }

    try {
      setLoading(true)
      const result = await getProjectAccessTree(projectId)
      setMembers(result.members || [])
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

  const filteredMembers = useMemo(() => (
    members.filter((member) => (
      (roleFilter === 'all' || member.access_level === roleFilter)
      && memberMatchesSearch(member, search)
    ))
  ), [members, roleFilter, search])

  const groupedMembers = useMemo(() => {
    const groups = {
      admin: [],
      manager: [],
      member: [],
      viewer: [],
    }

    for (const member of filteredMembers) {
      const key = roleOrder.includes(member.access_level) ? member.access_level : 'member'
      groups[key].push(member)
    }

    for (const group of Object.values(groups)) {
      group.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))
    }

    return groups
  }, [filteredMembers])

  const stats = useMemo(() => ({
    total: members.length,
    admin: members.filter((member) => member.access_level === 'admin').length,
    manager: members.filter((member) => member.access_level === 'manager').length,
    member: members.filter((member) => member.access_level === 'member').length,
    viewer: members.filter((member) => member.access_level === 'viewer').length,
  }), [members])

  function startEdit(member) {
    setEditingUserId(member.user_id)
    setEditForm({
      positionTitle: member.position_title || '',
      accessLevel: member.access_level || 'member',
    })
  }

  async function handleSaveMember(member) {
    if (!canManageProject) {
      return
    }

    try {
      setBusyUserId(member.user_id)
      await updateSupProjectMember({
        projectId,
        userId: member.user_id,
        positionTitle: editForm.positionTitle,
        accessLevel: editForm.accessLevel,
      })
      setEditingUserId(null)
      await loadTree()
      await onChanged?.()
      onMessage?.('Доступ участника обновлён.')
    } catch (error) {
      onMessage?.(error.message)
    } finally {
      setBusyUserId(null)
    }
  }

  async function handleRemoveMember(member) {
    if (!canManageProject) {
      return
    }

    if (member.access_level === 'admin' && getAdminCount(members) <= 1) {
      onMessage?.('Нельзя удалить последнего администратора проекта.')
      return
    }

    if (!window.confirm('Удалить участника из проекта?')) {
      return
    }

    try {
      setBusyUserId(member.user_id)
      await removeSupProjectMember({
        projectId,
        userId: member.user_id,
      })
      await loadTree()
      await onChanged?.()
      onMessage?.('Участник удалён из проекта.')
    } catch (error) {
      onMessage?.(error.message)
    } finally {
      setBusyUserId(null)
    }
  }

  function toggleGroup(groupId) {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }))
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
          <p>Структура участников проекта и их права доступа.</p>
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
                {[['all', 'Все'], ...roleOrder.map((role) => [role, groupLabels[role]])].map(([value, label]) => (
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

      <div className="access-table-card">
        {loading ? (
          <p className="notice">Загрузка дерева доступа...</p>
        ) : (
          <>
            <div className="access-table-head" aria-hidden="true">
              <span>Пользователь / роль</span>
              <span>Должность</span>
              <span>Уровень доступа</span>
              <span>Доступ к проекту</span>
              <span>Права</span>
              <span>Статус</span>
              <span>Действия</span>
            </div>

            <div className="access-table-body">
              {filteredMembers.length === 0 && (
                <p className="notice access-empty">Участники не найдены</p>
              )}

              {roleOrder.map((role) => {
                const group = groupedMembers[role]
                const isExpanded = expandedGroups[role]

                if (roleFilter !== 'all' && roleFilter !== role) {
                  return null
                }

                if (group.length === 0 && search) {
                  return null
                }

                return (
                  <div className="access-group" key={role}>
                    <button className="access-group-head" type="button" onClick={() => toggleGroup(role)}>
                      <span>{isExpanded ? '⌄' : '›'}</span>
                      <strong>{groupLabels[role]}</strong>
                      <em>{group.length || 'Нет участников'}</em>
                    </button>

                    {isExpanded && group.length > 0 && (
                      <div className="access-group-rows">
                        {group.map((member) => {
                          const isEditing = editingUserId === member.user_id

                          return (
                            <div className="access-member-row" key={member.user_id}>
                              <div className="access-person-cell">
                                <span className="access-avatar">{getInitials(member)}</span>
                                <span>
                                  <strong>{member.name || 'Пользователь'}</strong>
                                  <small>{getIdentity(member)}</small>
                                </span>
                              </div>

                              <div data-label="Должность">
                                {isEditing ? (
                                  <input
                                    value={editForm.positionTitle}
                                    onChange={(event) => setEditForm((current) => ({ ...current, positionTitle: event.target.value }))}
                                    placeholder="Без должности"
                                  />
                                ) : (
                                  <span>{member.position_title || 'Без должности'}</span>
                                )}
                              </div>

                              <div data-label="Уровень доступа">
                                {isEditing ? (
                                  <select
                                    value={editForm.accessLevel}
                                    onChange={(event) => setEditForm((current) => ({ ...current, accessLevel: event.target.value }))}
                                  >
                                    {roleOrder.map((value) => (
                                      <option key={value} value={value}>{accessLabels[value]}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className={`access-role-badge access-role-${member.access_level}`} title={roleHelp[member.access_level]}>
                                    <button
                                      type="button"
                                      onClick={() => setActiveHelp((current) => current === member.user_id ? null : member.user_id)}
                                    >
                                      {accessLabels[member.access_level] || member.access_level}
                                    </button>
                                    {activeHelp === member.user_id && (
                                      <span className="access-role-help">{roleHelp[member.access_level]}</span>
                                    )}
                                  </span>
                                )}
                              </div>

                              <div data-label="Доступ к проекту">Текущий проект</div>
                              <div data-label="Права">{rightsLabels[member.access_level] || 'Базовый доступ'}</div>
                              <div data-label="Статус"><span className="access-status">Активен</span></div>

                              <div className="access-actions" data-label="Действия">
                                {canManageProject ? (
                                  isEditing ? (
                                    <>
                                      <button type="button" onClick={() => handleSaveMember(member)} disabled={busyUserId === member.user_id}>
                                        Сохранить
                                      </button>
                                      <button className="secondary" type="button" onClick={() => setEditingUserId(null)} disabled={busyUserId === member.user_id}>
                                        Отмена
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button className="secondary" type="button" onClick={() => startEdit(member)}>
                                        Изменить
                                      </button>
                                      <button className="danger ghost" type="button" onClick={() => handleRemoveMember(member)} disabled={busyUserId === member.user_id}>
                                        Удалить
                                      </button>
                                    </>
                                  )
                                ) : (
                                  <span className="access-muted-action">Нет действий</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {isExpanded && group.length === 0 && !search && (
                      <p className="notice access-empty">Нет участников</p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="access-stats">
          <span>Всего: {stats.total} участников</span>
          <span>Администраторы: {stats.admin}</span>
          <span>Менеджеры: {stats.manager}</span>
          <span>Участники: {stats.member}</span>
          <span>Наблюдатели: {stats.viewer}</span>
        </div>
      </div>
    </section>
  )
}
