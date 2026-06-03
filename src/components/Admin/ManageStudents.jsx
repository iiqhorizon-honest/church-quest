import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import QRCode from 'qrcode';
import { useNavigate } from 'react-router-dom';
import './ManageStudents.css';

// Simple email regex validation
const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function ManageStudents({ user }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [shownEmailId, setShownEmailId] = useState(null);
  const [bulkExportLoading, setBulkExportLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    grade: 'all',
    coins: 'all',
    level: 'all',
    sortBy: 'recent'
  });
  const [formData, setFormData] = useState({
    name: '',
    student_number: '',
    grade: '',
    email: '',
    password: ''
  });
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  // ==================== Debounce Search ====================
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchTerm); }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ==================== Toast ====================
  // FIX 1: useCallback + timer cleanup to prevent double-toast leak
  const toastTimerRef = React.useRef(null);
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  // ==================== Fetch ====================
  // FIX 2: added showToast to deps, moved setLoading(false) inside try/catch
  const fetchStudents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*, users(email)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const studentsWithEmail = (data || []).map(s => {
        let email = null;
        if (Array.isArray(s.users)) email = s.users[0]?.email || null;
        else if (s.users && typeof s.users === 'object') email = s.users.email || null;
        return { ...s, email };
      });
      setStudents(studentsWithEmail);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching students:', error);
      showToast('حدث خطأ في تحميل البيانات', 'error');
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // ==================== Real-time Updates ====================
  useEffect(() => {
    const channel = supabase
      .channel('students-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
        fetchStudents();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStudents]);

  // ==================== Generate Codes ====================
  const generateUniqueCode = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return 'STD' + crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 16);
    }
    return 'STD' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
  };

  const generateQRCode = async (code) => {
    try {
      return await QRCode.toDataURL(code, {
        width: 300, margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
    } catch (error) {
      console.error('Error generating QR:', error);
      return null;
    }
  };

  // ==================== Add Student ====================
  const handleAddStudent = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);

    try {
      const trimmedName = formData.name.trim();
      if (!trimmedName) { showToast('يرجى إدخال اسم الطالب', 'error'); setSubmitLoading(false); return; }
      if (formData.password.length < 6) { showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error'); setSubmitLoading(false); return; }
      if (!/^\d+$/.test(formData.student_number)) { showToast('رقم الطالب يجب أن يحتوي على أرقام فقط', 'error'); setSubmitLoading(false); return; }
      const gradeInt = parseInt(formData.grade);
      if (!formData.grade || isNaN(gradeInt)) { showToast('يرجى اختيار الصف', 'error'); setSubmitLoading(false); return; }
      const normalizedEmail = formData.email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) { showToast('البريد الإلكتروني غير صحيح', 'error'); setSubmitLoading(false); return; }

      const { data: existingEmail } = await supabase.from('users').select('email').eq('email', normalizedEmail).maybeSingle();
      if (existingEmail) { showToast('هذا الإيميل مستخدم بالفعل ❌', 'error'); setSubmitLoading(false); return; }

      const { data: existingNumber } = await supabase.from('students').select('student_number').eq('student_number', formData.student_number).maybeSingle();
      if (existingNumber) { showToast('رقم الطالب مستخدم بالفعل ❌', 'error'); setSubmitLoading(false); return; }

      const uniqueCode = generateUniqueCode();
      const qrCode = await generateQRCode(uniqueCode);

      const { data: newStudent, error: studentError } = await supabase
        .from('students')
        .insert([{ name: trimmedName, student_number: formData.student_number.trim(), qr_code: uniqueCode, age: gradeInt, coins: 0, level: 1, attendance_rate: 0, streak: 0 }])
        .select().single();
      if (studentError) throw studentError;

      const { data: { session: adminSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !adminSession) {
        await supabase.from('students').delete().eq('id', newStudent.id);
        throw new Error('انتهت جلسة المدير، يرجى تسجيل الدخول مرة أخرى');
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: formData.password,
        options: { data: { role: 'student', student_id: newStudent.id } }
      });
      if (authError || !authData.user) {
        await supabase.from('students').delete().eq('id', newStudent.id);
        throw authError || new Error('فشل إنشاء حساب المستخدم');
      }

      // FIX 3: link user_id on students table for RLS
      const { error: updateUserIdError } = await supabase
        .from('students')
        .update({ user_id: authData.user.id })
        .eq('id', newStudent.id);
      if (updateUserIdError) {
        console.warn('Warning: could not set user_id on student:', updateUserIdError.message);
      }

      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });

      const { error: userError } = await supabase
        .from('users')
        .insert([{ email: normalizedEmail, role: 'student', student_id: newStudent.id }]);

      if (userError) {
        // FIX 3: cleanup BOTH student row AND auth account on failure
        await supabase.from('students').delete().eq('id', newStudent.id);
        await supabase.rpc('delete_user_account', { student_id_input: newStudent.id });
        throw userError;
      }

      showToast(`تم إضافة ${trimmedName} بنجاح! 🎉`, 'success');
      setShowAddModal(false);
      resetForm();
      fetchStudents();
      setSelectedStudent({ ...newStudent, qr_image: qrCode });
      setShowQRModal(true);

    } catch (error) {
      console.error('Error adding student:', error);
      showToast('حدث خطأ: ' + error.message, 'error');
    }
    setSubmitLoading(false);
  };

  // ==================== Edit Student ====================
  const handleEditStudent = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      const trimmedName = formData.name.trim();
      if (!trimmedName) { showToast('يرجى إدخال اسم الطالب', 'error'); setSubmitLoading(false); return; }
      if (!/^\d+$/.test(formData.student_number)) { showToast('رقم الطالب يجب أن يحتوي على أرقام فقط', 'error'); setSubmitLoading(false); return; }
      const gradeInt = parseInt(formData.grade);
      if (!formData.grade || isNaN(gradeInt)) { showToast('يرجى اختيار الصف', 'error'); setSubmitLoading(false); return; }
      const { data: existingNumber } = await supabase.from('students').select('student_number').eq('student_number', formData.student_number).neq('id', selectedStudent.id).maybeSingle();
      if (existingNumber) { showToast('رقم الطالب مستخدم بالفعل', 'error'); setSubmitLoading(false); return; }
      const { error } = await supabase.from('students').update({ name: trimmedName, student_number: formData.student_number.trim(), age: gradeInt }).eq('id', selectedStudent.id);
      if (error) throw error;
      showToast('تم تحديث البيانات ✅', 'success');
      setShowEditModal(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (error) {
      console.error('Error updating student:', error);
      showToast('حدث خطأ: ' + error.message, 'error');
    }
    setSubmitLoading(false);
  };

  // ==================== Change Password ====================
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      if (passwordData.newPassword.length < 6) { showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error'); setSubmitLoading(false); return; }
      if (passwordData.newPassword !== passwordData.confirmPassword) { showToast('كلمتا المرور غير متطابقتين', 'error'); setSubmitLoading(false); return; }
      const { data: userData, error: userFetchError } = await supabase.from('users').select('email').eq('student_id', selectedStudent.id).maybeSingle();
      if (userFetchError || !userData) { showToast('لم يتم العثور على حساب هذا الطالب', 'error'); setSubmitLoading(false); return; }
      const { error: rpcError } = await supabase.rpc('update_user_password', { user_email: userData.email, new_password: passwordData.newPassword });
      if (rpcError) { showToast('حدث خطأ في تغيير كلمة المرور', 'error'); setSubmitLoading(false); return; }
      showToast('تم تغيير كلمة المرور بنجاح ✅', 'success');
      setShowChangePasswordModal(false);
      setPasswordData({ newPassword: '', confirmPassword: '' });
      setSelectedStudent(null);
    } catch (error) {
      console.error('Error changing password:', error);
      showToast('حدث خطأ: ' + error.message, 'error');
    }
    setSubmitLoading(false);
  };

  // ==================== Delete Student ====================
  const handleDeleteStudent = (studentId, studentName) => {
    setConfirmAction({
      type: 'delete',
      title: 'حذف الطالب',
      message: `هل أنت متأكد من حذف "${studentName}"؟`,
      onConfirm: () => deleteStudent(studentId)
    });
    setShowConfirmModal(true);
  };

  const deleteStudent = async (studentId) => {
    if (shownEmailId === studentId) setShownEmailId(null);
    setDeletingIds(prev => new Set(prev).add(studentId));
    try {
      await supabase.rpc('delete_user_account', { student_id_input: studentId });
      const { error } = await supabase.from('students').delete().eq('id', studentId);
      if (error) throw error;
      showToast('تم الحذف بنجاح', 'success');
      // FIX: remove deleted id from selectedStudents
      setSelectedStudents(prev => prev.filter(id => id !== studentId));
      fetchStudents();
    } catch (error) {
      console.error('Error deleting student:', error);
      showToast('حدث خطأ: ' + error.message, 'error');
    }
    setDeletingIds(prev => { const next = new Set(prev); next.delete(studentId); return next; });
  };

  // ==================== Filters & Sort ====================
  const filteredStudents = useMemo(() => {
    return students
      .filter(s => {
        const matchesSearch =
          s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          s.student_number.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          (s.email && s.email.toLowerCase().includes(debouncedSearch.toLowerCase()));
        const matchesGrade = filters.grade === 'all' || (s.age && s.age.toString() === filters.grade);
        const matchesCoins = filters.coins === 'all' ||
          (filters.coins === 'low'    && s.coins >= 0   && s.coins <= 50)  ||
          (filters.coins === 'medium' && s.coins > 50   && s.coins <= 150) ||
          (filters.coins === 'high'   && s.coins > 150);
        const matchesLevel = filters.level === 'all' ||
          (filters.level === '5' ? s.level >= 5 : s.level.toString() === filters.level);
        return matchesSearch && matchesGrade && matchesCoins && matchesLevel;
      })
      .sort((a, b) => {
        switch (filters.sortBy) {
          case 'name':       return a.name.localeCompare(b.name);
          case 'coins':      return b.coins - a.coins;
          case 'level':      return b.level - a.level;
          case 'grade':      return (b.age || 0) - (a.age || 0);
          case 'attendance': return b.attendance_rate - a.attendance_rate;
          default:           return new Date(b.created_at) - new Date(a.created_at);
        }
      });
  }, [students, debouncedSearch, filters]);

  // ==================== Bulk Actions ====================
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const selectAllStudents = () => {
    const filteredIds = filteredStudents.map(s => s.id);
    const allSelected = filteredIds.every(id => selectedStudents.includes(id));
    if (allSelected) setSelectedStudents([]);
    else setSelectedStudents(filteredIds);
  };

  const handleBulkDelete = () => {
    setConfirmAction({
      type: 'bulkDelete',
      title: 'حذف جماعي',
      message: `هل تريد حذف ${selectedStudents.length} طالب؟`,
      onConfirm: bulkDeleteStudents
    });
    setShowConfirmModal(true);
  };

  const bulkDeleteStudents = async () => {
    const idsToDelete = [...selectedStudents];
    if (idsToDelete.includes(shownEmailId)) setShownEmailId(null);
    setDeletingIds(new Set(idsToDelete));
    try {
      const rpcResults = await Promise.allSettled(
        idsToDelete.map(id => supabase.rpc('delete_user_account', { student_id_input: id }))
      );
      const failedRpc = rpcResults.filter(r => r.status === 'rejected');
      if (failedRpc.length > 0) console.warn(`${failedRpc.length} RPC calls failed`);
      const { error } = await supabase.from('students').delete().in('id', idsToDelete);
      if (error) throw error;
      showToast(`تم حذف ${idsToDelete.length} طالب`, 'success');
      setSelectedStudents([]);
      setBulkMode(false);
      fetchStudents();
    } catch (error) {
      showToast('حدث خطأ في الحذف', 'error');
    }
    setDeletingIds(new Set());
  };

  // FIX 4: use filteredStudents not students for bulk QR export
  const handleBulkExportQR = async () => {
    setBulkExportLoading(true);
    try {
      const selected = filteredStudents.filter(s => selectedStudents.includes(s.id));
      const studentsWithQR = await Promise.all(
        selected.map(async (student) => ({ ...student, qr_image: await generateQRCode(student.qr_code) }))
      );
      setSelectedStudent({ bulk: true, students: studentsWithQR });
      setShowPrintModal(true);
    } catch (error) {
      showToast('حدث خطأ في توليد الأكواد', 'error');
    }
    setBulkExportLoading(false);
  };

  // ==================== Export CSV ====================
  const exportToCSV = () => {
    try {
      const headers = ['الاسم', 'رقم الطالب', 'الصف', 'العملات', 'المستوى', 'نسبة الحضور', 'الكود', 'الإيميل'];
      const data = filteredStudents.map(s => [s.name, s.student_number, s.age ? `الصف ${s.age}` : '', s.coins, s.level, s.attendance_rate, s.qr_code, s.email || '']);
      const escapeCSV = (val) => `"${String(val).replace(/"/g, '""')}"`;
      const csvContent = [headers.map(escapeCSV).join(','), ...data.map(row => row.map(escapeCSV).join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `students_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('تم التصدير 📥', 'success');
    } catch (error) {
      console.error('CSV export error:', error);
      showToast('حدث خطأ في التصدير', 'error');
    }
  };

  // ==================== Print QR ====================
  const handlePrint = () => { window.print(); };

  // ==================== Modals ====================
  const resetForm = () => {
    setFormData({ name: '', student_number: '', grade: '', email: '', password: '' });
    setShowPassword(false);
  };

  const openEditModal = (student) => {
    setSelectedStudent(student);
    setFormData({ name: student.name, student_number: student.student_number, grade: student.age || '', email: '', password: '' });
    setShowEditModal(true);
  };

  const openChangePasswordModal = (student) => {
    setSelectedStudent(student);
    setPasswordData({ newPassword: '', confirmPassword: '' });
    setShowNewPassword(false);
    setShowChangePasswordModal(true);
  };

  const viewQRCode = async (student) => {
    const qrImage = await generateQRCode(student.qr_code);
    if (!qrImage) { showToast('حدث خطأ في توليد QR Code', 'error'); return; }
    setSelectedStudent({ ...student, qr_image: qrImage });
    setShowQRModal(true);
  };

  const downloadQR = () => {
    if (!selectedStudent?.qr_image) return;
    const link = document.createElement('a');
    link.download = `${selectedStudent.name}_QR.png`;
    link.href = selectedStudent.qr_image;
    link.click();
    showToast('تم التحميل 📥', 'success');
  };

  const handleOverlayClick = () => { if (submitLoading) return; closeModal(); };

  const closeModal = () => {
    setShowAddModal(false); setShowEditModal(false); setShowQRModal(false);
    setShowConfirmModal(false); setShowPrintModal(false); setShowChangePasswordModal(false);
    resetForm(); setConfirmAction(null);
    setPasswordData({ newPassword: '', confirmPassword: '' });
  };

  // ==================== Pagination ====================
  const pageSize = 20;
  const totalPages = Math.ceil(filteredStudents.length / pageSize);
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
    setShownEmailId(null);
  }, [debouncedSearch, filters]);

  // ==================== Render ====================
  return (
    <div className="manage-students-optimized">

      <div className="stars-bg" />
      <div className="nebula nebula-1" />
      <div className="nebula nebula-2" />
      <div className="nebula nebula-3" />
      <div className="meteors">
        <div className="meteor meteor-1" />
        <div className="meteor meteor-2" />
        <div className="meteor meteor-3" />
        <div className="meteor meteor-4" />
      </div>
      <div className="particles">
        {[...Array(8)].map((_, i) => <div key={i} className="particle" />)}
      </div>

      {toast && (
        <div className={`toast-smart ${toast.type}`}>{toast.message}</div>
      )}

      <header className="smart-header">
        <div className="header-glass">
          <div className="header-row">
            <div className="greeting-section">
              <h1>👥 إدارة الطلاب</h1>
              <div className="status-row">
                <span className="connection-status online">● متصل</span>
              </div>
            </div>
            <div className="header-actions">
              <button className="action-btn" onClick={() => navigate('/admin')} title="رجوع">←</button>
              {!bulkMode && (
                <button className="action-btn" onClick={() => setShowAddModal(true)} title="إضافة طالب">+</button>
              )}
              <button className="action-btn" onClick={exportToCSV} title="تصدير CSV">📥</button>
              {bulkMode && selectedStudents.length > 0 && (
                <>
                  <button className="action-btn" onClick={handleBulkDelete} disabled={deletingIds.size > 0} title="حذف المحدد">
                    {deletingIds.size > 0 ? '⏳' : '🗑️'}
                  </button>
                  <button className="action-btn" onClick={handleBulkExportQR} disabled={bulkExportLoading} title="QR للمحدد">
                    {bulkExportLoading ? '⏳' : '📱'}
                  </button>
                </>
              )}
              <button className="action-btn" onClick={() => { setBulkMode(!bulkMode); setSelectedStudents([]); }} title={bulkMode ? 'إلغاء' : 'اختيار متعدد'}>
                {bulkMode ? '✖' : '☑'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="dashboard-body-smart">

        <div className="stats-compact">
          <div className="stat-mini purple">
            <span className="stat-mini-icon">👥</span>
            <div className="stat-mini-info">
              <div className="stat-mini-value">{students.length}</div>
              <div className="stat-mini-label">إجمالي</div>
            </div>
          </div>
          <div className="stat-mini blue">
            <span className="stat-mini-icon">🔍</span>
            <div className="stat-mini-info">
              <div className="stat-mini-value">{filteredStudents.length}</div>
              <div className="stat-mini-label">النتائج</div>
            </div>
          </div>
          {bulkMode && (
            <div className="stat-mini orange pulse">
              <span className="stat-mini-icon">☑️</span>
              <div className="stat-mini-info">
                <div className="stat-mini-value">{selectedStudents.length}</div>
                <div className="stat-mini-label">محدد</div>
              </div>
            </div>
          )}
        </div>

        <div className="section-smart">
          <input
            type="text"
            className="search-input-smart"
            placeholder="🔍 ابحث بالاسم أو الرقم أو الإيميل..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filters-smart">
          <select className="filter-select-smart" value={filters.grade} onChange={(e) => setFilters({ ...filters, grade: e.target.value })}>
            <option value="all">كل الصفوف</option>
            <option value="3">الصف 3</option>
            <option value="4">الصف 4</option>
            <option value="5">الصف 5</option>
            <option value="6">الصف 6</option>
          </select>
          <select className="filter-select-smart" value={filters.coins} onChange={(e) => setFilters({ ...filters, coins: e.target.value })}>
            <option value="all">كل العملات</option>
            <option value="low">0-50</option>
            <option value="medium">51-150</option>
            <option value="high">151+</option>
          </select>
          <select className="filter-select-smart" value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })}>
            <option value="all">كل المستويات</option>
            <option value="1">المستوى 1</option>
            <option value="2">المستوى 2</option>
            <option value="3">المستوى 3</option>
            <option value="4">المستوى 4</option>
            <option value="5">المستوى 5+</option>
          </select>
          <select className="filter-select-smart" value={filters.sortBy} onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}>
            <option value="recent">الأحدث</option>
            <option value="name">الاسم</option>
            <option value="coins">العملات</option>
            <option value="level">المستوى</option>
            <option value="grade">الصف</option>
          </select>
        </div>

        {bulkMode && filteredStudents.length > 0 && (
          <div className="quick-grid-smart">
            <button className="quick-btn-smart" onClick={selectAllStudents}>
              <span className="quick-icon-smart">
                {filteredStudents.every(s => selectedStudents.includes(s.id)) ? '◻️' : '☑️'}
              </span>
              <span className="quick-label-smart">
                {filteredStudents.every(s => selectedStudents.includes(s.id)) ? 'إلغاء الكل' : 'تحديد الكل'}
              </span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading-screen optimized">
            <div className="logo-loader">
              <span className="logo-icon">👥</span>
              <div className="logo-spinner"></div>
            </div>
            <div className="loading-text">جاري التحميل...</div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="empty-smart">
            <span className="empty-emoji">👥</span>
            <p>
              {searchTerm || Object.entries(filters).some(([k, v]) => (k === 'sortBy' ? false : v !== 'all'))
                ? 'لا توجد نتائج للبحث أو الفلتر المحدد'
                : 'لا يوجد طلاب حتى الآن'}
            </p>
          </div>
        ) : (
          <>
            <div className="students-list-smart">
              {paginatedStudents.map((student, idx) => (
                <div
                  key={student.id}
                  className={`student-card-smart ${selectedStudents.includes(student.id) ? 'selected' : ''}`}
                  style={{ animationDelay: `${idx * 0.04}s` }}
                >
                  {bulkMode && (
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(student.id)}
                      onChange={() => toggleStudentSelection(student.id)}
                      className="student-checkbox-smart"
                    />
                  )}
                  <div className="student-info-smart">
                    <div className="student-main">
                      <div className="student-name-smart">{student.name}</div>
                      <div className="student-number-smart">#{student.student_number}</div>
                    </div>
                    {student.email && (
                      <div className="student-email-row">
                        <button
                          className="email-toggle-btn"
                          onClick={() => setShownEmailId(shownEmailId === student.id ? null : student.id)}
                          title="عرض الإيميل"
                        >
                          📧
                        </button>
                        {shownEmailId === student.id && (
                          <div className="student-email-smart">{student.email}</div>
                        )}
                      </div>
                    )}
                    <div className="student-stats-smart">
                      {student.age && <span className="stat-badge">🎓 {student.age}</span>}
                      <span className="stat-badge">🪙 {student.coins}</span>
                      <span className="stat-badge">⭐ {student.level}</span>
                    </div>
                  </div>
                  {!bulkMode && (
                    <div className="student-actions-smart">
                      <button className="action-icon-btn qr" onClick={() => viewQRCode(student)} title="QR">📱</button>
                      <button className="action-icon-btn edit" onClick={() => openEditModal(student)} title="تعديل">✏️</button>
                      <button className="action-icon-btn password" onClick={() => openChangePasswordModal(student)} title="تغيير كلمة المرور">🔑</button>
                      <button
                        className="action-icon-btn delete"
                        onClick={() => handleDeleteStudent(student.id, student.name)}
                        disabled={deletingIds.has(student.id)}
                        title="حذف"
                      >
                        {deletingIds.has(student.id) ? '⏳' : '🗑️'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="pagination-smart">
                <button className="page-btn-smart" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹ السابق</button>
                <span className="page-info-smart">{currentPage} / {totalPages}</span>
                <button className="page-btn-smart" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>التالي ›</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-overlay-smart" onClick={handleOverlayClick}>
          <div className="modal-content-smart" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-smart">
              <h2>➕ إضافة طالب جديد</h2>
              <button className="modal-close-smart" onClick={closeModal} disabled={submitLoading}>×</button>
            </div>
            <form onSubmit={handleAddStudent} className="modal-form-smart">
              <div className="form-group-smart">
                <label>الاسم الكامل *</label>
                <input type="text" className="form-input-smart" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="أدخل اسم الطالب" required />
              </div>
              <div className="form-group-smart">
                <label>رقم الطالب * (أرقام فقط)</label>
                <input type="text" inputMode="numeric" pattern="\d*" className="form-input-smart" value={formData.student_number} onChange={(e) => setFormData({ ...formData, student_number: e.target.value.replace(/\D/g, '') })} placeholder="مثال: 2024001" required />
              </div>
              <div className="form-group-smart">
                <label>الصف *</label>
                <select className="form-input-smart" value={formData.grade} onChange={(e) => setFormData({ ...formData, grade: e.target.value })} required>
                  <option value="">اختر الصف</option>
                  <option value="3">الصف الثالث</option>
                  <option value="4">الصف الرابع</option>
                  <option value="5">الصف الخامس</option>
                  <option value="6">الصف السادس</option>
                </select>
              </div>
              <div className="form-group-smart">
                <label>📧 البريد الإلكتروني *</label>
                <input type="email" className="form-input-smart" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="student@example.com" required />
              </div>
              <div className="form-group-smart">
                <label>🔒 كلمة المرور *</label>
                <div className="password-wrapper-smart">
                  <input type={showPassword ? 'text' : 'password'} className="form-input-smart" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="6+ أحرف" required minLength="6" />
                  <button type="button" className="toggle-password-smart" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                <small className="form-hint-smart">⚠️ احفظ كلمة المرور للطالب</small>
              </div>
              <button type="submit" className="btn-submit-smart" disabled={submitLoading}>
                {submitLoading ? '⏳ جاري الإضافة...' : '✅ إضافة الطالب'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay-smart" onClick={handleOverlayClick}>
          <div className="modal-content-smart" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-smart">
              <h2>✏️ تعديل بيانات الطالب</h2>
              <button className="modal-close-smart" onClick={closeModal} disabled={submitLoading}>×</button>
            </div>
            <form onSubmit={handleEditStudent} className="modal-form-smart">
              <div className="form-group-smart">
                <label>الاسم الكامل *</label>
                <input type="text" className="form-input-smart" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="form-group-smart">
                <label>رقم الطالب * (أرقام فقط)</label>
                <input type="text" inputMode="numeric" pattern="\d*" className="form-input-smart" value={formData.student_number} onChange={(e) => setFormData({ ...formData, student_number: e.target.value.replace(/\D/g, '') })} required />
              </div>
              <div className="form-group-smart">
                <label>الصف *</label>
                <select className="form-input-smart" value={formData.grade} onChange={(e) => setFormData({ ...formData, grade: e.target.value })} required>
                  <option value="">اختر الصف</option>
                  <option value="3">الصف الثالث</option>
                  <option value="4">الصف الرابع</option>
                  <option value="5">الصف الخامس</option>
                  <option value="6">الصف السادس</option>
                </select>
              </div>
              <div className="cache-info">
                <span className="info-icon">ℹ️</span>
                <span className="info-text">الكود والـ QR لا يمكن تعديلهما</span>
              </div>
              <button type="submit" className="btn-submit-smart" disabled={submitLoading}>
                {submitLoading ? '⏳ جاري الحفظ...' : '💾 حفظ التعديلات'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && selectedStudent && (
        <div className="modal-overlay-smart" onClick={handleOverlayClick}>
          <div className="modal-content-smart" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-smart">
              <h2>🔑 تغيير كلمة المرور</h2>
              <button className="modal-close-smart" onClick={closeModal} disabled={submitLoading}>×</button>
            </div>
            <form onSubmit={handleChangePassword} className="modal-form-smart">
              <div className="student-info-banner">
                <span>👤 {selectedStudent.name}</span>
              </div>
              <div className="form-group-smart">
                <label>🔒 كلمة المرور الجديدة *</label>
                <div className="password-wrapper-smart">
                  <input type={showNewPassword ? 'text' : 'password'} className="form-input-smart" value={passwordData.newPassword} onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })} placeholder="6+ أحرف" required minLength="6" />
                  <button type="button" className="toggle-password-smart" onClick={() => setShowNewPassword(!showNewPassword)}>
                    {showNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
              <div className="form-group-smart">
                <label>🔒 تأكيد كلمة المرور *</label>
                <input type={showNewPassword ? 'text' : 'password'} className="form-input-smart" value={passwordData.confirmPassword} onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} placeholder="أعد كتابة كلمة المرور" required minLength="6" />
              </div>
              <small className="form-hint-smart">⚠️ احفظ كلمة المرور الجديدة للطالب</small>
              <button type="submit" className="btn-submit-smart" disabled={submitLoading} style={{ marginTop: '1rem' }}>
                {submitLoading ? '⏳ جاري التغيير...' : '🔑 تغيير كلمة المرور'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && selectedStudent && !selectedStudent.bulk && (
        <div className="modal-overlay-smart" onClick={closeModal}>
          <div className="modal-content-smart qr-modal-smart" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-smart">
              <h2>📱 كود الطالب</h2>
              <button className="modal-close-smart" onClick={closeModal}>×</button>
            </div>
            <div className="qr-display-smart">
              <h3>{selectedStudent.name}</h3>
              <p className="qr-code-text-smart">{selectedStudent.qr_code}</p>
              {selectedStudent.qr_image ? (
                <div className="qr-image-wrapper-smart">
                  <img src={selectedStudent.qr_image} alt="QR Code" className="qr-image-smart" />
                </div>
              ) : (
                <div className="qr-error-smart">⚠️ تعذّر توليد QR Code</div>
              )}
              <button className="btn-submit-smart" onClick={downloadQR} disabled={!selectedStudent.qr_image}>
                📥 تحميل الكود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && confirmAction && (
        <div className="modal-overlay-smart" onClick={closeModal}>
          <div className="modal-content-smart confirm-modal-smart" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-smart">
              <h2>⚠️ {confirmAction.title}</h2>
              <button className="modal-close-smart" onClick={closeModal}>×</button>
            </div>
            <div className="confirm-content-smart">
              <div className="confirm-icon-smart">🗑️</div>
              <p className="confirm-message-smart">{confirmAction.message}</p>
              <p className="confirm-warning-smart">لا يمكن التراجع عن هذا الإجراء!</p>
              <div className="confirm-actions-smart">
                <button
                  className="btn-danger-smart"
                  disabled={deletingIds.size > 0}
                  onClick={() => { const action = confirmAction.onConfirm; closeModal(); action(); }}
                >
                  {deletingIds.size > 0 ? '⏳ جاري الحذف...' : '✅ نعم، احذف'}
                </button>
                <button className="btn-cancel-smart" onClick={closeModal}>❌ إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {showPrintModal && selectedStudent?.bulk && (
        <div className="modal-overlay-smart" onClick={closeModal}>
          <div className="modal-content-smart print-modal-smart" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-smart no-print">
              <h2>🖨️ طباعة الأكواد</h2>
              <button className="modal-close-smart" onClick={closeModal}>×</button>
            </div>
            <div className="print-preview-smart">
              <div className="qr-grid-print-smart">
                {selectedStudent.students.map(student => (
                  <div key={student.id} className="qr-print-card-smart">
                    {student.qr_image ? (
                      <img src={student.qr_image} alt={`QR - ${student.name}`} className="qr-print-image-smart" />
                    ) : (
                      <div className="qr-error-smart">⚠️ خطأ في QR</div>
                    )}
                    <h4>{student.name}</h4>
                    <p>#{student.student_number}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="print-actions-smart no-print">
              <button className="btn-submit-smart" onClick={handlePrint}>🖨️ طباعة</button>
              <button className="btn-cancel-smart" onClick={closeModal}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ManageStudents;