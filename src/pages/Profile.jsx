import { supabase } from '../lib/supabaseClient'

export default function Profile({
  user,
  onLogout,
  onAskQuestion,
  onOpenMyQuestions,
  onOpenOwnerDashboard,
}) {
  const ownerEmail = import.meta.env.VITE_OWNER_EMAIL
  const isOwner = user.email === ownerEmail

  async function handleLogout() {
    await supabase.auth.signOut()
    onLogout()
  }

  return (
    <div className="page-stack">
      <section className="hero-card black">
        <div className="wordmark small">ГЕНА</div>
        <h2>Профиль</h2>
        <p>Личный concierge-кабинет для вопросов, чатов и ответов владельца.</p>
      </section>

      <section className="dashboard-card">
        <div className="profile-meta">
          <div className="meta-row">
            <span>Email</span>
            <strong>{user.email}</strong>
          </div>

          <div className="meta-row">
            <span>ID пользователя</span>
            <strong>{user.id}</strong>
          </div>

          <div className="meta-row">
            <span>Роль</span>
            <span className={`badge${isOwner ? ' dark' : ''}`}>
              {isOwner ? 'Владелец' : 'Пользователь'}
            </span>
          </div>
        </div>

        <div className="button-row" style={{ marginTop: '24px' }}>
          <button onClick={onOpenMyQuestions}>
            Чат с дворецким
          </button>

          <button className="secondary" onClick={onAskQuestion}>
            Задать вопрос
          </button>

          {isOwner && (
            <button className="secondary" onClick={onOpenOwnerDashboard}>
              Кабинет владельца
            </button>
          )}

          <button className="danger-outline" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </section>
    </div>
  )
}
