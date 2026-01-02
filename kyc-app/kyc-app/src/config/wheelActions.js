/**
 * Wheel Actions Configuration - GRID LAYOUT (4 columns)
 * Dynamic actions based on user role and mode (admin/gm/user)
 */

export const getWheelActions = (role, adminMode, gmMode) => {
  // Base 6 normal buttons (always present)
  const normalButtons = [
    { id: 'home', icon: '🏠', label: 'Acasă', route: '/home', type: 'normal', row: 1 },
    { id: 'evenimente', icon: '📅', label: 'Evenimente', route: '/evenimente', type: 'normal', row: 1 },
    { id: 'disponibilitate', icon: '🗓️', label: 'Disponibilitate', route: '/disponibilitate', type: 'normal', row: 1 },
    { id: 'salarii', icon: '💰', label: 'Salarii', route: '/salarizare', type: 'normal', row: 1 },
    { id: 'soferi', icon: '🚗', label: 'Șoferi', route: '/soferi', type: 'normal', row: 2 },
    { id: 'whatsapp', icon: '📱', label: 'WhatsApp', route: '/accounts-management', type: 'normal', row: 2 },
  ];

  // Admin buttons (3)
  const adminButtons = [
    {
      id: 'kyc-approvals',
      icon: '✅',
      label: 'Aprobări KYC',
      type: 'admin',
      row: 3,
      action: 'loadKycSubmissions',
      view: 'admin-kyc',
      state: { intent: { action: 'loadKycSubmissions', view: 'admin-kyc' } },
    },
    {
      id: 'ai-conversations',
      icon: '💬',
      label: 'Conversații AI',
      type: 'admin',
      row: 3,
      action: 'loadAiConversations',
      view: 'admin-conversations',
      state: { intent: { action: 'loadAiConversations', view: 'admin-conversations' } },
    },
    {
      id: 'exit-admin',
      icon: '🚪',
      label: 'Ieși Admin',
      type: 'admin',
      row: 3,
      action: 'exitAdminMode',
    },
  ];

  // GM buttons (5)
  const gmButtons = [
    {
      id: 'gm-overview',
      icon: '📊',
      label: 'Metrici',
      type: 'gm',
      row: 3,
      action: 'loadPerformanceMetrics',
      view: 'gm-overview',
      state: { intent: { action: 'loadPerformanceMetrics', view: 'gm-overview' } },
    },
    {
      id: 'gm-conversations',
      icon: '💬',
      label: 'Conversații',
      type: 'gm',
      row: 3,
      action: 'loadGMUsers',
      view: 'gm-conversations',
      state: { intent: { action: 'loadGMUsers', view: 'gm-conversations' } },
    },
    {
      id: 'gm-analytics',
      icon: '📈',
      label: 'Analytics',
      type: 'gm',
      row: 3,
      action: 'setView',
      view: 'gm-analytics',
      state: { intent: { action: 'setView', view: 'gm-analytics' } },
    },
    {
      id: 'gm-whatsapp-accounts',
      icon: '⚙️',
      label: 'Conturi WA',
      type: 'gm',
      row: 3,
      route: '/accounts-management',
    },
    {
      id: 'exit-gm',
      icon: '🚪',
      label: 'Ieși GM',
      type: 'gm',
      row: 4,
      action: 'exitGMMode',
    },
  ];

  // Admin + GM Mode: 14 buttons (6 normal + 3 admin + 5 GM)
  if (adminMode && gmMode && role === 'admin') {
    return [...normalButtons, ...adminButtons, ...gmButtons];
  }

  // Admin Mode: 9 buttons (6 normal + 3 admin)
  if (adminMode && role === 'admin') {
    return [...normalButtons, ...adminButtons];
  }

  // GM Mode: 11 buttons (6 normal + 5 GM)
  if (gmMode && role === 'admin') {
    return [...normalButtons, ...gmButtons];
  }

  // Default: Normal mode (6 buttons)
  return normalButtons;
};
