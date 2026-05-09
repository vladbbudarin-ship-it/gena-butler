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
    <div>
      <h2>Профиль</h2>

      <p>
        <strong>Email:</strong> {user.email}
      </p>

      <p>
        <strong>ID пользователя:</strong> {user.id}
      </p>

      <p>
        <strong>Роль:</strong> {isOwner ? 'Владелец' : 'Пользователь'}
      </p>

      <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
        <button onClick={onAskQuestion}>
          Задать вопрос
        </button>

        <button onClick={onOpenMyQuestions}>
          Чат с дворецким
        </button>

        {isOwner && (
  <button onClick={onOpenOwnerDashboard}>
    Кабинет владельца
  </button>
)}

        <button onClick={handleLogout}>
          Выйти
        </button>
      </div>
    </div>
  )
}
