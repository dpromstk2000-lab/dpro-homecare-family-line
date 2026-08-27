// DPRO 訪問介護・家族連絡 LINE
// STEP HOMECARE-15: 全画面回帰・管理権限分離・CSV数式実行防止
window.DPRO_HOMECARE_CONFIG = Object.freeze({
  APP_NAME: 'DPRO 訪問介護・家族連絡 LINE',
  APP_VERSION: 'HOMECARE-15-FINAL-REGRESSION-COMPLETE-20260728',
  API_BASE: 'https://dpro-homecare-family-line-api.dpromstk2000.workers.dev',
  OFFICE_CODE: 'dpro_homecare_demo',
  LIFF_ID: '',
  DEMO_LINE_USER_ID: 'UDEMO_HOMECARE_FAMILY_001',
  REQUEST_TIMEOUT_MS: 15000,
  STAFF_SESSION_STORAGE_KEY: 'dpro_homecare_staff_session',
  ADMIN_SESSION_STORAGE_KEY: 'dpro_homecare_admin_session'
});

/* DPRO TUTORIAL R3-R4 loader.
   Demo/tutorial UI only. It does not call business mutation APIs. */
(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  const shouldLoad = query.get('demo') === '1'
    || query.get('tutorial') === 'first10';
  if (!shouldLoad) return;

  if (!document.querySelector('link[data-dpro-tutorial-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'tutorial.css';
    link.dataset.dproTutorialStyle = '1';
    document.head.appendChild(link);
  }

  if (!document.querySelector('script[data-dpro-tutorial-script]')) {
    const script = document.createElement('script');
    script.src = 'tutorial.js';
    script.defer = true;
    script.dataset.dproTutorialScript = '1';
    document.head.appendChild(script);
  }
})();
