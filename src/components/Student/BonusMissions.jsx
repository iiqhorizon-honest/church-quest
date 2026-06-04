import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './StudentBonusMissions.css';

function StudentBonusMissions({ user }) {
  const navigate = useNavigate();
  const [missions, setMissions] = useState([]);
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.student?.id) {
      Promise.all([fetchActiveMissions(), fetchStudentData()]);
    } else {
      setLoading(false);
    }
  }, [user?.student?.id]);

  const fetchStudentData = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('id', user.student.id)
        .single();

      if (error) throw error;
      setStudentData(data);
    } catch (error) {
      console.error('Error fetching student data:', error);
    }
  };

  const fetchActiveMissions = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('bonus_missions')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMissions(data || []);
    } catch (error) {
      console.error('Error fetching bonus missions:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendToWhatsApp = (mission) => {
    const message = `مرحباً! أريد إرسال عملي لمهمة البونص: ${mission.title}`;
    const whatsappUrl = `https://wa.me/${mission.whatsapp_number}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const getDaysRemaining = (endDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const diffTime = end - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(diffDays, 0); // ✅ مش هيرجع قيمة سالبة أبداً
  };

  return (
    <div className="student-bonus-page">

      {/* ===== ANIMATED BACKGROUND ===== */}
      <div className="bg-canvas">
        <div className="stars"></div>
        <div className="grid-lines"></div>

        {/* Floating soft orbs */}
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>

        {/* Floating particles */}
        <div className="particles">
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
        </div>
      </div>

      {/* ===== HEADER ===== */}
      <header className="header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate('/student')}>‹</button>
        </div>

        <div className="header-center">
          <h3>⭐ مهمات البونص</h3>
          <p>تحديات أسبوعية بجوائز مميزة</p>
        </div>

        <div className="header-right">
          {studentData && (
            <div className="coins-display">
              <span className="coin-icon">🪙</span>
              <span className="coin-amount">{studentData.coins}</span>
            </div>
          )}
        </div>
      </header>

      {/* ===== PAGE CONTENT ===== */}
      <div className="container">

        {/* Info Banner */}
        <div className="info-banner">
          <div className="info-icon">💡</div>
          <div className="info-content">
            <h3>كيف تعمل مهمات البونص؟</h3>
            <p>اضغط على زر الواتساب لإرسال عملك. سيتم مراجعته وإضافة العملات إلى حسابك!</p>
          </div>
        </div>

        {/* Active Missions */}
        <div className="section-header">
          <h2>🎯 المهمات المتاحة</h2>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="empty-icon">⏳</div>
            <h3>جاري تحميل المهمات...</h3>
          </div>
        ) : missions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⭐</div>
            <h3>لا توجد مهمات بونص متاحة حالياً</h3>
            <p>تحقق لاحقاً من المهمات الجديدة</p>
          </div>
        ) : (
          <div className="bonus-missions-grid">
            {missions.map(mission => {
              const daysRemaining = getDaysRemaining(mission.end_date);

              return (
                <div key={mission.id} className="bonus-mission-card">
                  <div className="bonus-badge premium">⭐ بونص</div>

                  <div className="bonus-icon-large">{mission.icon}</div>

                  <h3>{mission.title}</h3>
                  <p className="bonus-description">{mission.description}</p>

                  <div className="bonus-reward-section">
                    <div className="reward-amount">
                      <span className="reward-label">المكافأة:</span>
                      <span className="reward-value">+{mission.coins} 🪙</span>
                    </div>
                  </div>

                  <div className="bonus-time-remaining">
                    <span className="time-icon">⏰</span>
                    <span>
                      {daysRemaining > 0
                        ? `متبقي ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : 'أيام'}`
                        : 'آخر يوم!'}
                    </span>
                  </div>

                  <div className="bonus-requirements">
                    <h4>📝 المتطلبات:</h4>
                    <ul>
                      <li>إرسال العمل عبر الواتساب</li>
                      <li>التأكد من جودة العمل</li>
                      <li>الانتظار للمراجعة</li>
                    </ul>
                  </div>

                  {/* ✅ Removed whatsapp number below button */}
                  <button
                    className="whatsapp-btn"
                    onClick={() => sendToWhatsApp(mission)}
                  >
                    <span className="whatsapp-icon">💬</span>
                    <span>إرسال عبر الواتساب</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Tips Section */}
        <div className="section-header">
          <h2>💡 نصائح للنجاح</h2>
        </div>

        <div className="tips-card">
          <div className="tip-item">
            <span className="tip-icon">📹</span>
            <p>اجعل الفيديوهات قصيرة وواضحة (3-5 دقائق)</p>
          </div>
          <div className="tip-item">
            <span className="tip-icon">🎨</span>
            <p>استخدم الألوان الزاهية في الرسومات</p>
          </div>
          <div className="tip-item">
            <span className="tip-icon">📝</span>
            <p>راجع عملك قبل الإرسال</p>
          </div>
          <div className="tip-item">
            <span className="tip-icon">⏰</span>
            <p>لا تنتظر آخر يوم - أرسل مبكراً!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentBonusMissions;