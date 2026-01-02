// Version check utility - silent update on app reopen only

const CURRENT_BUILD_TIME = import.meta.env.VITE_BUILD_TIME || 'unknown';

export function startVersionCheck() {
  // Store current version on first load
  const storedVersion = localStorage.getItem('app_build_time');
  
  if (!storedVersion) {
    localStorage.setItem('app_build_time', CURRENT_BUILD_TIME);
    console.log('📦 Build time stored:', CURRENT_BUILD_TIME);
    return;
  }

  // Check if version changed (new deployment) - SILENT
  if (storedVersion !== CURRENT_BUILD_TIME) {
    console.log('🔄 New version detected:', CURRENT_BUILD_TIME, '(old:', storedVersion + ')');
    // Update stored version silently
    localStorage.setItem('app_build_time', CURRENT_BUILD_TIME);
    console.log('✅ Version updated silently');
  }
}

export function stopVersionCheck() {
  // No-op - no intervals to clear
}
