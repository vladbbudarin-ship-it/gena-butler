import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Register from './pages/Register'
import Login from './pages/Login'
import Profile from './pages/Profile'
import MyQuestions from './pages/MyQuestions'
import OwnerDashboard from './pages/OwnerDashboard'
import Projects from './pages/Projects'

function BrandBadge() {
  return (
    <div className="brand-corner-badge" aria-label="Гена">
      <img className="brand-logo-vertical" src="/brand/gena-logo-white.png" alt="Гена" />
      <img className="brand-logo-sign" src="/brand/gena-logo-white.png" alt="" aria-hidden="true" />
    </div>
  )
}

function MobileFloatingNav({
  isOpen,
  isOwner,
  onToggle,
  onNavigate,
}) {
  return (
    <div className={`mobile-floating-nav${isOpen ? ' open' : ''}`}>
      {isOpen && (
        <button
          className="mobile-nav-backdrop"
          type="button"
          aria-label="Закрыть меню"
          onClick={onToggle}
        />
      )}

      {isOpen && (
        <nav className="mobile-nav-panel" aria-label="Мобильная навигация">
          <button type="button" onClick={() => onNavigate('myQuestions')}>
            Чаты
          </button>
          <button className="secondary" type="button" onClick={() => onNavigate('profile')}>
            Профиль
          </button>
          <button className="secondary" type="button" onClick={() => onNavigate('projects')}>
            Проекты
          </button>
          {isOwner && (
            <button className="secondary" type="button" onClick={() => onNavigate('owner')}>
              Кабинет Бударина
            </button>
          )}
        </nav>
      )}

      <button
        className="mobile-nav-toggle"
        type="button"
        aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        ☰
      </button>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [screen, setScreen] = useState('login')
  const [loading, setLoading] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const isOwner = Boolean(user?.email && user.email === import.meta.env.VITE_OWNER_EMAIL)

  function openScreen(nextScreen) {
    setScreen(nextScreen)
    setMobileNavOpen(false)
  }

  useEffect(() => {
    async function getSession() {
      const { data } = await supabase.auth.getSession()

      if (data.session?.user) {
        setUser(data.session.user)
        setScreen('profile')
      }

      setLoading(false)
    }

    getSession()
  }, [])

  if (loading) {
    return (
      <main className="app-shell auth">
        <section className="auth-card">
          <img className="wordmark" src="/brand/gena-logo-black.png" alt="Гена" />
          <p>Загрузка...</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="app-shell auth">
        <div className="app-frame auth-frame">
          <section className="auth-card">
            <img className="wordmark" src="/brand/gena-logo-black.png" alt="Гена" />
            <p className="auth-subtitle">Budarin&apos;s messenger</p>

            <nav className="auth-tabs">
              <button
                className={screen === 'login' ? 'active' : ''}
                onClick={() => setScreen('login')}
              >
                Вход
              </button>
              <button
                className={screen === 'register' ? 'active' : ''}
                onClick={() => setScreen('register')}
              >
                Регистрация
              </button>
            </nav>

            {screen === 'login' && (
              <Login
                onLogin={(loggedUser) => {
                  setUser(loggedUser)
                  setScreen('profile')
                }}
              />
            )}

            {screen === 'register' && <Register />}
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <BrandBadge />

      <nav className="app-nav" aria-label="Основная навигация">
        <button
          className={screen === 'myQuestions' ? 'active' : 'secondary'}
          type="button"
          onClick={() => openScreen('myQuestions')}
        >
          Чат
        </button>
        <button
          className={screen === 'profile' ? 'active' : 'secondary'}
          type="button"
          onClick={() => openScreen('profile')}
        >
          Профиль
        </button>
        <button
          className={screen === 'projects' ? 'active' : 'secondary'}
          type="button"
          onClick={() => openScreen('projects')}
        >
          Проекты
        </button>
        {isOwner && (
          <>
            
            <button
              className={screen === 'owner' ? 'active' : 'secondary'}
              type="button"
              onClick={() => openScreen('owner')}
            >
              Кабинет владельца
            </button>
          </>
        )}
      </nav>

      <div className={`app-frame ${screen === 'myQuestions' || screen === 'owner' || screen === 'projects' ? 'workspace-frame' : ''}`}>
        <section className="content-panel">
          {screen === 'profile' && (
            <Profile
              user={user}
              onOpenMyQuestions={() => openScreen('myQuestions')}
              onOpenProjects={() => openScreen('projects')}
              onOpenOwnerDashboard={() => openScreen('owner')}
              onLogout={() => {
                setUser(null)
                setScreen('login')
              }}
            />
          )}

          {screen === 'myQuestions' && (
            <MyQuestions
              onBack={() => openScreen('profile')}
            />
          )}

          {screen === 'projects' && (
            <Projects
              user={user}
              onBack={() => openScreen('profile')}
            />
          )}
          {screen === 'owner' && (
            <OwnerDashboard
              onBack={() => openScreen('profile')}
            />
          )}
        </section>

      </div>

      <MobileFloatingNav
        isOpen={mobileNavOpen}
        isOwner={isOwner}
        onToggle={() => setMobileNavOpen((current) => !current)}
        onNavigate={openScreen}
      />
    </main>
  )
}
