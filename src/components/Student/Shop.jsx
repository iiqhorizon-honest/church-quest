import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './StudentShop.css';

// ─── constants ────────────────────────────────────────────────────────────────
const STATUS_MAP = {
  pending:   { label: '⏳ قيد المراجعة', cls: 'pending'   },
  approved:  { label: '✅ تمت الموافقة',  cls: 'approved'  },
  delivered: { label: '📦 تم التسليم',   cls: 'delivered' },
  rejected:  { label: '❌ مرفوض',         cls: 'rejected'  },
};

const ORDER_TABS = [
  { key: 'all',       label: '📋 الكل'    },
  { key: 'pending',   label: '⏳ معلقة'  },
  { key: 'approved',  label: '✅ موافق'  },
  { key: 'delivered', label: '📦 مُسلَّمة' },
];

const CONFETTI_COLORS = ['#ff2d78','#00f0c8','#ffe500','#b44fff','#00aaff','#ff6b6b'];

// ─── FIX 9: groupOrders — استخدام أول created_at كـ key ثابت للـ group ─────
// بدل group[0].id اللي ممكن يتغير، نستخدم timestamp مع index
function groupOrders(orders) {
  if (!orders.length) return [];

  const sorted = [...orders].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  const groups = [];
  let current = [sorted[0]];
  let groupAnchor = new Date(sorted[0].created_at).getTime();

  for (let i = 1; i < sorted.length; i++) {
    const t = new Date(sorted[i].created_at).getTime();
    if (t - groupAnchor <= 60000) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
      groupAnchor = t;
    }
  }
  groups.push(current);

  // FIX 9: key ثابت = timestamp + index عشان مش يتأثر بترتيب الـ orders جوه الـ group
  return groups.map((group, idx) => ({
    items: group,
    key: `${new Date(group[0].created_at).getTime()}-${idx}`,
  }));
}

// ─── OrdersView component ────────────────────────────────────────────────────
function OrdersView({ myOrders, orderTab, setOrderTab, filteredOrders, totalSpent, setView }) {
  const [expandedGroups, setExpandedGroups] = useState({});

  // FIX 5: نحتفظ بـ expandedGroups حتى لو filteredOrders اتغير
  // groupOrders بترجع objects بـ key ثابت مش بيتأثر بالترتيب
  const groups = useMemo(() => groupOrders(filteredOrders), [filteredOrders]);

  const toggleGroup = (key) =>
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const groupStatus = (group) => {
    const priority = ['rejected', 'pending', 'approved', 'delivered'];
    return group.reduce((worst, o) => {
      return priority.indexOf(o.status) < priority.indexOf(worst) ? o.status : worst;
    }, 'delivered');
  };

  return (
    <div className="orders-section">
      <div className="section-header">
        <h2>📦 طلباتي</h2>
        {myOrders.length > 0 && (
          <div className="orders-stats">
            <div className="stat-item">
              <span className="stat-label">الطلبات</span>
              <span className="stat-value">{myOrders.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">المصروفات</span>
              <span className="stat-value">{totalSpent} 🪙</span>
            </div>
          </div>
        )}
        <div className="orders-tabs">
          {ORDER_TABS.map(tab => (
            <button
              key={tab.key}
              className={`order-tab-btn ${orderTab === tab.key ? 'active' : ''}`}
              onClick={() => setOrderTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📦</span>
          <h3>لا توجد طلبات</h3>
          <p>{orderTab === 'all' ? 'لم تقم بأي عمليات شراء بعد' : 'لا طلبات في هذه الحالة'}</p>
          <button className="browse-products-btn" onClick={() => setView('shop')}>تصفح المتجر</button>
        </div>
      ) : (
        <div className="orders-list">
          {groups.map(({ items: group, key }) => {
            const isExpanded = !!expandedGroups[key];
            const isSingle   = group.length === 1;
            const date       = new Date(group[0].created_at + 'Z');
            const status     = groupStatus(group);
            const s          = STATUS_MAP[status] || STATUS_MAP.pending;
            const total      = group.reduce((sum, o) => sum + (o.products?.price || 0), 0);

            return (
              <div key={key} className="order-group">
                <div
                  className={`order-group-header ${!isSingle ? 'clickable' : ''}`}
                  onClick={() => !isSingle && toggleGroup(key)}
                >
                  <div className="order-group-emojis">
                    {group.slice(0, 3).map((o, ei) => (
                      <span key={ei} className="og-emoji">{o.products?.emoji || '📦'}</span>
                    ))}
                    {group.length > 3 && (
                      <span className="og-more">+{group.length - 3}</span>
                    )}
                  </div>

                  <div className="order-group-info">
                    {isSingle ? (
                      <h4>{group[0].products?.name || 'منتج محذوف'}</h4>
                    ) : (
                      <h4>{group.length} منتجات</h4>
                    )}
                    <p className="order-date">
                      {date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                      {' · '}
                      {date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="order-group-meta">
                    <span className={`order-status ${s.cls}`}>{s.label}</span>
                    <span className="order-price">−{total} 🪙</span>
                    {!isSingle && (
                      <span className="expand-arrow">{isExpanded ? '▲' : '▼'}</span>
                    )}
                  </div>
                </div>

                {!isSingle && isExpanded && (
                  <div className="order-group-items">
                    {group.map(order => {
                      const os = STATUS_MAP[order.status] || STATUS_MAP.pending;
                      return (
                        <div key={order.id} className="order-sub-item">
                          <span className="order-sub-emoji">{order.products?.emoji || '📦'}</span>
                          <span className="order-sub-name">{order.products?.name || 'منتج محذوف'}</span>
                          <span className={`order-status ${os.cls}`}>{os.label}</span>
                          <span className="order-sub-price">−{order.products?.price || 0} 🪙</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
function StudentShop({ user, onLogout }) {
  const navigate = useNavigate();

  // ── data ──
  const [products,    setProducts]    = useState([]);
  const [studentData, setStudentData] = useState(null);
  const [myOrders,    setMyOrders]    = useState([]);

  // ── ui ──
  const [loading,     setLoading]     = useState(false);
  const [view,        setView]        = useState('shop');
  const [orderTab,    setOrderTab]    = useState('all');
  const [selectedCat, setSelectedCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy,      setSortBy]      = useState('price-low');

  // ── cart + per-card qty ──
  const [cart,    setCart]    = useState([]);
  const [cardQty, setCardQty] = useState({});

  // ── modal ──
  const [showModal,    setShowModal]    = useState(false);
  const [modalData,    setModalData]    = useState(null);

  // FIX 6: منع double-click على confirmPurchase
  const purchasingRef = useRef(false);

  // ── notification ──
  const [notif,    setNotif]    = useState(null);
  const notifTimer = useRef(null);

  // ── confetti ──
  const [showConfetti,    setShowConfetti]    = useState(false);
  // FIX 2: نحسب confetti items مرة واحدة بس بدل Math.random() في كل render
  const confettiItems = useRef(
    Array.from({ length: 55 }, (_, i) => ({
      left:  `${(i * 17 + 7) % 100}%`,  // توزيع شبه عشوائي لكن ثابت
      delay: `${(i * 0.057) % 2}s`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      round: i % 3 === 0,
    }))
  );
  // FIX 7: cleanup confetti timeout
  const confettiTimer = useRef(null);

  // ─── cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(notifTimer.current);
      clearTimeout(confettiTimer.current);
    };
  }, []);

  // ─── categories ───────────────────────────────────────────────────────────
  const categories = useMemo(() => [
    { value: 'all',     label: 'الكل',     icon: '🎁' },
    { value: 'books',   label: 'كتب',      icon: '📚' },
    { value: 'toys',    label: 'ألعاب',    icon: '🎮' },
    { value: 'sweets',  label: 'حلويات',   icon: '🍭' },
    { value: 'special', label: 'مميزة',    icon: '⭐' },
  ], []);

  // ─── FIX 1: showNotif في useCallback عشان reference ثابتة ────────────────
  const showNotif = useCallback((title, message, type = 'success') => {
    clearTimeout(notifTimer.current);
    setNotif({ title, message, type });
    notifTimer.current = setTimeout(() => setNotif(null), 4000);
  }, []);

  // ─── fetch functions ──────────────────────────────────────────────────────
  const fetchStudentData = useCallback(async () => {
    const { data, error } = await supabase
      .from('students').select('*').eq('id', user.student.id).single();
    if (error) throw error;
    setStudentData(data);
  }, [user?.student?.id]);

  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('products').select('*').eq('available', true).order('category');
    if (error) throw error;
    setProducts(data || []);
  }, []);

  const fetchMyOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders').select('*, products(*)')
      .eq('student_id', user.student.id)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    setMyOrders(data || []);
  }, [user?.student?.id]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchProducts(), fetchStudentData(), fetchMyOrders()]);
    } catch {
      showNotif('❌ خطأ', 'فشل تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  }, [fetchProducts, fetchStudentData, fetchMyOrders, showNotif]); // FIX 1: showNotif في deps

  useEffect(() => {
    if (user?.student) fetchAllData();
  }, [fetchAllData]);

  // ─── FIX 3: نظف cardQty لما products تتغير ────────────────────────────────
  useEffect(() => {
    if (!products.length) return;
    const productIds = new Set(products.map(p => p.id));
    setCardQty(prev => {
      const cleaned = {};
      for (const id of Object.keys(prev)) {
        if (productIds.has(Number(id) || id)) cleaned[id] = prev[id];
      }
      // لو مفيش حاجة اتحذفت، مترجعش object جديد
      if (Object.keys(cleaned).length === Object.keys(prev).length) return prev;
      return cleaned;
    });
  }, [products]);

  // ─── FIX 7: triggerConfetti مع cleanup ───────────────────────────────────
  const triggerConfetti = useCallback(() => {
    setShowConfetti(true);
    clearTimeout(confettiTimer.current);
    confettiTimer.current = setTimeout(() => setShowConfetti(false), 3000);
  }, []);

  // ─── cart helpers ─────────────────────────────────────────────────────────
  const getCardQty = (id) => cardQty[id] ?? 1;

  const changeCardQty = (id, delta) =>
    setCardQty(prev => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) }));

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.product.price * i.qty, 0), [cart]);

  const isInCart = (id) => cart.some(i => i.product.id === id);

  const addToCart = (product) => {
    const qty = getCardQty(product.id);
    setCart(prev => {
      const idx = prev.findIndex(i => i.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...prev, { product, qty }];
    });
    setCardQty(prev => ({ ...prev, [product.id]: 1 }));
    showNotif('🛒 أُضيف للسلة', `${product.emoji} ${product.name} × ${qty}`, 'success');
  };

  // FIX 4: changeCartQty مع حد أقصى بناءً على رصيد الطالب
  const changeCartQty = useCallback((productId, delta) => {
    setCart(prev =>
      prev.map(item => {
        if (item.product.id !== productId) return item;
        const newQty = item.qty + delta;
        if (newQty <= 0) return { ...item, qty: 0 }; // هيتفلتر تحت
        // حد أقصى: مش هيقدر يشتري أكتر من اللي يقدر يدفعه
        if (studentData && item.product.price * newQty > studentData.coins) return item;
        return { ...item, qty: newQty };
      }).filter(i => i.qty > 0)
    );
  }, [studentData]);

  // ─── checkout ─────────────────────────────────────────────────────────────
  const handleCheckout = () => {
    if (!studentData || cart.length === 0) return;
    if (cartTotal > studentData.coins) {
      showNotif('⚠️ رصيد غير كافٍ', `تحتاج ${cartTotal - studentData.coins} عملة إضافية 🪙`, 'warning');
      return;
    }
    setModalData({ items: cart, totalCost: cartTotal, remaining: studentData.coins - cartTotal });
    setShowModal(true);
  };

  // ─── FIX 6: confirmPurchase محمي من double-click ─────────────────────────
  const confirmPurchase = async () => {
    if (!modalData || purchasingRef.current) return;
    purchasingRef.current = true;
    setShowModal(false);
    setLoading(true);

    try {
      const orderRows = modalData.items.flatMap(({ product, qty }) =>
        Array.from({ length: qty }, () => ({
          student_id: user.student.id,
          product_id: product.id,
          status: 'pending',
        }))
      );

      const { data: rpcResult, error: rpcErr } = await supabase.rpc('purchase_items', {
        p_student_id: user.student.id,
        p_total_cost: modalData.totalCost,
        p_order_rows: orderRows,
      });
      if (rpcErr) throw rpcErr;

      if (!rpcResult.success) {
        showNotif('⚠️ رصيد غير كافٍ', 'تغير رصيدك، حاول مرة أخرى', 'warning');
        await fetchStudentData();
        return;
      }

      const sideEffects = await Promise.allSettled([
        supabase.from('coin_transactions').insert([{
          student_id: user.student.id,
          amount: modalData.totalCost,
          transaction_type: 'spent',
          reason: `شراء ${modalData.items.length} منتج`,
        }]),
        supabase.from('notifications').insert([{
          student_id: user.student.id,
          title: '🎉 تم الشراء بنجاح!',
          message: `تم شراء ${modalData.items.length} منتج. سيتم التسليم قريباً.`,
        }]),
      ]);

      sideEffects.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.error(`Side effect ${i} failed:`, result.reason);
        }
      });

      triggerConfetti();
      showNotif('🎉 تم الشراء!', `${modalData.totalCost} 🪙 — سيتم التسليم قريباً`, 'success');
      setCart([]);
      setView('shop');
      await Promise.all([fetchStudentData(), fetchMyOrders()]);
    } catch (err) {
      console.error(err);
      showNotif('❌ فشل الشراء', 'حدث خطأ، حاول مرة أخرى', 'error');
    } finally {
      setLoading(false);
      setModalData(null);
      purchasingRef.current = false; // FIX 6: release lock
    }
  };

  // ─── filtered data ────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let list = selectedCat === 'all' ? products : products.filter(p => p.category === selectedCat);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'price-low')  return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      if (sortBy === 'name')       return a.name.localeCompare(b.name, 'ar');
      return 0;
    });
  }, [products, selectedCat, searchQuery, sortBy]);

  const filteredOrders = useMemo(() =>
    orderTab === 'all' ? myOrders : myOrders.filter(o => o.status === orderTab),
    [myOrders, orderTab]
  );

  const totalSpent = useMemo(() =>
    myOrders
      .filter(o => o.status !== 'rejected')
      .reduce((s, o) => s + (o.products?.price || 0), 0),
    [myOrders]
  );

  // ─── loading screen ───────────────────────────────────────────────────────
  if (!studentData) {
    return (
      <div className="student-shop-page">
        <div className="stars" />
        <div className="shop-loading-screen">
          <div className="shop-logo-loader">
            <span className="shop-logo-icon">🕹️</span>
            <div className="shop-logo-spinner" />
          </div>
          <p className="shop-loading-text">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="student-shop-page">
      <div className="stars" />

      {/* FIX 2: Confetti بـ items ثابتة من الـ ref */}
      {showConfetti && (
        <div className="confetti-container">
          {confettiItems.current.map((item, i) => (
            <div key={i} className="confetti" style={{
              left: item.left,
              animationDelay: item.delay,
              backgroundColor: item.color,
              borderRadius: item.round ? '50%' : '2px',
            }} />
          ))}
        </div>
      )}

      {/* Notification */}
      {notif && (
        <div className={`custom-notification ${notif.type} show`}>
          <div className="notification-content">
            <h4>{notif.title}</h4>
            <p>{notif.message}</p>
          </div>
          <button className="notification-close" onClick={() => setNotif(null)}>✕</button>
        </div>
      )}

      {/* Checkout Modal */}
      {showModal && modalData && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h3>🛒 تأكيد الشراء</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {modalData.items.map(({ product, qty }) => (
                <div key={product.id} className="modal-product">
                  <span className="modal-emoji">{product.emoji}</span>
                  <h4>
                    {product.name}
                    {qty > 1 && (
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--c-muted)', marginRight: '6px' }}>
                        × {qty}
                      </span>
                    )}
                  </h4>
                  <p>{product.description}</p>
                </div>
              ))}
              <div className="modal-details">
                <div className="detail-row">
                  <span className="detail-label">إجمالي الطلب</span>
                  <span className="detail-value price">{modalData.totalCost} 🪙</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">رصيدك الحالي</span>
                  <span className="detail-value">{studentData.coins} 🪙</span>
                </div>
                <div className="detail-row highlight">
                  <span className="detail-label">رصيدك بعد الشراء</span>
                  <span className="detail-value">{modalData.remaining} 🪙</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setShowModal(false)}>إلغاء</button>
              <button className="modal-btn confirm" onClick={confirmPurchase} disabled={loading}>
                {loading ? '...' : '✅ تأكيد الشراء'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ HEADER ═══════════ */}
      <header className="header">
        <div className="header-content">
          <div className="header-title">
            <h1>🕹️ متجر النجوم</h1>
          </div>
          <div className="header-bottom">
            <div className="coins-display">
              <span className="coin-icon">🪙</span>
              <span>{studentData.coins}</span>
            </div>
            <button
              className={`cart-toggle-btn icon-btn ${view === 'cart' ? 'active' : ''}`}
              title="السلة"
              onClick={() => setView(v => v === 'cart' ? 'shop' : 'cart')}
            >
              🛍️
              {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
            </button>
            <button
              className={`orders-toggle-btn icon-btn ${view === 'orders' ? 'active' : ''}`}
              title="طلباتي"
              onClick={() => setView(v => v === 'orders' ? 'shop' : 'orders')}
            >
              📦
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════ MAIN ═══════════ */}
      <div className="container">

        {/* ══ SHOP ══ */}
        {view === 'shop' && (
          <>
            <div className="sticky-bar">
              <div className="controls-section">
                {/* FIX 8: إزالة الـ span الـ icon من الـ search-bar — كان مكرر مع الـ placeholder */}
                <div className="search-bar">
                  <input
                    type="text"
                    placeholder="🔍 ابحث عن منتج..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button className="clear-search" onClick={() => setSearchQuery('')}>✕</button>
                  )}
                </div>
                <select className="sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="price-low">💰 الأقل</option>
                  <option value="price-high">💎 الأعلى</option>
                  <option value="name">🔤 الاسم</option>
                </select>
              </div>
              <div className="category-filter">
                {categories.map(cat => (
                  <button
                    key={cat.value}
                    className={`category-btn ${selectedCat === cat.value ? 'active' : ''}`}
                    onClick={() => setSelectedCat(cat.value)}
                  >
                    <span className="cat-icon">{cat.icon}</span>
                    <span className="cat-label">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="loading-products">
                <div className="spinner" />
                <p>جاري التحميل...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🔍</span>
                <h3>لا توجد منتجات</h3>
                <p>{searchQuery ? `لا نتائج لـ "${searchQuery}"` : 'لا توجد منتجات في هذه الفئة'}</p>
                {searchQuery && (
                  <button className="clear-filters-btn" onClick={() => setSearchQuery('')}>مسح البحث</button>
                )}
              </div>
            ) : (
              <div className="products-grid">
                {filteredProducts.map(product => {
                  const qty        = getCardQty(product.id);
                  const totalPrice = product.price * qty;
                  const canAfford  = studentData.coins >= totalPrice;
                  const inCart     = isInCart(product.id);
                  const afford1Pct = Math.min((studentData.coins / product.price) * 100, 100);

                  return (
                    <div key={product.id} className={`product-card ${!canAfford ? 'cannot-afford' : ''}`}>
                      {product.category === 'special' && <div className="special-badge">⭐ مميز</div>}

                      <div className="product-emoji">{product.emoji}</div>

                      <div className="product-info">
                        <h3>{product.name}</h3>
                        <p className="product-description">{product.description}</p>
                      </div>

                      <div className="product-footer">
                        <div className="price-row">
                          <span className="price-label">السعر</span>
                          <span className="price-value">
                            {qty > 1 ? `${totalPrice}` : product.price} 🪙
                            {qty > 1 && (
                              <span style={{ fontSize: '0.7rem', opacity: 0.7, marginRight: '3px' }}>
                                ({product.price}×{qty})
                              </span>
                            )}
                          </span>
                        </div>

                        {studentData.coins < product.price && (
                          <div className="affordability-bar">
                            <div className="affordability-fill" style={{ width: `${afford1Pct}%` }} />
                          </div>
                        )}

                        <div className="card-qty-row">
                          <button className="card-qty-btn" onClick={() => changeCardQty(product.id, -1)}>−</button>
                          <span className="card-qty-num">{qty}</span>
                          <button className="card-qty-btn" onClick={() => changeCardQty(product.id, +1)}>+</button>
                        </div>

                        <button
                          className={`add-to-cart-btn ${inCart ? 'in-cart' : ''} ${!canAfford ? 'disabled' : ''}`}
                          onClick={() => canAfford && addToCart(product)}
                          disabled={!canAfford || loading}
                        >
                          {!canAfford
                            ? `⚠️ تحتاج ${totalPrice - studentData.coins} 🪙`
                            : inCart ? '✅ في السلة — أضف المزيد' : '🛒 أضف للسلة'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══ CART ══ */}
        {view === 'cart' && (
          <div className="cart-section">
            <div className="cart-header-card">
              <h2>🛍️ سلة المشتريات</h2>
              {cart.length > 0 && (
                <span className="cart-total-pill">الإجمالي: {cartTotal} 🪙</span>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🛍️</span>
                <h3>السلة فارغة</h3>
                <p>أضف منتجات من المتجر</p>
                <button className="browse-products-btn" onClick={() => setView('shop')}>تصفح المتجر</button>
              </div>
            ) : (
              <>
                <div className="cart-items-list">
                  {cart.map(({ product, qty }) => (
                    <div key={product.id} className="cart-item">
                      <span className="cart-item-emoji">{product.emoji}</span>
                      <div className="cart-item-info">
                        <h4>{product.name}</h4>
                        <span className="cart-item-price">{product.price * qty} 🪙</span>
                      </div>
                      <div className="cart-item-qty">
                        <button className="cart-qty-btn remove" onClick={() => changeCartQty(product.id, -1)}>−</button>
                        <span>{qty}</span>
                        <button className="cart-qty-btn" onClick={() => changeCartQty(product.id, +1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-checkout-bar">
                  <button
                    className="checkout-btn"
                    onClick={handleCheckout}
                    disabled={loading || cartTotal > studentData.coins}
                  >
                    {cartTotal > studentData.coins
                      ? `⚠️ تحتاج ${cartTotal - studentData.coins} 🪙 إضافية`
                      : `✅ اشتري الآن · ${cartTotal} 🪙`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ ORDERS ══ */}
        {view === 'orders' && (
          <OrdersView
            myOrders={myOrders}
            orderTab={orderTab}
            setOrderTab={setOrderTab}
            filteredOrders={filteredOrders}
            totalSpent={totalSpent}
            setView={setView}
          />
        )}

      </div>
    </div>
  );
}

export default StudentShop;