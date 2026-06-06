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
        <div className="anim-scene anim-star">
          <div className="star-glow-bg" />
          <div className="star-main">⭐</div>
          {[...Array(8)].map((_,i) => <div key={i} className={`star-orbit so${i}`}>✨</div>)}
          {[...Array(10)].map((_,i) => <div key={i} className={`star-ray sr${i}`} />)}
          <div className="star-label">البونص ⭐</div>
        </div>
      )}
      {anim.type === 'cart' && (
        <div className="anim-scene anim-coins">
          <div className="coins-glow-bg" />
          {[...Array(12)].map((_,i) => <div key={i} className={`falling-coin fc${i}`}>🪙</div>)}
          <div className="coins-pile">
            <div className="pile-coin pc1">🪙</div>
            <div className="pile-coin pc2">🪙</div>
            <div className="pile-coin pc3">🪙</div>
            <div className="pile-coin pc4">🪙</div>
            <div className="pile-coin pc5">🪙</div>
          </div>
          <div className="coins-label">المتجر 🛒</div>
        </div>
      )}
      {anim.type === 'trophy' && (
        <div className="anim-scene anim-trophy-light">
          <div className="trophy-glow-bg" />
          <div className="trophy-main">🏆</div>
          {[...Array(12)].map((_,i) => <div key={i} className={`trophy-ray-l trl${i}`} />)}
          <div className="trophy-medals">
            <div className="tm tm1">🥇</div>
            <div className="tm tm2">🥈</div>
            <div className="tm tm3">🥉</div>
          </div>
          <div className="trophy-label">الصدارة 🏆</div>
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // مفيش session نشطة — امسح أي بيانات قديمة
        localStorage.removeItem('churchQuestUser');
        setLoading(false);
        return;
      }
      // في session نشطة — جيب بيانات المستخدم من localStorage أو من DB
      const userData = localStorage.getItem('churchQuestUser');
      if (userData) {
        const saved = JSON.parse(userData);
        if (saved.email === session.user.email) {
          setUser(saved);
          setLoading(false);
          return;
        }
      }
      // مفيش بيانات محفوظة أو إيميل مختلف — جيب من DB
      supabase.from('users').select('*, students(*)')
        .eq('email', session.user.email).maybeSingle()
        .then(({ data }) => {
          if (data) {
            const loginData = { id: data.id, email: data.email, role: data.role, student: data.students };
            setUser(loginData);
            localStorage.setItem('churchQuestUser', JSON.stringify(loginData));
          } else {
            localStorage.removeItem('churchQuestUser');
          }
          setLoading(false);
        });
    });
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('churchQuestUser', JSON.stringify(userData));
  };

  const handleLogout = async () => {
    localStorage.removeItem('churchQuestUser');
    await supabase.auth.signOut();
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
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>جاري التحميل...</p>
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