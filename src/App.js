import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
        <div className="anim-scene anim-church">
          <div className="ch-building">
            <div className="ch-roof"><span className="ch-cross">✝</span></div>
            <div className="ch-facade">
              <div className="ch-win ch-win-l" /><div className="ch-win ch-win-r" />
              <div className="ch-door-frame">
                <div className="ch-door ch-door-l" />
                <div className="ch-door ch-door-r" />
                <div className="ch-door-light" />
              </div>
            </div>
          </div>
          <div className="ch-ground" />
          {[...Array(10)].map((_,i) => <div key={i} className={`ch-spark sp${i}`} />)}
          <div className="anim-label">Daily missions 📋</div>
        </div>
      )}
      {anim.type === 'stars' && (
        <div className="anim-scene anim-bonus">
          <div className="bonus-sky">
            {[...Array(12)].map((_,i) => <div key={i} className={`bonus-cloud bc${i}`}>🌤</div>)}
          </div>
          <div className="bonus-ground" />
          <div className="bonus-path">
            {[...Array(6)].map((_,i) => <div key={i} className={`bonus-coin-path bcp${i}`}>🪙</div>)}
          </div>
          <div className="bonus-runner">🏃</div>
          <div className="bonus-chest">💰</div>
          <div className="bonus-chest-open">🎁</div>
          <div className="bonus-coins-burst">
            {[...Array(10)].map((_,i) => <div key={i} className={`bcb${i}`}>🪙</div>)}
          </div>
          <div className="bonus-text">اجمع العملات! 🏃</div>
          <div className="anim-label">Bonus ⭐</div>
        </div>
      )}
      {anim.type === 'cart' && (
        <div className="anim-scene anim-cart">
          <div className="cart-road" />
          <div className="cart-car">🛒</div>
          {[...Array(8)].map((_,i) => <div key={i} className={`cart-coin cc${i}`}>🪙</div>)}
          <div className="cart-shop">🏪</div>
          <div className="anim-label">المتجر 🛒</div>
        </div>
      )}
      {anim.type === 'trophy' && (
        <div className="anim-scene anim-race">
          {[...Array(24)].map((_,i) => <div key={i} className={`confetti cf${i}`} />)}
          <div className="race-track" />
          <div className="race-finish">🏁</div>
          <div className="race-runner race-r1">🏃</div>
          <div className="race-runner race-r2">🏃</div>
          <div className="race-runner race-r3">🏃</div>
          <div className="race-badge race-b1">1🥇</div>
          <div className="race-badge race-b2">2🥈</div>
          <div className="race-badge race-b3">3🥉</div>
          <div className="race-podium">
            <div className="podium-2">🥈<span>2</span></div>
            <div className="podium-1">🏆<span>1</span></div>
            <div className="podium-3">🥉<span>3</span></div>
          </div>
          <div className="race-text">مين الأول النهارده؟ 🏆</div>
          <div className="anim-label">Leader Board 🏆</div>
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
    // Check if user is logged in
    const userData = localStorage.getItem('churchQuestUser');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('churchQuestUser', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('churchQuestUser');
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