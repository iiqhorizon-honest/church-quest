import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';
import './StudentDashboard.css';

// ══════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════
const MAX_NOTIFICATIONS = 10;
const TOAST_DURATION    = 3000;
const COINS_PER_LEVEL   = 100;
const MAX_LEVEL         = 50;

// ══════════════════════════════════════════
// IN-MEMORY CACHE (no localStorage)
// ══════════════════════════════════════════
const CACHE_TTL = 5 * 60 * 1000;
const mem = {};
const Cache = {
  set: (k, v) => { mem[k] = { data: v, ts: Date.now() }; },
  get: (k) => {
    const e = mem[k];
    if (!e) return null;
    return (Date.now() - e.ts) < CACHE_TTL ? { data: e.data } : null;
  },
  clear: (k) => { delete mem[k]; },
};

// ══════════════════════════════════════════
// STATIC CONFIG (outside component — never re-created)
// ══════════════════════════════════════════
const ACTION_CARDS = [
  { icon: '📋', title: 'المهمات', path: '/student/missions',    color: 'purple', anim: 'church'  },
  { icon: '⭐', title: 'البونص',  path: '/student/bonus',       color: 'orange', anim: 'stars'   },
  { icon: '🛒', title: 'المتجر',  path: '/student/shop',        color: 'blue',   anim: 'cart'    },
  { icon: '🏆', title: 'الصدارة', path: '/student/leaderboard', color: 'green',  anim: 'trophy'  },
];

const NAV_ITEMS = [
  { icon: '🏠', label: 'الرئيسية', path: '/student'             },
  { icon: '📋', label: 'المهمات',  path: '/student/missions'    },
  { icon: '⭐', label: 'البونص',   path: '/student/bonus'       },
  { icon: '🛒', label: 'المتجر',   path: '/student/shop'        },
  { icon: '🚪', label: 'خروج',     path: '__logout__'           },
];

// ══════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════
function StudentDashboard({ user, onLogout }) {
  const navigate     = useNavigate();
  const { pathname } = useLocation();
  const isMountedRef = useRef(true);

  // FIX 1: cleanup ref set once, not inside an effect that re-runs
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const [studentData,       setStudentData]       = useState(null);
  const [notifications,     setNotifications]     = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading,           setLoading]           = useState(true);
  const [toast,             setToast]             = useState(null);
  const [isOnline,          setIsOnline]          = useState(navigator.onLine);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [churchAnim,        setChurchAnim]        = useState(null); // { path }

  // ── Toast ──
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message, type = 'success') => {
    if (!isMountedRef.current) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setToast(null);
    }, TOAST_DURATION);
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  // ── Fetch ──
  const fetchStudent = useCallback(async () => {
    const { data, error } = await supabase
      .from('students').select('id, name, coins')
      .eq('id', user.student.id).single();
    if (error) throw error;
    if (isMountedRef.current) {
      setStudentData(data);
      Cache.set('student', data);
    }
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications').select('id, title, message, is_read, created_at')
      .eq('student_id', user.student.id)
      .order('created_at', { ascending: false }).limit(MAX_NOTIFICATIONS);
    if (error) throw error;
    if (isMountedRef.current) {
      setNotifications(data || []);
      Cache.set('notifs', data || []);
    }
  }, [user]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      const sc = Cache.get('student');
      if (sc) {
        if (isMountedRef.current) {
          setStudentData(sc.data);
          setNotifications(Cache.get('notifs')?.data || []);
          setLoading(false);
        }
        return;
      }
    }
    if (!silent && isMountedRef.current) setLoading(true);
    try {
      await Promise.all([fetchStudent(), fetchNotifications()]);
    } catch (err) {
      console.error('Dashboard error:', err);
      if (!silent) showToast('❌ خطأ في التحميل', 'error');
      const sc = Cache.get('student');
      if (sc && isMountedRef.current) {
        setStudentData(sc.data);
        setNotifications(Cache.get('notifs')?.data || []);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [showToast, fetchStudent, fetchNotifications]);

  // FIX 2: refreshOnReconnect uses refs to avoid stale closures
  const fetchStudentRef      = useRef(fetchStudent);
  const fetchNotificationsRef = useRef(fetchNotifications);
  useEffect(() => { fetchStudentRef.current      = fetchStudent;      }, [fetchStudent]);
  useEffect(() => { fetchNotificationsRef.current = fetchNotifications; }, [fetchNotifications]);

  const refreshOnReconnect = useCallback(async () => {
    if (!user?.student || !isMountedRef.current) return;
    try {
      const oldStudent = Cache.get('student')?.data;
      const oldNotifs  = Cache.get('notifs')?.data;
      await Promise.all([fetchStudentRef.current(), fetchNotificationsRef.current()]);
      if (!isMountedRef.current) return;
      const newStudent = Cache.get('student')?.data;
      const newNotifs  = Cache.get('notifs')?.data;
      if (oldStudent?.coins !== newStudent?.coins) {
        showToast('🪙 كوينزك اتحدثت!', 'success');
      } else {
        const newCount = (newNotifs || []).filter(
          n => !(oldNotifs || []).some(o => o.id === n.id)
        ).length;
        if (newCount > 0) showToast(`📬 ${newCount} إشعار جديد!`, 'info');
      }
    } catch (err) {
      console.error('Reconnect refresh error:', err);
    }
  }, [user, showToast]);

  // ── Online/Offline ──
  useEffect(() => {
    const up   = () => { setIsOnline(true);  refreshOnReconnect(); };
    const down = () => { setIsOnline(false); showToast('⚠️ غير متصل — بيشتغل من الذاكرة', 'info'); };
    window.addEventListener('online',  up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online',  up);
      window.removeEventListener('offline', down);
    };
  }, [refreshOnReconnect, showToast]);

  // ── Initial load ──
  useEffect(() => {
    if (user?.student) loadData();
  }, [user, loadData]);

  // FIX 3: Realtime — stable channel, ref-based handler to avoid re-subscribe loop
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  useEffect(() => {
    if (!user?.student) return;
    const channel = supabase
      .channel(`student_realtime_${user.student.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `student_id=eq.${user.student.id}`,
      }, ({ new: n }) => {
        if (!isMountedRef.current) return;
        setNotifications(prev => {
          const updated = [n, ...prev].slice(0, MAX_NOTIFICATIONS);
          Cache.set('notifs', updated);
          return updated;
        });
        showToastRef.current('📬 إشعار جديد!', 'info');
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'students',
        filter: `id=eq.${user.student.id}`,
      }, ({ new: updated }) => {
        if (!isMountedRef.current) return;
        const safe = { id: updated.id, name: updated.name, coins: updated.coins };
        setStudentData(safe);
        Cache.set('student', safe);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark notifications read ──
  const markNotificationsRead = useCallback(async () => {
    const unread = notifications.filter(n => !n.is_read).map(n => n.id);
    if (!unread.length) return;
    try {
      await supabase.from('notifications').update({ is_read: true }).in('id', unread);
      if (!isMountedRef.current) return;
      const updated = notifications.map(n => ({ ...n, is_read: true }));
      setNotifications(updated);
      Cache.set('notifs', updated);
    } catch (err) {
      console.error('markNotificationsRead error:', err);
      showToast('❌ خطأ في تحديث الإشعارات', 'error');
    }
  }, [notifications, showToast]);

  const handleOpenNotifications = useCallback(() => {
    setShowNotifications(true);
    markNotificationsRead();
  }, [markNotificationsRead]);

  const handleNavClick = useCallback((path) => {
    if (path === '__logout__') setShowLogoutConfirm(true);
    else navigate(path);
  }, [navigate]);

  const handleCardClick = useCallback((card) => {
    setChurchAnim({ path: card.path, type: card.anim });
    setTimeout(() => {
      setChurchAnim(null);
      navigate(card.path);
    }, 2000);
  }, [navigate]);

  // ── Computed ──
  const unreadCount     = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);
  const currentLevel    = useMemo(() => Math.min(Math.floor((studentData?.coins ?? 0) / COINS_PER_LEVEL) + 1, MAX_LEVEL), [studentData]);
  const progressInLevel = useMemo(() => (studentData?.coins ?? 0) % COINS_PER_LEVEL, [studentData]);
  const coinsNeeded     = useMemo(() => COINS_PER_LEVEL - progressInLevel, [progressInLevel]);
  const progressPct     = useMemo(() => (progressInLevel / COINS_PER_LEVEL) * 100, [progressInLevel]);
  const firstName       = useMemo(() => studentData?.name?.split(' ')[0] ?? '', [studentData]);

  // ══ LOADING ══
  if (loading || !studentData) {
    return (
      <div className="student-dashboard-page">
        <div className="stars" />
        <div className="loading-screen">
          <div className="logo-loader">
            <span className="logo-icon">🎓</span>
            <div className="logo-spinner" />
          </div>
          <p className="loading-text">جاري التحميل...</p>
          <p className="loading-hint">💡 البيانات تُحفظ محليًا للعمل بدون إنترنت</p>
        </div>
      </div>
    );
  }

  // ══ MAIN RENDER ══
  return (
    <div className="student-dashboard-page">
      <div className="stars" />
      <div className="stars-deep" />
      <div className="bg-orb-1" />
      <div className="bg-orb-2" />
      <div className="bg-orb-3" />
      <div className="bg-ring-1" />
      <div className="bg-ring-2" />
      <div className="bg-particle bg-particle-1" />
      <div className="bg-particle bg-particle-2" />
      <div className="bg-particle bg-particle-3" />
      <div className="bg-particle bg-particle-4" />
      <div className="bg-particle bg-particle-5" />

      {/* Card Animations */}
      {churchAnim && (
        <div className="card-anim-overlay">

          {/* MISSIONS: Church door */}
          {churchAnim.type === 'church' && (
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
              <div className="anim-label">المهمات 📋</div>
            </div>
          )}

          {/* BONUS: Stars rain */}
          {churchAnim.type === 'stars' && (
            <div className="anim-scene anim-stars">
              <div className="stars-moon">🌙</div>
              {[...Array(16)].map((_,i) => <div key={i} className={`star-rain sr${i}`}>⭐</div>)}
              <div className="stars-big-star">🌟</div>
              <div className="stars-text">بونص جديد!</div>
              <div className="anim-label">البونص ⭐</div>
            </div>
          )}

          {/* SHOP: Cart with coins */}
          {churchAnim.type === 'cart' && (
            <div className="anim-scene anim-cart">
              <div className="cart-road" />
              <div className="cart-car">🛒</div>
              {[...Array(8)].map((_,i) => <div key={i} className={`cart-coin cc${i}`}>🪙</div>)}
              <div className="cart-shop">🏪</div>
              <div className="anim-label">المتجر 🛒</div>
            </div>
          )}

          {/* LEADERBOARD: Trophy + confetti */}
          {churchAnim.type === 'trophy' && (
            <div className="anim-scene anim-trophy">
              {[...Array(20)].map((_,i) => <div key={i} className={`confetti cf${i}`} />)}
              <div className="trophy-cup">🏆</div>
              <div className="trophy-rays">
                {[...Array(8)].map((_,i) => <div key={i} className={`trophy-ray tr${i}`} />)}
              </div>
              <div className="trophy-text">انت الأفضل! 🎉</div>
              <div className="anim-label">الصدارة 🏆</div>
            </div>
          )}

        </div>
      )}

      {toast && <div className={`toast-smart ${toast.type}`}>{toast.message}</div>}

      {/* Logout Confirm */}
      {showLogoutConfirm && (
        <div className="logout-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="logout-popup" onClick={e => e.stopPropagation()}>
            <div className="logout-icon">🚪</div>
            <h2 className="logout-title">هتخرج؟</h2>
            <p className="logout-subtitle">متأكد إنك عايز تخرج دلوقتي؟</p>
            <div className="logout-btns">
              <button className="logout-btn-yes" onClick={onLogout}>
                <span>أيوه</span>
                <span className="logout-btn-emoji">👋</span>
              </button>
              <button className="logout-btn-no" onClick={() => setShowLogoutConfirm(false)}>
                <span>لأ</span>
                <span className="logout-btn-emoji">😊</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="smart-header">
        <div className="header-glass">
          <div className="header-row">
            <div className="header-actions">
              <button className="action-btn" onClick={handleOpenNotifications} title="الإشعارات">
                🔔
                {unreadCount > 0 && <span className="badge pulse">{unreadCount}</span>}
              </button>
            </div>
            <div className="header-center">
              <h1 className="header-name">
                <span className="header-greeting">مرحباً،</span>
                <span className="header-username">{firstName}</span>
                <span className="header-wave">👋</span>
              </h1>
              <div className={`header-status ${isOnline ? 'online' : 'offline'}`}>
                <span className="status-dot" />
              </div>
            </div>
            <div className="header-logo">🎓</div>
          </div>
        </div>
      </header>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className="notifications-overlay" onClick={() => setShowNotifications(false)}>
          <div className="notifications-panel" onClick={e => e.stopPropagation()}>
            <div className="panel-header">
              <h3>🔔 الإشعارات</h3>
              <button className="close-btn" onClick={() => setShowNotifications(false)}>✕</button>
            </div>
            <div className="notifications-list">
              {notifications.length > 0 ? (
                notifications.map(n => (
                  <div key={n.id} className={`notif-item ${n.is_read ? 'read' : ''}`}>
                    <h4>{n.title}</h4>
                    <p>{n.message}</p>
                    <span className="notif-time">
                      {new Date(n.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-smart">
                  <span className="empty-emoji">📭</span>
                  <p>لا توجد إشعارات</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="dashboard-body-smart">
        <div className="view-content">

          {/* Coins Hero */}
          <div className="coins-card-large" onClick={() => navigate('/student/shop')}>
            <div className="coins-header">
              <span className="coins-label">رصيدك الحالي</span>
              <span className="level-badge-large">⭐ المستوى {currentLevel}</span>
            </div>
            <div className="coins-value-large">
              <span className="coin-icon-large">🪙</span>
              <span className="coin-number">{studentData.coins.toLocaleString('ar-EG')}</span>
            </div>
          </div>

          {/* XP Progress */}
          <div className="progress-card-smart">
            <div className="progress-header">
              <span className="progress-title">📊 تقدم المستوى {currentLevel}</span>
              <span className="progress-coins">{progressInLevel}/{COINS_PER_LEVEL} 🪙</span>
            </div>
            <div className="progress-bar-wrapper">
              <div className="progress-bar" style={{ width: `${progressPct}%` }}>
                <span className="progress-shine" />
              </div>
            </div>
            <p className="progress-hint">
              💡 {coinsNeeded} عملة للوصول إلى المستوى {currentLevel + 1}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="section-smart">
            <h3 className="section-title-smart">⚡ الإجراءات السريعة</h3>
            <div className="quick-grid-smart">
              {ACTION_CARDS.map((card) => (
                <div
                  key={card.path}
                  className={`quick-btn-smart ${card.color}`}
                  onClick={() => handleCardClick(card)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && navigate(card.path)}
                >
                  <span className="quick-icon-smart">{card.icon}</span>
                  <span className="quick-label-smart">{card.title}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav-smart">
        {NAV_ITEMS.map(tab => (
          <button
            key={tab.path}
            className={`nav-item ${tab.path !== '__logout__' && pathname === tab.path ? 'active' : ''} ${tab.path === '__logout__' ? 'nav-logout' : ''}`}
            onClick={() => handleNavClick(tab.path)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-text">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default StudentDashboard;