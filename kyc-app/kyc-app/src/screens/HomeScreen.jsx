function HomeScreen() {
  return (
    <div
      className="new-theme"
      style={{
        height: '100dvh',
        minHeight: '-webkit-fill-available',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gradient-primary)',
        paddingBottom: 'calc(88px + env(safe-area-inset-bottom))',
        paddingTop: 'env(safe-area-inset-top)',
        overflow: 'hidden',
        position: 'relative',
        padding: 'var(--space-xl)',
      }}
    >
      {/* Decorative circles */}
      <div
        style={{
          position: 'absolute',
          top: '10%',
          left: '10%',
          width: '150px',
          height: '150px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          animation: 'float 6s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '20%',
          right: '15%',
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          animation: 'float 8s ease-in-out infinite reverse',
        }}
      />

      {/* Logo/Brand */}
      <div
        style={{
          textAlign: 'center',
          color: 'white',
          zIndex: 1,
          maxWidth: '500px',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(3rem, 15vw, 5rem)',
            marginBottom: 'var(--space-xl)',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          🎉
        </div>
        <h1
          style={{
            fontSize: 'clamp(1.5rem, 8vw, 2.5rem)',
            fontWeight: 'var(--font-weight-bold)',
            margin: 0,
            marginBottom: 'var(--space-md)',
            fontFamily: 'var(--font-family)',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
          }}
        >
          SuperParty
        </h1>
        <p
          style={{
            fontSize: 'clamp(0.875rem, 4vw, 1.125rem)',
            opacity: 0.95,
            margin: 0,
            fontFamily: 'var(--font-family)',
            lineHeight: 1.6,
          }}
        >
          Apasă butoanele de jos pentru a începe
        </p>

        {/* Quick actions hint */}
        <div
          style={{
            marginTop: 'var(--space-2xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-md)',
            fontSize: 'var(--font-size-sm)',
            opacity: 0.8,
          }}
        >
          <div>🤖 AI Chat - Asistent inteligent</div>
          <div>➕ Meniu - Toate funcțiile</div>
        </div>
      </div>

      {/* Build Stamp - Format RO */}
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(88px + env(safe-area-inset-bottom) + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '10px',
          color: 'rgba(255, 255, 255, 0.5)',
          fontFamily: 'monospace',
          textAlign: 'center',
          zIndex: 1000,
          pointerEvents: 'none',
        }}
      >
        UI v2 — commit {import.meta.env.VITE_COMMIT_SHA || 'dev'} — build{' '}
        {import.meta.env.VITE_BUILD_TIME || 'unknown'}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
}

export default HomeScreen;
