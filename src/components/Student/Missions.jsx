import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './StudentMissions.css';

function StudentMissions({ user }) {
  const navigate = useNavigate();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const [missions,           setMissions]           = useState([]);
  const [completedMissions,  setCompletedMissions]  = useState([]);
  const [studentData,        setStudentData]        = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [flippedCard,        setFlippedCard]        = useState(null);
  const [completingMission,  setCompletingMission]  = useState(null);
  const [leaderboard,        setLeaderboard]        = useState([]);
  const [toast,              setToast]              = useState({ show: false, message: '', type: '' });
  const [currentStreak,      setCurrentStreak]      = useState(0);
  const [streakMultiplier,   setStreakMultiplier]   = useState(1);

  // ✅ إصلاح #1: showToast بـ useRef للـ timer عشان نمنع memory leak
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (isMountedRef.current) setToast({ show: true, message, type });
    toastTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setToast({ show: false, message: '', type: '' });
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // ✅ إصلاح #2: fetchStudentData بتجيب بس اللي محتاجه مش select('*')
  const fetchStudentData = useCallback(async () => {
    const { data, error } = await supabase
      .from('students')
      .select('id, name, coins')
      .eq('id', user.student.id)
      .single();
    if (error) throw error;
    if (isMountedRef.current) setStudentData(data);
  }, [user]);

  const fetchTodayMissions = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('daily_missions')
      .select('*')
      .eq('mission_date', today)
      .order('id', { ascending: true });
    if (error) throw error;
    if (isMountedRef.current) setMissions(data || []);
  }, []);

  const fetchCompletedMissions = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('mission_completions')
      .select('mission_id')
      .eq('student_id', user.student.id)
      .eq('mission_type', 'daily')
      .gte('completed_at', `${today}T00:00:00`)
      .lt('completed_at', `${today}T23:59:59`);
    if (error) throw error;
    if (isMountedRef.current) setCompletedMissions(data?.map(m => m.mission_id) || []);
  }, [user]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('mission_completions')
        .select('student_id, students(name, coins)')
        .eq('mission_type', 'daily')
        .gte('completed_at', `${today}T00:00:00`)
        .lt('completed_at', `${today}T23:59:59`);

      if (error) throw error;

      const counts = {};
      data?.forEach(item => {
        const id = item.student_id;
        if (!counts[id]) {
          counts[id] = { name: item.students.name, coins: item.students.coins, completions: 0 };
        }
        counts[id].completions++;
      });

      const sorted = Object.values(counts)
        .sort((a, b) => b.completions - a.completions)
        .slice(0, 5);

      if (isMountedRef.current) setLeaderboard(sorted);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  }, []);

  const calculateStreak = useCallback(async () => {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const yesterdayDate = new Date(today);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

      const sixtyDaysAgo = new Date(today);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data, error } = await supabase
        .from('mission_completions')
        .select('completed_at')
        .eq('student_id', user.student.id)
        .eq('mission_type', 'daily')
        .gte('completed_at', sixtyDaysAgo.toISOString())
        .order('completed_at', { ascending: false });

      if (error) throw error;

      const uniqueDates = new Set();
      data?.forEach(completion => {
        const date = new Date(completion.completed_at).toISOString().split('T')[0];
        uniqueDates.add(date);
      });

      const streakIsActive = uniqueDates.has(todayStr) || uniqueDates.has(yesterdayStr);

      if (!streakIsActive) {
        if (isMountedRef.current) { setCurrentStreak(0); setStreakMultiplier(1); }
        return;
      }

      let streak = 0;
      let checkDate = new Date(today);
      if (!uniqueDates.has(todayStr)) checkDate = new Date(yesterdayDate);

      for (let i = 0; i < 60; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (uniqueDates.has(dateStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else { break; }
      }

      const dayInCycle = ((streak - 1) % 7) + 1;
      const multiplier = dayInCycle === 7 ? 2 : 1;

      if (isMountedRef.current) {
        setCurrentStreak(streak);
        setStreakMultiplier(multiplier);
      }
    } catch (error) {
      console.error('Error calculating streak:', error);
      if (isMountedRef.current) { setCurrentStreak(0); setStreakMultiplier(1); }
    }
  }, [user]);

  const loadAllData = useCallback(async () => {
    if (isMountedRef.current) setLoading(true);
    try {
      await Promise.all([
        fetchTodayMissions(),
        fetchCompletedMissions(),
        fetchStudentData(),
        fetchLeaderboard(),
        calculateStreak(),
      ]);
    } catch (error) {
      showToast('حدث خطأ في تحميل البيانات', 'error');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [fetchTodayMissions, fetchCompletedMissions, fetchStudentData, fetchLeaderboard, calculateStreak, showToast]);

  useEffect(() => {
    if (user?.student) loadAllData();
  }, [user, loadAllData]);

  // ✅ إصلاح #3: الـ Realtime filter أدق — بيسمع بس للطالب ده
  useEffect(() => {
    if (!user?.student) return;
    const subscription = supabase
      .channel(`mission_completions_${user.student.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mission_completions',
        filter: `mission_type=eq.daily`,
      }, () => {
        if (isMountedRef.current) fetchLeaderboard();
      })
      .subscribe();
    return () => supabase.removeChannel(subscription);
  }, [user, fetchLeaderboard]);

  const completeMission = async (mission) => {
    if (completedMissions.includes(mission.id)) {
      showToast('لقد أكملت هذه المهمة بالفعل!', 'info');
      return;
    }
    await submitMissionCompletion(mission);
  };

  const submitMissionCompletion = async (mission) => {
    if (!isMountedRef.current) return;
    setCompletingMission(mission.id);
    const finalCoins = mission.coins * streakMultiplier;

    try {
      const { error: completionError } = await supabase
        .from('mission_completions')
        .insert([{ student_id: user.student.id, mission_id: mission.id, mission_type: 'daily' }]);

      if (completionError) {
        if (completionError.code === '23505') {
          showToast('أكملت هذه المهمة بالفعل', 'info');
          if (isMountedRef.current) setCompletedMissions(prev => [...prev, mission.id]);
          return;
        }
        throw completionError;
      }

      const { error: coinsError } = await supabase
        .rpc('add_coins', { student_id: user.student.id, amount: finalCoins });
      if (coinsError) throw coinsError;

      // هذه الـ inserts مش محتاجين await — تشتغل في الخلفية
      supabase.from('coin_transactions').insert([{
        student_id: user.student.id,
        amount: finalCoins,
        transaction_type: 'earned',
        reason: `إكمال مهمة: ${mission.title}${streakMultiplier > 1 ? ` (×${streakMultiplier})` : ''}`,
      }]);

      supabase.from('notifications').insert([{
        student_id: user.student.id,
        title: '🎉 أحسنت!',
        message: `تم إكمال "${mission.title}" ${streakMultiplier > 1 ? `مع مضاعف ×${streakMultiplier}!` : ''} +${finalCoins} عملة!`,
      }]);

      if (!isMountedRef.current) return;

      setCompletedMissions(prev => [...prev, mission.id]);
      setStudentData(prev => ({ ...prev, coins: prev.coins + finalCoins }));

      showToast(
        streakMultiplier > 1
          ? `🔥 مذهل! ${finalCoins} عملة (×${streakMultiplier} مضاعف)!`
          : `🎉 رائع! +${finalCoins} عملة!`,
        'success'
      );

      setFlippedCard(mission.id);
      setTimeout(() => { if (isMountedRef.current) setFlippedCard(null); }, 2000);

      fetchLeaderboard();
      calculateStreak();

    } catch (error) {
      console.error('Error:', error);
      showToast('حدث خطأ. حاول مرة أخرى.', 'error');
    } finally {
      if (isMountedRef.current) setCompletingMission(null);
    }
  };

  const getCompletionPercentage = () => {
    if (missions.length === 0) return 0;
    return Math.round((completedMissions.length / missions.length) * 100);
  };

  const getTodayCoins = () =>
    missions.filter(m => completedMissions.includes(m.id))
      .reduce((sum, m) => sum + (m.coins * streakMultiplier), 0);

  const getDayInCycle = () => {
    if (currentStreak === 0) return 0;
    return ((currentStreak - 1) % 7) + 1;
  };

  return (
    <div className="sm-page">
      <div className="sm-stars" />

      {/* Toast */}
      {toast.show && (
        <div className={`sm-toast sm-toast--${toast.type}`}>{toast.message}</div>
      )}

      {/* ── Header ── */}
      <header className="sm-header">
        <div className="sm-header__left">
          <button className="sm-back-btn" onClick={() => navigate('/student')}>←</button>
          <div className="sm-header__title">
            <h3>🎮 مهماتي اليومية</h3>
            <p>حوّل روتينك لمغامرة!</p>
          </div>
        </div>
        <div className="sm-header__right">
          {studentData && (
            <div className="sm-coins">
              <span className="sm-coins__icon">🪙</span>
              <span className="sm-coins__amount">{studentData.coins.toLocaleString('ar-EG')}</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <div className="sm-container">
        {loading ? (
          <div className="sm-loading">
            <div className="sm-spinner" />
            <p>جاري التحميل...</p>
          </div>
        ) : (
          <>
            {/* Hero */}
            <div className="sm-hero">
              <div className="sm-streak-card">
                <div className="sm-streak-card__visual">
                  <div className="sm-streak-card__flame">🔥</div>
                  <div className="sm-streak-card__number">{currentStreak}</div>
                </div>
                <div className="sm-streak-card__details">
                  <h3>سلسلة النجاح</h3>
                  <p>
                    {currentStreak === 0
                      ? 'ابدأ سلسلتك اليوم!'
                      : `${getDayInCycle()}/7 في الدورة الحالية`}
                  </p>
                  {streakMultiplier > 1 ? (
                    <div className="sm-multiplier-badge sm-multiplier-badge--active">
                      ⚡ اليوم السابع - مضاعف ×{streakMultiplier}!
                    </div>
                  ) : getDayInCycle() > 0 && (
                    <div className="sm-multiplier-badge">
                      💪 {7 - getDayInCycle()} أيام للمضاعف
                    </div>
                  )}
                </div>
              </div>

              {leaderboard.length > 0 && (
                <div className="sm-leaderboard">
                  <h4>🏆 متصدرو اليوم</h4>
                  <div className="sm-leaderboard__list">
                    {leaderboard.map((student, idx) => (
                      <div key={idx} className="sm-leaderboard__item">
                        <span className="sm-leaderboard__rank">#{idx + 1}</span>
                        <span className="sm-leaderboard__name">{student.name}</span>
                        <span className="sm-leaderboard__count">{student.completions} ✅</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Progress Ring */}
            <div className="sm-progress-ring-wrap">
              <svg className="sm-progress-ring" width="160" height="160" viewBox="0 0 200 200">
                <circle className="sm-progress-ring__bg"   cx="100" cy="100" r="85" />
                <circle
                  className="sm-progress-ring__fill"
                  cx="100" cy="100" r="85"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 85}`,
                    strokeDashoffset: `${2 * Math.PI * 85 * (1 - getCompletionPercentage() / 100)}`,
                  }}
                />
                <text x="100" y="95"  className="sm-progress-ring__pct">{getCompletionPercentage()}%</text>
                <text x="100" y="115" className="sm-progress-ring__label">مكتمل</text>
              </svg>
              <div className="sm-progress-stats">
                <div className="sm-stat">
                  <span className="sm-stat__value">{completedMissions.length}/{missions.length}</span>
                  <span className="sm-stat__label">مهمات</span>
                </div>
                <div className="sm-stat">
                  <span className="sm-stat__value">{getTodayCoins()}</span>
                  <span className="sm-stat__label">عملات اليوم</span>
                </div>
              </div>
            </div>

            {/* Section Header */}
            <div className="sm-section-header">
              <h2>📅 مهمات اليوم</h2>
              <span className="sm-date-badge">
                {new Date().toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>

            {missions.length === 0 ? (
              <div className="sm-empty">
                <div className="sm-empty__icon">📭</div>
                <h3>لا توجد مهمات اليوم</h3>
                <p>استمتع بيومك وتحقق لاحقاً!</p>
              </div>
            ) : (
              <div className="sm-grid">
                {missions.map((mission, idx) => {
                  const isCompleted   = completedMissions.includes(mission.id);
                  const isFlipped     = flippedCard === mission.id;
                  const isLoadingThis = completingMission === mission.id;

                  return (
                    <div
                      key={mission.id}
                      className={`sm-card ${isCompleted ? 'sm-card--completed' : ''} ${isFlipped ? 'sm-card--flipped' : ''}`}
                      style={{ animationDelay: `${idx * 0.1}s` }}
                    >
                      <div className="sm-card__inner">
                        {/* Front */}
                        <div className="sm-card__front">
                          <div className="sm-card__glow" />
                          <div className="sm-card__mission-icon">{mission.icon}</div>
                          <h3 className="sm-card__title">{mission.title}</h3>
                          <p className="sm-card__desc">{mission.description}</p>
                          <div className="sm-card__footer">
                            <div className="sm-coin-reward">
                              <span className="sm-coin-reward__value">+{mission.coins * streakMultiplier}</span>
                              <span className="sm-coin-reward__icon">🪙</span>
                              {streakMultiplier > 1 && (
                                <span className="sm-coin-reward__multiplier">×{streakMultiplier}</span>
                              )}
                            </div>
                            {isCompleted ? (
                              <div className="sm-stamp">
                                <span className="sm-stamp__check">✓</span>
                                <span className="sm-stamp__text">مكتمل</span>
                              </div>
                            ) : (
                              <button
                                className={`sm-complete-btn ${isLoadingThis ? 'sm-complete-btn--loading' : ''}`}
                                onClick={() => completeMission(mission)}
                                disabled={isLoadingThis}
                              >
                                {isLoadingThis ? (
                                  <><span className="sm-btn-spinner" /><span>جاري...</span></>
                                ) : (
                                  <><span>✨</span><span>أكملت!</span></>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Back */}
                        <div className="sm-card__back">
                          <div className="sm-celebration">
                            <div className="sm-celebration__icon">🎉</div>
                            <h3>أحسنت!</h3>
                            <p>+{mission.coins * streakMultiplier} عملة</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* All Done */}
            {completedMissions.length === missions.length && missions.length > 0 && (
              <div className="sm-all-done">
                <div className="sm-all-done__content">
                  <div className="sm-all-done__trophy">🏆</div>
                  <h2>مذهل! أكملت جميع المهمات!</h2>
                  <p>حصلت على {getTodayCoins()} عملة اليوم</p>
                  <div className="sm-all-done__stats">
                    <div className="sm-all-done__stat"><span>⭐</span><span>يوم مثالي</span></div>
                    <div className="sm-all-done__stat"><span>🔥</span><span>{currentStreak} يوم سلسلة</span></div>
                    {streakMultiplier > 1 && (
                      <div className="sm-all-done__stat sm-all-done__stat--highlight">
                        <span>⚡</span><span>مضاعف ×{streakMultiplier} نشط!</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default StudentMissions;