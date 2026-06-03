import React from 'react';
import './NotificationsPanel.css';

function NotificationsPanel({ 
  notifications, 
  isOpen, 
  onClose 
}) {
  
  return (
    <>
      {/* Overlay للإغلاق لما يدوس بره */}
      {isOpen && (
        <div className="notif-overlay" onClick={onClose}></div>
      )}
      
      {/* الـ Panel نفسه */}
      <div className={`notif-panel ${isOpen ? 'notif-panel-open' : ''}`}>
        <div className="notif-header">
          <h3>📬 الإشعارات</h3>
          <button className="notif-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="notif-list">
          {notifications.length === 0 ? (
            <div className="notif-empty">
              <span className="notif-empty-icon">📭</span>
              <p>لا توجد إشعارات</p>
            </div>
          ) : (
            notifications.map(notif => (
              <div 
                key={notif.id} 
                className={`notif-item ${!notif.is_read ? 'notif-item-new' : ''}`}
              >
                <div className="notif-item-content">
                  <p className="notif-item-title">{notif.title}</p>
                  <p className="notif-item-message">{notif.message}</p>
                  <span className="notif-item-time">
                    {new Date(notif.created_at).toLocaleString('ar-EG')}
                  </span>
                </div>
                {!notif.is_read && (
                  <span className="notif-item-badge"></span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default NotificationsPanel;