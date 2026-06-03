import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './ManageProducts.css';

function ManageProducts({ user, onLogout }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [toasts, setToasts] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    emoji: '📦',
    price: '',
    category: 'books',
    available: true
  });

  const categories = [
    { value: 'all',     label: '🔍 الكل',    color: '#6366f1' },
    { value: 'books',   label: '📚 كتب',     color: '#10b981' },
    { value: 'toys',    label: '🎮 ألعاب',   color: '#f59e0b' },
    { value: 'sweets',  label: '🍭 حلويات',  color: '#ef4444' },
    { value: 'special', label: '⭐ جوائز',   color: '#8b5cf6' }
  ];

  const emojiOptions = [
    '📦','📖','📕','📘','📗',
    '🎮','🧩','🎯','🎲','🃏',
    '🍫','🍬','🍭','🍩','🍪',
    '⌚','📱','🎁','🏆','💎','👑','⭐'
  ];

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showModal) closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      showToast('❌ خطأ في تحميل المنتجات', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    let result = [...products];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term)
      );
    }
    if (selectedCategory !== 'all') {
      result = result.filter(p => p.category === selectedCategory);
    }
    return result;
  }, [products, searchTerm, selectedCategory]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ name: '', description: '', emoji: '📦', price: '', category: 'books', available: true });
    setShowModal(true);
    document.body.style.overflow = 'hidden';
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      emoji: product.emoji,
      price: product.price,
      category: product.category,
      available: product.available
    });
    setShowModal(true);
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setShowModal(false);
    document.body.style.overflow = 'auto';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedPrice = parseInt(formData.price);
    if (isNaN(parsedPrice) || parsedPrice < 1) {
      showToast('❌ السعر يجب أن يكون رقم صحيح أكبر من صفر', 'error');
      return;
    }
    setActionLoading('submit');
    const productData = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      emoji: formData.emoji,
      price: parsedPrice,
      category: formData.category,
      available: formData.available
    };

    if (editingProduct) {
      setProducts(prev =>
        prev.map(p => p.id === editingProduct.id ? { ...p, ...productData } : p)
      );
    } else {
      const tempId = `temp-${Date.now()}`;
      setProducts(prev => [{ id: tempId, ...productData, created_at: new Date().toISOString() }, ...prev]);
    }
    closeModal();

    try {
      if (editingProduct) {
        const { error } = await supabase.from('products').update(productData).eq('id', editingProduct.id);
        if (error) throw error;
        showToast('✅ تم تحديث المنتج بنجاح');
      } else {
        const { error } = await supabase.from('products').insert([productData]);
        if (error) throw error;
        showToast('✅ تم إضافة المنتج بنجاح');
      }
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      showToast('❌ حدث خطأ، تم التراجع عن التغيير', 'error');
      fetchProducts();
    }
    setActionLoading(null);
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('هل أنت متأكد من الحذف؟')) return;
    setProducts(prev => prev.filter(p => p.id !== productId));
    setActionLoading(`delete-${productId}`);
    try {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      showToast('✅ تم الحذف');
    } catch (error) {
      console.error('Error deleting product:', error);
      showToast('❌ حدث خطأ في الحذف', 'error');
      fetchProducts();
    }
    setActionLoading(null);
  };

  const toggleAvailability = async (product) => {
    const newVal = !product.available;
    setProducts(prev =>
      prev.map(p => p.id === product.id ? { ...p, available: newVal } : p)
    );
    setActionLoading(`toggle-${product.id}`);
    try {
      const { error } = await supabase.from('products').update({ available: newVal }).eq('id', product.id);
      if (error) throw error;
    } catch (error) {
      console.error('Error toggling:', error);
      showToast('❌ حدث خطأ', 'error');
      fetchProducts();
    }
    setActionLoading(null);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
  };

  return (
    <div className="manage-products-page">
      <div className="particles" aria-hidden="true"></div>

      <div className="toast-stack" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      <header className="header">
        <div className="header-content">
          <button className="back-btn" onClick={() => navigate('/admin')} aria-label="رجوع">
            ← رجوع
          </button>

          <div className="header-title">
            <h1>🏪 المنتجات</h1>
            <span className="product-count">{filteredProducts.length} منتج</span>
          </div>

          <button className="add-btn" onClick={openAddModal} aria-label="إضافة منتج">
            + إضافة
          </button>
        </div>

        <div className="search-filter-bar">
          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 بحث..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="بحث عن منتج"
            />
            {searchTerm && (
              <button className="clear-btn" onClick={() => setSearchTerm('')} aria-label="مسح البحث">×</button>
            )}
          </div>

          <div className="filter-chips" role="group" aria-label="تصفية حسب الفئة">
            {categories.map(cat => (
              <button
                key={cat.value}
                className={`chip ${selectedCategory === cat.value ? 'active' : ''}`}
                style={selectedCategory === cat.value ? { background: cat.color, borderColor: cat.color } : {}}
                onClick={() => setSelectedCategory(cat.value)}
                aria-pressed={selectedCategory === cat.value}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="container">
        {loading ? (
          <div className="loading" role="status" aria-label="جاري التحميل">
            <div className="spinner"></div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>{searchTerm || selectedCategory !== 'all' ? 'لا توجد نتائج' : 'لا توجد منتجات'}</h3>
            <p>{searchTerm || selectedCategory !== 'all' ? 'جرب البحث بكلمات أخرى' : 'ابدأ بإضافة منتج جديد'}</p>
            {(searchTerm || selectedCategory !== 'all') && (
              <button className="reset-btn" onClick={resetFilters}>🔄 إعادة تعيين</button>
            )}
          </div>
        ) : (
          <div className="products-grid">
            {filteredProducts.map((product, index) => (
              <div
                key={product.id}
                className={`product-card ${!product.available ? 'unavailable' : ''}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* row-reverse: status أول في DOM = يسار، emoji تاني = يمين ✅ */}
                <div className="card-top">
                  <div className="product-status">{product.available ? '✅' : '⏸️'}</div>
                  <div className="product-emoji">{product.emoji}</div>
                </div>

                <div className="card-body">
                  <h3>{product.name}</h3>
                  <div className="product-meta">
                    <span className="category">
                      {categories.find(c => c.value === product.category)?.label}
                    </span>
                    <span className="price">{product.price} 🪙</span>
                  </div>
                </div>

                <div className="card-actions">
                  <button
                    className="action-btn edit"
                    onClick={() => openEditModal(product)}
                    disabled={actionLoading !== null}
                    aria-label="تعديل"
                    title="تعديل"
                  >✏️</button>
                  <button
                    className={`action-btn toggle ${product.available ? 'active' : ''}`}
                    onClick={() => toggleAvailability(product)}
                    disabled={actionLoading !== null}
                    aria-label={product.available ? 'إيقاف' : 'تفعيل'}
                    title={product.available ? 'إيقاف' : 'تفعيل'}
                  >
                    {actionLoading === `toggle-${product.id}` ? '⏳' : (product.available ? '⏸️' : '▶️')}
                  </button>
                  <button
                    className="action-btn delete"
                    onClick={() => handleDelete(product.id)}
                    disabled={actionLoading !== null}
                    aria-label="حذف"
                    title="حذف"
                  >
                    {actionLoading === `delete-${product.id}` ? '⏳' : '🗑️'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal} role="dialog" aria-modal="true" aria-label={editingProduct ? 'تعديل منتج' : 'إضافة منتج'}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProduct ? '✏️ تعديل' : '➕ إضافة'}</h2>
              <button className="modal-close" onClick={closeModal} aria-label="إغلاق">×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="prod-name">الاسم</label>
                <input
                  id="prod-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="اسم المنتج"
                  required
                  maxLength="50"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="prod-desc">الوصف (اختياري)</label>
                <input
                  id="prod-desc"
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="وصف مختصر"
                  maxLength="100"
                />
              </div>

              <div className="form-group">
                <label>اختر الإيموجي</label>
                <div className="emoji-grid" role="group">
                  {emojiOptions.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className={`emoji-btn ${formData.emoji === emoji ? 'selected' : ''}`}
                      onClick={() => setFormData({ ...formData, emoji })}
                      aria-pressed={formData.emoji === emoji}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="prod-price">السعر 🪙</label>
                  <input
                    id="prod-price"
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="10"
                    min="1"
                    max="99999"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="prod-cat">الفئة</label>
                  <select
                    id="prod-cat"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {categories.slice(1).map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.available}
                    onChange={(e) => setFormData({ ...formData, available: e.target.checked })}
                  />
                  <span>متوفر للشراء</span>
                </label>
              </div>

              <div className="form-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>إلغاء</button>
                <button type="submit" className="submit-btn" disabled={actionLoading === 'submit'}>
                  {actionLoading === 'submit' ? '⏳ جاري الحفظ...' : (editingProduct ? '💾 حفظ' : '✅ إضافة')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManageProducts;