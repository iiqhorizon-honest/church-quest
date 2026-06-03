import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './AdminDashboard.css';

// ============================================
// CONSTANTS & SMART CACHING
// ============================================
const CACHE_DURATION = 5 * 60 * 1000;
const ACTIVITIES_CACHE_KEY = 'dashboard_activities_cache';
const STATS_CACHE_KEY = 'dashboard_stats_cache';

const ACTIVITY_ICONS = { attendance: '⛪', mission: '✅', order: '🛒' };

// ============================================
// LOCAL STORAGE CACHE HELPER
// ============================================
const CacheManager = {
  set: (key, data) => {
    try { localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() })); }
    catch (error) { console.error('Cache set error:', error); }
  },
  get: (key) => {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;
      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      if (age < CACHE_DURATION) return { data, age };
      return null;
    } catch (error) { console.error('Cache get error:', error); return null; }
  },
  clear: (key) => {
    try { localStorage.removeItem(key); }
    catch (error) { console.error('Cache clear error:', error); }
  }
};

// ============================================
// MAIN COMPONENT
// ============================================
function AdminDashboard({ onLogout }) {
  const navigate = useNavigate();
  const isMounted = useRef(true);
  const toastTimerRef = useRef(null);

  const [stats, setStats] = useState({
    totalStudents: 0, totalMissions: 0, attendanceRate: 0, pendingOrders: 0
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [activityFilter, setActivityFilter] = useState('all');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showLogoutPopup, setShowLogoutPopup] = useState(false);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    if (!isMounted.current) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      if (isMounted.current) setToast(null);
    }, 3000);
  }, []);

  // ============================================
  // FETCH FUNCTIONS
  // ============================================
  const fetchStatsOptimized = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const [students, missions, attendance, orders] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('mission_completions').select('*', { count: 'exact', head: true }).gte('completed_at', today),
      supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('attendance_date', today),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    ]);
    const newStats = {
      totalStudents:  students.count   || 0,
      totalMissions:  missions.count   || 0,
      attendanceRate: attendance.count || 0,
      pendingOrders:  orders.count     || 0
    };
    if (isMounted.current) { setStats(newStats); CacheManager.set(STATS_CACHE_KEY, newStats); }
  }, []);

  const fetchRecentActivitiesOptimized = useCallback(async () => {
    const [attendanceRes, completionsRes, ordersRes] = await Promise.all([
      supabase.from('attendance').select('id, attendance_time, activity_type, coins_earned, students(name)').order('attendance_time', { ascending: false }).limit(5),
      supabase.from('mission_completions').select('id, completed_at, mission_id, mission_type, students(name)').eq('mission_type', 'daily').order('completed_at', { ascending: false }).limit(5),
      supabase.from('orders').select('id, created_at, students(name), products(name, price)').order('created_at', { ascending: false }).limit(5)
    ]);

    const activities = [];

    attendanceRes.data?.forEach(record => {
      if (record.students?.name) activities.push({
        id: `att-${record.id}`, type: 'attendance',
        student: record.students.name,
        description: `حضر ${record.activity_type}`,
        coins: record.coins_earned || 0, time: record.attendance_time
      });
    });

    if (completionsRes.data?.length > 0) {
      const missionIds = completionsRes.data.map(m => m.mission_id).filter(Boolean);
      if (missionIds.length > 0) {
        const { data: missions } = await supabase.from('daily_missions').select('id, title, coins').in('id', missionIds);
        const missionsMap = new Map(missions?.map(m => [m.id, m]) || []);
        completionsRes.data.forEach(record => {
          if (record.students?.name) {
            const mission = missionsMap.get(record.mission_id);
            activities.push({
              id: `mis-${record.id}`, type: 'mission',
              student: record.students.name,
              description: `أكمل "${mission?.title || 'مهمة'}"`,
              coins: mission?.coins || 0, time: record.completed_at
            });
          }
        });
      }
    }

    ordersRes.data?.forEach(record => {
      if (record.students?.name && record.products?.name) activities.push({
        id: `ord-${record.id}`, type: 'order',
        student: record.students.name,
        description: `طلب "${record.products.name}"`,
        coins: -(record.products.price || 0), time: record.created_at
      });
    });

    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    const limitedActivities = activities.slice(0, 15);
    if (isMounted.current) { setRecentActivities(limitedActivities); CacheManager.set(ACTIVITIES_CACHE_KEY, limitedActivities); }
  }, []);

  const loadDashboardData = useCallback(async (force = false) => {
    const online = navigator.onLine;
    if (isMounted.current) setLoading(true);

    if (!online && !force) {
      const cached = CacheManager.get(STATS_CACHE_KEY);
      const cachedActivities = CacheManager.get(ACTIVITIES_CACHE_KEY);
      if (cached) {
        setStats(cached.data);
        if (cachedActivities) setRecentActivities(cachedActivities.data);
        setLoading(false);
        return;
      }
    }

    if (!force) {
      const statsCache = CacheManager.get(STATS_CACHE_KEY);
      const activitiesCache = CacheManager.get(ACTIVITIES_CACHE_KEY);
      if (statsCache && activitiesCache) {
        setStats(statsCache.data);
        setRecentActivities(activitiesCache.data);
        setLoading(false);
        return;
      }
    }

    

    try {
      await Promise.all([fetchStatsOptimized(), fetchRecentActivitiesOptimized()]);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      showToast('❌ خطأ في التحميل', 'error');
      const statsCache = CacheManager.get(STATS_CACHE_KEY);
      const activitiesCache = CacheManager.get(ACTIVITIES_CACHE_KEY);
      if (statsCache && activitiesCache) {
        setStats(statsCache.data);
        setRecentActivities(activitiesCache.data);
      }
    } finally {
      if (isMounted.current) { setLoading(false); }
    }
  }, [fetchStatsOptimized, fetchRecentActivitiesOptimized, showToast]);

  const loadDashboardDataRef = useRef(loadDashboardData);
  useEffect(() => { loadDashboardDataRef.current = loadDashboardData; }, [loadDashboardData]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('✓ متصل بالإنترنت', 'success');
      loadDashboardData(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('⚠️ غير متصل - البيانات من الذاكرة', 'info');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadDashboardData, showToast]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine && isMounted.current) {
        CacheManager.clear(STATS_CACHE_KEY);
        CacheManager.clear(ACTIVITIES_CACHE_KEY);
        loadDashboardData(true);
      }
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  useEffect(() => {
    if (!navigator.onLine) return;
    const handleRealtimeChange = () => {
      if (!isMounted.current) return;
      CacheManager.clear(STATS_CACHE_KEY);
      CacheManager.clear(ACTIVITIES_CACHE_KEY);
      loadDashboardDataRef.current(true);
    };
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },             handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' },          handleRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_completions' }, handleRealtimeChange)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('Realtime connected');
        if (status === 'CHANNEL_ERROR') console.warn('Realtime error — falling back to interval');
      });
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  const formatTime = useCallback((timeString) => {
    const date = new Date(timeString);
    const diffMins = Math.floor((Date.now() - date) / 60000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `${diffMins}د`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}س`;
    return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  }, []);

  const getGreeting = useCallback(() => {
    const hour = new Date().getHours();
    if (hour < 12) return '☀️ صباح الخير';
    if (hour < 18) return '🌤️ نهارك سعيد';
    return '🌙 مساء الخير';
  }, []);

  // ============================================
  // MEMOIZED VALUES
  // ============================================
  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return recentActivities;
    return recentActivities.filter(a => a.type === activityFilter);
  }, [recentActivities, activityFilter]);

  const activityCounts = useMemo(() => ({
    all:        recentActivities.length,
    attendance: recentActivities.filter(a => a.type === 'attendance').length,
    mission:    recentActivities.filter(a => a.type === 'mission').length,
    order:      recentActivities.filter(a => a.type === 'order').length
  }), [recentActivities]);

  // ============================================
  // LOADING STATE
  // ============================================
  if (loading) {
    return (
      <div className="admin-dashboard-page loading-page">
        <div className="stars"></div>
        <div className="loading-screen">
          <div className="logo-loader">
            <span className="logo-icon">👑</span>
            <div className="logo-spinner"></div>
          </div>
          <p className="loading-text">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <div className="admin-dashboard-page">
      <div className="stars"></div>

      {/* Fixed Header */}
      <header className="smart-header">
        <div className="header-glass">
          <div className="header-row">
            <div className="greeting-section">
              <h1>{getGreeting()}</h1>
              <div className="status-row">
                <span className={`connection-dot ${isOnline ? 'online' : 'offline'}`}>
                  {isOnline ? '🟢' : '🔴'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Fixed Bottom Nav */}
      <nav className="bottom-nav-smart">
        <button className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveView('dashboard')}>
          <span className="nav-icon">📊</span>
          <span className="nav-text">لوحة</span>
        </button>
        <button className={`nav-item ${activeView === 'quick' ? 'active' : ''}`} onClick={() => setActiveView('quick')}>
          <span className="nav-icon">⚡</span>
          <span className="nav-text">سريع</span>
        </button>
        <button className={`nav-item ${activeView === 'activities' ? 'active' : ''}`} onClick={() => setActiveView('activities')}>
          <span className="nav-icon">📈</span>
          <span className="nav-text">نشاطات</span>
          {activityCounts.all > 0 && <span className="nav-counter">{activityCounts.all}</span>}
        </button>
        <button className="nav-item nav-logout" onClick={() => setShowLogoutPopup(true)}>
          <span className="nav-icon">🚪</span>
          <span className="nav-text">خروج</span>
        </button>
      </nav>

        {/* Logout Popup */}
        {showLogoutPopup && (
          <div className="logout-overlay" onClick={() => setShowLogoutPopup(false)}>
            <div className="logout-popup" onClick={e => e.stopPropagation()}>
              <span className="logout-icon">🚪</span>
              <h2 className="logout-title">خروج؟</h2>
              <p className="logout-subtitle">هل تريد تسجيل الخروج من لوحة الإدارة؟</p>
              <div className="logout-btns">
                <button className="logout-btn-yes" onClick={onLogout}>
                  <span className="logout-btn-emoji">✅</span> نعم
                </button>
                <button className="logout-btn-no" onClick={() => setShowLogoutPopup(false)}>
                  <span className="logout-btn-emoji">❌</span> لا
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className={`toast-smart ${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        )}

        <div className="dashboard-body-smart">

          {activeView === 'dashboard' && (
            <div className="view-content">
              <div className="stats-compact">
                <StatCardMini icon="👥" value={stats.totalStudents}  label="طالب"  color="purple" />
                <StatCardMini icon="✅" value={stats.totalMissions}  label="مهمة"  color="green"  />
                <StatCardMini icon="⛪" value={stats.attendanceRate} label="حضور"  color="blue"   />
                <StatCardMini icon="🛒" value={stats.pendingOrders}  label="طلب"   color="orange" pulse={stats.pendingOrders > 0} />
              </div>

              <div className="section-smart">
                <h3 className="section-title-smart">⚡ وصول سريع</h3>
                <div className="quick-grid-smart">
                  <QuickBtn icon="📷" label="QR"    path="/admin/qr-scanner"     onClick={navigate} />
                  <QuickBtn icon="💰" label="عملات" path="/admin/add-coins"      onClick={navigate} />
                  <QuickBtn icon="📦" label="طلبات" path="/admin/orders"         badge={stats.pendingOrders} onClick={navigate} />
                  <QuickBtn icon="👥" label="طلاب"  path="/admin/students"       onClick={navigate} />
                  <QuickBtn icon="📋" label="مهمات" path="/admin/daily-missions" onClick={navigate} />
                  <QuickBtn icon="🏪" label="متجر"  path="/admin/products"       onClick={navigate} />
                </div>
              </div>

              {recentActivities.length > 0 && (
                <div className="section-smart">
                  <div className="section-header-smart">
                    <h3 className="section-title-smart">📊 آخر النشاطات</h3>
                    <button className="view-all" onClick={() => setActiveView('activities')}>الكل ←</button>
                  </div>
                  <div className="activities-preview">
                    {recentActivities.slice(0, 5).map(activity => (
                      <ActivityItemCompact key={activity.id} activity={activity} formatTime={formatTime} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === 'quick' && (
            <div className="view-content">
              <h3 className="view-title">⚡ الإجراءات السريعة</h3>
              <div className="quick-list-full">
                <QuickItemFull icon="📷" title="مسح QR - الحضور"  desc="تسجيل حضور سريع"  path="/admin/qr-scanner"      onClick={navigate} />
                <QuickItemFull icon="💰" title="إضافة عملات"       desc="منح مكافآت فورية"  path="/admin/add-coins"       onClick={navigate} />
                <QuickItemFull icon="📦" title="مراجعة الطلبات"    desc="اعتماد ورفض"        path="/admin/orders"          badge={stats.pendingOrders} onClick={navigate} />
                <QuickItemFull icon="👥" title="إدارة الطلاب"      desc="إضافة وتعديل"       path="/admin/students"        onClick={navigate} />
                <QuickItemFull icon="📋" title="المهمات اليومية"   desc="إنشاء وإدارة"       path="/admin/daily-missions"  onClick={navigate} />
                <QuickItemFull icon="⭐" title="مهمات البونص"      desc="مكافآت أسبوعية"    path="/admin/bonus-missions"  onClick={navigate} />
                <QuickItemFull icon="🏪" title="إدارة المتجر"      desc="منتجات وأسعار"      path="/admin/products"        onClick={navigate} />
              </div>
            </div>
          )}

          {activeView === 'activities' && (
            <div className="view-content">
              <h3 className="view-title">📈 سجل النشاطات</h3>
              <div className="filters-smart">
                <button className={`filter-btn ${activityFilter === 'all'        ? 'active' : ''}`} onClick={() => setActivityFilter('all')}>الكل ({activityCounts.all})</button>
                <button className={`filter-btn ${activityFilter === 'attendance' ? 'active' : ''}`} onClick={() => setActivityFilter('attendance')}>⛪ حضور ({activityCounts.attendance})</button>
                <button className={`filter-btn ${activityFilter === 'mission'    ? 'active' : ''}`} onClick={() => setActivityFilter('mission')}>✅ مهمات ({activityCounts.mission})</button>
                <button className={`filter-btn ${activityFilter === 'order'      ? 'active' : ''}`} onClick={() => setActivityFilter('order')}>🛒 طلبات ({activityCounts.order})</button>
              </div>
              {filteredActivities.length > 0 ? (
                <div className="activities-list-full">
                  {filteredActivities.map(activity => (
                    <ActivityItemFull key={activity.id} activity={activity} formatTime={formatTime} />
                  ))}
                </div>
              ) : (
                <div className="empty-smart">
                  <span className="empty-emoji">📭</span>
                  <p>لا توجد نشاطات</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================
function StatCardMini({ icon, value, label, color, pulse }) {
  return (
    <div className={`stat-mini ${color} ${pulse ? 'pulse' : ''}`}>
      <span className="stat-mini-icon">{icon}</span>
      <div className="stat-mini-info">
        <span className="stat-mini-value">{value}</span>
        <span className="stat-mini-label">{label}</span>
      </div>
    </div>
  );
}

function QuickBtn({ icon, label, path, badge, onClick }) {
  return (
    <button className="quick-btn-smart" onClick={() => onClick(path)}>
      {badge > 0 && <span className="quick-badge-smart">{badge}</span>}
      <span className="quick-icon-smart">{icon}</span>
      <span className="quick-label-smart">{label}</span>
    </button>
  );
}

function QuickItemFull({ icon, title, desc, path, badge, onClick }) {
  return (
    <button className="quick-item-full" onClick={() => onClick(path)}>
      {badge > 0 && <span className="item-badge-full">{badge}</span>}
      <span className="item-icon-full">{icon}</span>
      <div className="item-content-full"><h4>{title}</h4><p>{desc}</p></div>
      <span className="item-arrow-full">→</span>
    </button>
  );
}

function ActivityItemCompact({ activity, formatTime }) {
  return (
    <div className={`activity-compact-smart ${activity.type}`}>
      <span className="activity-icon-smart">{ACTIVITY_ICONS[activity.type]}</span>
      <div className="activity-info-smart">
        <span className="activity-name-smart">{activity.student}</span>
        <span className="activity-desc-smart">{activity.description}</span>
      </div>
      <div className="activity-meta-smart">
        <span className={`activity-coins-smart ${activity.coins < 0 ? 'neg' : 'pos'}`}>
          {activity.coins > 0 ? '+' : ''}{activity.coins}🪙
        </span>
        <span className="activity-time-smart">{formatTime(activity.time)}</span>
      </div>
    </div>
  );
}

function ActivityItemFull({ activity, formatTime }) {
  return (
    <div className={`activity-full-smart ${activity.type}`}>
      <div className="activity-badge-full">{ACTIVITY_ICONS[activity.type]}</div>
      <div className="activity-body-full">
        <div className="activity-header-full">
          <span className="activity-student-full">{activity.student}</span>
          <span className="activity-time-full">{formatTime(activity.time)}</span>
        </div>
        <div className="activity-description-full">{activity.description}</div>
      </div>
      <span className={`activity-coins-full ${activity.coins < 0 ? 'negative' : 'positive'}`}>
        {activity.coins > 0 ? '+' : ''}{activity.coins} 🪙
      </span>
    </div>
  );
}

export default AdminDashboard;