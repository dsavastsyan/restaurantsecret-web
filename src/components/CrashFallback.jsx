// Shown instead of a white screen when a React render crash happens anywhere
// in the tree. Sentry.ErrorBoundary has already reported the error by the
// time this renders — reload is the one recovery action guaranteed to work
// regardless of what broke.
export default function CrashFallback() {
  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      textAlign: 'center',
      padding: '80px 24px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }}>
        Что-то пошло не так
      </h1>
      <p style={{ fontSize: '1.05rem', color: '#64748b', margin: '0 0 32px' }}>
        Страница не смогла загрузиться. Мы уже знаем об этой ошибке — попробуйте обновить страницу.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '12px 28px',
          borderRadius: '12px',
          background: '#0ea5e9',
          color: '#fff',
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
        }}
      >
        Обновить страницу
      </button>
    </main>
  )
}
