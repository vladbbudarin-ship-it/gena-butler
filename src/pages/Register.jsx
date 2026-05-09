import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Регистрация успешна. Теперь можно войти.')
      setName('')
      setEmail('')
      setPassword('')
    }

    setLoading(false)
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

        <button type="submit" disabled={loading}>
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>
      </form>

      {message && <p className="auth-message">{message}</p>}
    </div>
  )
}
