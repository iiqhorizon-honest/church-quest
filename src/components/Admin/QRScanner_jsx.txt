import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './QRScanner.css';

/**
 * QRScanner Component - OPTIMIZED
 * مسؤول عن مسح QR codes للطلاب وتسجيل الحضور
 * بيدعم كمان استعراض سجل وإحصائيات أي تاريخ سابق (مش بس النهارده)
 */

// ============================================
// DATE HELPERS
// ============================================

// بيرجع تاريخ اليوم بالتوقيت المحلي (مش UTC) بصيغة YYYY-MM-DD
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// بيرجع تاريخ أقرب يوم من نوع معين (زي آخر جمعة أو آخر حد)
// وده بيشمل النهارده نفسه لو هو أصلاً اليوم المطلوب
// targetDay بنفس ترقيم Date.getDay(): 0 = الأحد ... 5 = الجمعة ... 6 = السبت
function getMostRecentWeekday(targetDay) {
  const d = new Date();
  const diff = (d.getDay() - targetDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return getLocalDateString(d);
}

// بيحول تاريخ زي "2026-07-10" لصيغة عربي زي "الجمعة، ١٠ يوليو"
function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
}

function QRScanner({ user, onLogout }) {
  const navigate = useNavigate();

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [viewDate, setViewDate] = useState(() => getLocalDateString());
  const [activityFilter, setActivityFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [toast, setToast] = useState(null);

  // ============================================
  // REFS
  // ============================================
  
  const scannerRef = useRef(null);
  const selectedActivityRef = useRef(null);
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);

  // ============================================
  // LIFECYCLE
  // ============================================
  
  useEffect(() => {
    fetchAttendanceForDate(viewDate);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupScanner();
    };
  }, []);

  useEffect(() => {
    if (!scanning) {
      cleanupScanner();
    }
  }, [scanning]);

  // ============================================
  // TOAST SYSTEM
  // ============================================

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ============================================
  // SCANNER MANAGEMENT
  // ============================================

  const cleanupScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear().catch(() => {});
      } catch (e) {
        console.warn('Scanner cleanup:', e);
      } finally {
        scannerRef.current = null;
      }
    }
  }, []);

  const startScanning = useCallback(() => {
    cleanupScanner();
    setScanning(true);
    
    setTimeout(() => {
      if (!isMountedRef.current) return;
      
      try {
        const scanner = new Html5QrcodeScanner(
          "qr-reader",
          { 
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: true
          },
          false
        );

        scanner.render(handleQRSuccess, handleQRError);
        scannerRef.current = scanner;
        console.log('✅ Scanner started');
        
      } catch (error) {
        console.error('❌ Scanner error:', error);
        showToast('فشل تشغيل الكاميرا. تحقق من الأذونات.');
        setScanning(false);
      }
    }, 100);
  }, []);

  const handleQRSuccess = useCallback((decodedText) => {
    if (isProcessingRef.current) return;

    console.log('📷 QR Scanned:', decodedText);
    cleanupScanner();
    setScanning(false);
    processAttendance(decodedText);
  }, []);

  const handleQRError = useCallback((errorMessage) => {
    if (!errorMessage.includes('NotFoundException')) {
      console.warn('⚠️ Scan warning:', errorMessage);
    }
  }, []);

  const cancelScanning = useCallback(() => {
    cleanupScanner();
    setScanning(false);
    setSelectedActivity(null);
    selectedActivityRef.current = null;
  }, [cleanupScanner]);

  // ============================================
  // ACTIVITY SELECTION
  // ============================================

  const selectActivity = useCallback((activityName, coins) => {
    const activityData = { name: activityName, coins };
    setSelectedActivity(activityData);
    selectedActivityRef.current = activityData;
    console.log('✅ Activity selected:', activityData);
    startScanning();
  }, [startScanning]);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchAttendanceForDate = async (date) => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('attendance')
        .select('*, students(*)')
        .eq('attendance_date', date)
        .order('attendance_time', { ascending: false });

      if (error) throw error;
      
      if (isMountedRef.current) {
        setAttendanceRecords(data || []);
      }
      
      console.log(`✅ Loaded ${data?.length || 0} records (${date})`);
      
    } catch (error) {
      console.error('❌ Error fetching:', error);
      if (isMountedRef.current) {
        showToast('فشل تحميل البيانات');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  // الانتقال لعرض تاريخ تاني في السجل والإحصائيات (من غير ما يأثر على مسح QR الفعلي)
  const jumpToDate = useCallback((date) => {
    setViewDate(date);
    setActivityFilter('all');
    fetchAttendanceForDate(date);
  }, []);

  // ============================================
  // ATTENDANCE PROCESSING
  // ============================================

  const processAttendance = async (qrCode) => {
    if (isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    setProcessing(true);

    try {
      const activity = selectedActivityRef.current;
      
      if (!activity?.name || !activity?.coins) {
        throw new Error('لم يتم اختيار نشاط');
      }

      console.log('📌 Activity:', activity);
      console.log('🔍 QR:', qrCode);
      
      // البحث عن الطالب
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('qr_code', qrCode.trim())
        .maybeSingle();

      if (studentError) {
        throw new Error(`خطأ في البحث: ${studentError.message}`);
      }

      if (!student) {
        throw new Error(`الكود غير صحيح\n${qrCode}`);
      }

      console.log('✅ Student:', student.name);
      
      // التحقق من الحضور المسبق
      const today = getLocalDateString();
      
      const { data: existing, error: checkError } = await supabase
        .from('attendance')
        .select('id, attendance_time')
        .eq('student_id', student.id)
        .eq('activity_type', activity.name)
        .eq('attendance_date', today)
        .maybeSingle();

      if (checkError) {
        throw new Error(`خطأ في التحقق: ${checkError.message}`);
      }

      if (existing) {
        const time = new Date(existing.attendance_time).toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit'
        });
        throw new Error(
          `⚠️ ${student.name}\nمسجل بالفعل\nالوقت: ${time}`
        );
      }

      console.log('✅ No duplicate');
      
      // تسجيل الحضور
      const { error: insertError } = await supabase
        .from('attendance')
        .insert([{
          student_id: student.id,
          activity_type: activity.name,
          coins_earned: activity.coins,
          attendance_date: today
        }]);

      if (insertError) {
        throw new Error(`فشل التسجيل: ${insertError.message}`);
      }

      console.log('✅ Recorded');
      
      // تحديث العملات
      const newCoins = (student.coins || 0) + activity.coins;
      const currentRate = student.attendance_rate || 0;
      const newRate = ((currentRate * 10) + 100) / 11;
      
      const { error: updateError } = await supabase
        .from('students')
        .update({ 
          coins: newCoins,
          attendance_rate: Math.round(newRate * 100) / 100
        })
        .eq('id', student.id);

      if (updateError) {
        console.error('⚠️ Update failed:', updateError);
      } else {
        console.log('✅ Coins updated:', newCoins);
      }
      
      // إضافة معاملة
      await supabase
        .from('coin_transactions')
        .insert([{
          student_id: student.id,
          amount: activity.coins,
          transaction_type: 'earned',
          reason: `حضور ${activity.name}`,
          transaction_date: new Date().toISOString()
        }]);
      
      // إرسال إشعار
      await supabase
        .from('notifications')
        .insert([{
          student_id: student.id,
          title: 'تم التسجيل ✅',
          message: `تم إضافة ${activity.coins} عملة لحضور ${activity.name}`,
          is_read: false,
          created_at: new Date().toISOString()
        }]);
      
      // عرض النجاح
      if (!isMountedRef.current) return;

      setSuccessData({
        studentName: student.name,
        activity: activity.name,
        coins: activity.coins,
        totalCoins: newCoins
      });
      setShowSuccessModal(true);

      // نرجع نعرض بيانات النهارده عشان الطالب اللي اتسجل يظهر فورًا في السجل تحت
      setViewDate(today);
      setActivityFilter('all');
      fetchAttendanceForDate(today);
      
      console.log('🎉 Success!');
      
    } catch (error) {
      console.error('❌ Error:', error);
      
      if (isMountedRef.current) {
        showToast(error.message || 'حدث خطأ');
        
        setTimeout(() => {
          if (isMountedRef.current && selectedActivityRef.current && !showSuccessModal) {
            console.log('🔄 Restarting...');
            startScanning();
          }
        }, 3000);
      }
      
    } finally {
      isProcessingRef.current = false;
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  };

  // ============================================
  // SUCCESS MODAL HANDLERS
  // ============================================

  const closeSuccessModal = useCallback(() => {
    setShowSuccessModal(false);
    setSuccessData(null);
    setSelectedActivity(null);
    selectedActivityRef.current = null;
  }, []);

  const scanNext = useCallback(() => {
    setShowSuccessModal(false);
    setSuccessData(null);
    if (selectedActivityRef.current) {
      startScanning();
    }
  }, [startScanning]);

  // ============================================
  // STATISTICS & DERIVED VALUES
  // ============================================

  const getActivityStats = useCallback(() => {
    return {
      total: attendanceRecords.length,
      قداس: attendanceRecords.filter(a => a.activity_type === 'قداس').length,
      تسبحة: attendanceRecords.filter(a => a.activity_type === 'تسبحة').length,
      'مدارس أحد': attendanceRecords.filter(a => a.activity_type === 'مدارس أحد').length
    };
  }, [attendanceRecords]);

  const stats = getActivityStats();

  // السجل المعروض ممكن يتفلتر بنشاط معين، لكن الإحصائيات فوق بتفضل شاملة كل أنشطة اليوم المختار
  const displayedRecords = activityFilter === 'all'
    ? attendanceRecords
    : attendanceRecords.filter(r => r.activity_type === activityFilter);

  const todayStr = getLocalDateString();
  const isViewingToday = viewDate === todayStr;
  const lastFridayStr = getMostRecentWeekday(5);
  const lastSundayStr = getMostRecentWeekday(0);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="qr-scanner-optimized">
      <div className="stars"></div>
      
      {/* Toast */}
      {toast && (
        <div className={`toast-smart ${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="smart-header">
        <div className="header-glass">
          <div className="header-row">
            <div className="greeting-section">
              <h1>📷 مسح QR للحضور</h1>
              <div className="status-row">
                <span className="connection-status online">● متصل</span>
              </div>
            </div>
            
            <div className="header-actions">
              <button className="action-btn" onClick={() => navigate('/admin')} title="رجوع">
                ←
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Processing Overlay */}
      {processing && (
        <div className="processing-overlay-smart">
          <div className="logo-loader">
            <span className="logo-icon">⏳</span>
            <div className="logo-spinner"></div>
          </div>
          <div className="loading-text">جاري التسجيل...</div>
        </div>
      )}

      <div className="dashboard-body-smart">
        {/* Activity Selection */}
        {!scanning && !selectedActivity && (
          <div className="section-smart">
            <h2 className="section-title-smart">اختر نوع النشاط:</h2>
            <div className="activity-grid-smart">
              <button 
                className="activity-card-smart" 
                onClick={() => selectActivity('قداس', 5)}
                disabled={processing}
              >
                <div className="activity-icon-smart">⛪</div>
                <h3>حضور القداس</h3>
                <div className="activity-reward-smart">+5 🪙</div>
              </button>

              <button 
                className="activity-card-smart" 
                onClick={() => selectActivity('تسبحة', 5)}
                disabled={processing}
              >
                <div className="activity-icon-smart">📿</div>
                <h3>حضور التسبحة</h3>
                <div className="activity-reward-smart">+5 🪙</div>
              </button>

              <button 
                className="activity-card-smart" 
                onClick={() => selectActivity('مدارس أحد', 5)}
                disabled={processing}
              >
                <div className="activity-icon-smart">📖</div>
                <h3>مدارس الأحد</h3>
                <div className="activity-reward-smart">+5 🪙</div>
              </button>
            </div>
          </div>
        )}

        {/* Scanner Section */}
        {scanning && (
          <div className="scanner-section-smart">
            <div className="scanner-header-smart">
              <h2>📷 مسح QR Code</h2>
              {selectedActivity && (
                <div className="cache-info">
                  <span className="info-icon">✨</span>
                  <span className="info-text">
                    {selectedActivity.name} (+{selectedActivity.coins} 🪙)
                  </span>
                </div>
              )}
            </div>

            <div id="qr-reader" className="qr-reader-smart"></div>

            <button 
              className="btn-cancel-smart" 
              onClick={cancelScanning}
              disabled={processing}
            >
              ❌ إلغاء
            </button>
          </div>
        )}

        {/* Date Browser - بيتحكم في اليوم اللي الإحصائيات والسجل تحت بيعرضوه */}
        <div className="section-smart date-browser-section-smart">
          <h2 className="section-title-smart">🗓️ اعرض بيانات يوم:</h2>

          <div className="date-chips-smart">
            <button
              className={`chip-smart ${isViewingToday ? 'active' : ''}`}
              onClick={() => jumpToDate(todayStr)}
            >
              النهارده
            </button>
            <button
              className={`chip-smart ${viewDate === lastFridayStr ? 'active' : ''}`}
              onClick={() => jumpToDate(lastFridayStr)}
            >
              آخر جمعة
            </button>
            <button
              className={`chip-smart ${viewDate === lastSundayStr ? 'active' : ''}`}
              onClick={() => jumpToDate(lastSundayStr)}
            >
              آخر أحد
            </button>
          </div>

          <div className="date-picker-row-smart">
            <input
              type="date"
              className="date-input-smart"
              value={viewDate}
              max={todayStr}
              onChange={(e) => e.target.value && jumpToDate(e.target.value)}
            />

            <select
              className="activity-filter-smart"
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
            >
              <option value="all">كل الأنشطة</option>
              <option value="قداس">قداس</option>
              <option value="تسبحة">تسبحة</option>
              <option value="مدارس أحد">مدارس أحد</option>
            </select>
          </div>
        </div>

        {/* Statistics */}
        <div className="section-smart">
          <div className="section-header-smart">
            <h2 className="section-title-smart">
              📊 {isViewingToday ? 'إحصائيات اليوم' : `إحصائيات يوم ${formatDateLabel(viewDate)}`}
            </h2>
            <button 
              className="action-btn refresh-btn" 
              onClick={() => fetchAttendanceForDate(viewDate)}
              disabled={loading}
              title="تحديث"
            >
              🔄
            </button>
          </div>

          <div className="stats-compact">
            <div className="stat-mini green">
              <span className="stat-mini-icon">✅</span>
              <div className="stat-mini-info">
                <div className="stat-mini-value">{stats.total}</div>
                <div className="stat-mini-label">إجمالي</div>
              </div>
            </div>
            
            <div className="stat-mini purple">
              <span className="stat-mini-icon">⛪</span>
              <div className="stat-mini-info">
                <div className="stat-mini-value">{stats.قداس}</div>
                <div className="stat-mini-label">القداس</div>
              </div>
            </div>
            
            <div className="stat-mini blue">
              <span className="stat-mini-icon">📿</span>
              <div className="stat-mini-info">
                <div className="stat-mini-value">{stats.تسبحة}</div>
                <div className="stat-mini-label">التسبحة</div>
              </div>
            </div>
            
            <div className="stat-mini orange">
              <span className="stat-mini-icon">📖</span>
              <div className="stat-mini-info">
                <div className="stat-mini-value">{stats['مدارس أحد']}</div>
                <div className="stat-mini-label">مدارس أحد</div>
              </div>
            </div>
          </div>
        </div>

        {/* Attendance List */}
        <div className="section-smart">
          <h2 className="section-title-smart">
            ✅ {isViewingToday ? 'سجل الحضور اليوم' : `سجل حضور ${formatDateLabel(viewDate)}`}
          </h2>

          {loading ? (
            <div className="loading-screen optimized">
              <div className="logo-loader">
                <span className="logo-icon">📋</span>
                <div className="logo-spinner"></div>
              </div>
              <div className="loading-text">جاري التحميل...</div>
            </div>
          ) : displayedRecords.length > 0 ? (
            <div className="attendance-list-smart">
              {displayedRecords.map(record => (
                <div key={record.id} className="attendance-item-smart">
                  <div className="attendance-icon-smart">
                    {record.activity_type === 'قداس' ? '⛪' : 
                     record.activity_type === 'تسبحة' ? '📿' : '📖'}
                  </div>
                  <div className="attendance-details-smart">
                    <div className="attendance-name-smart">
                      {record.students?.name || 'طالب غير معروف'}
                    </div>
                    <div className="attendance-meta-smart">
                      {record.activity_type} • 
                      {new Date(record.attendance_time).toLocaleTimeString('ar-EG', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </div>
                  <div className="attendance-coins-smart">
                    +{record.coins_earned} 🪙
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-smart">
              <span className="empty-emoji">📭</span>
              <p>{isViewingToday ? 'لا يوجد حضور مسجل اليوم' : 'لا يوجد حضور مسجل في اليوم ده'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && successData && (
        <div className="modal-overlay-smart" onClick={closeSuccessModal}>
          <div className="modal-content-smart success-modal-smart" onClick={(e) => e.stopPropagation()}>
            <div className="success-icon-smart">✅</div>
            <h2>تم التسجيل بنجاح!</h2>
            
            <div className="success-details-smart">
              <div className="success-item-smart">
                <span className="success-label-smart">الطالب</span>
                <span className="success-value-smart">{successData.studentName}</span>
              </div>
              <div className="success-item-smart">
                <span className="success-label-smart">النشاط</span>
                <span className="success-value-smart">{successData.activity}</span>
              </div>
              <div className="success-item-smart highlight">
                <span className="success-label-smart">تم الإضافة</span>
                <span className="success-value-smart">+{successData.coins} 🪙</span>
              </div>
              <div className="success-item-smart total">
                <span className="success-label-smart">الرصيد الكلي</span>
                <span className="success-value-smart">{successData.totalCoins} 🪙</span>
              </div>
            </div>
            
            <div className="success-actions-smart">
              <button className="btn-submit-smart" onClick={scanNext}>
                ➡️ الطالب التالي
              </button>
              <button className="btn-cancel-smart" onClick={closeSuccessModal}>
                ✓ إنهاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QRScanner;
