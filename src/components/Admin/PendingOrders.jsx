import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './PendingOrders.css';

function PendingOrders({ user, onLogout }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pending');
  const [orders, setOrders] = useState([]);
  const [groupedOrders, setGroupedOrders] = useState([]);
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [processingOrder, setProcessingOrder] = useState(null);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    delivered: 0
  });

  useEffect(() => {
    fetchOrders();
    fetchStats();
    
    const subscription = supabase
      .channel('orders-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchOrders();
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    groupOrdersByStudent();
  }, [orders, searchTerm, activeTab]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, students(*), products(*)')
        .in('status', ['pending', 'approved', 'delivered'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('status')
        .in('status', ['pending', 'approved', 'delivered']);

      if (error) throw error;

      const counts = {
        pending: data.filter(o => o.status === 'pending').length,
        approved: data.filter(o => o.status === 'approved').length,
        delivered: data.filter(o => o.status === 'delivered').length
      };
      
      setStats(counts);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const groupOrdersByStudent = () => {
    let filtered = orders.filter(order => order.status === activeTab);

    if (searchTerm) {
      filtered = filtered.filter(order => 
        order.students.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.products.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Group by student
    const grouped = filtered.reduce((acc, order) => {
      const studentId = order.student_id;
      if (!acc[studentId]) {
        acc[studentId] = {
          student: order.students,
          orders: [],
          totalPrice: 0
        };
      }
      acc[studentId].orders.push(order);
      acc[studentId].totalPrice += order.products.price;
      return acc;
    }, {});

    const groupedArray = Object.values(grouped).sort((a, b) => 
      new Date(b.orders[0].created_at) - new Date(a.orders[0].created_at)
    );

    setGroupedOrders(groupedArray);
  };

  const toggleStudent = (studentId) => {
    if (expandedStudent === studentId) {
      setExpandedStudent(null);
    } else {
      setExpandedStudent(studentId);
    }
  };

  const openModal = (order, action) => {
    setSelectedOrder(order);
    setModalAction(action);
    setShowModal(true);
    setRejectReason('');
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedOrder(null);
    setModalAction('');
    setRejectReason('');
  };

  const handleApprove = async (order) => {
    setProcessingOrder(order.id);
    try {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'approved' })
        .eq('id', order.id);

      if (updateError) throw updateError;

      await supabase.from('notifications').insert([{
        student_id: order.student_id,
        title: 'تمت الموافقة على طلبك! ✅',
        message: `تمت الموافقة على طلب "${order.products.name}". يرجى استلام المنتج من المسئول.`
      }]);

      showToast('✅ تمت الموافقة على الطلب', 'success');
      fetchOrders();
      fetchStats();
      closeModal();
    } catch (error) {
      console.error('Error approving order:', error);
      showToast('❌ حدث خطأ أثناء الموافقة', 'error');
    }
    setProcessingOrder(null);
  };

  const handleReject = async (order) => {
    if (!rejectReason.trim()) {
      showToast('⚠️ الرجاء كتابة سبب الرفض', 'error');
      return;
    }

    setProcessingOrder(order.id);
    try {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'rejected' })
        .eq('id', order.id);

      if (updateError) throw updateError;

      const { error: coinsError } = await supabase
        .from('students')
        .update({ 
          coins: order.students.coins + order.products.price 
        })
        .eq('id', order.student_id);

      if (coinsError) throw coinsError;

      await supabase.from('notifications').insert([{
        student_id: order.student_id,
        title: '❌ تم رفض الطلب',
        message: `سبب الرفض: ${rejectReason}\nتم إرجاع ${order.products.price} عملة إلى رصيدك.`
      }]);

      showToast('✅ تم رفض الطلب وإرجاع العملات', 'success');
      fetchOrders();
      fetchStats();
      closeModal();
    } catch (error) {
      console.error('Error rejecting order:', error);
      showToast('❌ حدث خطأ أثناء رفض الطلب', 'error');
    }
    setProcessingOrder(null);
  };

  const handleDeliver = async (order) => {
    setProcessingOrder(order.id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', order.id);

      if (error) throw error;

      await supabase.from('notifications').insert([{
        student_id: order.student_id,
        title: '🎉 تم التسليم بنجاح',
        message: `تم تسليم "${order.products.name}" بنجاح! نتمنى لك الاستفادة منه.`
      }]);

      showToast('✅ تم تسليم المنتج بنجاح', 'success');
      fetchOrders();
      fetchStats();
      closeModal();
    } catch (error) {
      console.error('Error updating order:', error);
      showToast('❌ حدث خطأ أثناء التسليم', 'error');
    }
    setProcessingOrder(null);
  };

  const handleApproveAll = async (studentOrders) => {
    if (!window.confirm(`هل تريد الموافقة على جميع طلبات ${studentOrders.student.name}؟`)) return;

    for (const order of studentOrders.orders) {
      await handleApprove(order);
    }
  };

  const handleDeliverAll = async (studentOrders) => {
    if (!window.confirm(`هل تم تسليم جميع المنتجات لـ ${studentOrders.student.name}؟`)) return;

    for (const order of studentOrders.orders) {
      await handleDeliver(order);
    }
  };

  const confirmAction = () => {
    if (!selectedOrder) return;

    switch(modalAction) {
      case 'approve':
        handleApprove(selectedOrder);
        break;
      case 'reject':
        handleReject(selectedOrder);
        break;
      case 'deliver':
        handleDeliver(selectedOrder);
        break;
    }
  };

  const showToast = (message, type) => {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  const getModalContent = () => {
    if (!selectedOrder) return null;

    switch(modalAction) {
      case 'approve':
        return {
          icon: '✅',
          title: 'الموافقة على الطلب',
          message: `هل تريد الموافقة على هذا الطلب؟`,
          confirmText: 'موافقة',
          confirmClass: 'approve'
        };
      case 'reject':
        return {
          icon: '❌',
          title: 'رفض الطلب',
          message: `سيتم إرجاع ${selectedOrder.products.price} عملة للطالب`,
          showInput: true,
          confirmText: 'رفض الطلب',
          confirmClass: 'reject'
        };
      case 'deliver':
        return {
          icon: '📦',
          title: 'تأكيد التسليم',
          message: `هل تم تسليم المنتج فعلياً للطالب؟`,
          confirmText: 'تم التسليم',
          confirmClass: 'deliver'
        };
      default:
        return null;
    }
  };

  const getTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return 'الآن';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} د`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} س`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)} يوم`;
    return new Date(date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
  };

  const modalContent = getModalContent();

  return (
    <div className="pending-orders-page">
      <div className="animated-bg"></div>
      
      <header className="header">
        <button className="back-btn" onClick={() => navigate('/admin')}>←</button>
        <h1 className="page-title">📦 إدارة الطلبات</h1>
        <button className="logout-btn" onClick={onLogout}>🚪</button>
      </header>

      <div className="container">
        {/* Tabs */}
        <div className="tabs-nav">
          <button 
            className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <span className="tab-icon">⏳</span>
            <span className="tab-label">معلقة</span>
            {stats.pending > 0 && <span className="tab-badge">{stats.pending}</span>}
          </button>
          
          <button 
            className={`tab-btn ${activeTab === 'approved' ? 'active' : ''}`}
            onClick={() => setActiveTab('approved')}
          >
            <span className="tab-icon">✅</span>
            <span className="tab-label">موافق عليها</span>
            {stats.approved > 0 && <span className="tab-badge">{stats.approved}</span>}
          </button>
          
          <button 
            className={`tab-btn ${activeTab === 'delivered' ? 'active' : ''}`}
            onClick={() => setActiveTab('delivered')}
          >
            <span className="tab-icon">🎉</span>
            <span className="tab-label">مُسلّمة</span>
            {stats.delivered > 0 && <span className="tab-badge">{stats.delivered}</span>}
          </button>
        </div>

        {/* Search */}
        {groupedOrders.length > 0 || searchTerm ? (
          <div className="search-container">
            <input
              type="text"
              className="search-input"
              placeholder="🔍 ابحث..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="clear-btn" onClick={() => setSearchTerm('')}>×</button>
            )}
          </div>
        ) : null}

        {/* Content */}
        {loading ? (
          <div className="loader-container">
            <div className="spinner"></div>
            <p>جاري التحميل...</p>
          </div>
        ) : groupedOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              {activeTab === 'pending' && '📭'}
              {activeTab === 'approved' && '✅'}
              {activeTab === 'delivered' && '🎉'}
            </div>
            <h3>
              {searchTerm ? 'لا توجد نتائج' : 
               activeTab === 'pending' ? 'لا توجد طلبات معلقة' :
               activeTab === 'approved' ? 'لا توجد طلبات موافق عليها' :
               'لا توجد طلبات مسلّمة'}
            </h3>
            <p>
              {searchTerm ? 'جرب البحث بكلمات أخرى' : 'كل شيء على ما يرام'}
            </p>
          </div>
        ) : (
          <div className="students-list">
            {groupedOrders.map((group) => {
              const isExpanded = expandedStudent === group.student.id;
              const ordersCount = group.orders.length;
              
              return (
                <div key={group.student.id} className="student-group">
                  {/* Student Header - Clickable */}
                  <div 
                    className="student-header"
                    onClick={() => toggleStudent(group.student.id)}
                  >
                    <div className="student-main">
                      <div className="student-avatar">
                        {group.student.name.charAt(0)}
                      </div>
                      <div className="student-info">
                        <h3>{group.student.name}</h3>
                        <span className="orders-count">
                          {ordersCount} {ordersCount === 1 ? 'طلب' : 'طلبات'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="student-summary">
                      <div className="total-price">
                        {group.totalPrice} 🪙
                      </div>
                      <div className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                        ▼
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions for Multiple Orders */}
                  {isExpanded && ordersCount > 1 && activeTab !== 'delivered' && (
                    <div className="quick-actions">
                      {activeTab === 'pending' && (
                        <button 
                          className="quick-btn approve-all"
                          onClick={() => handleApproveAll(group)}
                        >
                          ✅ موافقة على الكل
                        </button>
                      )}
                      {activeTab === 'approved' && (
                        <button 
                          className="quick-btn deliver-all"
                          onClick={() => handleDeliverAll(group)}
                        >
                          📦 تسليم الكل
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expanded Orders List */}
                  {isExpanded && (
                    <div className="orders-list">
                      {group.orders.map((order) => (
                        <div key={order.id} className="order-item">
                          <div className="order-product">
                            <div className="product-icon">{order.products.emoji}</div>
                            <div className="product-details">
                              <h4>{order.products.name}</h4>
                              <p>{order.products.description}</p>
                              <div className="order-footer">
                                <span className="price">{order.products.price} 🪙</span>
                                <span className="time">{getTimeAgo(order.created_at)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="order-actions">
                            {activeTab === 'pending' && (
                              <>
                                <button 
                                  className="action-btn mini approve"
                                  onClick={() => openModal(order, 'approve')}
                                  disabled={processingOrder === order.id}
                                >
                                  ✅
                                </button>
                                <button 
                                  className="action-btn mini reject"
                                  onClick={() => openModal(order, 'reject')}
                                  disabled={processingOrder === order.id}
                                >
                                  ❌
                                </button>
                              </>
                            )}
                            
                            {activeTab === 'approved' && (
                              <button 
                                className="action-btn mini deliver"
                                onClick={() => openModal(order, 'deliver')}
                                disabled={processingOrder === order.id}
                              >
                                📦
                              </button>
                            )}
                            
                            {activeTab === 'delivered' && (
                              <div className="delivered-mark">✓</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && modalContent && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>×</button>
            
            <div className="modal-icon">{modalContent.icon}</div>
            <h2 className="modal-title">{modalContent.title}</h2>
            
            {selectedOrder && (
              <div className="modal-order">
                <div className="modal-product">
                  <span className="modal-emoji">{selectedOrder.products.emoji}</span>
                  <div>
                    <strong>{selectedOrder.products.name}</strong>
                    <span className="modal-student">{selectedOrder.students.name}</span>
                  </div>
                </div>
              </div>
            )}

            <p className="modal-message">{modalContent.message}</p>

            {modalContent.showInput && (
              <textarea
                className="modal-textarea"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="اكتب سبب الرفض..."
                rows="3"
              />
            )}

            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={closeModal}>
                إلغاء
              </button>
              <button 
                className={`modal-btn confirm ${modalContent.confirmClass}`}
                onClick={confirmAction}
                disabled={processingOrder === selectedOrder?.id}
              >
                {processingOrder === selectedOrder?.id ? '⏳ جاري...' : modalContent.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PendingOrders;