// DPRO 訪問介護・家族連絡 LINE
// STEP HOMECARE-5: 公開設定
window.DPRO_HOMECARE_CONFIG = Object.freeze({
  APP_NAME: 'DPRO 訪問介護・家族連絡 LINE',
  APP_VERSION: 'HOMECARE-5-STAFF-WORK-UI-COMPLETE-20260719',
  API_BASE: 'https://dpro-homecare-family-line-api.dpromstk2000.workers.dev',
  OFFICE_CODE: 'dpro_homecare_demo',

  // LINE DevelopersでLIFFアプリを作成した後に設定します。
  LIFF_ID: '',

  // 公開デモ用。実データの本人確認や本番スタッフ認証には使用しません。
  DEMO_LINE_USER_ID: 'UDEMO_HOMECARE_FAMILY_001',
  REQUEST_TIMEOUT_MS: 15000,
  STAFF_SESSION_STORAGE_KEY: 'dpro_homecare_staff_session'
});
