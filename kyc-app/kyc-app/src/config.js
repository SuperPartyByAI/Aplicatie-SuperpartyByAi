// Application configuration
// Centralized config to avoid hardcoded values

export const CONFIG = {
  // Admin email - should match the email in Firestore users collection with role='admin'
  ADMIN_EMAIL: 'ursache.andrei1995@gmail.com',

  // Rate limits
  MAX_IMAGES_PER_UPLOAD: 3,
  MAX_IMAGE_SIZE_MB: 3,

  // Pagination
  CONVERSATIONS_PER_PAGE: 50,
  EVENTS_PER_PAGE: 20,

  // Performance thresholds
  PERFORMANCE_SCORE_EXCELLENT: 90,
  PERFORMANCE_SCORE_GOOD: 70,
  PERFORMANCE_SCORE_ACCEPTABLE: 50,

  // Alert thresholds
  OVERDUE_TASKS_CRITICAL: 3,
  DOCUMENT_ACCEPTANCE_RATE_WARNING: 70,
};

// Helper function to check if user is admin
export const isAdmin = user => {
  return user?.email === CONFIG.ADMIN_EMAIL;
};
