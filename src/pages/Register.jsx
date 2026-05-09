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
      <h2>Регистрация</h2>

      <form onSubmit={handleRegister}>
        <div>
          <label>Имя</label>
          <br />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ваше имя"
          />
        </div>

        <div>
          <label>Email</label>
          <br />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label>Пароль</label>
          <br />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Минимум 6 символов"
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>
      </form>

      {message && <p>{message}</p>}
    </div>
  )
}