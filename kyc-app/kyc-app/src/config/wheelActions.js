/**
 * Wheel Actions Configuration
 * Dynamic actions based on user role and mode (admin/gm/user)
 */

export const getWheelActions = (role, adminMode, gmMode) => {
  const baseActions = {
    inner: [
      { id: 'home', icon: '🏠', label: 'Home', route: '/home' },
      { id: 'video', icon: '📹', label: 'Video', route: '/centrala-telefonica' },
    ],
    outer: [
      { id: 'new-message', icon: '✉️', label: 'Mesaj Nou', route: '/chat-clienti' },
      { id: 'whatsapp', icon: '📱', label: 'WhatsApp', route: '/accounts-management' },
      { id: 'event', icon: '📅', label: 'Eveniment', route: '/evenimente' },
      { id: 'staff', icon: '👥', label: 'Staff', route: '/staff-setup' },
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
        },
        {
          id: 'ai-conversations',
          icon: '💬',
          label: 'Conversații AI',
          action: 'loadAiConversations',
          view: 'admin-conversations',
        },
        {
          id: 'admin-dashboard',
          icon: '📊',
          label: 'Admin Panel',
          route: '/admin',
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
        },
        {
          id: 'gm-conversations',
          icon: '💬',
          label: 'GM Conversații',
          action: 'loadGMUsers',
          view: 'gm-conversations',
        },
        {
          id: 'gm-analytics',
          icon: '📈',
          label: 'GM Analytics',
          view: 'gm-analytics',
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
