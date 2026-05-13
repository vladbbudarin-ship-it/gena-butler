import { useEffect, useRef, useState } from 'react'
import { registerWithInvite, registerWithTelegram } from '../lib/api'

const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'gena_butler_bot'

export default function Register() {
  const [mode, setMode] = useState('invite')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [telegramAuthData, setTelegramAuthData] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const telegramWidgetRef = useRef(null)

  useEffect(() => {
    if (mode !== 'telegram' || telegramAuthData || !telegramWidgetRef.current) {
      return undefined
    }

    const callbackName = `onTelegramRegisterAuth_${Date.now()}`

    window[callbackName] = (user) => {
      setTelegramAuthData(user)
      setMessage(user?.username ? `Telegram подтверждён: @${user.username}` : 'Telegram подтверждён.')
    }

    telegramWidgetRef.current.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', telegramBotUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-onauth', `${callbackName}(user)`)

    telegramWidgetRef.current.appendChild(script)

    return () => {
      delete window[callbackName]

      if (telegramWidgetRef.current) {
        telegramWidgetRef.current.innerHTML = ''
      }
    }
  }, [mode, telegramAuthData])

  function resetForm() {
    setName('')
    setEmail('')
    setPassword('')
    setInviteCode('')
    setTelegramAuthData(null)
  }

  async function handleInviteRegister(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      await registerWithInvite({
        name,
        email,
        password,
        inviteCode,
      })

      resetForm()
      setMessage('Регистрация успешна. Теперь можно войти.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleTelegramRegister(event) {
    event.preventDefault()

    if (!telegramAuthData) {
      setMessage('Сначала подтвердите Telegram.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      await registerWithTelegram({
        name,
        email,
        password,
        telegramAuthData,
      })

      resetForm()
      setMessage('Регистрация успешна. Теперь можно войти.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const commonFields = (
    <>
      <div>
        <label>
          <strong>Имя</strong>
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="ваше имя..."
          autoComplete="name"
        />
      </div>

      <div>
        <label>
          <strong>Email</strong>
        </label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="email..."
          autoComplete="email"
        />
      </div>

      <div>
        <label>
          <strong>Пароль</strong>
        </label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="минимум 6 символов..."
          autoComplete="new-password"
        />
      </div>
    </>
  )

  return (
    <div>
      <nav className="auth-tabs registration-methods" aria-label="Способ регистрации">
        <button
          className={mode === 'invite' ? 'active' : ''}
          type="button"
          onClick={() => {
            setMode('invite')
            setMessage('')
          }}
        >
          По коду приглашения
        </button>
        <button
          className={mode === 'telegram' ? 'active' : ''}
          type="button"
          onClick={() => {
            setMode('telegram')
            setMessage('')
          }}
        >
          Через Telegram
        </button>
      </nav>

      {mode === 'invite' && (
        <form className="form-stack" onSubmit={handleInviteRegister}>
          {commonFields}

          <div>
            <label>
              <strong>Код приглашения</strong>
            </label>
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6))}
              placeholder="4821AB"
              autoComplete="one-time-code"
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>
      )}

      {mode === 'telegram' && (
        <form className="form-stack" onSubmit={handleTelegramRegister}>
          <div className="telegram-auth-box">
            <strong>Подтвердите Telegram</strong>
            <p>Telegram заменяет invite-код и сразу привязывается к профилю.</p>

            {telegramAuthData ? (
              <div className="telegram-confirmed">
                Telegram подтверждён
                {telegramAuthData.username ? `: @${telegramAuthData.username}` : ''}
              </div>
            ) : (
              <div ref={telegramWidgetRef} className="telegram-widget-slot" />
            )}
          </div>

          {commonFields}

          <button type="submit" disabled={loading || !telegramAuthData}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться через Telegram'}
          </button>
        </form>
      )}

      {message && <p className="auth-message">{message}</p>}
    </div>
  )
}
