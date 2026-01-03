/**
 * Grid Button Configuration
 *
 * Data model for configurable 4×6 grid with drag & drop
 * Each button has absolute positioning: { page, row, col }
 */

// Button sets by role/mode
export const BUTTON_SETS = {
  // Normal user buttons (blue gradient)
  normal: [
    {
      id: 'evenimente',
      icon: '📅',
      label: 'Evenimente',
      route: '/evenimente',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
    {
      id: 'disponibilitate',
      icon: '🗓️',
      label: 'Disponibilitate',
      route: '/disponibilitate',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
    {
      id: 'salarii',
      icon: '💰',
      label: 'Salarii',
      route: '/salarizare',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
    {
      id: 'soferi',
      icon: '🚗',
      label: 'Șoferi',
      route: '/soferi',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
    {
      id: 'animator-chat',
      icon: '💬',
      label: 'Animator Chat',
      route: '/animator/chat-clienti',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
    {
      id: 'clienti-disp',
      icon: '📱',
      label: 'Clienți Disp',
      route: '/whatsapp/available',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
  ],

  // Admin buttons (red gradient)
  admin: [
    {
      id: 'kyc-approvals',
      icon: '✅',
      label: 'Aprobări KYC',
      action: 'loadKycSubmissions',
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    },
    {
      id: 'ai-conversations',
      icon: '💬',
      label: 'Conversații AI',
      action: 'loadAiConversations',
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    },
    {
      id: 'exit-admin',
      icon: '🚪',
      label: 'Ieși Admin',
      action: 'exitAdminMode',
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    },
  ],

  // GM buttons (yellow gradient)
  gm: [
    {
      id: 'wa-accounts',
      icon: '⚙️',
      label: 'Conturi WA',
      route: '/accounts-management',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    },
    {
      id: 'metrics',
      icon: '📊',
      label: 'Metrice',
      action: 'loadPerformanceMetrics',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    },
    {
      id: 'analytics',
      icon: '📈',
      label: 'Analiză',
      action: 'setView',
      actionParam: 'gm-analytics',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    },
    {
      id: 'exit-gm',
      icon: '🚪',
      label: 'Ieși GM',
      action: 'exitGMMode',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    },
  ],
};

// Dock buttons (always visible, fixed at bottom)
export const DOCK_BUTTONS = [
  {
    id: 'centrala',
    icon: '📞',
    label: 'Centrala',
    route: '/centrala-telefonica',
  },
  {
    id: 'chat-clienti',
    icon: '💬',
    label: 'Chat',
    route: '/chat-clienti',
  },
  {
    id: 'fab',
    icon: '➕',
    label: 'Meniu',
    isFAB: true,
  },
  {
    id: 'team',
    icon: '👥',
    label: 'Echipă',
    route: '/team',
  },
  {
    id: 'home-ai',
    icon: '🤖',
    label: 'Acasă + AI',
    route: '/home',
  },
];

// Default grid layout (initial positions)
// Format: { buttonId: { page: 1, row: 1, col: 1 } }
export const DEFAULT_GRID_LAYOUT = {
  // Normal buttons - Page 1
  evenimente: { page: 1, row: 1, col: 1 },
  disponibilitate: { page: 1, row: 1, col: 2 },
  salarii: { page: 1, row: 1, col: 3 },
  soferi: { page: 1, row: 1, col: 4 },
  'animator-chat': { page: 1, row: 2, col: 1 },
  'clienti-disp': { page: 1, row: 2, col: 2 },

  // Admin buttons - Page 1, row 3
  'kyc-approvals': { page: 1, row: 3, col: 1 },
  'ai-conversations': { page: 1, row: 3, col: 2 },
  'exit-admin': { page: 1, row: 3, col: 3 },

  // GM buttons - Page 1, row 4
  'wa-accounts': { page: 1, row: 4, col: 1 },
  metrics: { page: 1, row: 4, col: 2 },
  analytics: { page: 1, row: 4, col: 3 },
  'exit-gm': { page: 1, row: 4, col: 4 },
};

// Grid configuration
export const GRID_CONFIG = {
  COLS: 4,
  ROWS: 6,
  MAX_SLOTS_PER_PAGE: 24, // 4 × 6
};

/**
 * Get available buttons based on user roles
 */
export function getAvailableButtons(adminMode, gmMode) {
  const buttons = [...BUTTON_SETS.normal];

  if (adminMode) {
    buttons.push(...BUTTON_SETS.admin);
  }

  if (gmMode) {
    buttons.push(...BUTTON_SETS.gm);
  }

  return buttons;
}

/**
 * Get button by ID from all sets
 */
export function getButtonById(buttonId) {
  const allButtons = [...BUTTON_SETS.normal, ...BUTTON_SETS.admin, ...BUTTON_SETS.gm];

  return allButtons.find(btn => btn.id === buttonId);
}
