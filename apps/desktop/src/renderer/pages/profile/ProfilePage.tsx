// apps/desktop/src/renderer/pages/profile/ProfilePage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadFile } from '../../services/uploadService';
import { API_BASE_URL } from '@renderer/config';
import './ProfilePage.css';

interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: 'ONLINE' | 'IDLE' | 'DND' | 'OFFLINE';
  lastSeenAt?: string;
}

const STATUS_CONFIG = {
  ONLINE: { label: '在线', color: '#4CAF50' },
  IDLE: { label: '离开', color: '#FF9800' },
  DND: { label: '请勿打扰', color: '#F44336' },
  OFFLINE: { label: '离线', color: '#9E9E9E' },
};

export const ProfilePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialogs
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('locale', lang);
    setLangMenuOpen(false);
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = await window.electronAPI.getToken();
      const response = await fetch(`${API_BASE_URL}/api/v1/profile/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch profile');

      const data = await response.json();
      setProfile(data);
      setNewName(data.displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    try {
      const result = await uploadFile(file, 'avatar');

      // PATCH profile with new avatar URL
      const token = await window.electronAPI.getToken();
      if (!token) return;

      const res = await fetch(`${API_BASE_URL}/api/v1/profile/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ avatarUrl: result.url }),
      });

      if (res.ok && profile) {
        setProfile({ ...profile, avatarUrl: result.url });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleUpdateName = async () => {
    if (!profile || newName === profile.displayName) {
      setEditNameOpen(false);
      return;
    }

    try {
      const token = await window.electronAPI.getToken();
      const response = await fetch(`${API_BASE_URL}/api/v1/profile/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: newName }),
      });

      if (!response.ok) throw new Error('Failed to update name');

      setProfile({ ...profile, displayName: newName });
      setEditNameOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!profile) return;

    setStatusMenuOpen(false);

    try {
      const token = await window.electronAPI.getToken();
      const response = await fetch(`${API_BASE_URL}/api/v1/profile/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      setProfile({ ...profile, status: status as any });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleLogout = async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.logout();
      }
      const locale = localStorage.getItem('locale');
      localStorage.clear();
      if (locale) localStorage.setItem('locale', locale);
      setLogoutDialogOpen(false);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-loading-spinner">{t('loading')}</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-page">
        <div className="profile-error-message">{error || 'Failed to load profile'}</div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[profile.status];

  return (
    <div className="profile-page">
      <div className="profile-content">
        {/* Telegram-style Profile Header */}
        <div className="profile-header">
          <div className="avatar-container">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" className="avatar" />
            ) : (
              <div className="avatar-placeholder">
                <span>{profile.displayName.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div
              className="status-indicator"
              style={{ backgroundColor: statusConfig.color }}
            />
            <input
              type="file"
              ref={avatarInputRef}
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={handleAvatarUpload}
            />
            <button
              className="avatar-edit-button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
            >
              {avatarUploading ? (
                <span style={{ fontSize: '12px' }}>...</span>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path
                    fill="currentColor"
                    d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                  />
                </svg>
              )}
            </button>
          </div>
          <h1 className="display-name">{profile.displayName}</h1>
          <span
            className="status-badge"
            style={{ borderColor: statusConfig.color }}
          >
            <span
              className="status-dot"
              style={{ backgroundColor: statusConfig.color }}
            />
            {statusConfig.label}
          </span>
        </div>

        {/* Account Info Card */}
        <div className="profile-card">
          <div className="profile-item" onClick={() => setEditNameOpen(true)}>
            <div className="item-icon">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path
                  fill="currentColor"
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                />
              </svg>
            </div>
            <div className="item-content">
              <div className="item-label">{t('nickname')}</div>
              <div className="item-value">{profile.displayName}</div>
            </div>
            <div className="item-action">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="currentColor"
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                />
              </svg>
            </div>
          </div>

          <div className="profile-divider" />

          <div className="profile-item disabled">
            <div className="item-icon">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path
                  fill="currentColor"
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
                />
              </svg>
            </div>
            <div className="item-content">
              <div className="item-label">{t('username')}</div>
              <div className="item-value">@{profile.username}</div>
            </div>
          </div>

          <div className="profile-divider" />

          <div className="profile-item disabled">
            <div className="item-icon">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path
                  fill="currentColor"
                  d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
                />
              </svg>
            </div>
            <div className="item-content">
              <div className="item-label">{t('email')}</div>
              <div className="item-value">{profile.email}</div>
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div className="profile-card">
          <div className="profile-item" onClick={() => setStatusMenuOpen(!statusMenuOpen)}>
            <div className="item-icon">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <circle fill={statusConfig.color} cx="12" cy="12" r="8" />
              </svg>
            </div>
            <div className="item-content">
              <div className="item-label">{t('status')}</div>
              <div className="item-value">{statusConfig.label}</div>
            </div>
            <div className="item-action">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M7 10l5 5 5-5z" />
              </svg>
            </div>
          </div>

          {statusMenuOpen && (
            <div className="status-menu">
              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                <div
                  key={status}
                  className={`status-option ${profile.status === status ? 'active' : ''}`}
                  onClick={() => handleStatusChange(status)}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <circle fill={config.color} cx="12" cy="12" r="6" />
                  </svg>
                  <span>{config.label}</span>
                  {profile.status === status && (
                    <svg className="check-icon" viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Language Card */}
        <div className="profile-card">
          <div className="profile-item" onClick={() => setLangMenuOpen(!langMenuOpen)}>
            <div className="item-icon">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/>
              </svg>
            </div>
            <div className="item-content">
              <div className="item-label">{t('language')}</div>
              <div className="item-value">{i18n.language === 'zh' ? '中文' : 'English'}</div>
            </div>
            <div className="item-action">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M7 10l5 5 5-5z" />
              </svg>
            </div>
          </div>

          {langMenuOpen && (
            <div className="status-menu">
              <div
                className={`status-option ${i18n.language === 'zh' ? 'active' : ''}`}
                onClick={() => changeLanguage('zh')}
              >
                <span>中文</span>
                {i18n.language === 'zh' && (
                  <svg className="check-icon" viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </div>
              <div
                className={`status-option ${i18n.language === 'en' ? 'active' : ''}`}
                onClick={() => changeLanguage('en')}
              >
                <span>English</span>
                {i18n.language === 'en' && (
                  <svg className="check-icon" viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button className="logout-button" onClick={() => setLogoutDialogOpen(true)}>
          {t('logout')}
        </button>

        {/* Version Info */}
        <div className="version-info">{t('version', { version: '1.0.0' })}</div>
      </div>

      {/* Edit Name Dialog */}
      {editNameOpen && (
        <div className="dialog-overlay" onClick={() => setEditNameOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">{t('editNickname')}</div>
            <div className="dialog-content">
              <input
                type="text"
                className="text-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="请输入昵称"
                autoFocus
              />
            </div>
            <div className="dialog-actions">
              <button className="dialog-button" onClick={() => setEditNameOpen(false)}>
                {t('cancel')}
              </button>
              <button className="dialog-button primary" onClick={handleUpdateName}>
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      {logoutDialogOpen && (
        <div className="dialog-overlay" onClick={() => setLogoutDialogOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">{t('logout')}</div>
            <div className="dialog-content">
              <p>{t('logoutConfirm')}</p>
            </div>
            <div className="dialog-actions">
              <button className="dialog-button" onClick={() => setLogoutDialogOpen(false)}>
                {t('cancel')}
              </button>
              <button className="dialog-button danger" onClick={handleLogout}>
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
