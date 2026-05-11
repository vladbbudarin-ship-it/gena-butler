import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { createInviteCode, createTelegramLinkCode, getMyProfile } from '../lib/api'

function formatDateTime(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getAccountRoleLabel(profile, isOwner) {
  if (isOwner || profile?.account_type === 'owner' || profile?.role === 'owner') {
    return 'Бударин'
  }

  if (profile?.account_type === 'user_plus' || profile?.role === 'user_plus') {
    return 'Пользователь+'
  }

  return 'Пользователь'
}

export default function Profile({
  user,
  onLogout,
  onOpenMyQuestions,
  onOpenProjects,
  onOpenOwnerDashboard,
}) {
  const ownerEmail = import.meta.env.VITE_OWNER_EMAIL
  const isOwner = user.email === ownerEmail
  const [profile, setProfile] = useState(null)
  const [message, setMessage] = useState('')
  const [invite, setInvite] = useState(null)
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [telegramLink, setTelegramLink] = useState(null)
  const [telegramMessage, setTelegramMessage] = useState('')
  const [telegramLoading, setTelegramLoading] = useState(false)

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

  async function handleCreateInvite() {
    try {
      setInviteLoading(true)
      setInviteMessage('')

      const inviteData = await createInviteCode()
      setInvite(inviteData)
      setInviteMessage('Код создан.')
    } catch (error) {
      setInviteMessage(error.message)
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleCopyInviteCode() {
    if (!invite?.code) {
      return
    }

    await navigator.clipboard.writeText(invite.code)
    setInviteMessage('Код скопирован.')
  }

  async function handleCreateTelegramLinkCode() {
    try {
      setTelegramLoading(true)
      setTelegramMessage('')

      const linkData = await createTelegramLinkCode()
      setTelegramLink(linkData)
      setTelegramMessage('Telegram-код создан.')
    } catch (error) {
      setTelegramMessage(error.message)
    } finally {
      setTelegramLoading(false)
    }
  }

  async function handleCopyTelegramCode() {
    if (!telegramLink?.code) {
      return
    }

    await navigator.clipboard.writeText(telegramLink.code)
    setTelegramMessage('Telegram-код скопирован.')
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
              {getAccountRoleLabel(profile, isOwner)}
            </span>
          </div>
        </div>

        {message && <p className="notice" style={{ marginTop: '18px' }}>{message}</p>}

        <div className="button-row" style={{ marginTop: '24px' }}>
          <button onClick={onOpenMyQuestions}>
            Чаты
          </button>

          <button className="secondary" onClick={onOpenProjects}>
            Проекты
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

      <section className="dashboard-card">
        <h3>Пригласить пользователя</h3>
        <p style={{ marginTop: '10px' }}>
          Создайте одноразовый код. Он действует 7 дней и подходит только для одной регистрации.
        </p>

        <div className="button-row" style={{ marginTop: '20px' }}>
          <button onClick={handleCreateInvite} disabled={inviteLoading}>
            {inviteLoading ? 'Создаём...' : 'Пригласить'}
          </button>

          {invite?.code && (
            <button className="secondary" onClick={handleCopyInviteCode}>
              Скопировать код
            </button>
          )}
        </div>

        {invite?.code && (
          <div className="invite-code-box">
            <span>Invite-код</span>
            <strong>{invite.code}</strong>
            <small>Действует до {formatDateTime(invite.expiresAt)}</small>
          </div>
        )}

        {inviteMessage && <p className="notice" style={{ marginTop: '18px' }}>{inviteMessage}</p>}
      </section>

      <section className="dashboard-card">
        <h3>Telegram</h3>

        {profile?.telegram_user_id ? (
          <div className="invite-code-box">
            <span>Статус</span>
            <strong>Telegram привязан</strong>
            {profile?.telegram_username && <small>@{profile.telegram_username}</small>}
          </div>
        ) : (
          <>
            <p style={{ marginTop: '10px' }}>
              Создайте код и отправьте его боту, чтобы писать Бударину прямо из Telegram.
            </p>

            <div className="button-row" style={{ marginTop: '20px' }}>
              <button onClick={handleCreateTelegramLinkCode} disabled={telegramLoading}>
                {telegramLoading ? 'Создаём...' : 'Привязать Telegram'}
              </button>

              {telegramLink?.code && (
                <button className="secondary" onClick={handleCopyTelegramCode}>
                  Скопировать код
                </button>
              )}
            </div>

            {telegramLink?.code && (
              <div className="invite-code-box">
                <span>Telegram-код</span>
                <strong>{telegramLink.code}</strong>
                <small>Действует до {formatDateTime(telegramLink.expiresAt)}</small>
                <small>
                  Откройте @{telegramLink.botUsername || 'BOT_USERNAME'} и отправьте {telegramLink.code} или /start {telegramLink.code}
                </small>
              </div>
            )}
          </>
        )}

        {telegramMessage && <p className="notice" style={{ marginTop: '18px' }}>{telegramMessage}</p>}
      </section>
    </div>
  )
}
