export function RankingComingSoon() {
  return (
    <section
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '64px 24px',
        textAlign: 'center',
      }}
    >
      {/* Animated flame icon */}
      <div
        style={{
          fontSize: '4rem',
          marginBottom: '24px',
          animation: 'pulse 2s ease-in-out infinite',
        }}
      >
        🔥
      </div>

      <h2
        style={{
          fontSize: '1.6rem',
          fontWeight: 800,
          color: '#fff',
          marginBottom: '12px',
          letterSpacing: '0.05em',
        }}
      >
        ランキング公開準備中
      </h2>

      <p
        style={{
          color: 'rgba(255,255,255,0.45)',
          fontSize: '0.95rem',
          lineHeight: 1.8,
          marginBottom: '32px',
          maxWidth: '400px',
          margin: '0 auto 32px',
        }}
      >
        Cambodia Daily Music Ranking は現在ベータ運用中です。<br />
        データ精度向上後、正式公開いたします。
      </p>

      <div
        style={{
          display: 'inline-block',
          padding: '8px 24px',
          border: '1px solid rgba(255,140,0,0.35)',
          borderRadius: '999px',
          color: 'rgba(255,140,0,0.8)',
          fontSize: '0.8rem',
          letterSpacing: '0.1em',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        Coming Soon
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
      `}</style>
    </section>
  );
}
