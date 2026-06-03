import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './AddCoins.css';

const MESSAGES = {
  SUCCESS_ADD: (amount, name) => `تم إضافة ${amount} عملة لـ ${name}`,
  SUCCESS_DEDUCT: (amount, name) => `تم خصم ${amount} عملة من ${name}`,
  ERROR_NO_STUDENT: 'اختر طالباً أولاً',
  ERROR_INVALID_AMOUNT: 'أدخل عدد عملات صحيح',
  ERROR_NO_REASON: 'اكتب السبب (3 أحرف على الأقل)',
  ERROR_GENERIC: 'حدث خطأ',
  ERROR_INSUFFICIENT: 'الرصيد غير كافي'
};

const MAX_COINS_PER_TRANSACTION = 1000;
const QUICK_AMOUNTS = [5, 10, 25, 50, 100];
const MAX_REASON_LENGTH = 150;

// ✅ تحسين: debounce hook لتقليل عمليات الفلترة
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function AddCoins({ user, onLogout }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [operationType, setOperationType] = useState('add');
  const searchInputRef = useRef(null);

  // ✅ تحسين: debounce على الـ search بدل ما يفلتر على كل حرف فوراً
  const debouncedSearch = useDebounce(searchTerm, 200);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, student_number, coins')
        .order('name');
      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      setError('فشل تحميل الطلاب');
    }
  };

  const filteredStudents = useMemo(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) return [];
    const term = debouncedSearch.toLowerCase().trim();
    return students
      .filter(s =>
        s.name.toLowerCase().includes(term) ||
        s.student_number.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [debouncedSearch, students]);

  const selectStudent = useCallback((student) => {
    setSelectedStudent(student);
    setSearchTerm('');
    setError('');
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedStudent(null);
    setAmount('');
    setReason('');
    setError('');
    // ✅ تحسين: focus على الـ search بعد الإلغاء
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const handleOperationChange = (type) => {
    setOperationType(type);
    setError('');
    setAmount('');
  };

  // ✅ تحسين: keyboard shortcut - Enter يختار أول طالب
  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && filteredStudents.length > 0) {
      e.preventDefault();
      selectStudent(filteredStudents[0]);
    }
    if (e.key === 'Escape') {
      setSearchTerm('');
    }
  }, [filteredStudents, selectStudent]);

  // ✅ تحسين: Quick Amount Buttons
  const handleQuickAmount = (val) => {
    if (!selectedStudent) return;
    setAmount(String(val));
    setError('');
  };

  const validateForm = useCallback(() => {
    if (!selectedStudent) { setError(MESSAGES.ERROR_NO_STUDENT); return false; }
    const coinsAmount = parseInt(amount);
    if (!amount || isNaN(coinsAmount) || coinsAmount < 1) { setError(MESSAGES.ERROR_INVALID_AMOUNT); return false; }
    if (coinsAmount > MAX_COINS_PER_TRANSACTION) { setError(`الحد الأقصى ${MAX_COINS_PER_TRANSACTION} عملة`); return false; }
    if (operationType === 'deduct' && coinsAmount > selectedStudent.coins) { setError(MESSAGES.ERROR_INSUFFICIENT); return false; }
    if (!reason.trim() || reason.trim().length < 3) { setError(MESSAGES.ERROR_NO_REASON); return false; }
    return true;
  }, [selectedStudent, amount, reason, operationType]);

  const showNotification = (message, type = 'success') => {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 50);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 400);
    }, 2800);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;
    setLoading(true);
    try {
      const coinsAmount = parseInt(amount);
      const isDeduct = operationType === 'deduct';
      const newBalance = isDeduct
        ? selectedStudent.coins - coinsAmount
        : selectedStudent.coins + coinsAmount;

      const { error: updateError } = await supabase
        .from('students')
        .update({ coins: newBalance })
        .eq('id', selectedStudent.id);
      if (updateError) throw updateError;

      const { error: transactionError } = await supabase
        .from('coin_transactions')
        .insert({
          student_id: selectedStudent.id,
          amount: isDeduct ? -coinsAmount : coinsAmount,
          transaction_type: 'admin_added',
          reason: reason.trim()
        });
      if (transactionError) throw transactionError;

      await supabase
        .from('notifications')
        .insert({
          student_id: selectedStudent.id,
          title: isDeduct ? `تم خصم ${coinsAmount} عملة` : `تم إضافة ${coinsAmount} عملة`,
          message: reason.trim()
        });

      const successMsg = isDeduct
        ? MESSAGES.SUCCESS_DEDUCT(coinsAmount, selectedStudent.name)
        : MESSAGES.SUCCESS_ADD(coinsAmount, selectedStudent.name);

      showNotification(`✅ ${successMsg}`);

      setStudents(prev =>
        prev.map(s => s.id === selectedStudent.id ? { ...s, coins: newBalance } : s)
      );
      clearSelection();
    } catch (error) {
      console.error('Error processing coins:', error);
      showNotification('❌ ' + (error.message || MESSAGES.ERROR_GENERIC), 'error');
      setError(error.message || MESSAGES.ERROR_GENERIC);
    } finally {
      setLoading(false);
    }
  };

  const newBalance = useMemo(() => {
    if (!selectedStudent || !amount) return null;
    const coinsAmount = parseInt(amount) || 0;
    return operationType === 'deduct'
      ? selectedStudent.coins - coinsAmount
      : selectedStudent.coins + coinsAmount;
  }, [selectedStudent, amount, operationType]);

  const isDeduct = operationType === 'deduct';
  // ✅ تحسين: تحذير لو الرصيد هيبقى سلبي
  const isNegativeBalance = newBalance !== null && newBalance < 0;

  return (
    <div className="add-coins-page">
      <div className="bg-orbs">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      <header className="header">
        <div className="header-content">
          <div className="header-title">
            <h1>🪙 إدارة العملات</h1>
            <span className={`header-badge ${isDeduct ? 'badge-deduct' : 'badge-add'}`}>
              {isDeduct ? '➖ خصم' : '➕ إضافة'}
            </span>
          </div>
        </div>
      </header>

      <div className="container">
        <div className="main-card">

          {/* Operation Toggle */}
          <div className="operation-toggle">
            <button
              type="button"
              className={`toggle-btn ${!isDeduct ? 'active add-active' : ''}`}
              onClick={() => handleOperationChange('add')}
            >
              <span className="toggle-icon">➕</span>
              <span>إضافة</span>
            </button>
            <button
              type="button"
              className={`toggle-btn ${isDeduct ? 'active deduct-active' : ''}`}
              onClick={() => handleOperationChange('deduct')}
            >
              <span className="toggle-icon">➖</span>
              <span>خصم</span>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Student Search */}
            <div className="form-section">
              <label className="form-label">🔍 الطالب</label>
              <div className="search-wrapper">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="ابحث بالاسم أو الرقم... (Enter للاختيار)"
                  disabled={!!selectedStudent}
                  autoComplete="off"
                />
                {searchTerm && !selectedStudent && (
                  <button type="button" className="clear-search" onClick={() => setSearchTerm('')}>✕</button>
                )}
              </div>

              {filteredStudents.length > 0 && (
                <div className="search-results">
                  {filteredStudents.map((student, idx) => (
                    <button
                      key={student.id}
                      type="button"
                      className={`search-item ${idx === 0 ? 'search-item-first' : ''}`}
                      onClick={() => selectStudent(student)}
                    >
                      <div className="search-avatar">{student.name.charAt(0)}</div>
                      <div className="search-info">
                        <strong>{student.name}</strong>
                        <span>#{student.student_number}</span>
                      </div>
                      <span className="search-coins">{student.coins} 🪙</span>
                      {idx === 0 && <span className="enter-hint">Enter ↵</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Student */}
            {selectedStudent && (
              <div className="selected-card">
                <div className="selected-avatar">{selectedStudent.name.charAt(0)}</div>
                <div className="selected-info">
                  <h3>{selectedStudent.name}</h3>
                  <span className="selected-id">#{selectedStudent.student_number}</span>
                  <div className="selected-balance">
                    <span>الرصيد:</span>
                    <strong>{selectedStudent.coins} 🪙</strong>
                  </div>
                </div>
                <button type="button" className="remove-btn" onClick={clearSelection}>✕</button>
              </div>
            )}

            {/* Amount Input */}
            <div className="form-section">
              <label className="form-label">🪙 العدد</label>
              {/* ✅ تحسين: Quick Amount Buttons */}
              <div className="quick-amounts">
                {QUICK_AMOUNTS.map(val => (
                  <button
                    key={val}
                    type="button"
                    className={`quick-btn ${amount === String(val) ? 'quick-btn-active' : ''}`}
                    onClick={() => handleQuickAmount(val)}
                    disabled={!selectedStudent}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(''); }}
                placeholder="أو أدخل عدداً..."
                min="1"
                max={operationType === 'deduct' ? selectedStudent?.coins : MAX_COINS_PER_TRANSACTION}
                disabled={!selectedStudent}
              />
            </div>

            {/* Reason Input */}
            <div className="form-section">
              <label className="form-label">
                📝 السبب
                {/* ✅ تحسين: Character counter */}
                {reason.length > 0 && (
                  <span className={`char-counter ${reason.length > MAX_REASON_LENGTH ? 'counter-over' : ''}`}>
                    {reason.length}/{MAX_REASON_LENGTH}
                  </span>
                )}
              </label>
              <textarea
                rows="3"
                value={reason}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_REASON_LENGTH) setReason(e.target.value);
                  setError('');
                }}
                placeholder={isDeduct ? 'سبب الخصم...' : 'سبب الإضافة...'}
                disabled={!selectedStudent}
                maxLength={MAX_REASON_LENGTH}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="error-box">
                <span>⚠️</span>
                <p>{error}</p>
              </div>
            )}

            {/* Preview */}
            {selectedStudent && amount && parseInt(amount) > 0 && (
              <div className={`preview-box ${isDeduct ? 'preview-deduct' : 'preview-add'} ${isNegativeBalance ? 'preview-warning' : ''}`}>
                {/* ✅ تحسين: تحذير الرصيد السلبي */}
                {isNegativeBalance && (
                  <div className="balance-warning">⚠️ الرصيد سيصبح سالباً!</div>
                )}
                <div className="preview-row">
                  <span>الطالب:</span>
                  <strong>{selectedStudent.name}</strong>
                </div>
                <div className="preview-row">
                  <span>{isDeduct ? 'الخصم:' : 'الإضافة:'}</span>
                  <strong className="preview-amount">{isDeduct ? '-' : '+'}{amount} 🪙</strong>
                </div>
                <div className="preview-row preview-total">
                  <span>الرصيد الجديد:</span>
                  <strong className={isNegativeBalance ? 'negative' : 'positive'}>{newBalance} 🪙</strong>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className={`submit-btn ${isDeduct ? 'btn-deduct' : 'btn-add'}`}
              disabled={loading || !selectedStudent || !amount || !reason.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner-small"></span>
                  <span>جاري التنفيذ...</span>
                </>
              ) : (
                <>
                  <span>{isDeduct ? '💸' : '✨'}</span>
                  <span>{isDeduct ? 'تأكيد الخصم' : 'تأكيد الإضافة'}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <RecentTransactions />
      </div>
    </div>
  );
}

function RecentTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(false);

  const handleToggle = () => {
    if (!open && !fetched) fetchTransactions();
    setOpen(prev => !prev);
  };

  // ✅ تحسين: Refresh button
  const handleRefresh = (e) => {
    e.stopPropagation();
    fetchTransactions();
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('coin_transactions')
        .select('id, amount, reason, created_at, transaction_type, students(name, student_number)')
        .eq('transaction_type', 'admin_added')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setTransactions(data || []);
      setFetched(true);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMins = Math.floor((now - date) / 60000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins}د`;
    if (diffMins < 1440) return `منذ ${Math.floor(diffMins / 60)}س`;
    return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  };

  return (
    <div className={`transactions-section ${open ? 'open' : ''}`}>
      <button className="tx-toggle" onClick={handleToggle} type="button">
        <span>📜 آخر العمليات</span>
        <div className="tx-right">
          {fetched && transactions.length > 0 && (
            <span className="tx-badge">{transactions.length}</span>
          )}
          {/* ✅ تحسين: Refresh Button */}
          {open && fetched && (
            <button
              type="button"
              className="tx-refresh"
              onClick={handleRefresh}
              title="تحديث"
            >
              {loading ? '⏳' : '🔄'}
            </button>
          )}
          <span className={`tx-arrow ${open ? 'arrow-up' : ''}`}>‹</span>
        </div>
      </button>

      {open && (
        <div className="tx-body">
          {loading ? (
            // ✅ تحسين: Loading Skeleton
            <div className="tx-skeleton-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="tx-skeleton">
                  <div className="skeleton-icon"></div>
                  <div className="skeleton-info">
                    <div className="skeleton-line skeleton-name"></div>
                    <div className="skeleton-line skeleton-reason"></div>
                  </div>
                  <div className="skeleton-amount"></div>
                </div>
              ))}
            </div>
          ) : transactions.length > 0 ? (
            <div className="tx-list">
              {transactions.map(transaction => {
                const isDeducted = transaction.amount < 0;
                return (
                  <div key={transaction.id} className={`tx-item ${isDeducted ? 'tx-minus' : 'tx-plus'}`}>
                    <div className="tx-icon">{isDeducted ? '−' : '+'}</div>
                    <div className="tx-info">
                      <h4>{transaction.students.name}</h4>
                      <p>{transaction.reason}</p>
                      <span className="tx-time">{formatDate(transaction.created_at)}</span>
                    </div>
                    <div className={`tx-amount ${isDeducted ? 'amount-minus' : 'amount-plus'}`}>
                      {isDeducted ? '-' : '+'}{Math.abs(transaction.amount)} 🪙
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <p>لا توجد عمليات بعد</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AddCoins;