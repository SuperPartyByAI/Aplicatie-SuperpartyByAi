let toastCallback = null;

export function showToast(message, type = 'info') {
  if (toastCallback) {
    toastCallback(message, type);
  }
}

export function setToastCallback(callback) {
  toastCallback = callback;
}

export function clearToastCallback() {
  toastCallback = null;
}
