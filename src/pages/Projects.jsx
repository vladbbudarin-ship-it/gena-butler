import { useEffect, useMemo, useState } from 'react'
import {
  addSupProjectMember,
  addSupTaskComment,
  addSupTaskUpdate,
  createSupAiSuggestion,
  createSupProject,
  createSupTask,
  deleteSupProject,
  getMyProfile,
  getSupProjectDetails,
  getSupProjects,
  getSupTaskDetails,
  removeSupProjectMember,
  setSupTaskStatus,
  updateSupProject,
  updateSupProjectMember,
  updateSupTask,
  uploadSupTaskFile,
} from '../lib/api'

const projectStatusLabels = {
  active: 'Активен',
  paused: 'Пауза',
  done: 'Готов',
  archived: 'Архив',
}

const taskStatusLabels = {
  todo: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  needs_changes: 'Нужны правки',
  done: 'Готово',
  cancelled: 'Отменена',
}

const priorityLabels = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный',
}

const visibilityLabels = {
  project_public: 'Всем участникам',
  assigned_only: 'Исполнителю и управлению',
  custom: 'Выбранным людям',
}

const accessLabels = {
  admin: 'Администратор',
  manager: 'Менеджер',
  member: 'Участник',
  viewer: 'Наблюдатель',
}

const accessHelp = {
  admin: 'Полный управляющий проекта. Может редактировать проект, менять AI-контекст, добавлять и удалять участников, менять их должности и доступ, создавать и редактировать задачи, принимать задачи или возвращать на доработку.',
  manager: 'Работает с задачами. Может создавать и редактировать задачи, назначать исполнителей, менять статусы задач, принимать задачи или возвращать их на доработку. Но управление участниками и настройками проекта обычно остаётся у администратора.',
  member: 'Обычный исполнитель внутри проекта. Видит доступные ему задачи, может работать со своими задачами, писать комментарии, добавлять дополнения и нажимать «Выполнено» по задаче, где он назначен исполнителем. Не управляет проектом и участниками.',
  viewer: 'Режим просмотра. Может видеть проект и доступные задачи, но не должен создавать, редактировать или менять статусы. Это роль “посмотреть, быть в курсе”.',
}

const projectTabs = [
  { id: 'overview', label: 'Обзор' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'members', label: 'Участники' },
  { id: 'files', label: 'Файлы' },
  { id: 'ai', label: 'AI-контекст' },
]

function ProjectStatusPill({ status }) {
  return (
    <span className={`status-pill sup-status-${status || 'active'}`}>
      {projectStatusLabels[status] || status || 'Активен'}
    </span>
  )
}

function formatDate(value) {
  if (!value) {
    return 'Без срока'
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDateTime(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getProfileName(profile) {
  return profile?.name || profile?.public_id || profile?.email || 'Пользователь'
}

function isPrivilegedProfile(profile, user) {
  return ['user_plus', 'owner', 'admin'].includes(profile?.role)
    || ['user_plus', 'owner'].includes(profile?.account_type)
    || user?.email === import.meta.env.VITE_OWNER_EMAIL
}

function getMyAccess(projectDetails, profile, user) {
  if (user?.email === import.meta.env.VITE_OWNER_EMAIL || ['owner', 'admin'].includes(profile?.role) || profile?.account_type === 'owner') {
    return 'admin'
  }

  return projectDetails?.members?.find((member) => member.user_id === profile?.id)?.access_level || 'none'
}

export default function Projects({ user, onBack }) {
  const [profile, setProfile] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [projectDetails, setProjectDetails] = useState(null)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [taskDetails, setTaskDetails] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [showPlusGuide, setShowPlusGuide] = useState(false)
  const [activeRoleHelp, setActiveRoleHelp] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [createProjectForm, setCreateProjectForm] = useState({
    title: '',
    description: '',
    status: 'active',
    aiContext: '',
  })
  const [projectForm, setProjectForm] = useState({
    title: '',
    description: '',
    status: 'active',
    aiContext: '',
  })
  const [memberForm, setMemberForm] = useState({
    publicId: '',
    positionTitle: '',
    accessLevel: 'member',
  })
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'normal',
    visibility: 'project_public',
    assigneeId: '',
    dueDate: '',
  })
  const [taskUpdateText, setTaskUpdateText] = useState('')
  const [commentText, setCommentText] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')

  const canCreate = isPrivilegedProfile(profile, user)
  const showPlusUpsell = profile?.account_type === 'user' && !canCreate
  const myAccess = getMyAccess(projectDetails, profile, user)
  const canManageProject = myAccess === 'admin'
  const canManageTasks = canCreate && ['admin', 'manager'].includes(myAccess)
  const canDeleteProject = canManageProject
  const selectedTask = taskDetails?.task
  const canCompleteTask = selectedTask?.assignee_id === profile?.id && !['done', 'review'].includes(selectedTask?.status)
  const canReviewTask = selectedTask && (selectedTask.created_by === profile?.id || ['admin', 'manager'].includes(myAccess))

  const projectMembers = projectDetails?.members || []
  const memberOptions = useMemo(() => projectMembers.map((member) => ({
    id: member.user_id,
    label: getProfileName(member.profile),
  })), [projectMembers])

  async function loadProjects(nextSelectedId = selectedProjectId) {
    const data = await getSupProjects()
    setProjects(data)

    const nextId = nextSelectedId || data[0]?.id || null
    setSelectedProjectId(nextId)

    if (nextId) {
      await loadProjectDetails(nextId)
    } else {
      setProjectDetails(null)
      setTaskDetails(null)
    }
  }

  async function loadProjectDetails(projectId) {
    const details = await getSupProjectDetails(projectId)
    setProjectDetails(details)
    setProjectForm({
      title: details.project.title || '',
      description: details.project.description || '',
      status: details.project.status || 'active',
      aiContext: details.project.ai_context || '',
    })

    if (details.tasks.length > 0) {
      const nextTaskId = selectedTaskId && details.tasks.some((task) => task.id === selectedTaskId)
        ? selectedTaskId
        : details.tasks[0].id
      setSelectedTaskId(nextTaskId)
      await loadTaskDetails(nextTaskId)
    } else {
      setSelectedTaskId(null)
      setTaskDetails(null)
    }
  }

  async function loadTaskDetails(taskId) {
    const details = await getSupTaskDetails(taskId)
    setTaskDetails(details)
    setTaskForm({
      title: details.task.title || '',
      description: details.task.description || '',
      status: details.task.status || 'todo',
      priority: details.task.priority || 'normal',
      visibility: details.task.visibility || 'project_public',
      assigneeId: details.task.assignee_id || '',
      dueDate: details.task.due_date || '',
    })
  }

  async function refresh() {
    try {
      setMessage('')
      await loadProjects(selectedProjectId)
    } catch (error) {
      setMessage(error.message)
    }
  }

  useEffect(() => {
    async function init() {
      try {
        setLoading(true)
        setMessage('')
        const profileData = await getMyProfile()
        setProfile(profileData)
        const data = await getSupProjects()
        setProjects(data)
        if (data[0]?.id) {
          setSelectedProjectId(data[0].id)
          await loadProjectDetails(data[0].id)
        }
      } catch (error) {
        setMessage(error.message)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  async function handleCreateProject(event) {
    event.preventDefault()
    if (!canCreate) {
      setMessage('Создавать проекты могут только user_plus и owner.')
      return
    }

    try {
      setBusy(true)
      setMessage('')
      const project = await createSupProject(createProjectForm)
      setCreateProjectForm({
        title: '',
        description: '',
        status: 'active',
        aiContext: '',
      })
      setShowCreateProject(false)
      await loadProjects(project.id)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  function resetTaskForm() {
    setTaskForm({
      title: '',
      description: '',
      status: 'todo',
      priority: 'normal',
      visibility: 'project_public',
      assigneeId: '',
      dueDate: '',
    })
  }

  async function handleUpdateProject(event) {
    event.preventDefault()
    if (!selectedProjectId) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await updateSupProject(selectedProjectId, projectForm)
      await loadProjectDetails(selectedProjectId)
      await loadProjects(selectedProjectId)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddMember(event) {
    event.preventDefault()
    try {
      setBusy(true)
      setMessage('')
      await addSupProjectMember({
        projectId: selectedProjectId,
        userPublicId: memberForm.publicId,
        positionTitle: memberForm.positionTitle,
        accessLevel: memberForm.accessLevel,
      })
      setMemberForm({ publicId: '', positionTitle: '', accessLevel: 'member' })
      await loadProjectDetails(selectedProjectId)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateTask(event) {
    event.preventDefault()
    try {
      setBusy(true)
      setMessage('')
      const task = await createSupTask({
        ...taskForm,
        projectId: selectedProjectId,
      })
      resetTaskForm()
      setShowCreateTask(false)
      setSelectedTaskId(task.id)
      await loadProjectDetails(selectedProjectId)
      await loadTaskDetails(task.id)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteProject() {
    if (!selectedProjectId || !canDeleteProject) {
      return
    }

    const confirmed = window.confirm('Удалить проект? Это действие нельзя отменить.')

    if (!confirmed) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await deleteSupProject(selectedProjectId)
      setSelectedProjectId(null)
      setProjectDetails(null)
      setSelectedTaskId(null)
      setTaskDetails(null)
      setMessage('Проект удалён.')
      await loadProjects(null)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateTask(event) {
    event.preventDefault()
    if (!selectedTaskId) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await updateSupTask(selectedTaskId, taskForm)
      await loadProjectDetails(selectedProjectId)
      await loadTaskDetails(selectedTaskId)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleTaskStatus(status) {
    try {
      setBusy(true)
      setMessage('')
      await setSupTaskStatus(selectedTaskId, status)
      await loadProjectDetails(selectedProjectId)
      await loadTaskDetails(selectedTaskId)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddUpdate(event) {
    event.preventDefault()
    if (!taskUpdateText.trim()) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await addSupTaskUpdate(selectedTaskId, taskUpdateText)
      setTaskUpdateText('')
      await loadTaskDetails(selectedTaskId)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddComment(event) {
    event.preventDefault()
    if (!commentText.trim()) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await addSupTaskComment(selectedTaskId, commentText)
      setCommentText('')
      await loadTaskDetails(selectedTaskId)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleTaskFile(event) {
    const file = event.target.files?.[0]
    if (!file || !selectedTaskId) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await uploadSupTaskFile(selectedTaskId, file)
      await loadTaskDetails(selectedTaskId)
    } catch (error) {
      setMessage(error.message)
    } finally {
      event.target.value = ''
      setBusy(false)
    }
  }

  async function handleAi(event) {
    event.preventDefault()
    if (!aiPrompt.trim() || !selectedProjectId) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await createSupAiSuggestion({
        projectId: selectedProjectId,
        taskId: selectedTaskId || null,
        prompt: aiPrompt,
      })
      setAiPrompt('')
      await loadProjectDetails(selectedProjectId)
      if (selectedTaskId) {
        await loadTaskDetails(selectedTaskId)
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sup-page">
      <section className="sup-hero">
        <img className="wordmark small light" src="/brand/gena-logo-white.png" alt="Гена" />
        <div className="sup-hero-actions">
          <button className="secondary" type="button" onClick={onBack}>Профиль</button>
          <button className="secondary" type="button" onClick={refresh}>Обновить</button>
          {canCreate && (
            <button type="button" onClick={() => setShowCreateProject(true)}>
              + Новый проект
            </button>
          )}
        </div>
      </section>

      {showPlusUpsell && (
        <section className={`sup-plus-card${showPlusGuide ? ' open' : ''}`}>
          <div className="sup-plus-card-main">
            <div>
              <h3>Подключить Пользователь+</h3>
              <p>Пользователь+ позволяет создавать проекты, задачи и управлять СУП.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPlusGuide((current) => !current)}
              aria-expanded={showPlusGuide}
            >
              Как подключить?
            </button>
          </div>

          {showPlusGuide && (
            <div className="sup-plus-guide">
              <h4>Как подключить Пользователь+</h4>
              <ol>
                <li>Получите одноразовый код у владельца сервиса.</li>
                <li>Убедитесь, что ваш Telegram привязан к аккаунту.</li>
                <li>Откройте Telegram-бота Дворецкого Гены.</li>
                <li>
                  Отправьте команду:
                  <code>/kodPlus Plus1234AB</code>
                  <span>где Plus1234AB — ваш одноразовый код.</span>
                </li>
                <li>После успешной активации обновите страницу.</li>
                <li>Во вкладке «Проекты» появятся возможности Пользователь+.</li>
              </ol>
              <p>Код одноразовый и действует ограниченное время. Если код не работает, запросите новый у владельца.</p>
            </div>
          )}
        </section>
      )}

      {message && <p className="notice danger">{message}</p>}

      <section className="sup-card">
        <div className="sup-shell">
          <aside className="sup-sidebar">
            <div className="sup-sidebar-head">
              <div>
                <span className="sup-kicker">Проекты</span>
                <strong>{projects.length}</strong>
              </div>
            </div>

            {loading && <p className="notice">Загрузка проектов...</p>}
            {!loading && projects.length === 0 && <p className="notice">Проектов пока нет</p>}

            <div className="sup-list">
              {projects.map((project) => {
                const isSelected = project.id === selectedProjectId
                const taskCount = isSelected ? projectDetails?.tasks?.length || 0 : project.task_count || project.tasks_count || 0

                return (
                  <button
                    key={project.id}
                    className={`sup-project-card${isSelected ? ' active' : ''}`}
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(project.id)
                      loadProjectDetails(project.id).catch((error) => setMessage(error.message))
                    }}
                  >
                    <span className="mini-avatar">{project.title.slice(0, 1).toUpperCase()}</span>
                    <span className="sup-project-copy">
                      <strong>{project.title}</strong>
                      <small>{project.description || 'Без описания'}</small>
                      <span>
                        <ProjectStatusPill status={project.status} />
                        <em>{taskCount} задач</em>
                      </span>
                    </span>
                    <span className="sup-open-label">Открыть</span>
                  </button>
                )
              })}
            </div>
          </aside>

          <main className="sup-main">
            {!projectDetails && !loading && (
              <div className="sup-empty">
                <h3>Выберите проект</h3>
                <p>Список проектов находится слева. Новый проект создаётся через кнопку вверху.</p>
              </div>
            )}

            {projectDetails && (
              <>
                <div className="sup-header">
                  <div>
                    <h3>{projectDetails.project.title}</h3>
                    <p>{projectDetails.project.description || 'Без описания'}</p>
                  </div>
                  <div className="sup-header-meta">
                    <ProjectStatusPill status={projectDetails.project.status} />
                    <span>{projectDetails.tasks.length} задач</span>
                    <span>{projectMembers.length} участников</span>
                    {canDeleteProject && (
                      <button
                        className="danger-outline sup-delete-project"
                        type="button"
                        onClick={handleDeleteProject}
                        disabled={busy}
                      >
                        Удалить проект
                      </button>
                    )}
                  </div>
                </div>

                <nav className="sup-tabs" aria-label="Разделы проекта">
                  {projectTabs.map((tab) => (
                    <button
                      key={tab.id}
                      className={activeTab === tab.id ? 'active' : 'secondary'}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>

                {activeTab === 'overview' && (
                  <div className="sup-grid">
                    <section className="dashboard-card">
                      <h4>Обзор проекта</h4>
                      {canManageProject ? (
                        <form className="sup-form" onSubmit={handleUpdateProject}>
                          <input
                            value={projectForm.title}
                            onChange={(event) => setProjectForm((current) => ({ ...current, title: event.target.value }))}
                          />
                          <textarea
                            value={projectForm.description}
                            onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
                            placeholder="Описание проекта"
                          />
                          <select
                            value={projectForm.status}
                            onChange={(event) => setProjectForm((current) => ({ ...current, status: event.target.value }))}
                          >
                            {Object.entries(projectStatusLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <button type="submit" disabled={busy}>Сохранить проект</button>
                        </form>
                      ) : (
                        <div className="sup-readonly">
                          <div>
                            <span>Название</span>
                            <strong>{projectDetails.project.title}</strong>
                          </div>
                          <div>
                            <span>Описание</span>
                            <p>{projectDetails.project.description || 'Без описания'}</p>
                          </div>
                          <div>
                            <span>Статус</span>
                            <ProjectStatusPill status={projectDetails.project.status} />
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="dashboard-card sup-summary-card">
                      <h4>Сводка</h4>
                      <div className="sup-stats">
                        <div><strong>{projectDetails.tasks.length}</strong><span>Задач</span></div>
                        <div><strong>{projectMembers.length}</strong><span>Участников</span></div>
                        <div><strong>{projectDetails.files.length}</strong><span>Файлов</span></div>
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'tasks' && (
                  <div className="sup-grid two">
                    <section className="dashboard-card">
                      <div className="sup-section-head">
                        <h4>Задачи</h4>
                        {canManageTasks && (
                          <button
                            className="danger sup-new-task-button"
                            type="button"
                            onClick={() => setShowCreateTask(true)}
                          >
                            + Новая задача
                          </button>
                        )}
                      </div>
                      <div className="sup-mini-list">
                        {projectDetails.tasks.map((task) => (
                          <button
                            type="button"
                            key={task.id}
                            className={`sup-task-card${task.id === selectedTaskId ? ' active' : ''}`}
                            onClick={() => {
                              setSelectedTaskId(task.id)
                              loadTaskDetails(task.id).catch((error) => setMessage(error.message))
                            }}
                          >
                            <strong>{task.title}</strong>
                            <span>{taskStatusLabels[task.status]} · {priorityLabels[task.priority]}</span>
                            <small>{visibilityLabels[task.visibility]} · {formatDate(task.due_date)}</small>
                          </button>
                        ))}
                      </div>

                      {canManageTasks && showCreateTask && (
                        <form className="sup-form compact" onSubmit={handleCreateTask}>
                          <h4>Новая задача</h4>
                          <input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} placeholder="Название задачи" />
                          <textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} placeholder="Описание" />
                          <select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}>
                            {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <select value={taskForm.visibility} onChange={(event) => setTaskForm((current) => ({ ...current, visibility: event.target.value }))}>
                            {Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <select value={taskForm.assigneeId} onChange={(event) => setTaskForm((current) => ({ ...current, assigneeId: event.target.value }))}>
                            <option value="">Без ответственного</option>
                            {memberOptions.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
                          </select>
                          <input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))} />
                          <div className="button-row">
                            <button type="submit" disabled={busy}>Создать задачу</button>
                            <button
                              className="secondary"
                              type="button"
                              onClick={() => {
                                resetTaskForm()
                                setShowCreateTask(false)
                              }}
                              disabled={busy}
                            >
                              Отмена
                            </button>
                          </div>
                        </form>
                      )}
                    </section>

                    <section className="dashboard-card">
                      <h4>Открытая задача</h4>
                      {!taskDetails && <p className="notice">Задача не выбрана</p>}
                      {taskDetails && (
                        <>
                          {canManageTasks ? (
                            <form className="sup-form" onSubmit={handleUpdateTask}>
                              <input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} />
                              <textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} />
                              <select value={taskForm.status} onChange={(event) => setTaskForm((current) => ({ ...current, status: event.target.value }))}>
                                {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                              <select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}>
                                {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                              <select value={taskForm.assigneeId} onChange={(event) => setTaskForm((current) => ({ ...current, assigneeId: event.target.value }))}>
                                <option value="">Без ответственного</option>
                                {memberOptions.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
                              </select>
                              <input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))} />
                              <button type="submit" disabled={busy}>Сохранить задачу</button>
                            </form>
                          ) : (
                            <div className="sup-readonly">
                              <div>
                                <span>Название</span>
                                <strong>{taskDetails.task.title}</strong>
                              </div>
                              <div>
                                <span>Описание</span>
                                <p>{taskDetails.task.description || 'Без описания'}</p>
                              </div>
                              <div>
                                <span>Статус</span>
                                <strong>{taskStatusLabels[taskDetails.task.status] || taskDetails.task.status}</strong>
                              </div>
                              <div>
                                <span>Приоритет</span>
                                <strong>{priorityLabels[taskDetails.task.priority] || taskDetails.task.priority}</strong>
                              </div>
                              <div>
                                <span>Ответственный</span>
                                <strong>{getProfileName(taskDetails.task.assignee)}</strong>
                              </div>
                              <div>
                                <span>Срок</span>
                                <strong>{formatDate(taskDetails.task.due_date)}</strong>
                              </div>
                            </div>
                          )}

                          {canCompleteTask && (
                            <div className="button-row">
                              <button type="button" onClick={() => handleTaskStatus('review')} disabled={busy}>Выполнено</button>
                            </div>
                          )}

                          {canReviewTask && (
                            <div className="task-decision-block">
                              <h5>Решение по задаче</h5>
                              <div className="task-decision-actions">
                                <button className="success" type="button" onClick={() => handleTaskStatus('done')} disabled={busy}>Принять задачу</button>
                                <button className="danger-outline" type="button" onClick={() => handleTaskStatus('needs_changes')} disabled={busy}>Вернуть на доработку</button>
                              </div>
                            </div>
                          )}

                          <div className="sup-mini-list">
                            {[...(taskDetails.updates || []).map((item) => ({ ...item, kind: 'Дополнение' })), ...(taskDetails.comments || []).map((item) => ({ ...item, kind: 'Комментарий' }))].map((item) => (
                              <div className="sup-row" key={`${item.kind}:${item.id}`}>
                                <div>
                                  <strong>{item.kind} · {getProfileName(item.profile)}</strong>
                                  <small>{formatDateTime(item.created_at)}</small>
                                  <p>{item.body}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          <form className="sup-form compact" onSubmit={handleAddUpdate}>
                            <textarea value={taskUpdateText} onChange={(event) => setTaskUpdateText(event.target.value)} placeholder="Дополнение к задаче" />
                            <button type="submit" disabled={busy}>Добавить дополнение</button>
                          </form>
                          <form className="sup-form compact" onSubmit={handleAddComment}>
                            <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Комментарий" />
                            <button className="secondary" type="submit" disabled={busy}>Комментировать</button>
                          </form>
                        </>
                      )}
                    </section>
                  </div>
                )}

                {activeTab === 'members' && (
                  <section className="dashboard-card">
                    <h4>Участники</h4>
                    <div className="sup-mini-list">
                      {projectMembers.map((member) => (
                        <div className="sup-row" key={member.user_id}>
                          <div>
                            <strong>{getProfileName(member.profile)}</strong>
                            <small>{member.position_title || 'Без должности'}</small>
                            <div className="role-help-wrap">
                              <button
                                className="role-help-trigger"
                                type="button"
                                title={accessHelp[member.access_level]}
                                onClick={() => setActiveRoleHelp((current) => current === member.user_id ? null : member.user_id)}
                                aria-expanded={activeRoleHelp === member.user_id}
                              >
                                {accessLabels[member.access_level]}
                              </button>
                              {activeRoleHelp === member.user_id && (
                                <p className="role-help-text">{accessHelp[member.access_level]}</p>
                              )}
                            </div>
                          </div>
                          {canManageProject && (
                            <div className="sup-row-actions">
                              <select
                                value={member.access_level}
                                onChange={(event) => updateSupProjectMember({
                                  projectId: selectedProjectId,
                                  userId: member.user_id,
                                  positionTitle: member.position_title,
                                  accessLevel: event.target.value,
                                }).then(() => loadProjectDetails(selectedProjectId)).catch((error) => setMessage(error.message))}
                              >
                                {Object.entries(accessLabels).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                              <button
                                className="danger ghost"
                                type="button"
                                onClick={() => removeSupProjectMember({ projectId: selectedProjectId, userId: member.user_id })
                                  .then(() => loadProjectDetails(selectedProjectId))
                                  .catch((error) => setMessage(error.message))}
                              >
                                Удалить
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {canManageProject && (
                      <form className="sup-form compact" onSubmit={handleAddMember}>
                        <input value={memberForm.publicId} onChange={(event) => setMemberForm((current) => ({ ...current, publicId: event.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="10-значный ID пользователя" inputMode="numeric" />
                        <input value={memberForm.positionTitle} onChange={(event) => setMemberForm((current) => ({ ...current, positionTitle: event.target.value }))} placeholder="Должность в проекте" />
                        <select value={memberForm.accessLevel} onChange={(event) => setMemberForm((current) => ({ ...current, accessLevel: event.target.value }))}>
                          {Object.entries(accessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <button type="submit" disabled={busy}>Добавить участника</button>
                      </form>
                    )}
                  </section>
                )}

                {activeTab === 'files' && (
                  <section className="dashboard-card">
                    <h4>Файлы</h4>
                    <div className="sup-file-actions">
                      {canManageTasks && (
                        <label className="file-control">
                          Файл задачи
                          <input type="file" onChange={handleTaskFile} disabled={busy || !selectedTaskId} />
                        </label>
                      )}
                    </div>
                    <div className="sup-mini-list">
                      {[...(projectDetails.files || []), ...(taskDetails?.files || [])].map((file) => (
                        <div className="sup-row" key={file.id}>
                          <div>
                            <strong>{file.file_name}</strong>
                            <small>{file.mime_type || 'Файл'}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {activeTab === 'ai' && (
                  <div className="sup-grid">
                    <section className="dashboard-card">
                      <h4>AI-контекст</h4>
                      {canManageProject ? (
                        <form className="sup-form" onSubmit={handleUpdateProject}>
                          <textarea
                            value={projectForm.aiContext}
                            onChange={(event) => setProjectForm((current) => ({ ...current, aiContext: event.target.value }))}
                            placeholder="Контекст проекта для AI"
                          />
                          <button type="submit" disabled={busy}>Сохранить контекст</button>
                        </form>
                      ) : (
                        <div className="sup-readonly">
                          <div>
                            <span>AI-контекст проекта</span>
                            <p>{projectDetails.project.ai_context || 'Контекст пока не заполнен.'}</p>
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="dashboard-card">
                      <h4>AI-помощник</h4>
                      {canCreate && (
                        <form className="sup-form" onSubmit={handleAi}>
                          <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Спросить AI по проекту или выбранной задаче" />
                          <button type="submit" disabled={busy}>Получить AI-предложение</button>
                        </form>
                      )}
                      <div className="sup-mini-list">
                        {[...(taskDetails?.suggestions || []), ...(projectDetails.suggestions || [])].map((item) => (
                          <div className="sup-row" key={item.id}>
                            <div>
                              <strong>AI · {formatDateTime(item.created_at)}</strong>
                              <small>{item.prompt}</small>
                              <p>{item.suggestion}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </section>

      {showCreateProject && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowCreateProject(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-label="Новый проект" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>Новый проект</h3>
              <button className="secondary icon" type="button" onClick={() => setShowCreateProject(false)}>×</button>
            </div>
            <form className="sup-form" onSubmit={handleCreateProject}>
              <input
                value={createProjectForm.title}
                onChange={(event) => setCreateProjectForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Название"
                disabled={!canCreate}
              />
              <textarea
                value={createProjectForm.description}
                onChange={(event) => setCreateProjectForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Описание"
                disabled={!canCreate}
              />
              <select
                value={createProjectForm.status}
                onChange={(event) => setCreateProjectForm((current) => ({ ...current, status: event.target.value }))}
                disabled={!canCreate}
              >
                {Object.entries(projectStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <textarea
                value={createProjectForm.aiContext}
                onChange={(event) => setCreateProjectForm((current) => ({ ...current, aiContext: event.target.value }))}
                placeholder="Контекст для ИИ"
                disabled={!canCreate}
              />
              <button type="submit" disabled={!canCreate || busy}>Создать</button>
              {!canCreate && <small>Создание доступно только user_plus и owner.</small>}
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
