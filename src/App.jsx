import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Register from './pages/Register'
import Login from './pages/Login'
import Profile from './pages/Profile'
import MyQuestions from './pages/MyQuestions'
import OwnerDashboard from './pages/OwnerDashboard'
import Projects from './pages/Projects'
import PlusDashboard from './pages/PlusDashboard'
import { getMyProfile } from './lib/api'

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
  isPlus,
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
          {isPlus && (
            <button className="secondary" type="button" onClick={() => onNavigate('plus')}>
              Кабинет Пользователь+
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
  const [accountProfile, setAccountProfile] = useState(null)
  const isOwner = Boolean(
    (user?.email && user.email === import.meta.env.VITE_OWNER_EMAIL)
    || accountProfile?.account_type === 'owner'
    || ['owner', 'admin'].includes(accountProfile?.role)
  )
  const isPlus = Boolean(isOwner || accountProfile?.account_type === 'user_plus' || accountProfile?.role === 'user_plus')

  async function loadAccountProfile() {
    try {
      const profile = await getMyProfile()
      setAccountProfile(profile)
    } catch {
      setAccountProfile(null)
    }
  }

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
        await loadAccountProfile()
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
                  loadAccountProfile()
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
        {isPlus && (
          <button
            className={screen === 'plus' ? 'active' : 'secondary'}
            type="button"
            onClick={() => openScreen('plus')}
          >
            Кабинет Пользователь+
          </button>
        )}
        {isOwner && (
          <button
            className={screen === 'owner' ? 'active' : 'secondary'}
            type="button"
            onClick={() => openScreen('owner')}
          >
            Кабинет владельца
          </button>
        )}
      </nav>

      <div className={`app-frame ${['myQuestions', 'owner', 'projects', 'plus'].includes(screen) ? 'workspace-frame' : ''}`}>
        <section className="content-panel">
          {screen === 'profile' && (
            <Profile
              user={user}
              onOpenMyQuestions={() => openScreen('myQuestions')}
              onOpenProjects={() => openScreen('projects')}
              onOpenPlusDashboard={() => openScreen('plus')}
              onOpenOwnerDashboard={() => openScreen('owner')}
              onLogout={() => {
                setUser(null)
                setAccountProfile(null)
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
          {screen === 'plus' && (
            <PlusDashboard
              user={user}
              onBack={() => openScreen('profile')}
              onOpenProjects={() => openScreen('projects')}
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
        isPlus={isPlus}
        onToggle={() => setMobileNavOpen((current) => !current)}
        onNavigate={openScreen}
      />
    </main>
  )
}
