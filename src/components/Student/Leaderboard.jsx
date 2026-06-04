import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './StudentLeaderboard.css';

// ─── constants ────────────────────────────────────────────────────────────────
const RANK_LABELS = {
  1: 'الأول', 2: 'الثاني', 3: 'الثالث', 4: 'الرابع', 5: 'الخامس',
  6: 'السادس', 7: 'السابع', 8: 'الثامن', 9: 'التاسع', 10: 'العاشر',
};

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

const COINS_PER_LEVEL = 100;
const MAX_LEVEL       = 50;
const calcLevel = (coins) => Math.min(Math.floor((coins ?? 0) / COINS_PER_LEVEL) + 1, MAX_LEVEL);

const REFRESH_INTERVAL = 60000; // FIX 6: 60s بدل 30s

// ─── helpers ──────────────────────────────────────────────────────────────────
const getRankMedal = (rank) => MEDALS[rank] || `#${rank}`;
const getRankLabel = (rank) => RANK_LABELS[rank] || `المركز ${rank}`; // FIX 4

// ─── PodiumMobileItem ─────────────────────────────────────────────────────────
const PodiumMobileItem = React.memo(({ student, rank, isMe, compact = false }) => {
  const medal     = MEDALS[rank];
  const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';
  return (
    <div className={`slb-podium-item ${rankClass}${isMe ? ' is-me' : ''}${compact ? ' compact' : ''}`}>
      {rank === 1 && <div className="slb-winner-badge">👑 البطل</div>}
      <div className="slb-podium-medal">{medal}</div>
      <div className="slb-podium-info">
        <h3>
          {student.name}
          {isMe && <span className="slb-you-tag">u</span>}
        </h3>
        <div className="slb-podium-stats">
          <span className="slb-coins">{student.coins} 🪙</span>
          <span className="slb-level">⭐ Lv.{calcLevel(student.coins)}</span>
        </div>
      </div>
    </div>
  );
});
PodiumMobileItem.displayName = 'PodiumMobileItem';

// ─── LeaderboardItem ──────────────────────────────────────────────────────────
const LeaderboardItem = React.memo(({ student, rank, isMe }) => (
  <div className={`slb-lb-item${isMe ? ' is-me' : ''}${rank <= 3 ? ' top-three' : ''}`}>
    <div className="slb-lb-rank">
      <span className="slb-rank-badge">{getRankMedal(rank)}</span>
    </div>
    <div className="slb-lb-info">
      <div className="slb-lb-name">
        {student.name}
        {isMe && <span className="slb-you-badge">أنت</span>}
      </div>
      <div className="slb-lb-level">⭐ Level {calcLevel(student.coins)}</div>
    </div>
    <div className="slb-lb-coins">{student.coins} 🪙</div>
  </div>
));
LeaderboardItem.displayName = 'LeaderboardItem';

// ─── MotivationCard ───────────────────────────────────────────────────────────
const MotivationCard = React.memo(({ navigate }) => (
  <div className="slb-motivation">
    <div className="slb-motivation-title">
      <span className="slb-motivation-emoji">💪</span>
      <h3>استمر في التقدم!</h3>
    </div>
    <p>أكمل المهمات لكسب المزيد من العملات</p>
    <div className="slb-motivation-btns">
      <button className="slb-mot-btn primary" onClick={() => navigate('/student/missions')}>
        📋 Daily Missions
      </button>
      <button className="slb-mot-btn secondary" onClick={() => navigate('/student/bonus')}>
        ⭐ Bonus
      </button>
    </div>
  </div>
));
MotivationCard.displayName = 'MotivationCard';

// ─── main component ───────────────────────────────────────────────────────────
function StudentLeaderboard({ user, onLogout }) {
  const navigate      = useNavigate();
  const isMountedRef  = useRef(true); // FIX 7: mounted guard

  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState('');
  const [showTopOnly, setShowTopOnly] = useState(false);

  // FIX 7: cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ─── fetch ──────────────────────────────────────────────────────────────────
  const fetchLeaderboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else           setLoading(true);
      setError('');

      const { data, error: fetchError } = await supabase
        .from('students')
        .select('id, name, coins, level, student_number')
        .order('coins', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      if (!isMountedRef.current) return; // FIX 7: guard
      setStudents(data || []);
    } catch (err) {
      console.error('Leaderboard fetch error:', err);
      if (!isMountedRef.current) return;
      setError('حدث خطأ في تحميل البيانات');
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // initial load
  useEffect(() => {
    if (user?.student?.id) fetchLeaderboard();
    else { setError('لم يتم العثور على بيانات الطالب'); setLoading(false); }
  }, [user?.student?.id, fetchLeaderboard]);

  // auto-refresh — FIX 6: 60s
  useEffect(() => {
    if (!user?.student?.id) return;
    const timer = setInterval(() => fetchLeaderboard(true), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [user?.student?.id, fetchLeaderboard]);

  // ─── computed ────────────────────────────────────────────────────────────────
  const myIndex = useMemo(
    () => students.findIndex(s => s.id === user?.student?.id),
    [students, user?.student?.id]
  );
  const myRank        = myIndex >= 0 ? myIndex + 1 : 0;
  const currentStudent = myIndex >= 0 ? students[myIndex] : null;

  // FIX 5: الشخص اللي فوق مباشرة هو students[myIndex - 1]
  const coinGapToNext = useMemo(() => {
    if (myRank <= 1 || myIndex < 1 || !currentStudent) return 0;
    return (students[myIndex - 1]?.coins ?? 0) - currentStudent.coins;
  }, [myRank, myIndex, students, currentStudent]);

  // FIX 3: المنطق كان معكوس — showTopOnly=true يعرض أول 10
  const displayedStudents = useMemo(
    () => showTopOnly ? students.slice(0, 10) : students,
    [students, showTopOnly]
  );

  // ─── loading screen — FIX 2: scoped داخل student-leaderboard-page ──────────
  if (loading) {
    return (
      <div className="student-leaderboard-page">
        <div className="slb-stars" />
        <div className="slb-loading-screen">
          <div className="slb-logo-loader">
            <span className="slb-logo-icon">🏆</span>
            <div className="slb-logo-spinner" />
          </div>
          <p className="slb-loading-text">جاري تحميل لوحة الصدارة...</p>
        </div>
      </div>
    );
  }

  if (error && students.length === 0) {
    return (
      <div className="student-leaderboard-page">
        <div className="slb-stars" />
        <div className="slb-error-screen">
          <span className="slb-error-icon">⚠️</span>
          <p>{error}</p>
          <button className="slb-btn-primary" onClick={() => fetchLeaderboard()}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  // ─── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="student-leaderboard-page">
      <div className="slb-stars" />

      {/* ══ HEADER ══ */}
      <header className="slb-header">
        <div className="slb-header-row">
          <button className="slb-back-btn" onClick={() => navigate('/student')} aria-label="رجوع">
            ←
          </button>
          <div className="slb-header-center">
            <h1 className="slb-header-title">🏆  Leader board</h1>
          </div>
          <button
            className={`slb-refresh-btn${refreshing ? ' spinning' : ''}`}
            onClick={() => fetchLeaderboard(true)}
            disabled={refreshing}
            aria-label="تحديث"
          >
            <span>🔄</span>
          </button>
        </div>
      </header>

      {/* ══ COINS STRIP — below header ══ */}
      {currentStudent && (
        <div className="slb-coins-strip">
          <div className="slb-coins-strip-inner">
            <span className="slb-coins-strip-label"> Your coins</span>
            <div className="slb-coins-strip-value">
              <span className="slb-coin-icon-large">🪙</span>
              <span className="slb-coin-number">{currentStudent.coins.toLocaleString('ar-EG')}</span>
            </div>
          </div>
          {myRank > 0 && (
            <div className="slb-rank-pill">
              <span>{getRankMedal(myRank)}</span>
              <span>المركز {getRankLabel(myRank)}</span>
            </div>
          )}
        </div>
      )}

      {/* ══ BODY ══ */}
      <div className="slb-container">

        {/* Gap to next rank */}
        {coinGapToNext > 0 && (
          <div className="slb-gap-card">
            <span className="slb-gap-label">للمركز الأعلى:</span>
            <span className="slb-gap-value">{coinGapToNext} 🪙</span>
          </div>
        )}

        {/* Podium Top 3 */}
        {students.length >= 3 && (
          <div className="slb-podium">
            <div className="slb-podium-header"><h2>🏅 Top Three</h2></div>
            <PodiumMobileItem student={students[0]} rank={1} isMe={students[0].id === user?.student?.id} />
            <div className="slb-podium-row">
              <PodiumMobileItem student={students[1]} rank={2} isMe={students[1].id === user?.student?.id} compact />
              <PodiumMobileItem student={students[2]} rank={3} isMe={students[2].id === user?.student?.id} compact />
            </div>
          </div>
        )}

        {/* Full List */}
        <div className="slb-list-header">
          <h2>📊 الترتيب الكامل</h2>
          <div className="slb-list-controls">
            <span className="slb-student-count">{students.length} طالب</span>
            {students.length > 10 && (
              <button className="slb-toggle-btn" onClick={() => setShowTopOnly(v => !v)}>
                {showTopOnly ? 'عرض الكل' : 'أفضل 10'}
              </button>
            )}
          </div>
        </div>

        <div className="slb-leaderboard-list">
          {displayedStudents.map((student, index) => (
            <LeaderboardItem
              key={student.id}
              student={student}
              rank={index + 1}
              isMe={student.id === user?.student?.id}
            />
          ))}
        </div>

        {showTopOnly && students.length > 10 && (
          <button className="slb-show-more-btn" onClick={() => setShowTopOnly(false)}>
            عرض باقي الطلاب ({students.length - 10})
          </button>
        )}

        {students.length === 0 && (
          <div className="slb-empty-state">
            <span className="slb-empty-icon">📭</span>
            <p>لا توجد بيانات</p>
          </div>
        )}

        <MotivationCard navigate={navigate} />
      </div>

      {/* ══ BOTTOM NAV ══ */}
      <nav className="slb-bottom-nav">
        <button className="slb-nav-item active" onClick={() => navigate('/student/leaderboard')}>
          <span className="slb-nav-icon">🏆</span>
          <span className="slb-nav-text">Leader Board</span>
        </button>
        <button className="slb-nav-item" onClick={() => navigate('/student')}>
          <span className="slb-nav-icon">🏠</span>
          <span className="slb-nav-text">Home</span>
        </button>
        <button className="slb-nav-item" onClick={() => navigate('/student/missions')}>
          <span className="slb-nav-icon">📋</span>
          <span className="slb-nav-text">MIssions</span>
        </button>
        <button className="slb-nav-item" onClick={() => navigate('/student/shop')}>
          <span className="slb-nav-icon">🛒</span>
          <span className="slb-nav-text">الكانتين</span>
        </button>
      </nav>
    </div>
  );
}

export default StudentLeaderboard;