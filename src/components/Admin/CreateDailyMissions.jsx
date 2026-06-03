import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './CreateDailyMissions.css';

// ============================================
// CONSTANTS
// ============================================
const MISSION_TEMPLATES = [
  { title: 'صلاة باكر',      description: 'صلِ صلاة باكر في الصباح',       icon: '🌅', coins: 10 },
  { title: 'قراءة الكتاب',   description: 'اقرأ إصحاحاً من الكتاب المقدس', icon: '📖', coins: 10 },
  { title: 'صلاة النوم',     description: 'صلِ صلاة النوم قبل النوم',       icon: '🌙', coins: 10 },
];

const ICON_OPTIONS = ['📋', '🙏', '📖', '📿', '❤️', '✝️', '🌅', '🌙', '🎵', '✨', '🌟', '💫'];

// ============================================
// CONFIRM MODAL
// ============================================
const ConfirmModal = ({ message, onConfirm, onCancel }) => (
  <div className="modal-overlay">
    <div className="modal-box">
      <h3>{message}</h3>
      <div className="modal-actions">
        <button className="btn-delete-confirm" onClick={onConfirm}>حذف</button>
        <button className="btn-cancel-smart"   onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  </div>
);

// ============================================
// DATE MODAL
// ============================================
const DateModal = ({ title, onConfirm, onCancel, defaultDate }) => {
  const [inputDate, setInputDate] = useState(defaultDate);
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h3>{title}</h3>
        <input
          type="date"
          value={inputDate}
          onChange={(e) => setInputDate(e.target.value)}
          className="date-input-smart"
        />
        <div className="modal-actions">
          <button className="btn-save-smart"   onClick={() => onConfirm(inputDate)}>تأكيد</button>
          <button className="btn-cancel-smart" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// NUMBER MODAL
// ============================================
const NumberModal = ({ title, defaultValue, onConfirm, onCancel }) => {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h3>{title}</h3>
        <input
          type="number"
          value={value}
          min="1"
          max="30"
          onChange={(e) => setValue(e.target.value)}
          className="date-input-smart"
        />
        <div className="modal-actions">
          <button className="btn-save-smart"   onClick={() => onConfirm(value)}>تأكيد</button>
          <button className="btn-cancel-smart" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MISSION CARD
// ============================================
const MissionCard = ({ mission, editingId, setEditingId, onSave, onDelete }) => {
  const isEditing = editingId === mission.id;
  const [editData, setEditData] = useState(mission);

  const isEditingRef = useRef(isEditing);
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  // FIX 2: منعنا reset الـ editData وانت شغال بتكتب
  useEffect(() => {
    if (!isEditingRef.current) {
      setEditData(mission);
    }
  }, [mission]);

  return (
    <div className={`mission-card-smart ${isEditing ? 'editing' : ''}`}>
      {isEditing ? (
        <div className="mission-edit-smart">
          <div className="edit-row-smart">
            <select
              value={editData.icon}
              onChange={(e) => setEditData({ ...editData, icon: e.target.value })}
              className="icon-select-smart"
              aria-label="اختر أيقونة"
            >
              {ICON_OPTIONS.map(icon => (
                <option key={icon} value={icon}>{icon}</option>
              ))}
            </select>
            <input
              type="text"
              value={editData.title}
              onChange={(e) => setEditData({ ...editData, title: e.target.value })}
              placeholder="عنوان المهمة"
              className="edit-input-smart"
              autoFocus
            />
          </div>
          <textarea
            value={editData.description}
            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            placeholder="الوصف"
            className="edit-textarea-smart"
            rows="2"
          />
          <div className="edit-row-smart">
            <div className="coins-input-wrapper">
              <input
                type="number"
                value={editData.coins}
                onChange={(e) => {
                  // FIX 3: minimum 1
                  const val = parseInt(e.target.value, 10);
                  setEditData({ ...editData, coins: val >= 1 ? val : 1 });
                }}
                className="coins-input-smart"
                min="1"
                aria-label="عدد الكوينز"
              />
              <span className="coins-label">🪙</span>
            </div>
            <div className="edit-actions-smart">
              <button
                className="btn-save-smart"
                onClick={() => onSave(editData)}
                aria-label="حفظ"
              >✅</button>
              <button
                className="btn-cancel-smart"
                aria-label="إلغاء"
                onClick={() => {
                  if (mission.isNew) onDelete(mission.id, true);
                  setEditingId(null);
                }}
              >❌</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mission-view-smart">
          <div className="mission-icon-smart">{mission.icon}</div>
          <div className="mission-content-smart">
            <h4>{mission.title}</h4>
            <p>{mission.description}</p>
          </div>
          <div className="mission-meta-smart">
            <div className="mission-coins-smart">+{mission.coins} 🪙</div>
            <div className="mission-actions-smart">
              <button
                className="action-icon-btn edit"
                onClick={() => setEditingId(mission.id)}
                aria-label="تعديل المهمة"
                title="تعديل"
              >✏️</button>
              <button
                className="action-icon-btn delete"
                onClick={() => onDelete(mission.id, mission.isNew)}
                aria-label="حذف المهمة"
                title="حذف"
              >🗑️</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// DATE TAB — helper لتنسيق التاريخ
// ============================================
const formatTabDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00'); // تجنب timezone shift
  const dayName = d.toLocaleDateString('ar-EG', { weekday: 'short' });
  const dayNum  = d.toLocaleDateString('ar-EG', { day: 'numeric' });
  const month   = d.toLocaleDateString('ar-EG', { month: 'short' });
  return { dayName, dayNum, month };
};

const formatFullDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
};

// ============================================
// MAIN COMPONENT
// ============================================
function CreateDailyMissions() {
  const navigate = useNavigate();
  const [missions,      setMissions]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [editingId,     setEditingId]     = useState(null);
  const [selectedDate,  setSelectedDate]  = useState(new Date().toISOString().split('T')[0]);
  const [activeTab,     setActiveTab]     = useState(null); // التاريخ المحدد في الـ tabs
  const [toast,         setToast]         = useState(null);
  const [dateModal,     setDateModal]     = useState(null);
  const [confirmModal,  setConfirmModal]  = useState(null);
  const tabsScrollRef   = useRef(null);

  // ─── Toast: FIX memory leak ──────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  // ─── Fetch ───────────────────────────────────────────────────────────────
  const fetchMissions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('daily_missions')
        .select('*')
        .order('mission_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      setMissions(data || []);
    } catch (err) {
      console.error('[fetchMissions]', err);
      showToast('فشل تحميل المهمات', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchMissions(); }, [fetchMissions]);

  // ─── FIX: useMemo بدل useEffect + useState لـ groupedMissions ────────────
  const groupedMissions = useMemo(() => {
    return missions.reduce((acc, m) => {
      (acc[m.mission_date] ??= []).push(m);
      return acc;
    }, {});
  }, [missions]);

  // التواريخ مرتبة تنازلياً
  const sortedDates = useMemo(() =>
    Object.keys(groupedMissions).sort((a, b) => new Date(b) - new Date(a)),
    [groupedMissions]
  );

  // نحدد الـ active tab أول مرة تيجي البيانات
  useEffect(() => {
    if (sortedDates.length > 0 && !activeTab) {
      setActiveTab(sortedDates[0]);
    }
  }, [sortedDates, activeTab]);

  // ─── Add empty ────────────────────────────────────────────────────────────
  const addEmptyMission = useCallback((date) => {
    const newMission = {
      // FIX: crypto.randomUUID() بدل Date.now()
      id: `temp-${crypto.randomUUID()}`,
      title: '', description: '', icon: '📋', coins: 10,
      mission_date: date, isNew: true,
    };
    setMissions(prev => [newMission, ...prev]);
    setEditingId(newMission.id);
    // لو التاريخ مش موجود في التابز، نحطه نشط
    setActiveTab(date);
  }, []);

  // ─── Add from template ────────────────────────────────────────────────────
  const addFromTemplate = useCallback(async (template, date) => {
    try {
      const { data, error } = await supabase
        .from('daily_missions')
        .insert([{ ...template, mission_date: date }])
        .select();
      if (error) throw error;
      setMissions(prev => [data[0], ...prev]);
      setActiveTab(date);
      showToast('تم إضافة المهمة ✅');
    } catch (err) {
      console.error('[addFromTemplate]', err);
      showToast('حدث خطأ', 'error');
    }
  }, [showToast]);

  // ─── Save ─────────────────────────────────────────────────────────────────
  const saveMission = useCallback(async (mission) => {
    if (!mission.title.trim() || !mission.description.trim()) {
      showToast('املأ جميع الحقول', 'error');
      return;
    }
    const coins = Math.max(1, parseInt(mission.coins, 10) || 1);

    try {
      if (mission.isNew) {
        const { data, error } = await supabase
          .from('daily_missions')
          .insert([{
            title: mission.title, description: mission.description,
            icon: mission.icon, coins, mission_date: mission.mission_date,
          }])
          .select();
        if (error) throw error;
        setMissions(prev => prev.map(m => m.id === mission.id ? data[0] : m));
        showToast('تم الإضافة ✅');
      } else {
        const { error } = await supabase
          .from('daily_missions')
          .update({
            title: mission.title, description: mission.description,
            icon: mission.icon, coins,
          })
          .eq('id', mission.id);
        if (error) throw error;
        setMissions(prev => prev.map(m =>
          m.id === mission.id ? { ...m, ...mission, coins } : m
        ));
        showToast('تم الحفظ ✅');
      }
      setEditingId(null);
    } catch (err) {
      console.error('[saveMission]', err);
      showToast('حدث خطأ: ' + (err?.message || 'خطأ غير معروف'), 'error');
    }
  }, [showToast]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const requestDelete = useCallback((id, isNew) => {
    if (isNew) {
      setMissions(prev => prev.filter(m => m.id !== id));
      setEditingId(null);
      return;
    }
    setConfirmModal({ id });
  }, []);

  const confirmDelete = useCallback(async () => {
    const { id } = confirmModal;
    setConfirmModal(null);
    try {
      const { error } = await supabase.from('daily_missions').delete().eq('id', id);
      if (error) throw error;
      setMissions(prev => prev.filter(m => m.id !== id));
      showToast('تم الحذف ✅');
    } catch (err) {
      console.error('[confirmDelete]', err);
      showToast('حدث خطأ', 'error');
    }
  }, [confirmModal, showToast]);

  // ─── Duplicate day ────────────────────────────────────────────────────────
  const duplicateDay = useCallback((date) => {
    setDateModal({ mode: 'duplicate', fromDate: date });
  }, []);

  // ─── Add multiple days ────────────────────────────────────────────────────
  const addMultipleDays = useCallback(() => {
    setDateModal({ mode: 'multiDay' });
  }, []);

  // ─── Unified modal confirm handler ────────────────────────────────────────
  const handleDateModalConfirm = useCallback(async (value) => {
    const mode     = dateModal?.mode;
    const fromDate = dateModal?.fromDate;
    setDateModal(null);

    if (mode === 'duplicate') {
      if (!fromDate) return;
      const missionsOfDay = groupedMissions[fromDate] || [];
      if (missionsOfDay.length === 0) return;

      if (groupedMissions[value]) {
        showToast('هذا التاريخ فيه مهمات بالفعل!', 'error');
        return;
      }
      try {
        const toInsert = missionsOfDay.map(m => ({
          title: m.title, description: m.description,
          icon: m.icon, coins: m.coins, mission_date: value,
        }));
        const { error } = await supabase.from('daily_missions').insert(toInsert);
        if (error) throw error;
        showToast(`تم نسخ ${missionsOfDay.length} مهمة ✅`);
        fetchMissions();
      } catch (err) {
        console.error('[duplicateDay]', err);
        showToast('حدث خطأ', 'error');
      }
      return;
    }

    if (mode === 'multiDay') {
      const days = parseInt(value, 10);
      if (!days || days < 1 || days > 30) {
        showToast('أدخل عدداً من 1 إلى 30', 'error');
        return;
      }
      const templates     = MISSION_TEMPLATES.slice(0, 3);
      const today         = new Date();
      const missionsToAdd = [];

      for (let i = 0; i < days; i++) {
        const d       = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        if (groupedMissions[dateStr]) continue;
        templates.forEach(t => missionsToAdd.push({ ...t, mission_date: dateStr }));
      }

      if (missionsToAdd.length === 0) {
        showToast('كل الأيام دي موجودة بالفعل!', 'error');
        return;
      }
      try {
        setLoading(true);
        const { error } = await supabase.from('daily_missions').insert(missionsToAdd);
        if (error) throw error;
        showToast(`تم إضافة ${missionsToAdd.length} مهمة ✅`);
        fetchMissions();
      } catch (err) {
        console.error('[addMultipleDays]', err);
        showToast('حدث خطأ', 'error');
      } finally {
        setLoading(false);
      }
    }
  }, [dateModal, groupedMissions, showToast, fetchMissions]);

  // المهام الخاصة بالـ tab المحدد
  const activeMissions = useMemo(() =>
    activeTab ? (groupedMissions[activeTab] || []) : [],
    [activeTab, groupedMissions]
  );

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="create-missions-optimized">
      <div className="stars" />

      {toast && (
        <div className={`toast-smart ${toast.type}`} role="alert">{toast.message}</div>
      )}

      {confirmModal && (
        <ConfirmModal
          message="هل أنت متأكد من الحذف؟"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {dateModal?.mode === 'duplicate' && (
        <DateModal
          title="اختر التاريخ الجديد"
          defaultDate={selectedDate}
          onConfirm={handleDateModalConfirm}
          onCancel={() => setDateModal(null)}
        />
      )}

      {dateModal?.mode === 'multiDay' && (
        <NumberModal
          title="كم يوماً تريد إضافتها؟ (1-30)"
          defaultValue="7"
          onConfirm={handleDateModalConfirm}
          onCancel={() => setDateModal(null)}
        />
      )}

      {/* ✅ FIX: position: fixed في الـ CSS — يفضل ثابت عند الـ scroll */}
      <header className="smart-header" style={{ position: 'fixed', top: 0, left: 0, right: 0, width: '100%', zIndex: 100 }}>
        <div className="header-glass">
          <div className="header-row">
            <div className="greeting-section">
              {/* ✅ FIX: شلنا كلمة "متصل" تماماً */}
              <h1>📋 إدارة المهمات اليومية</h1>
            </div>
            <div className="header-actions">
              <button
                className="action-btn"
                onClick={() => navigate('/admin')}
                title="رجوع"
                aria-label="رجوع للأدمن"
              >←</button>
              <button
                className="action-btn"
                onClick={addMultipleDays}
                disabled={loading}
                title="إضافة أيام"
                aria-label="إضافة أيام متعددة"
              >📅</button>
            </div>
          </div>
        </div>
      </header>

      <div className="dashboard-body-smart" style={{ paddingTop: '80px' }}>

        {/* Control Panel */}
        <div className="control-panel-smart">
          <div className="date-section-smart">
            <div className="date-picker-wrapper">
              <input
                id="date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="date-input-smart"
              />
            </div>
            <button
              className="btn-add-mission"
              onClick={() => addEmptyMission(selectedDate)}
            >
              + إضافة مهمة
            </button>
            {groupedMissions[selectedDate] && (
              <button
                className="btn-duplicate-day"
                onClick={() => duplicateDay(selectedDate)}
                title="نسخ اليوم"
                aria-label="نسخ مهمات هذا اليوم"
              >📋</button>
            )}
          </div>

          <div className="templates-section-smart">
            <h3 className="section-title-smart">قوالب سريعة</h3>
            <div className="templates-grid-smart">
              {MISSION_TEMPLATES.map((template, idx) => (
                <button
                  key={idx}
                  className="template-btn-smart"
                  onClick={() => addFromTemplate(template, selectedDate)}
                  title={template.description}
                >
                  <span className="template-icon">{template.icon}</span>
                  <span className="template-name">{template.title}</span>
                  <span className="template-coins">+{template.coins} 🪙</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Missions Area */}
        {loading ? (
          <div className="loading-screen optimized">
            <div className="logo-loader">
              <span className="logo-icon">📋</span>
              <div className="logo-spinner" />
            </div>
            <div className="loading-text">جاري التحميل...</div>
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="empty-smart">
            <span className="empty-emoji">📭</span>
            <h3>لا توجد مهمات بعد</h3>
            <p>اختر تاريخاً وابدأ بإضافة المهمات</p>
          </div>
        ) : (
          /* ✅ NEW: Date Tabs بدل الـ accordion المزدحم */
          <div className="date-tabs-wrapper">

            {/* Scrollable date tabs */}
            <div className="date-tabs-scroll" ref={tabsScrollRef} role="tablist" aria-label="التواريخ">
              {sortedDates.map(date => {
                const { dayName, dayNum, month } = formatTabDate(date);
                const count = groupedMissions[date]?.length || 0;
                return (
                  <button
                    key={date}
                    role="tab"
                    aria-selected={activeTab === date}
                    className={`date-tab ${activeTab === date ? 'active' : ''}`}
                    onClick={() => setActiveTab(date)}
                  >
                    {count > 0 && (
                      <span className="tab-badge">{count}</span>
                    )}
                    <span className="tab-day-name">{dayName}</span>
                    <span className="tab-date-num">{dayNum}</span>
                    <span className="tab-month">{month}</span>
                  </button>
                );
              })}
            </div>

            {/* Panel for selected tab */}
            {activeTab && (
              <div
                key={activeTab}
                className="tab-missions-panel"
                role="tabpanel"
              >
                <div className="tab-panel-header">
                  <span className="tab-panel-title">{formatFullDate(activeTab)}</span>
                  <span className="tab-panel-count">{activeMissions.length} مهمة</span>
                </div>

                {activeMissions.length === 0 ? (
                  <div className="tab-empty">
                    <span className="empty-emoji">📭</span>
                    <p>لا توجد مهمات لهذا اليوم</p>
                  </div>
                ) : (
                  <div className="missions-list-smart">
                    {activeMissions.map(mission => (
                      <MissionCard
                        key={mission.id}
                        mission={mission}
                        editingId={editingId}
                        setEditingId={setEditingId}
                        onSave={saveMission}
                        onDelete={requestDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CreateDailyMissions;