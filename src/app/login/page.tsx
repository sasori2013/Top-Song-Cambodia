'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, from }),
    });
    const data = await res.json();

    if (data.success) {
      router.push(from);
      router.refresh();
    } else {
      setError(data.error || 'パスワードが違います');
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a00 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,140,0,0.2)',
          borderRadius: '16px',
          padding: '48px 40px',
          width: '100%',
          maxWidth: '360px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Logo / Title */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              fontSize: '2rem',
              fontWeight: 900,
              letterSpacing: '0.1em',
              background: 'linear-gradient(90deg, #ff8c00, #ff4500)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            🔥 HEAT
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', marginTop: '4px' }}>
            Cambodia Music Ranking
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '8px' }}
          >
            パスワード
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoFocus
            required
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.07)',
              border: error ? '1px solid #ff4444' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '12px 14px',
              color: '#fff',
              fontSize: '1rem',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: '8px',
            }}
          />
          {error && (
            <div style={{ color: '#ff6666', fontSize: '0.8rem', marginBottom: '12px' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '13px',
              background: loading ? 'rgba(255,140,0,0.4)' : 'linear-gradient(90deg, #ff8c00, #ff4500)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? '確認中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
