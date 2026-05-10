import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getMyProfile } from '../lib/api'

export default function Profile({
  user,
  onLogout,
  onOpenMyQuestions,
  onOpenOwnerDashboard,
}) {
  const ownerEmail = import.meta.env.VITE_OWNER_EMAIL
  const isOwner = user.email === ownerEmail
  const [profile, setProfile] = useState(null)
  const [message, setMessage] = useState('')

  async function handleLogout() {
    await supabase.auth.signOut()
    onLogout()
  }

  async function handleCopyPublicId() {
    if (!profile?.public_id) {
      return
    }

    await navigator.clipboard.writeText(profile.public_id)
    setMessage('ID скопирован.')
  }

  useEffect(() => {
    async function loadProfile() {
      try {
        setMessage('')
        const data = await getMyProfile()
        setProfile(data)
      } catch (error) {
        setMessage(error.message)
      }
    }

    loadProfile()
  }, [])

  return (
    <div className="page-stack">
      <section className="hero-card black">
        <img className="wordmark small light" src="/brand/gena-logo-white.png" alt="Гена" />
        <h2>Профиль</h2>
        <p>Личный concierge-кабинет для чатов, публичного ID и кабинета владельца.</p>
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
            <span>Мой ID</span>
            <strong>{profile?.public_id || 'Будет доступен после SQL-обновления'}</strong>
          </div>

          <div className="meta-row">
            <span>Роль</span>
            <span className={`badge${isOwner ? ' dark' : ''}`}>
              {isOwner ? 'Бударин' : 'Пользователь'}
            </span>
          </div>
        </div>

        {message && <p className="notice" style={{ marginTop: '18px' }}>{message}</p>}

        <div className="button-row" style={{ marginTop: '24px' }}>
          <button onClick={onOpenMyQuestions}>
            Чаты
          </button>

          <button className="secondary" onClick={handleCopyPublicId} disabled={!profile?.public_id}>
            Скопировать ID
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
