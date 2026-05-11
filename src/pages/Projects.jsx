import { useEffect, useMemo, useState } from 'react'
import {
  addSupProjectMember,
  addSupTaskComment,
  addSupTaskUpdate,
  createSupAiSuggestion,
  createSupProject,
  createSupTask,
  getMyProfile,
  getSupProjectDetails,
  getSupProjects,
  getSupTaskDetails,
  removeSupProjectMember,
  setSupTaskStatus,
  updateSupProject,
  updateSupProjectMember,
  updateSupTask,
  uploadSupProjectFile,
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
    || user?.email === import.meta.env.VITE_OWNER_EMAIL
}

function getMyAccess(projectDetails, profile, user) {
  if (user?.email === import.meta.env.VITE_OWNER_EMAIL || ['owner', 'admin'].includes(profile?.role)) {
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
  const myAccess = getMyAccess(projectDetails, profile, user)
  const canManageProject = myAccess === 'admin'
  const canManageTasks = canCreate && ['admin', 'manager'].includes(myAccess)
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
      const project = await createSupProject(projectForm)
      await loadProjects(project.id)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
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
      setSelectedTaskId(task.id)
      await loadProjectDetails(selectedProjectId)
      await loadTaskDetails(task.id)
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

  async function handleProjectFile(event) {
    const file = event.target.files?.[0]
    if (!file || !selectedProjectId) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await uploadSupProjectFile(selectedProjectId, file)
      await loadProjectDetails(selectedProjectId)
    } catch (error) {
      setMessage(error.message)
    } finally {
      event.target.value = ''
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
    <div className="page-stack sup-page">
      <section className="hero-card black">
        <img className="wordmark small light" src="/brand/gena-logo-white.png" alt="Гена" />
        <h2>СУП</h2>
        <p>Проекты, задачи, файлы и AI-контекст с доступом только для участников.</p>
      </section>

      <section className="hero-card sup-card">
        <div className="sup-shell">
          <aside className="sup-sidebar">
            <div className="chat-list-title">Проекты</div>
            <button className="secondary" type="button" onClick={onBack}>Профиль</button>
            <button className="secondary" type="button" onClick={refresh}>Обновить</button>

            {loading && <p className="notice">Загрузка проектов...</p>}
            {!loading && projects.length === 0 && <p className="notice">Проектов пока нет</p>}

            <div className="sup-list">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`chat-list-item${project.id === selectedProjectId ? ' active' : ''}`}
                  type="button"
                  onClick={() => {
                    setSelectedProjectId(project.id)
                    loadProjectDetails(project.id).catch((error) => setMessage(error.message))
                  }}
                >
                  <span className="mini-avatar">{project.title.slice(0, 1).toUpperCase()}</span>
                  <span className="chat-list-copy">
                    <strong>{project.title}</strong>
                    <small>{projectStatusLabels[project.status] || project.status}</small>
                  </span>
                </button>
              ))}
            </div>

            <form className="sup-form" onSubmit={handleCreateProject}>
              <h4>Новый проект</h4>
              <input
                value={projectForm.title}
                onChange={(event) => setProjectForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Название"
                disabled={!canCreate}
              />
              <textarea
                value={projectForm.description}
                onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Описание"
                disabled={!canCreate}
              />
              <button type="submit" disabled={!canCreate || busy}>Создать</button>
              {!canCreate && <small>Создание доступно только user_plus и owner.</small>}
            </form>
          </aside>

          <main className="sup-main">
            {message && <p className="notice danger">{message}</p>}

            {!projectDetails && !loading && (
              <p className="notice">Выберите проект или создайте новый.</p>
            )}

            {projectDetails && (
              <>
                <div className="sup-header">
                  <div>
                    <h3>{projectDetails.project.title}</h3>
                    <p>{projectDetails.project.description || 'Без описания'}</p>
                  </div>
                  <span className="status-pill">{projectStatusLabels[projectDetails.project.status]}</span>
                </div>

                <div className="sup-grid">
                  <section className="dashboard-card">
                    <h4>Проект</h4>
                    <form className="sup-form" onSubmit={handleUpdateProject}>
                      <input
                        value={projectForm.title}
                        onChange={(event) => setProjectForm((current) => ({ ...current, title: event.target.value }))}
                        disabled={!canManageProject}
                      />
                      <textarea
                        value={projectForm.description}
                        onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
                        placeholder="Описание проекта"
                        disabled={!canManageProject}
                      />
                      <select
                        value={projectForm.status}
                        onChange={(event) => setProjectForm((current) => ({ ...current, status: event.target.value }))}
                        disabled={!canManageProject}
                      >
                        {Object.entries(projectStatusLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <textarea
                        value={projectForm.aiContext}
                        onChange={(event) => setProjectForm((current) => ({ ...current, aiContext: event.target.value }))}
                        placeholder="Контекст для ИИ"
                        disabled={!canManageProject}
                      />
                      <button type="submit" disabled={!canManageProject || busy}>Сохранить проект</button>
                    </form>
                  </section>

                  <section className="dashboard-card">
                    <h4>Участники</h4>
                    <div className="sup-mini-list">
                      {projectMembers.map((member) => (
                        <div className="sup-row" key={member.user_id}>
                          <div>
                            <strong>{getProfileName(member.profile)}</strong>
                            <small>{member.position_title || 'Без должности'} · {accessLabels[member.access_level]}</small>
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
                      <form className="sup-form" onSubmit={handleAddMember}>
                        <input
                          value={memberForm.publicId}
                          onChange={(event) => setMemberForm((current) => ({ ...current, publicId: event.target.value.replace(/\D/g, '').slice(0, 10) }))}
                          placeholder="10-значный ID пользователя"
                          inputMode="numeric"
                        />
                        <input
                          value={memberForm.positionTitle}
                          onChange={(event) => setMemberForm((current) => ({ ...current, positionTitle: event.target.value }))}
                          placeholder="Должность в проекте"
                        />
                        <select
                          value={memberForm.accessLevel}
                          onChange={(event) => setMemberForm((current) => ({ ...current, accessLevel: event.target.value }))}
                        >
                          {Object.entries(accessLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <button type="submit" disabled={busy}>Добавить участника</button>
                      </form>
                    )}
                  </section>
                </div>

                <div className="sup-grid two">
                  <section className="dashboard-card">
                    <h4>Задачи</h4>
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

                    {canManageTasks && (
                      <form className="sup-form" onSubmit={handleCreateTask}>
                        <h4>Новая задача</h4>
                        <input
                          value={taskForm.title}
                          onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                          placeholder="Название задачи"
                        />
                        <textarea
                          value={taskForm.description}
                          onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
                          placeholder="Описание"
                        />
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
                        <button type="submit" disabled={busy}>Создать задачу</button>
                      </form>
                    )}
                  </section>

                  <section className="dashboard-card">
                    <h4>Открытая задача</h4>
                    {!taskDetails && <p className="notice">Задача не выбрана</p>}
                    {taskDetails && (
                      <>
                        <form className="sup-form" onSubmit={handleUpdateTask}>
                          <input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} disabled={!canManageTasks} />
                          <textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} disabled={!canManageTasks} />
                          <select value={taskForm.status} onChange={(event) => setTaskForm((current) => ({ ...current, status: event.target.value }))} disabled={!canManageTasks}>
                            {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))} disabled={!canManageTasks}>
                            {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <select value={taskForm.assigneeId} onChange={(event) => setTaskForm((current) => ({ ...current, assigneeId: event.target.value }))} disabled={!canManageTasks}>
                            <option value="">Без ответственного</option>
                            {memberOptions.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
                          </select>
                          <input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))} disabled={!canManageTasks} />
                          <button type="submit" disabled={!canManageTasks || busy}>Сохранить задачу</button>
                        </form>

                        <div className="button-row">
                          {canCompleteTask && <button type="button" onClick={() => handleTaskStatus('review')} disabled={busy}>Выполнено</button>}
                          {canReviewTask && <button className="secondary" type="button" onClick={() => handleTaskStatus('done')} disabled={busy}>Принять</button>}
                          {canReviewTask && <button className="danger-outline" type="button" onClick={() => handleTaskStatus('needs_changes')} disabled={busy}>Вернуть на доработку</button>}
                        </div>
                      </>
                    )}
                  </section>
                </div>

                {taskDetails && (
                  <div className="sup-grid two">
                    <section className="dashboard-card">
                      <h4>Дополнения и комментарии</h4>
                      <form className="sup-form" onSubmit={handleAddUpdate}>
                        <textarea value={taskUpdateText} onChange={(event) => setTaskUpdateText(event.target.value)} placeholder="Дополнение к задаче" />
                        <button type="submit" disabled={busy}>Добавить дополнение</button>
                      </form>
                      <form className="sup-form" onSubmit={handleAddComment}>
                        <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Комментарий" />
                        <button className="secondary" type="submit" disabled={busy}>Комментировать</button>
                      </form>

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
                    </section>

                    <section className="dashboard-card">
                      <h4>Файлы и AI</h4>
                      <label className="file-control">
                        Файл проекта
                        <input type="file" onChange={handleProjectFile} disabled={!canCreate || busy} />
                      </label>
                      <label className="file-control">
                        Файл задачи
                        <input type="file" onChange={handleTaskFile} disabled={!canCreate || busy} />
                      </label>

                      <form className="sup-form" onSubmit={handleAi}>
                        <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Спросить AI по проекту или выбранной задаче" />
                        <button type="submit" disabled={busy}>Получить AI-предложение</button>
                      </form>

                      <div className="sup-mini-list">
                        {[...(taskDetails.suggestions || []), ...(projectDetails.suggestions || [])].map((item) => (
                          <div className="sup-row" key={item.id}>
                            <div>
                              <strong>AI · {formatDateTime(item.created_at)}</strong>
                              <small>{item.prompt}</small>
                              <p>{item.suggestion}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="sup-mini-list">
                        {[...(projectDetails.files || []), ...(taskDetails.files || [])].map((file) => (
                          <div className="sup-row" key={file.id}>
                            <div>
                              <strong>{file.file_name}</strong>
                              <small>{file.mime_type || 'Файл'}</small>
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
    </div>
  )
}
