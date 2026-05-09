import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Вход выполнен.')
      onLogin(data.user)
    }

    setLoading(false)
  }

  return (
    <div>
      <form className="form-stack" onSubmit={handleLogin}>
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
            placeholder="ваш пароль..."
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>

      {message && <p className="auth-message">{message}</p>}
    </div>
  )
}
