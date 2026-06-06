import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import './Login.css';

// ─── main component ───────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [showPass, setShowPass] = useState(false);

  useEffect(() => { if (error) setError(''); }, [username, password]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // الخطوة 0: امسح أي session قديمة قبل تسجيل الدخول
      await supabase.auth.signOut();

      // الخطوة 1: Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: username.trim(),
        password: password,
      });

      if (authError) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        setLoading(false);
        return;
      }

      console.log('Auth user email:', authData.user.email);

      // الخطوة 2: جيب بيانات الـ role والـ student
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*, students(*)')
        .eq('email', authData.user.email)
        .maybeSingle();

      console.log('userData:', userData);
      console.log('userError:', userError);

      if (userError || !userData) {
        // ✅ signOut الأول، بعدين setError وsetLoading
        await supabase.auth.signOut();
        setError('حدث خطأ في تحميل بيانات المستخدم');
        setLoading(false);
        return;
      }

      const loginData = {
        id:      userData.id,
        email:   userData.email,
        role:    userData.role,
        student: userData.students,
      };

      console.log('✅ Login successful:', loginData.email);
      onLogin(loginData);

    } catch (err) {
      console.error('Login error:', err);
      setError('حدث خطأ غير متوقع. حاول مرة أخرى.');
      setLoading(false);
    }
  };

  const quickLogin = (role) => {
    if (role === 'admin') {
      setUsername('admin@church.com');
      setPassword('224410');
    } else {
      setUsername('JohnHani@gmail.com');
      setPassword('Am1234555');
    }
  };

  return (
    <div className="login-page">
      <div className="stars" />

      <div className="login-container">
        <div className="logo-container">
          <span className="logo-icon">✝️</span>
          <h1 className="game-title">CHURCH QUEST</h1>
          <p className="game-subtitle">رحلتك الروحية تبدأ هنا</p>
        </div>

        <form className="login-form" onSubmit={handleLogin} noValidate>
          {error && (
            <div className="error-message" role="alert">
              ⚠️ {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="lp-email">👤 البريد الإلكتروني</label>
            <input
              id="lp-email"
              type="email"
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="example@church.com"
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="lp-pass">🔒 كلمة المرور</label>
            <div className="pass-wrapper">
              <input
                id="lp-pass"
                type={showPass ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={loading}
              />
              <button
                type="button"
                className="pass-toggle"
                onClick={() => setShowPass(v => !v)}
                tabIndex={-1}
                aria-label={showPass ? 'إخفاء' : 'إظهار'}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !username || !password}
          >
            {loading ? '⏳ جاري التحقق...' : '🚀 دخول'}
          </button>

          <div className="demo-accounts">
            <p>💡 حسابات تجريبية:</p>
            <div className="demo-btns">
              <button type="button" className="demo-btn" onClick={() => quickLogin('student')} disabled={loading}>
                🎓 طالب
              </button>
              <button type="button" className="demo-btn" onClick={() => quickLogin('admin')} disabled={loading}>
                ⚙️ مسئول
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;