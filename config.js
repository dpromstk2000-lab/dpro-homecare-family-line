// DPRO 訪問介護・家族連絡 LINE
// STEP HOMECARE-3: 公開設定
window.DPRO_HOMECARE_CONFIG = Object.freeze({
  APP_NAME: 'DPRO 訪問介護・家族連絡 LINE',
  APP_VERSION: 'HOMECARE-3-LINE-FAMILY-UI-COMPLETE-20260719',
  API_BASE: 'https://dpro-homecare-family-line-api.dpromstk2000.workers.dev',
  OFFICE_CODE: 'dpro_homecare_demo',

  // LINE DevelopersでLIFFアプリを作成した後に設定します。
  // STEP HOMECARE-3のGitHub Pages公開確認では空欄のままで問題ありません。
  LIFF_ID: '',

  // デモURL（?demo=1）の表示にのみ使用します。本番の本人確認には使用しません。
  DEMO_LINE_USER_ID: 'UDEMO_HOMECARE_FAMILY_001',
  REQUEST_TIMEOUT_MS: 15000
});
