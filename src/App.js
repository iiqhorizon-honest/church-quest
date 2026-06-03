import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

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

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>جاري التحميل...</p>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
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
  );
}

export default App;