import { useState } from 'react'
import { registerWithInvite } from '../lib/api'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(event) {
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

      setMessage('Регистрация успешна. Теперь можно войти.')
      setName('')
      setEmail('')
      setPassword('')
      setInviteCode('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form className="form-stack" onSubmit={handleRegister}>
        <div>
          <label>
            <strong>Имя</strong>
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="ваше имя..."
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
          />
        </div>

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

      {message && <p className="auth-message">{message}</p>}
    </div>
  )
}
