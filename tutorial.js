/* DPRO TUTORIAL HOMECARE / STANDARD V1.1 / R3-R4
   Tutorial-owned UI state only. No business API write is issued here. */
(() => {
  'use strict';

  const STORAGE_KEY = 'dpro_tutorial_homecare_v1_1';
  const TUTORIAL_NAME = 'first10';
  const TOTAL_STEPS = 10;
  const MIN_EDGE = 12;
  const CARD_WIDTH = 360;
  const MOVE_PX = 16;
  const MOVE_FAST_PX = 40;
  const params = new URLSearchParams(location.search);

  const STEPS = [
    {
      n: 1, title: '次回訪問を確認', persona: '本人 / 家族',
      route: 'family.html', anchor: '#nextVisitDate', highlight: '#nextVisitDate',
      text: 'まず次回の訪問日時とサービス内容を確認します。変更がある場合は事業所から連絡されます。',
      completion: () => {
        const el = document.querySelector('#nextVisitDate');
        if (!visible(el)) return false;
        return !/読み込み中/.test(el.textContent || '');
      }
    },
    {
      n: 2, title: '訪問予定一覧を確認', persona: '本人 / 家族',
      route: 'family.html', anchor: '#visitsSection', highlight: '#visitsSection',
      text: '今後の訪問予定はここで確認します。「すべて表示」は閲覧範囲を広げるだけで、予定内容は変更しません。',
      completion: () => visible(document.querySelector('#visitsSection'))
    },
    {
      n: 3, title: '公開済み訪問報告を確認', persona: '本人 / 家族',
      route: 'family.html', anchor: '#reportsSection', highlight: '#reportsSection',
      text: '家族・本人に見えるのは、事業所が確認して公開を承認した報告だけです。',
      completion: () => visible(document.querySelector('#reportsSection'))
    },
    {
      n: 4, title: '問い合わせ画面を開く', persona: '本人 / 家族',
      route: 'family.html', anchor: '[data-open-modal="inquiryModal"]',
      highlight: '[data-open-modal="inquiryModal"]',
      text: '予定変更や問い合わせはここから開きます。このチュートリアルでは送信せず、入力画面の場所だけ確認します。',
      completion: () => {
        const modal = document.querySelector('#inquiryModal');
        return !!modal && !modal.hidden;
      },
      waiting: '「予定変更・お問い合わせ」を開くと次へ進めます。送信はしません。'
    },
    {
      n: 5, title: '担当訪問を開く', persona: '訪問スタッフ',
      route: 'staff.html', anchor: '#visitList .visit-card:first-of-type', fallback: '#visitList',
      highlight: '#visitList .visit-card:first-of-type',
      text: '担当訪問を選ぶと、訪問先・注意事項・申し送り・担当スタッフを確認できます。',
      completion: () => {
        const dialog = document.querySelector('#visitDialog');
        return !!dialog && dialog.open;
      },
      waiting: '最初の担当訪問を開くと次へ進めます。訪問が無い場合は「スキップ」を使えます。'
    },
    {
      n: 6, title: '注意事項と申し送りを確認', persona: '訪問スタッフ',
      route: 'staff.html',
      anchor: '#clientAlerts', fallback: '#handoverList',
      highlight: '#clientAlerts',
      text: '訪問開始より前に、安全上の注意事項と申し送りを確認します。開始・保存・提出はこのFirst10では行いません。',
      completion: () => {
        const dialog = document.querySelector('#visitDialog');
        const alerts = document.querySelector('#clientAlerts');
        const handover = document.querySelector('#handoverList');
        return !!dialog && dialog.open && (visible(alerts) || visible(handover));
      }
    },
    {
      n: 7, title: 'サ責の当日業務を開く', persona: 'サービス提供責任者',
      route: 'owner-ipad.html',
      anchor: () => hidden(document.querySelector('#ipadApp')) ? '#loginForm' : '#ipadApp',
      highlight: () => hidden(document.querySelector('#ipadApp')) ? '#loginForm' : '.summary-strip',
      text: 'デモでは管理コード1234が入力済みです。業務画面を開き、当日の訪問・未割当て・記録・家族公開・要対応を確認します。',
      completion: () => visible(document.querySelector('#ipadApp')),
      waiting: '管理コード欄を確認し、「iPad業務画面を開く」を実行すると次へ進めます。'
    },
    {
      n: 8, title: '記録確認キューを見る', persona: 'サービス提供責任者',
      route: 'owner-ipad.html',
      anchor: '.tab-button[data-tab="records"]', highlight: '.tab-button[data-tab="records"]',
      text: '提出された訪問記録は「記録」で確認します。First10では承認・差戻しは実行せず、確認場所だけ覚えます。',
      completion: () => document.querySelector('.tab-panel[data-panel="records"]')?.classList.contains('active'),
      waiting: '「記録」タブを開くと次へ進めます。'
    },
    {
      n: 9, title: '家族公開キューを見る', persona: 'サービス提供責任者',
      route: 'owner-ipad.html',
      anchor: '.tab-button[data-tab="reports"]', highlight: '.tab-button[data-tab="reports"]',
      text: '家族向けコメントの公開待ちは「家族公開」で確認します。First10では公開・非公開の確定操作は行いません。',
      completion: () => document.querySelector('.tab-panel[data-panel="reports"]')?.classList.contains('active'),
      waiting: '「家族公開」タブを開くと次へ進めます。'
    },
    {
      n: 10, title: '管理者の事故・ヒヤリ画面を確認', persona: 'オーナー / 管理者',
      route: 'owner.html',
      anchor: () => hidden(document.querySelector('#ownerApp')) ? '#loginForm' : '.nav-button[data-section="incidents"]',
      highlight: () => hidden(document.querySelector('#ownerApp')) ? '#loginForm' : '.nav-button[data-section="incidents"]',
      text: '管理者は「事故・ヒヤリ」で確認状況と対応を追います。First10はここまでです。実際の更新・完了処理はGuide Centerで確認します。',
      completion: () => document.querySelector('.owner-section[data-owner-section="incidents"]')?.classList.contains('active'),
      waiting: '管理画面を開いた後、「事故・ヒヤリ」を選ぶと完了です。'
    }
  ];

  let card = null;
  let highlight = null;
  let currentStep = null;
  let opener = null;
  let target = null;
  let targetMissing = false;
  let pollTimer = 0;
  let drag = null;
  let manualPosition = null;
  let focusCardOnRender = false;

  function hidden(el) {
    if (!el) return true;
    return el.hidden || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden';
  }

  function visible(el) {
    if (!el || hidden(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function pathName() {
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function safeReadState() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        version: '1.1',
        currentStep: clampStep(Number(data.currentStep || 1)),
        completed: Array.isArray(data.completed) ? data.completed.filter(validStep) : [],
        skipped: Array.isArray(data.skipped) ? data.skipped.filter(validStep) : [],
        status: ['idle', 'running', 'closed', 'completed'].includes(data.status) ? data.status : 'idle',
        updatedAt: data.updatedAt || ''
      };
    } catch {
      return { version: '1.1', currentStep: 1, completed: [], skipped: [], status: 'idle', updatedAt: '' };
    }
  }

  function writeState(patch = {}) {
    const next = { ...safeReadState(), ...patch, version: '1.1', updatedAt: new Date().toISOString() };
    next.currentStep = clampStep(Number(next.currentStep || 1));
    next.completed = [...new Set((next.completed || []).filter(validStep))];
    next.skipped = [...new Set((next.skipped || []).filter(validStep))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    updateGuideProgress();
    updateLauncher();
    return next;
  }

  function validStep(value) { return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= TOTAL_STEPS; }
  function clampStep(value) { return Math.max(1, Math.min(TOTAL_STEPS, Number.isFinite(value) ? value : 1)); }

  function stepByNumber(n) { return STEPS[clampStep(n) - 1]; }

  function resolveSelector(value) {
    return typeof value === 'function' ? value() : value;
  }

  function resolveTarget(step) {
    const primarySelector = resolveSelector(step.anchor);
    const fallbackSelector = resolveSelector(step.fallback);
    const primary = primarySelector ? document.querySelector(primarySelector) : null;
    const fallback = fallbackSelector ? document.querySelector(fallbackSelector) : null;
    const selected = visible(primary) ? primary : (visible(fallback) ? fallback : primary || fallback);
    targetMissing = !selected || !visible(selected);
    target = selected || null;
    return target;
  }

  function resolveHighlight(step) {
    const selector = resolveSelector(step.highlight || step.anchor);
    const el = selector ? document.querySelector(selector) : null;
    if (visible(el)) return el;
    return resolveTarget(step);
  }

  function tutorialUrl(stepNumber) {
    const step = stepByNumber(stepNumber);
    const url = new URL(step.route, location.href);
    url.searchParams.set('demo', '1');
    url.searchParams.set('tutorial', TUTORIAL_NAME);
    url.searchParams.set('tstep', String(step.n));
    return url.toString();
  }

  function go(stepNumber, { replace = false } = {}) {
    const n = clampStep(stepNumber);
    const step = stepByNumber(n);
    const state = writeState({ currentStep: n, status: 'running' });
    const sameRoute = pathName() === step.route.toLowerCase();
    if (!sameRoute) {
      location.href = tutorialUrl(n);
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('demo', '1');
    url.searchParams.set('tutorial', TUTORIAL_NAME);
    url.searchParams.set('tstep', String(n));
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    currentStep = step;
    manualPosition = null;
    focusCardOnRender = true;
    renderStep();
  }

  function start() {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    writeState({ currentStep: 1, completed: [], skipped: [], status: 'running' });
    location.href = tutorialUrl(1);
  }

  function resume() {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const state = safeReadState();
    const n = state.status === 'completed' ? 1 : clampStep(state.currentStep || 1);
    writeState({ currentStep: n, status: 'running' });
    location.href = tutorialUrl(n);
  }

  function replay() {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    writeState({ currentStep: 1, completed: [], skipped: [], status: 'running' });
    location.href = tutorialUrl(1);
  }

  function closeTutorial() {
    clearTimeout(pollTimer);
    if (card) card.hidden = true;
    if (highlight) highlight.hidden = true;
    if (card && card.parentElement !== document.body) document.body.appendChild(card);
    if (highlight && highlight.parentElement !== document.body) document.body.appendChild(highlight);
    const n = currentStep?.n || safeReadState().currentStep || 1;
    const priorState = safeReadState();
    writeState({ currentStep: n, status: priorState.status === 'completed' ? 'completed' : 'closed' });
    updateLauncher();
    const canFocus = (el) => !!el && el.isConnected && visible(el) && (
      /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)
      || el.hasAttribute('tabindex')
      || el.isContentEditable
    );
    const returnTo = canFocus(opener)
      ? opener
      : canFocus(target)
        ? target
        : document.querySelector('#dproGuideLauncher');
    setTimeout(() => returnTo?.focus?.(), 0);
  }

  function skipStep() {
    const step = currentStep;
    if (!step) return;
    const state = safeReadState();
    writeState({
      skipped: [...state.skipped, step.n],
      currentStep: step.n < TOTAL_STEPS ? step.n + 1 : step.n
    });
    if (step.n >= TOTAL_STEPS) finishTutorial(true);
    else transition(step.n + 1);
  }

  function markComplete(step) {
    const state = safeReadState();
    if (!state.completed.includes(step.n)) {
      writeState({ completed: [...state.completed, step.n] });
    }
  }

  function finishTutorial(skipped = false) {
    const state = safeReadState();
    if (!skipped && currentStep && currentStep.completion?.()) markComplete(currentStep);
    writeState({ currentStep: TOTAL_STEPS, status: 'completed' });
    if (card) {
      const status = card.querySelector('[data-tutorial-status]');
      const next = card.querySelector('[data-tutorial-next]');
      if (status) {
        status.className = 'dpro-tutorial-status ready';
        status.textContent = skipped ? 'First10を終了しました。右下の「操作ガイド」から、いつでも最初から確認できます。' : 'First10 完了です。右下の「操作ガイド」から、いつでもReplayできます。';
      }
      if (next) {
        next.disabled = false;
        next.textContent = '最初からReplay';
        next.onclick = replay;
      }
    }
    updateGuideProgress();
  }

  function nextStep() {
    if (!currentStep) return;
    const complete = completionState(currentStep);
    if (!complete) return;
    markComplete(currentStep);
    if (currentStep.n >= TOTAL_STEPS) {
      finishTutorial(false);
      return;
    }
    transition(currentStep.n + 1);
  }

  function backStep() {
    if (!currentStep || currentStep.n <= 1) return;
    transition(currentStep.n - 1);
  }

  function transition(nextNumber) {
    if (currentStep?.n === 4) {
      const modal = document.querySelector('#inquiryModal');
      if (modal && !modal.hidden) {
        const closer = modal.querySelector('[data-close-modal]');
        closer?.click?.();
      }
    }
    if (currentStep?.n === 6) {
      const dialog = document.querySelector('#visitDialog');
      if (dialog?.open) dialog.close();
    }
    go(nextNumber);
  }

  function completionState(step) {
    try {
      if (typeof step.completion !== 'function') return !targetMissing;
      return !!step.completion();
    } catch {
      return false;
    }
  }

  function ensureUi() {
    if (!highlight) {
      highlight = document.createElement('div');
      highlight.id = 'dproTutorialHighlight';
      highlight.hidden = true;
      highlight.setAttribute('aria-hidden', 'true');
      document.body.appendChild(highlight);
    }

    if (!card) {
      card = document.createElement('section');
      card.id = 'dproTutorialCard';
      card.hidden = true;
      card.setAttribute('aria-label', 'First10 操作チュートリアル');
      card.innerHTML = `
        <div class="dpro-tutorial-handle" tabindex="0" role="button"
             aria-label="チュートリアルカードを移動。矢印キーでも移動できます。"
             data-tutorial-handle>
          <span class="dpro-tutorial-handle-copy"><span class="dpro-tutorial-grip" aria-hidden="true"></span>First10</span>
          <button type="button" class="dpro-tutorial-close" data-tutorial-close aria-label="チュートリアルを閉じる">×</button>
        </div>
        <div class="dpro-tutorial-body">
          <div class="dpro-tutorial-meta"><span data-tutorial-count></span><span data-tutorial-progress></span></div>
          <h2 class="dpro-tutorial-title" tabindex="-1" data-tutorial-title></h2>
          <p class="dpro-tutorial-persona" data-tutorial-persona></p>
          <p class="dpro-tutorial-copy" data-tutorial-copy></p>
          <div class="dpro-tutorial-status" data-tutorial-status aria-live="polite"></div>
        </div>
        <div class="dpro-tutorial-actions">
          <button type="button" class="dpro-tutorial-control" data-tutorial-back>戻る</button>
          <button type="button" class="dpro-tutorial-control primary" data-tutorial-next>次へ</button>
          <button type="button" class="dpro-tutorial-control dpro-tutorial-skip" data-tutorial-skip>この項目をスキップ</button>
        </div>`;
      document.body.appendChild(card);

      card.querySelector('[data-tutorial-close]').addEventListener('click', closeTutorial);
      card.querySelector('[data-tutorial-back]').addEventListener('click', backStep);
      card.querySelector('[data-tutorial-next]').addEventListener('click', nextStep);
      card.querySelector('[data-tutorial-skip]').addEventListener('click', skipStep);
      bindDrag(card.querySelector('[data-tutorial-handle]'));
    }
  }

  function syncTopLayerHost() {
    if (!card || !highlight) return;
    const openDialog = document.querySelector('dialog[open]');
    const host = openDialog || document.body;
    if (card.parentElement !== host) host.appendChild(card);
    if (highlight.parentElement !== host) host.appendChild(highlight);
  }

  function renderStep() {
    if (!currentStep) return;
    ensureUi();
    syncTopLayerHost();
    card.hidden = false;
    const launcher = document.querySelector('#dproGuideLauncher');
    if (launcher) launcher.hidden = true;

    const state = safeReadState();
    card.querySelector('[data-tutorial-count]').textContent = `STEP ${String(currentStep.n).padStart(2, '0')} / ${TOTAL_STEPS}`;
    card.querySelector('[data-tutorial-progress]').textContent = `${state.completed.length}/${TOTAL_STEPS} 完了`;
    card.querySelector('[data-tutorial-title]').textContent = currentStep.title;
    card.querySelector('[data-tutorial-persona]').textContent = currentStep.persona;
    card.querySelector('[data-tutorial-copy]').textContent = currentStep.text;
    card.querySelector('[data-tutorial-back]').disabled = currentStep.n <= 1;
    card.querySelector('[data-tutorial-next]').textContent = currentStep.n === TOTAL_STEPS ? '完了' : '次へ';

    resolveTarget(currentStep);
    updateTargetAndCard(true);
    pollCompletion();

    if (focusCardOnRender) {
      focusCardOnRender = false;
      setTimeout(() => card.querySelector('[data-tutorial-title]')?.focus(), 0);
    }
  }

  function pollCompletion() {
    clearTimeout(pollTimer);
    if (!currentStep || !card || card.hidden) return;

    syncTopLayerHost();
    resolveTarget(currentStep);
    const complete = completionState(currentStep);
    const status = card.querySelector('[data-tutorial-status]');
    const next = card.querySelector('[data-tutorial-next]');

    if (complete) {
      status.className = 'dpro-tutorial-status ready';
      status.textContent = currentStep.n === TOTAL_STEPS ? '確認できました。「完了」でFirst10を終了します。' : '確認できました。次へ進めます。';
      next.disabled = false;
    } else if (targetMissing) {
      status.className = 'dpro-tutorial-status missing';
      status.textContent = '対象がまだ表示されていません。読み込み後に再確認します。対象が無い場合はスキップできます。';
      next.disabled = true;
    } else {
      status.className = 'dpro-tutorial-status waiting';
      status.textContent = currentStep.waiting || '画面上の強調箇所を確認すると次へ進めます。';
      next.disabled = true;
    }

    updateHighlight();
    placeCardNearTarget(false);
    pollTimer = window.setTimeout(pollCompletion, 350);
  }

  function visualBounds() {
    const vv = window.visualViewport;
    return {
      left: (vv?.offsetLeft || 0) + MIN_EDGE,
      top: (vv?.offsetTop || 0) + MIN_EDGE,
      right: (vv?.offsetLeft || 0) + (vv?.width || window.innerWidth) - MIN_EDGE,
      bottom: (vv?.offsetTop || 0) + (vv?.height || window.innerHeight) - MIN_EDGE
    };
  }

  function clampPosition(left, top) {
    if (!card) return { left: MIN_EDGE, top: MIN_EDGE };
    const bounds = visualBounds();
    const rect = card.getBoundingClientRect();
    const width = Math.min(rect.width || CARD_WIDTH, Math.max(0, bounds.right - bounds.left));
    const height = Math.min(rect.height || 260, Math.max(0, bounds.bottom - bounds.top));
    return {
      left: Math.min(Math.max(left, bounds.left), Math.max(bounds.left, bounds.right - width)),
      top: Math.min(Math.max(top, bounds.top), Math.max(bounds.top, bounds.bottom - height))
    };
  }

  function placeCardNearTarget(force = false) {
    if (!card || card.hidden) return;
    const rect = target && visible(target) ? target.getBoundingClientRect() : null;
    const bounds = visualBounds();
    let proposed = manualPosition;

    if (!proposed || force) {
      const cardRect = card.getBoundingClientRect();
      const cw = cardRect.width;
      const ch = cardRect.height;

      if (rect) {
        const raw = [
          { left: rect.right + 14, top: rect.top },
          { left: rect.left - cw - 14, top: rect.top },
          { left: rect.left, top: rect.bottom + 14 },
          { left: rect.left, top: rect.top - ch - 14 }
        ];
        const padded = { left: rect.left - 8, top: rect.top - 8, right: rect.right + 8, bottom: rect.bottom + 8 };
        const overlaps = (pos) => {
          const right = pos.left + cw;
          const bottom = pos.top + ch;
          return !(right <= padded.left || pos.left >= padded.right || bottom <= padded.top || pos.top >= padded.bottom);
        };
        const candidates = raw.map((item) => clampPosition(item.left, item.top));
        proposed = candidates.find((item) => !overlaps(item));

        if (!proposed) {
          const targetCenterY = rect.top + rect.height / 2;
          proposed = targetCenterY > (bounds.top + bounds.bottom) / 2
            ? clampPosition(bounds.right - cw, bounds.top)
            : clampPosition(bounds.right - cw, bounds.bottom - ch);
        }
      } else {
        proposed = clampPosition(bounds.right - cardRect.width, bounds.top);
      }
    }

    const clamped = clampPosition(proposed.left, proposed.top);
    card.style.left = `${Math.round(clamped.left)}px`;
    card.style.top = `${Math.round(clamped.top)}px`;
    manualPosition = clamped;
  }

  function updateHighlight() {
    if (!highlight || !currentStep) return;
    const el = resolveHighlight(currentStep);
    if (!el || !visible(el)) {
      highlight.hidden = true;
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 5;
    highlight.style.left = `${Math.max(0, rect.left - pad)}px`;
    highlight.style.top = `${Math.max(0, rect.top - pad)}px`;
    highlight.style.width = `${Math.max(0, Math.min(window.innerWidth, rect.width + pad * 2))}px`;
    highlight.style.height = `${Math.max(0, Math.min(window.innerHeight, rect.height + pad * 2))}px`;
    highlight.hidden = false;
  }

  function updateTargetAndCard(forcePosition = false) {
    if (!currentStep) return;
    resolveTarget(currentStep);
    if (target && visible(target)) {
      const stickyOffset = 90;
      const rect = target.getBoundingClientRect();
      if (rect.top < stickyOffset || rect.bottom > window.innerHeight - 20) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }
    updateHighlight();
    placeCardNearTarget(forcePosition);
  }

  function bindDrag(handle) {
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest('button, a, input, select, textarea, label, [contenteditable]')) return;
      const rect = card.getBoundingClientRect();
      drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      manualPosition = { left: rect.left, top: rect.top };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const pos = clampPosition(event.clientX - drag.dx, event.clientY - drag.dy);
      manualPosition = pos;
      card.style.left = `${Math.round(pos.left)}px`;
      card.style.top = `${Math.round(pos.top)}px`;
      event.preventDefault();
    });

    const end = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      handle.releasePointerCapture?.(event.pointerId);
      drag = null;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);

    handle.addEventListener('keydown', (event) => {
      const delta = event.shiftKey ? MOVE_FAST_PX : MOVE_PX;
      const rect = card.getBoundingClientRect();
      let left = rect.left;
      let top = rect.top;
      if (event.key === 'ArrowLeft') left -= delta;
      else if (event.key === 'ArrowRight') left += delta;
      else if (event.key === 'ArrowUp') top -= delta;
      else if (event.key === 'ArrowDown') top += delta;
      else if (event.key === 'Home') { left = visualBounds().left; top = visualBounds().top; }
      else return;
      const pos = clampPosition(left, top);
      manualPosition = pos;
      card.style.left = `${Math.round(pos.left)}px`;
      card.style.top = `${Math.round(pos.top)}px`;
      event.preventDefault();
    });
  }

  function businessOverlayOpen() {
    if (document.querySelector('dialog[open]:not(#dproTutorialCard)')) return true;
    if (document.querySelector('.modal-backdrop:not([hidden])')) return true;
    return false;
  }

  function onKeydown(event) {
    if (event.key !== 'Escape') return;
    if (!card || card.hidden) return;
    if (businessOverlayOpen()) return;
    event.preventDefault();
    closeTutorial();
  }

  function onBusinessDialogClose() {
    window.setTimeout(() => {
      if (!card || card.hidden) return;
      syncTopLayerHost();
      updateTargetAndCard(true);
      pollCompletion();
    }, 0);
  }

  function updateLauncher() {
    const button = document.querySelector('#dproGuideLauncher');
    if (!button) return;
    const state = safeReadState();
    if (state.status === 'running') {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.textContent = '操作ガイド';
    const done = new Set([...(state.completed || []), ...(state.skipped || [])]).size;
    const stateHint = state.status === 'closed'
      ? `・First10 ${done}/${TOTAL_STEPS} 中断中`
      : state.status === 'completed'
        ? '・First10 完了'
        : '';
    button.setAttribute('aria-label', `HOMECARE 操作ガイドを開く${stateHint}`);
    button.onclick = () => { location.href = 'guide-center.html'; };
  }

  function injectGuideLauncher() {
    if (document.querySelector('#dproGuideLauncher')) return;
    const demo = params.get('demo') === '1' || params.get('tutorial') === TUTORIAL_NAME;
    if (!demo) return;
    const button = document.createElement('button');
    button.id = 'dproGuideLauncher';
    button.type = 'button';
    document.body.appendChild(button);
    updateLauncher();
  }

  function updateGuideProgress() {
    const el = document.querySelector('[data-guide-progress]');
    if (!el) return;
    const state = safeReadState();
    const done = new Set([...state.completed, ...state.skipped]).size;
    const status = state.status === 'completed' ? '完了' : state.status === 'closed' ? '中断中' : state.status === 'running' ? '進行中' : '未開始';
    el.textContent = `進捗 ${done}/${TOTAL_STEPS} ・ ${status}`;
    const resumeButton = document.querySelector('[data-dpro-tutorial-action="resume"]');
    if (resumeButton) resumeButton.disabled = state.status === 'idle' && done === 0;
  }

  function bindGuideActions() {
    document.querySelectorAll('[data-dpro-tutorial-action]').forEach((button) => {
      const action = button.getAttribute('data-dpro-tutorial-action');
      button.addEventListener('click', () => {
        if (action === 'start') start();
        if (action === 'resume') resume();
        if (action === 'replay') replay();
      });
    });
    updateGuideProgress();
  }

  function initTutorialFromUrl() {
    if (params.get('tutorial') !== TUTORIAL_NAME) return;
    const requested = validStep(Number(params.get('tstep'))) ? Number(params.get('tstep')) : safeReadState().currentStep;
    const step = stepByNumber(requested);
    if (pathName() !== step.route.toLowerCase()) {
      location.replace(tutorialUrl(step.n));
      return;
    }
    currentStep = step;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    writeState({ currentStep: step.n, status: 'running' });
    focusCardOnRender = true;
    ensureUi();
    renderStep();
  }

  function onViewportChange() {
    if (!card || card.hidden) return;
    if (manualPosition) {
      const pos = clampPosition(manualPosition.left, manualPosition.top);
      manualPosition = pos;
      card.style.left = `${Math.round(pos.left)}px`;
      card.style.top = `${Math.round(pos.top)}px`;
    } else {
      placeCardNearTarget(true);
    }
    updateHighlight();
  }

  function init() {
    injectGuideLauncher();
    bindGuideActions();
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('close', onBusinessDialogClose, true);
    window.addEventListener('scroll', updateHighlight, { passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('orientationchange', onViewportChange, { passive: true });
    window.visualViewport?.addEventListener('resize', onViewportChange, { passive: true });
    window.visualViewport?.addEventListener('scroll', onViewportChange, { passive: true });
    window.addEventListener('popstate', () => {
      const q = new URLSearchParams(location.search);
      if (q.get('tutorial') === TUTORIAL_NAME && validStep(Number(q.get('tstep')))) {
        currentStep = stepByNumber(Number(q.get('tstep')));
        manualPosition = null;
        renderStep();
      }
    });
    initTutorialFromUrl();
  }

  window.DPRO_HOMECARE_TUTORIAL = Object.freeze({
    start, resume, replay,
    getState: () => safeReadState(),
    totalSteps: TOTAL_STEPS
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
