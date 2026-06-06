import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './App.css';
import './CardAnimations.css';

// Auth Components
import Login from './components/Auth/Login';

// Student Components
import StudentDashboard from './components/Student/Dashboard';
import StudentMissions from './components/Student/Missions';
import StudentBonusMissions from './components/Student/BonusMissions';
import StudentShop from './components/Student/Shop';
import StudentLeaderboard from './components/Student/Leaderboard';

// Admin Components
import AdminDashboard from './components/Admin/Dashboard';
import ManageStudents from './components/Admin/ManageStudents';
import QRScanner from './components/Admin/QRScanner';
import ManageProducts from './components/Admin/ManageProducts';
import PendingOrders from './components/Admin/PendingOrders';
import AddCoins from './components/Admin/AddCoins';
import CreateDailyMissions from './components/Admin/CreateDailyMissions';
import CreateBonusMissions from './components/Admin/CreateBonusMissions';

// ── Card Animation Context ──────────────────────────
export const AnimContext = React.createContext(null);

const CardAnimOverlay = React.memo(function CardAnimOverlay({ anim, onDone }) {
  React.useEffect(() => {
    if (!anim) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [anim, onDone]);
  if (!anim) return null;
  return (
    <div className={`card-anim-overlay${anim.closing ? ' closing' : ''}`}>
      {anim.type === 'church' && (
        <div className="anim-scene anim-cross">
          <div className="cross-glow-bg" />
          <div className="cross-wrap">
            <div className="cross-v" />
            <div className="cross-h" />
            <div className="cross-center" />
          </div>
          {[...Array(12)].map((_,i) => <div key={i} className={`cross-ray cr${i}`} />)}
          <div className="cross-label">المهمات 📋</div>
        </div>
      )}
      {anim.type === 'stars' && (
        <div className="anim-scene anim-wand">
          <div className="wand-bg" />
          <div className="wand-wrap">
            <div className="wand-stick" />
            <div className="wand-tip">⭐</div>
          </div>
          {[...Array(12)].map((_,i) => <div key={i} className={`wand-coin wc${i}`}>🪙</div>)}
          {[...Array(10)].map((_,i) => <div key={i} className={`wand-spark wsp${i}`} />)}
          <div className="wand-burst">✨</div>
          <div className="wand-text">تحويل سحري! 🪄</div>
          <div className="anim-label">البونص ⭐</div>
        </div>
      )}
      {anim.type === 'cart' && (
        <div className="anim-scene anim-gift">
          <div className="gift-bg" />
          <div className="gift-box">
            <div className="gift-lid">🎀</div>
            <div className="gift-body">🎁</div>
          </div>
          {['⭐','🪙','🎮','📚','🎯','🏅','💎','🍭','🎨','🎭','🎪','🎲'].map((e,i) =>
            <div key={i} className={`gift-item gi${i}`}>{e}</div>
          )}
          {[...Array(8)].map((_,i) => <div key={i} className={`gift-spark gsp${i}`} />)}
          <div className="gift-text">🎁 فتح الهدية!</div>
          <div className="anim-label">المتجر 🛒</div>
        </div>
      )}
      {anim.type === 'trophy' && (
        <div className="anim-scene anim-num1">
          <div className="num1-bg" />
          {[...Array(18)].map((_,i) => <div key={i} className={`num1-star ns${i}`}>⭐</div>)}
          <div className="num1-digit">1</div>
          <div className="num1-crown">👑</div>
          {[...Array(6)].map((_,i) => <div key={i} className={`num1-ray nr${i}`} />)}
          <div className="num1-text">أنت الأول! 🌟</div>
          <div className="anim-label">الصدارة 🏆</div>
        </div>
      )}
    </div>
  );
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cardAnim, setCardAnim] = useState(null);

  useEffect(() => {
    // لو في logout حصل للتو — متحمّلش أي session
    if (localStorage.getItem('justLoggedOut')) {
      localStorage.removeItem('justLoggedOut');
      setLoading(false);
      return;
    }

    const userData = localStorage.getItem('churchQuestUser');
    if (!userData) {
      setLoading(false);
      return;
    }

    // في بيانات محفوظة — تأكد إن الـ session نشطة ونفس الإيميل
    supabase.auth.getSession().then(({ data: { session } }) => {
      const saved = JSON.parse(userData);
      if (!session || session.user.email !== saved.email) {
        localStorage.clear();
        setLoading(false);
        return;
      }
      setUser(saved);
      setLoading(false);
    });
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('churchQuestUser', JSON.stringify(userData));
  };

  const handleLogout = async () => {
    // امسح كل حاجة الأول
    localStorage.clear();
    sessionStorage.clear();
    // بعدين اعمل signOut
    await supabase.auth.signOut({ scope: 'global' });
    // حط flag عشان الـ useEffect يعرف إنه logout مش session عادية
    localStorage.setItem('justLoggedOut', '1');
    window.location.href = '/login';
  };

  const handleCardNav = React.useCallback((animType, path, navigateFn) => {
    setCardAnim({ type: animType, closing: false });
    // navigate after short delay so overlay is visible
    setTimeout(() => navigateFn(path), 80);
    // start fade-out
    setTimeout(() => setCardAnim(prev => prev ? { ...prev, closing: true } : null), 1800);
    // remove overlay
    setTimeout(() => setCardAnim(null), 2200);
  }, []);

  const clearCardAnim = React.useCallback(() => setCardAnim(null), []);

  if (loading) {
    return (
      <div className="global-loading">
        <div className="gl-cross"><div className="gl-v" /><div className="gl-h" /></div>
        <p className="gl-text">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <AnimContext.Provider value={handleCardNav}>
    <Router>
      <div className="App">
        <CardAnimOverlay anim={cardAnim} onDone={clearCardAnim} />
        <Routes>
          {/* Login Route */}
          <Route 
            path="/login" 
            element={!user ? <Login onLogin={handleLogin} /> : <Navigate to={user.role === 'admin' ? '/admin' : '/student'} />} 
          />

          {/* Student Routes */}
          <Route 
            path="/student" 
            element={user?.role === 'student' ? <StudentDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/student/missions" 
            element={user?.role === 'student' ? <StudentMissions user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/student/bonus" 
            element={user?.role === 'student' ? <StudentBonusMissions user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/student/shop" 
            element={user?.role === 'student' ? <StudentShop user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/student/leaderboard" 
            element={user?.role === 'student' ? <StudentLeaderboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />

          {/* Admin Routes */}
          <Route 
            path="/admin" 
            element={user?.role === 'admin' ? <AdminDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/students" 
            element={user?.role === 'admin' ? <ManageStudents user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/qr-scanner" 
            element={user?.role === 'admin' ? (
              <QRScanner 
                user={user} 
                onLogout={handleLogout} 
              />
            ) : (
              <Navigate to="/login" />
            )} 
          />
          <Route 
            path="/admin/products" 
            element={user?.role === 'admin' ? <ManageProducts user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/orders" 
            element={user?.role === 'admin' ? <PendingOrders user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/add-coins" 
            element={user?.role === 'admin' ? <AddCoins user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/daily-missions" 
            element={user?.role === 'admin' ? <CreateDailyMissions user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin/bonus-missions" 
            element={user?.role === 'admin' ? <CreateBonusMissions user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />

          {/* Default Route */}
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
    </AnimContext.Provider>
  );
}

export default App;