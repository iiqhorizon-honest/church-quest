import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './CreateBonusMissions.css';

// ============================================
// CONSTANTS — برا الـ component عشان مش بتتغير
// FIX 1: مش بتتعمل array جديدة كل render
// ============================================
const ICON_OPTIONS = ['⭐', '🎬', '🎨', '📝', '🎵', '❤️', '🏆', '✨', '💎', '🎁', '🎯', '🌟', '💫', '🔥'];

// FIX A: بنعمل function بدل object ثابت عشان start_date
//        يتحسب وقت الاستخدام مش وقت تحميل الملف
const getDefaultForm = () => ({
  title: '',
  description: '',
  icon: '⭐',
  coins: 20,
  whatsapp_number: '01270365099',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
});

// ============================================
// CONFIRM MODAL — بديل لـ window.confirm()
// FIX 2: شلنا window.confirm() تماماً
// ============================================
const ConfirmModal = ({ message, onConfirm, onCancel }) => (
  <div className="modal-overlay-smart" onClick={onCancel}>
    <div className="modal-box-confirm" onClick={(e) => e.stopPropagation()}>
      <h3>{message}</h3>
      <div className="modal-confirm-actions">
        <button className="btn-delete-confirm" onClick={onConfirm}>حذف</button>
        <button className="btn-cancel-confirm" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================
function CreateBonusMissions() {
  const navigate = useNavigate();
  const [missions,      setMissions]      = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [editingMission,setEditingMission]= useState(null);
  const [filter,        setFilter]        = useState('all');
  const [toast,         setToast]         = useState(null);
  const [confirmModal,  setConfirmModal]  = useState(null); // { id }
  const [formData,      setFormData]      = useState(getDefaultForm);

  // ─── Toast ────────────────────────────────────────────────────────────────
  // FIX 3: useCallback عشان مش بتتعمل دالة جديدة كل render
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const fetchMissions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('bonus_missions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMissions(data || []);
    } catch (error) {
      console.error('Error:', error);
      showToast('فشل تحميل المهمات', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchMissions(); }, [fetchMissions]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const isActive = useCallback((mission) => {
    const today = new Date().toISOString().split('T')[0];
    return today >= mission.start_date && today <= mission.end_date;
  }, []);

  // FIX 4: useMemo عشان مش بيتحسب من تاني غير لو missions أو filter اتغيروا
  const stats = useMemo(() => {
    const active     = missions.filter(m => isActive(m)).length;
    const inactive   = missions.length - active;
    const totalCoins = missions.reduce((sum, m) => sum + m.coins, 0);
    return { active, inactive, total: missions.length, totalCoins };
  }, [missions, isActive]);

  const filteredMissions = useMemo(() => {
    if (filter === 'active')   return missions.filter(m =>  isActive(m));
    if (filter === 'inactive') return missions.filter(m => !isActive(m));
    return missions;
  }, [missions, filter, isActive]);

  // بنحسب isActive مرة واحدة لكل mission في الـ render
  // بدل ما تتحسب مرتين (للـ class والـ badge)
  const missionsWithStatus = useMemo(() =>
    filteredMissions.map(m => ({ ...m, active: isActive(m) })),
    [filteredMissions, isActive]
  );

  // ─── Form helpers ─────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setFormData(getDefaultForm());
    setEditingMission(null);
  }, []);

  const closeModal = useCallback(() => {
    setShowAddModal(false);
    resetForm();
  }, [resetForm]);

  const openEditModal = useCallback((mission) => {
    setEditingMission(mission);
    setFormData({
      title:            mission.title,
      description:      mission.description,
      icon:             mission.icon,
      coins:            mission.coins,
      whatsapp_number:  mission.whatsapp_number,
      start_date:       mission.start_date,
      end_date:         mission.end_date,
    });
    setShowAddModal(true);
  }, []);

  // ─── Save (add + edit unified) ────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    // FIX: validation مدمجة هنا بدل useCallback منفصل
    // عشان نكسر chain الـ deps اللي بتتغير كل ما formData اتغير
    const coins = parseInt(formData.coins, 10);
    if (!formData.title.trim()) {
      showToast('عنوان المهمة مطلوب', 'error'); return;
    }
    if (!formData.description.trim()) {
      showToast('وصف المهمة مطلوب', 'error'); return;
    }
    if (!coins || coins < 10 || coins > 50) {
      showToast('العملات بين 10 و 50', 'error'); return;
    }
    if (!formData.start_date || !formData.end_date) {
      showToast('التواريخ مطلوبة', 'error'); return;
    }
    if (formData.start_date > formData.end_date) {
      showToast('تاريخ البداية قبل النهاية', 'error'); return;
    }

    const payload = {
      title:           formData.title.trim(),
      description:     formData.description.trim(),
      icon:            formData.icon,
      coins,
      whatsapp_number: formData.whatsapp_number.trim(),
      start_date:      formData.start_date,
      end_date:        formData.end_date,
    };

    setLoading(true);
    try {
      if (editingMission) {
        const { error } = await supabase
          .from('bonus_missions')
          .update(payload)
          .eq('id', editingMission.id);
        if (error) throw error;
        showToast('تم التحديث ✅');
      } else {
        const { error } = await supabase
          .from('bonus_missions')
          .insert([payload]);
        if (error) throw error;
        showToast('تم الإضافة ✅');
      }
      closeModal();
      fetchMissions();
    } catch (error) {
      showToast('حدث خطأ: ' + (error?.message || 'خطأ غير معروف'), 'error');
    } finally {
      setLoading(false);
    }
  }, [formData, editingMission, showToast, closeModal, fetchMissions]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  // FIX 2: requestDelete بتفتح ConfirmModal بدل window.confirm()
  const requestDelete = useCallback((id) => {
    setConfirmModal({ id });
  }, []);

  const confirmDelete = useCallback(async () => {
    // FIX: نحفظ id في متغير local قبل setConfirmModal(null)
    // عشان نتجنب الـ stale closure لو الـ state اتغير
    const id = confirmModal?.id;
    setConfirmModal(null);
    if (!id) return;
    try {
      const { error } = await supabase
        .from('bonus_missions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('تم الحذف ✅');
      fetchMissions();
    } catch {
      showToast('حدث خطأ', 'error');
    }
  }, [confirmModal, showToast, fetchMissions]);

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="bonus-missions-optimized">
      <div className="stars" />

      {toast && (
        <div className={`toast-smart ${toast.type}`}>{toast.message}</div>
      )}

      {/* FIX 2: Confirm modal بدل window.confirm() */}
      {confirmModal && (
        <ConfirmModal
          message="هل أنت متأكد من الحذف؟"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* Header */}
      <header className="smart-header">
        <div className="header-glass">
          <div className="header-row">
            <div className="greeting-section">
              <h1>⭐ مهمات البونص</h1>
              <div className="status-row">
                <span className="connection-status online">● متصل</span>
              </div>
            </div>
            <div className="header-actions">
              <button className="action-btn" onClick={() => navigate('/admin')} title="رجوع">←</button>
              <button className="action-btn" onClick={() => { resetForm(); setShowAddModal(true); }} title="إضافة مهمة">+</button>
            </div>
          </div>
        </div>
      </header>

      <div className="dashboard-body-smart">

        {/* Stats */}
        <div className="stats-compact">
          <div className="stat-mini blue">
            <span className="stat-mini-icon">📊</span>
            <div className="stat-mini-info">
              <div className="stat-mini-value">{stats.total}</div>
              <div className="stat-mini-label">الكل</div>
            </div>
          </div>
          <div className="stat-mini green">
            <span className="stat-mini-icon">🟢</span>
            <div className="stat-mini-info">
              <div className="stat-mini-value">{stats.active}</div>
              <div className="stat-mini-label">نشط</div>
            </div>
          </div>
          <div className="stat-mini orange">
            <span className="stat-mini-icon">🔴</span>
            <div className="stat-mini-info">
              <div className="stat-mini-value">{stats.inactive}</div>
              <div className="stat-mini-label">منتهي</div>
            </div>
          </div>
          <div className="stat-mini purple">
            <span className="stat-mini-icon">🪙</span>
            <div className="stat-mini-info">
              <div className="stat-mini-value">{stats.totalCoins}</div>
              <div className="stat-mini-label">عملات</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-smart">
          <button className={`filter-btn ${filter === 'all'      ? 'active' : ''}`} onClick={() => setFilter('all')}>
            الكل ({missions.length})
          </button>
          <button className={`filter-btn ${filter === 'active'   ? 'active' : ''}`} onClick={() => setFilter('active')}>
            🟢 نشط ({stats.active})
          </button>
          <button className={`filter-btn ${filter === 'inactive' ? 'active' : ''}`} onClick={() => setFilter('inactive')}>
            🔴 منتهي ({stats.inactive})
          </button>
        </div>

        {/* Content */}
        {loading && missions.length === 0 ? (
          <div className="loading-screen optimized">
            <div className="logo-loader">
              <span className="logo-icon">⭐</span>
              <div className="logo-spinner" />
            </div>
            <div className="loading-text">جاري التحميل...</div>
          </div>
        ) : filteredMissions.length === 0 ? (
          <div className="empty-smart">
            <span className="empty-emoji">📭</span>
            <h3>لا توجد مهمات {filter === 'active' ? 'نشطة' : filter === 'inactive' ? 'منتهية' : ''}</h3>
            <p>ابدأ بإضافة مهمة بونص جديدة!</p>
          </div>
        ) : (
          <div className="bonus-missions-grid-smart">
            {missionsWithStatus.map(mission => (
              <div key={mission.id} className={`bonus-card-smart ${mission.active ? 'active' : 'inactive'}`}>
                <div className="bonus-status-badge">
                  {mission.active ? '🟢 نشط' : '🔴 منتهي'}
                </div>
                <div className="bonus-icon-large">{mission.icon}</div>
                <h3 className="bonus-title">{mission.title}</h3>
                <p className="bonus-description">{mission.description}</p>
                <div className="bonus-details">
                  <div className="bonus-detail-item">
                    <span className="detail-label">المكافأة</span>
                    <span className="detail-value coins">+{mission.coins} 🪙</span>
                  </div>
                  <div className="bonus-detail-item">
                    <span className="detail-label">الفترة</span>
                    <span className="detail-value">
                      {new Date(mission.start_date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                      {' - '}
                      {new Date(mission.end_date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <div className="bonus-detail-item">
                    <span className="detail-label">واتساب</span>
                    <a
                      href={`https://wa.me/${mission.whatsapp_number.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="whatsapp-link-smart"
                    >
                      {mission.whatsapp_number} 📱
                    </a>
                  </div>
                </div>
                <div className="bonus-actions">
                  <button className="action-icon-btn edit"   onClick={() => openEditModal(mission)}       title="تعديل">✏️</button>
                  <button className="action-icon-btn delete" onClick={() => requestDelete(mission.id)}    title="حذف">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="modal-overlay-smart" onClick={closeModal}>
          <div className="modal-content-smart modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-smart">
              <h2>{editingMission ? '✏️ تعديل المهمة' : '➕ مهمة جديدة'}</h2>
              <button className="modal-close-smart" onClick={closeModal}>×</button>
            </div>

            {/* div بدل form عشان نتحكم في الـ submit يدوياً */}
            <div className="modal-form-smart">
              <div className="form-group-smart">
                <label>عنوان المهمة *</label>
                <input
                  type="text"
                  className="form-input-smart"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="مثال: شرح فيديو"
                  maxLength="100"
                />
              </div>

              <div className="form-group-smart">
                <label>الوصف *</label>
                <textarea
                  className="form-input-smart"
                  rows="4"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="صف المهمة بالتفصيل..."
                  maxLength="500"
                />
                <small className="char-count-smart">{formData.description.length}/500</small>
              </div>

              <div className="form-group-smart">
                <label>اختر الأيقونة</label>
                <div className="icon-picker-smart">
                  {ICON_OPTIONS.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      className={`icon-option-smart ${formData.icon === icon ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row-smart">
                <div className="form-group-smart">
                  <label>العملات (10-50) *</label>
                  <input
                    type="number"
                    className="form-input-smart"
                    value={formData.coins}
                    onChange={(e) => setFormData({ ...formData, coins: e.target.value })}
                    min="10"
                    max="50"
                  />
                </div>
                <div className="form-group-smart">
                  <label>رقم الواتساب *</label>
                  <input
                    type="text"
                    className="form-input-smart"
                    value={formData.whatsapp_number}
                    onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                    placeholder="01270365099"
                  />
                </div>
              </div>

              <div className="form-row-smart">
                <div className="form-group-smart">
                  <label>تاريخ البداية *</label>
                  <input
                    type="date"
                    className="form-input-smart"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="form-group-smart">
                  <label>تاريخ النهاية *</label>
                  <input
                    type="date"
                    className="form-input-smart"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    min={formData.start_date}
                  />
                </div>
              </div>

              {formData.title && formData.description && (
                <div className="preview-section-smart">
                  <h4>👀 معاينة:</h4>
                  <div className="preview-card-smart">
                    <div className="preview-icon-smart">{formData.icon}</div>
                    <h5>{formData.title}</h5>
                    <p>{formData.description}</p>
                    <span className="preview-coins-smart">+{formData.coins} 🪙</span>
                  </div>
                </div>
              )}

              <button
                className="btn-submit-smart"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? '⏳ جاري الحفظ...' : editingMission ? '✅ حفظ التعديلات' : '✅ إضافة المهمة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateBonusMissions;