/**
 * Wheel Actions Configuration - GRID LAYOUT (4 columns)
 * Dynamic actions based on user role and mode (admin/gm/user)
 * 
 * Modes:
 * - Normal: 6 buttons (user functions)
 * - Admin: 3 buttons (admin functions only)
 * - GM: 4 buttons (GM functions only)
 * - Admin+GM: 7 buttons (3 admin + 4 GM)
 * - Normal+Admin+GM: 13 buttons (6 normal + 3 admin + 4 GM)
 */

export const getWheelActions = (role, adminMode, gmMode) => {
  // Base 6 normal buttons (user mode)
  const normalButtons = [
    { id: 'evenimente', icon: '📅', label: 'Evenimente', route: '/evenimente', type: 'normal', row: 1 },
    { id: 'disponibilitate', icon: '🗓️', label: 'Disponibilitate', route: '/disponibilitate', type: 'normal', row: 1 },
    { id: 'salarii', icon: '💰', label: 'Salarii', route: '/salarizare', type: 'normal', row: 1 },
    { id: 'soferi', icon: '🚗', label: 'Șoferi', route: '/soferi', type: 'normal', row: 1 },
    { id: 'chat-animator', icon: '💬', label: 'Chat Animator', route: '/animator/chat-clienti', type: 'normal', row: 2 },
    { id: 'clienti-disp', icon: '📱', label: 'Clienți Disp', route: '/whatsapp/available', type: 'normal', row: 2 },
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

  // GM buttons (4)
  const gmButtons = [
    {
      id: 'gm-whatsapp-accounts',
      icon: '⚙️',
      label: 'Conturi WA',
      type: 'gm',
      row: 4,
      route: '/accounts-management',
    },
    {
      id: 'gm-overview',
      icon: '📊',
      label: 'Metrici',
      type: 'gm',
      row: 4,
      action: 'loadPerformanceMetrics',
      view: 'gm-overview',
      state: { intent: { action: 'loadPerformanceMetrics', view: 'gm-overview' } },
    },
    {
      id: 'gm-analytics',
      icon: '📈',
      label: 'Analytics',
      type: 'gm',
      row: 4,
      action: 'setView',
      view: 'gm-analytics',
      state: { intent: { action: 'setView', view: 'gm-analytics' } },
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

  // Determine which buttons to show based on active modes
  const isAdmin = adminMode && role === 'admin';
  const isGM = gmMode && role === 'admin';

  // Normal + Admin + GM Mode: 13 buttons (6 normal + 3 admin + 4 GM)
  if (isAdmin && isGM) {
    return [...normalButtons, ...adminButtons, ...gmButtons];
  }

  // Admin Mode only: 3 buttons (admin functions only)
  if (isAdmin && !isGM) {
    return adminButtons;
  }

  // GM Mode only: 4 buttons (GM functions only)
  if (isGM && !isAdmin) {
    return gmButtons;
  }

  // Default: Normal mode (6 buttons)
  return normalButtons;
};
