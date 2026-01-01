/**
 * Wheel Actions Configuration
 * Dynamic actions based on user role and mode (admin/gm/user)
 */

export const getWheelActions = (role, adminMode, gmMode) => {
  const baseActions = {
    inner: [
      { id: 'home', icon: '🏠', label: 'Home', route: '/home' },
      { id: 'evenimente', icon: '📅', label: 'Evenimente', route: '/evenimente' },
    ],
    outer: [
      { id: 'chat', icon: '💬', label: 'Chat', route: '/chat-clienti' },
      { id: 'whatsapp', icon: '📱', label: 'WhatsApp', route: '/accounts-management' },
      { id: 'disponibilitate', icon: '📋', label: 'Disponibilitate', route: '/disponibilitate' },
      { id: 'salarizare', icon: '💰', label: 'Salarii', route: '/salarizare' },
      { id: 'soferi', icon: '🚗', label: 'Șoferi', route: '/soferi' },
      { id: 'settings', icon: '⚙️', label: 'Setări', route: '/settings' },
    ],
  };

  // Admin Mode: Replace outer ring with admin actions
  if (adminMode && role === 'admin') {
    return {
      ...baseActions,
      outer: [
        {
          id: 'kyc-approvals',
          icon: '✅',
          label: 'Aprobări KYC',
          action: 'loadKycSubmissions',
          view: 'admin-kyc',
          state: { intent: { action: 'loadKycSubmissions', view: 'admin-kyc' } },
        },
        {
          id: 'ai-conversations',
          icon: '💬',
          label: 'Conversații AI',
          action: 'loadAiConversations',
          view: 'admin-conversations',
          state: { intent: { action: 'loadAiConversations', view: 'admin-conversations' } },
        },
        {
          id: 'admin-dashboard',
          icon: '📊',
          label: 'Admin Panel',
          route: '/admin',
        },
        {
          id: 'evenimente',
          icon: '📅',
          label: 'Evenimente',
          route: '/evenimente',
        },
        {
          id: 'exit-admin',
          icon: '🚪',
          label: 'Ieși Admin',
          action: 'exitAdminMode',
        },
      ],
    };
  }

  // GM Mode: Replace outer ring with GM actions
  if (gmMode && role === 'admin') {
    return {
      ...baseActions,
      outer: [
        {
          id: 'gm-overview',
          icon: '📊',
          label: 'GM Overview',
          action: 'loadPerformanceMetrics',
          view: 'gm-overview',
          state: { intent: { action: 'loadPerformanceMetrics', view: 'gm-overview' } },
        },
        {
          id: 'gm-conversations',
          icon: '💬',
          label: 'GM Conversații',
          action: 'loadGMUsers',
          view: 'gm-conversations',
          state: { intent: { action: 'loadGMUsers', view: 'gm-conversations' } },
        },
        {
          id: 'gm-analytics',
          icon: '📈',
          label: 'GM Analytics',
          action: 'setView',
          view: 'gm-analytics',
          state: { intent: { action: 'setView', view: 'gm-analytics' } },
        },
        {
          id: 'evenimente',
          icon: '📅',
          label: 'Evenimente',
          route: '/evenimente',
        },
        {
          id: 'disponibilitate',
          icon: '📋',
          label: 'Disponibilitate',
          route: '/disponibilitate',
        },
        {
          id: 'exit-gm',
          icon: '🚪',
          label: 'Ieși GM',
          action: 'exitGMMode',
        },
      ],
    };
  }

  // Default: User actions
  return baseActions;
};
