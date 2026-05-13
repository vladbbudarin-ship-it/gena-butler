import { useEffect, useMemo, useState } from 'react'
import {
  createSupAiSuggestion,
  deleteSupAiSuggestion,
  getMyProfile,
  getSupProjectDetails,
  getSupProjects,
} from '../lib/api'

function isPlusProfile(profile, user) {
  return user?.email === import.meta.env.VITE_OWNER_EMAIL
    || profile?.account_type === 'owner'
    || profile?.account_type === 'user_plus'
    || ['owner', 'admin', 'user_plus'].includes(profile?.role)
}

function getProjectTitle(project) {
  return project?.title || 'Проект'
}

function formatDateTime(value) {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function PlusDashboard({ user, onBack, onOpenProjects }) {
  const [profile, setProfile] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectDetails, setProjectDetails] = useState(null)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const allowed = isPlusProfile(profile, user)
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  )
  const taskOptions = projectDetails?.tasks || []
  const aiHistory = useMemo(
    () => (projectDetails?.suggestions || []).filter((item) => !item.deleted_at),
    [projectDetails]
  )

  useEffect(() => {
    async function init() {
      try {
        setLoading(true)
        setMessage('')
        const [profileData, projectData] = await Promise.all([
          getMyProfile(),
          getSupProjects(),
        ])

        setProfile(profileData)
        setProjects(projectData)

        if (projectData[0]?.id) {
          setSelectedProjectId(projectData[0].id)
          const details = await getSupProjectDetails(projectData[0].id)
          setProjectDetails(details)
        }
      } catch (error) {
        setMessage(error.message)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  async function handleSelectProject(projectId) {
    try {
      setSelectedProjectId(projectId)
      setSelectedTaskId('')
      setMessage('')
      const details = await getSupProjectDetails(projectId)
      setProjectDetails(details)
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleAskAi(event) {
    event.preventDefault()

    if (!selectedProjectId || !prompt.trim()) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await createSupAiSuggestion({
        projectId: selectedProjectId,
        taskId: selectedTaskId || null,
        prompt,
      })
      setPrompt('')
      const details = await getSupProjectDetails(selectedProjectId)
      setProjectDetails(details)
      setMessage('AI-предложение сохранено.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteSuggestion(suggestionId) {
    if (!window.confirm('Удалить этот AI-ответ из истории?')) {
      return
    }

    try {
      setBusy(true)
      setMessage('')
      await deleteSupAiSuggestion(suggestionId)
      const details = await getSupProjectDetails(selectedProjectId)
      setProjectDetails(details)
      setMessage('AI-ответ удалён из истории.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="plus-page">
        <section className="dashboard-card">
          <p>Загрузка кабинета Пользователь+...</p>
        </section>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="plus-page">
        <section className="dashboard-card plus-locked">
          <h3>Кабинет Пользователь+</h3>
          <p>Этот раздел доступен только Пользователь+ и Бударину.</p>
          <button type="button" onClick={onBack}>Вернуться в профиль</button>
        </section>
      </div>
    )
  }

  return (
    <div className="plus-page">
      <section className="plus-hero">
        <div>
          <span className="sup-kicker">Кабинет Пользователь+</span>
          <h3>AI-помощник по проектам</h3>
          <p>Планы, чеклисты, идеи, резюме и помощь по задачам без owner-only функций.</p>
        </div>
        <div className="button-row">
          <button className="secondary" type="button" onClick={onOpenProjects}>Проекты</button>
          <button className="secondary" type="button" onClick={onBack}>Профиль</button>
        </div>
      </section>

      {message && <p className="notice">{message}</p>}

      <section className="plus-grid">
        <aside className="dashboard-card">
          <h4>Доступные проекты</h4>
          <div className="sup-mini-list">
            {projects.length === 0 && <p className="notice">Доступных проектов пока нет.</p>}
            {projects.map((project) => (
              <button
                className={`sup-task-card${project.id === selectedProjectId ? ' active' : ''}`}
                key={project.id}
                type="button"
                onClick={() => handleSelectProject(project.id)}
              >
                <strong>{getProjectTitle(project)}</strong>
                <small>{project.description || 'Без описания'}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="dashboard-card">
          <h4>{selectedProject ? getProjectTitle(selectedProject) : 'Выберите проект'}</h4>
          <form className="sup-form" onSubmit={handleAskAi}>
            <select
              value={selectedTaskId}
              onChange={(event) => setSelectedTaskId(event.target.value)}
              disabled={!selectedProjectId}
            >
              <option value="">Весь проект</option>
              {taskOptions.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Попросите AI составить план, чеклист, резюме, идеи или помочь с задачей"
              disabled={!selectedProjectId}
            />
            <button type="submit" disabled={busy || !selectedProjectId || !prompt.trim()}>
              Получить предложение
            </button>
          </form>

          <div className="sup-mini-list ai-history-list">
            {aiHistory.length === 0 && (
              <p className="notice">Истории AI-ответов по этому проекту пока нет.</p>
            )}

            {aiHistory.map((item) => {
              const task = taskOptions.find((taskItem) => taskItem.id === item.task_id)

              return (
              <div className="sup-row ai-history-row" key={item.id}>
                <div>
                  <strong>AI-ответ</strong>
                  <small>{formatDateTime(item.created_at)} · {selectedProject ? getProjectTitle(selectedProject) : 'Проект'}</small>
                  {task && <small>Задача: {task.title}</small>}
                  <small>Статус: сохранено</small>
                  <small>Запрос: {item.prompt}</small>
                  <p>{item.suggestion}</p>
                </div>
                <div className="sup-row-actions">
                  <button
                    className="secondary compact"
                    type="button"
                    onClick={() => handleDeleteSuggestion(item.id)}
                    disabled={busy}
                  >
                    Удалить
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        </main>
      </section>
    </div>
  )
}
