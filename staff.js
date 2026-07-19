(() => {
  'use strict';

  const CONFIG = window.DPRO_HOMECARE_CONFIG || {};
  const API_BASE = String(CONFIG.API_BASE || '').replace(/\/+$/, '');
  const OFFICE_CODE = CONFIG.OFFICE_CODE || 'dpro_homecare_demo';
  const REQUEST_TIMEOUT_MS = Number(CONFIG.REQUEST_TIMEOUT_MS || 15000);
  const SESSION_KEY = CONFIG.STAFF_SESSION_STORAGE_KEY || 'dpro_homecare_staff_session';
  const params = new URLSearchParams(location.search);
  const demo = ['1', 'true', 'yes'].includes(String(params.get('demo') || '').toLowerCase());

  const state = {
    sessionToken: '',
    session: null,
    today: null,
    selectedVisitId: null,
    detail: null,
    pendingKeys: new Map()
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));

  function ymd(date = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
  }

  function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00+09:00`);
    date.setUTCDate(date.getUTCDate() + Number(days));
    return ymd(date);
  }

  function formatDate(dateString) {
    const date = new Date(`${dateString}T12:00:00+09:00`);
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    }).format(date);
  }

  function formatTime(iso) {
    if (!iso) return '--:--';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso));
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso));
  }

  function serviceLabel(value) {
    return ({
      physical_care: '身体介護', daily_living: '生活援助', combined: '身体介護＋生活援助',
      outing: '通院・外出介助', self_pay: '自費サービス', other: 'その他'
    })[value] || value || '未設定';
  }

  function roleLabel(value) {
    return ({ owner: 'オーナー', manager: '管理者', service_coordinator: 'サービス提供責任者', helper: '訪問介護員', clerk: '事務', viewer: '閲覧' })[value] || value || '';
  }

  function statusLabel(value) {
    return ({ scheduled: '予定', confirmed: '確認済み', in_progress: '訪問中', completed: '完了', cancelled: 'キャンセル', no_show: '不在', suspended: '中止' })[value] || value;
  }

  function resultLabel(value) {
    return ({ done: '実施', partial: '一部実施', not_done: '未実施', not_applicable: '対象外' })[value] || value;
  }

  function setLoading(active) {
    $('#loadingOverlay').hidden = !active;
  }

  function showToast(message, isError = false) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 4500);
  }

  function newIdempotencyKey(action, visitId) {
    const mapKey = `${action}:${visitId}`;
    if (!state.pendingKeys.has(mapKey)) {
      const uuid = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      state.pendingKeys.set(mapKey, `homecare-${action}-${visitId}-${uuid}`);
    }
    return state.pendingKeys.get(mapKey);
  }

  function clearIdempotencyKey(action, visitId) {
    state.pendingKeys.delete(`${action}:${visitId}`);
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const url = new URL(`${API_BASE}${path}`);
    if (!url.searchParams.has('office_code')) url.searchParams.set('office_code', OFFICE_CODE);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.sessionToken) headers['X-Staff-Session'] = state.sessionToken;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    try {
      const response = await fetch(url, {
        method: options.method || 'GET', headers, signal: controller.signal,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const error = new Error(data.error || `通信エラー（${response.status}）`);
        error.code = data.error_code;
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('通信がタイムアウトしました。同じ操作をもう一度押してください。');
      if (error.status === 401 || error.code === 'ERR_STAFF_SESSION_INVALID' || error.code === 'STAFF_LOGIN_REQUIRED') {
        clearSession();
        showLogin();
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function saveSession(data) {
    state.sessionToken = data.session_token;
    state.session = data;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.session_token, session: data }));
  }

  function restoreSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved.token) return false;
      state.sessionToken = saved.token;
      state.session = saved.session || null;
      return true;
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
  }

  function clearSession() {
    state.sessionToken = '';
    state.session = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  function showLogin() {
    $('#loginPanel').hidden = false;
    $('#workspace').hidden = true;
    $('#logoutButton').hidden = true;
  }

  function showWorkspace() {
    $('#loginPanel').hidden = true;
    $('#workspace').hidden = false;
    $('#logoutButton').hidden = false;
  }

  async function login({ demoLogin = false } = {}) {
    setLoading(true);
    try {
      const data = await api(demoLogin ? '/staff/demo-login' : '/staff/login', {
        method: 'POST',
        body: demoLogin ? {} : {
          staff_code: $('#staffCode').value.trim(),
          access_code: $('#accessCode').value.trim()
        }
      });
      saveSession(data);
      showWorkspace();
      await loadToday();
      showToast(demoLogin ? 'デモスタッフとしてログインしました。' : 'ログインしました。');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      if (state.sessionToken) await api('/staff/logout', { method: 'POST', body: {} });
    } catch {
      // セッション期限切れでも端末側は確実に削除する。
    } finally {
      clearSession();
      showLogin();
      setLoading(false);
      showToast('ログアウトしました。');
    }
  }

  function renderHeader(data) {
    const staff = data.staff || state.session?.staff || {};
    const office = data.office || state.session?.office || {};
    $('#staffName').textContent = `${staff.staff_name || 'スタッフ'} さん`;
    $('#staffRole').textContent = [roleLabel(staff.primary_role), staff.qualification].filter(Boolean).join('・') || '担当訪問を確認してください。';
    const phone = String(office.phone || '092-555-0101');
    $('#officePhone').href = `tel:${phone.replace(/\D/g, '')}`;
  }

  function renderSummary(summary = {}) {
    $('#summaryVisits').textContent = summary.visits ?? 0;
    $('#summaryScheduled').textContent = summary.scheduled ?? 0;
    $('#summaryProgress').textContent = summary.in_progress ?? 0;
    $('#summaryCompleted').textContent = summary.completed ?? 0;
  }

  function renderVisits(visits = []) {
    const list = $('#visitList');
    list.innerHTML = '';
    $('#visitCountBadge').textContent = `${visits.length}件`;
    $('#visitEmpty').hidden = visits.length > 0;

    visits.forEach((visit) => {
      const card = document.createElement('article');
      card.className = `visit-card ${visit.status === 'in_progress' ? 'in-progress' : ''} ${visit.status === 'completed' ? 'completed' : ''}`;
      card.tabIndex = 0;
      card.dataset.visitId = visit.id;
      const client = visit.client || {};
      card.innerHTML = `
        <div class="visit-card-head">
          <div>
            <div class="visit-time">${escapeHtml(formatTime(visit.planned_start))}〜${escapeHtml(formatTime(visit.planned_end))}</div>
            <div class="visit-client">${escapeHtml(client.client_name || '利用者')}</div>
          </div>
          <span class="status-pill status-${escapeHtml(visit.status)}">${escapeHtml(statusLabel(visit.status))}</span>
        </div>
        <div class="visit-meta">
          <span>${escapeHtml(serviceLabel(visit.service_type))}</span>
          <span>${escapeHtml(visit.assignment_role === 'secondary' ? '副担当' : '主担当')}</span>
          ${visit.record?.started_at ? `<span>開始 ${escapeHtml(formatTime(visit.record.started_at))}</span>` : ''}
        </div>
        <div class="visit-address">${escapeHtml([client.address, client.building_room].filter(Boolean).join(' '))}</div>
        ${Number(visit.open_handover_count || 0) > 0 ? `<div class="handover-flag">申し送り ${Number(visit.open_handover_count)}件あり</div>` : ''}
      `;
      card.addEventListener('click', () => openVisit(visit.id));
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') openVisit(visit.id); });
      list.appendChild(card);
    });
  }

  async function loadToday() {
    const date = $('#workDate').value || ymd();
    setLoading(true);
    try {
      const data = await api(`/staff/today?date=${encodeURIComponent(date)}`);
      state.today = data;
      renderHeader(data);
      renderSummary(data.summary);
      renderVisits(data.visits || []);
      $('#visitListTitle').textContent = date === ymd() ? '本日の訪問' : `${formatDate(date)}の訪問`;
    } finally {
      setLoading(false);
    }
  }

  function alertRows(client = {}) {
    return [
      ['danger', 'アレルギー', client.allergy_notes],
      ['danger', '禁忌・禁止事項', client.contraindication_notes],
      ['warning', '緊急時対応', client.emergency_notes],
      ['info', '移動・介助', client.mobility_notes],
      ['info', 'コミュニケーション', client.communication_notes],
      ['warning', 'ペット・住環境', client.pet_notes]
    ].filter(([, , text]) => String(text || '').trim());
  }

  function renderPlanItems(planItems = [], recordItems = []) {
    const recordMap = new Map(recordItems.map((item) => [item.plan_item_id, item]));
    const list = $('#planItemList');
    list.innerHTML = '';

    if (!planItems.length) {
      list.innerHTML = '<div class="empty-state"><strong>計画上の実施項目はありません。</strong><span>実施内容欄へ記録してください。</span></div>';
      return;
    }

    planItems.forEach((item, index) => {
      const saved = recordMap.get(item.id) || {};
      const selected = saved.result || '';
      const row = document.createElement('div');
      row.className = 'plan-item';
      row.dataset.planItemId = item.id;
      row.dataset.itemName = item.item_name;
      row.dataset.displayOrder = item.display_order ?? index;
      row.dataset.required = item.is_required ? '1' : '0';
      row.innerHTML = `
        <div class="plan-item-title"><span>${escapeHtml(item.item_name)}</span>${item.is_required ? '<span class="required-text">必須</span>' : ''}</div>
        ${item.instruction_text ? `<div class="plan-item-instruction">${escapeHtml(item.instruction_text)}</div>` : ''}
        <div class="result-buttons" role="radiogroup" aria-label="${escapeHtml(item.item_name)}の実施結果">
          ${[['done','実施'],['partial','一部'],['not_done','未実施'],['not_applicable','対象外']].map(([value,label]) => `
            <label><input type="radio" name="result-${escapeHtml(item.id)}" value="${value}" ${selected === value ? 'checked' : ''}><span>${label}</span></label>
          `).join('')}
        </div>
        <input class="item-note" type="text" maxlength="1000" value="${escapeHtml(saved.note || '')}" placeholder="補足（任意）">
      `;
      list.appendChild(row);
    });
  }

  function fillRecord(record) {
    $('#clientCondition').value = record?.client_condition || '';
    $('#serviceSummary').value = record?.service_summary || '';
    $('#familyPublicComment').value = record?.family_public_comment || '';
    $('#internalHandover').value = record?.internal_handover || '';
    $('#nextVisitAttention').value = record?.next_visit_attention || '';
  }

  function collectRecordPayload({ requireComplete = false } = {}) {
    const items = $$('.plan-item').map((row) => {
      const checked = $('input[type="radio"]:checked', row);
      if (requireComplete && row.dataset.required === '1' && !checked) {
        throw new Error(`「${row.dataset.itemName}」の実施結果を選択してください。`);
      }
      return {
        plan_item_id: row.dataset.planItemId,
        item_name: row.dataset.itemName,
        result: checked?.value || 'not_applicable',
        note: $('.item-note', row).value.trim(),
        display_order: Number(row.dataset.displayOrder || 0)
      };
    });

    const payload = {
      client_condition: $('#clientCondition').value.trim(),
      service_summary: $('#serviceSummary').value.trim(),
      family_public_comment: $('#familyPublicComment').value.trim(),
      internal_handover: $('#internalHandover').value.trim(),
      next_visit_attention: $('#nextVisitAttention').value.trim(),
      handover_importance: $('#handoverImportance').value,
      items
    };
    if (requireComplete && (!payload.client_condition || !payload.service_summary)) {
      throw new Error('利用者の様子と実施内容を入力してください。');
    }
    return payload;
  }

  function renderVisitDetail(data) {
    const visit = data.visit;
    state.detail = visit;
    const client = visit.client || {};
    $('#detailStatus').textContent = statusLabel(visit.status);
    $('#detailClientName').textContent = `${client.client_name || '利用者'} 様`;
    $('#detailTime').textContent = `${formatTime(visit.planned_start)}〜${formatTime(visit.planned_end)}・${serviceLabel(visit.service_type)}`;
    const address = [client.address, client.building_room].filter(Boolean).join(' ');
    $('#detailAddress').textContent = address || '住所未登録';
    $('#mapLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    $('#mapLink').hidden = !address;

    $('#clientAlerts').innerHTML = alertRows(client).map(([type, title, text]) => `
      <div class="client-alert ${type}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>
    `).join('') || '<div class="client-alert info"><strong>注意事項</strong><span>登録された注意事項はありません。</span></div>';

    $('#handoverList').innerHTML = (visit.handovers || []).map((item) => `
      <div class="handover-item ${item.importance === 'urgent' ? 'urgent' : ''}">
        <strong>${escapeHtml(item.title)}${item.requires_confirmation ? '・確認必須' : ''}</strong>
        <span>${escapeHtml(item.note_text)}</span>
      </div>
    `).join('') || '<p>未解決の申し送りはありません。</p>';

    $('#assignedStaffList').innerHTML = (visit.assigned_staff || []).map((staff) => `
      <span class="staff-chip">${escapeHtml(staff.staff_name)}・${staff.assignment_role === 'secondary' ? '副担当' : staff.assignment_role === 'observer' ? '同行' : '主担当'}</span>
    `).join('');

    fillRecord(visit.record);
    renderPlanItems(visit.plan_items || [], visit.record?.items || []);

    const started = Boolean(visit.record?.started_at);
    const completed = visit.status === 'completed' || Boolean(visit.record?.ended_at);
    $('#startArea').hidden = started || completed;
    $('#recordForm').hidden = !started || completed;
    $('#completedArea').hidden = !completed;
    if (completed) {
      $('#completedText').textContent = `開始 ${formatDateTime(visit.record?.started_at)}／終了 ${formatDateTime(visit.record?.ended_at)}／状態 ${visit.record?.record_status === 'approved' ? '承認済み' : '提出済み'}`;
    }
    $('#openHandoverButton').disabled = completed;
    $('#visitDialog').showModal();
  }

  async function openVisit(visitId) {
    state.selectedVisitId = visitId;
    setLoading(true);
    try {
      const data = await api(`/staff/visits/${visitId}`);
      renderVisitDetail(data);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSelectedVisit() {
    if (!state.selectedVisitId) return;
    const data = await api(`/staff/visits/${state.selectedVisitId}`);
    renderVisitDetail(data);
  }

  async function startVisit() {
    const visitId = state.selectedVisitId;
    if (!visitId || !confirm('利用者宅へ到着し、サービスを開始しますか？')) return;
    const key = newIdempotencyKey('start', visitId);
    $('#startVisitButton').disabled = true;
    setLoading(true);
    try {
      const result = await api(`/staff/visits/${visitId}/start`, { method: 'POST', body: { idempotency_key: key }, idempotencyKey: key });
      clearIdempotencyKey('start', visitId);
      const timing = Number(result.timing_minutes || 0);
      showToast(timing < -30 ? '訪問を開始しました。予定より30分以上早いため事業所へ確認してください。' : '訪問を開始しました。');
      await loadToday();
      await refreshSelectedVisit();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      $('#startVisitButton').disabled = false;
      setLoading(false);
    }
  }

  async function saveDraft() {
    const visitId = state.selectedVisitId;
    if (!visitId) return;
    let payload;
    try { payload = collectRecordPayload({ requireComplete: false }); }
    catch (error) { showToast(error.message, true); return; }
    const key = newIdempotencyKey('save', visitId);
    $('#saveDraftButton').disabled = true;
    setLoading(true);
    try {
      await api(`/staff/visits/${visitId}/save`, { method: 'POST', body: { ...payload, idempotency_key: key }, idempotencyKey: key });
      clearIdempotencyKey('save', visitId);
      showToast('下書きを保存しました。');
      await refreshSelectedVisit();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      $('#saveDraftButton').disabled = false;
      setLoading(false);
    }
  }

  async function finishVisit(event) {
    event.preventDefault();
    const visitId = state.selectedVisitId;
    if (!visitId) return;
    let payload;
    try { payload = collectRecordPayload({ requireComplete: true }); }
    catch (error) { showToast(error.message, true); return; }
    if (!confirm('訪問を終了し、記録をサービス提供責任者へ提出しますか？提出後はスタッフ画面から変更できません。')) return;
    const key = newIdempotencyKey('finish', visitId);
    $('#finishVisitButton').disabled = true;
    setLoading(true);
    try {
      const result = await api(`/staff/visits/${visitId}/finish`, { method: 'POST', body: { ...payload, idempotency_key: key }, idempotencyKey: key });
      clearIdempotencyKey('finish', visitId);
      showToast(result.family_report_pending ? '訪問を終了しました。家族コメントは承認待ちです。' : '訪問を終了し、記録を提出しました。');
      await loadToday();
      await refreshSelectedVisit();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      $('#finishVisitButton').disabled = false;
      setLoading(false);
    }
  }

  async function submitHandover(event) {
    event.preventDefault();
    const visitId = state.selectedVisitId;
    const payload = {
      title: $('#handoverTitle').value.trim(),
      note_text: $('#handoverText').value.trim(),
      importance: $('#quickHandoverImportance').value
    };
    if (!payload.title || !payload.note_text) return showToast('件名と内容を入力してください。', true);
    const key = newIdempotencyKey('handover', visitId);
    setLoading(true);
    try {
      await api(`/staff/visits/${visitId}/handover`, { method: 'POST', body: { ...payload, idempotency_key: key }, idempotencyKey: key });
      clearIdempotencyKey('handover', visitId);
      $('#handoverDialog').close();
      $('#handoverForm').reset();
      showToast('申し送りを登録しました。');
      await refreshSelectedVisit();
    } catch (error) {
      showToast(error.message, true);
    } finally { setLoading(false); }
  }

  async function submitIncident(event) {
    event.preventDefault();
    const visitId = state.selectedVisitId;
    const severity = $('#incidentSeverity').value;
    const payload = {
      incident_type: $('#incidentType').value,
      severity,
      fact_summary: $('#incidentFact').value.trim(),
      initial_response: $('#incidentResponse').value.trim()
    };
    if (!payload.fact_summary) return showToast('発生した事実を入力してください。', true);
    if (['high', 'critical'].includes(severity) && !confirm('重大度が高く設定されています。事業所へ電話連絡済みですか？報告を登録しますか？')) return;
    const key = newIdempotencyKey('incident', visitId);
    setLoading(true);
    try {
      await api(`/staff/visits/${visitId}/incident`, { method: 'POST', body: { ...payload, idempotency_key: key }, idempotencyKey: key });
      clearIdempotencyKey('incident', visitId);
      $('#incidentDialog').close();
      $('#incidentForm').reset();
      showToast('事故・ヒヤリハットを管理者へ報告しました。');
    } catch (error) {
      showToast(error.message, true);
    } finally { setLoading(false); }
  }

  function bindEvents() {
    $('#loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await login(); } catch (error) { showToast(error.message, true); }
    });
    $('#clearAccessCode').addEventListener('click', () => { $('#accessCode').value = ''; $('#accessCode').focus(); });
    $('#logoutButton').addEventListener('click', logout);
    $('#reloadButton').addEventListener('click', () => state.sessionToken ? loadToday().catch((error) => showToast(error.message, true)) : location.reload());
    $('#todayButton').addEventListener('click', () => { $('#workDate').value = ymd(); loadToday().catch((error) => showToast(error.message, true)); });
    $('#previousDate').addEventListener('click', () => { $('#workDate').value = addDays($('#workDate').value, -1); loadToday().catch((error) => showToast(error.message, true)); });
    $('#nextDate').addEventListener('click', () => { $('#workDate').value = addDays($('#workDate').value, 1); loadToday().catch((error) => showToast(error.message, true)); });
    $('#workDate').addEventListener('change', () => loadToday().catch((error) => showToast(error.message, true)));
    $('#closeVisitDialog').addEventListener('click', () => $('#visitDialog').close());
    $('#startVisitButton').addEventListener('click', startVisit);
    $('#saveDraftButton').addEventListener('click', saveDraft);
    $('#recordForm').addEventListener('submit', finishVisit);
    $('#openHandoverButton').addEventListener('click', () => $('#handoverDialog').showModal());
    $('#openIncidentButton').addEventListener('click', () => $('#incidentDialog').showModal());
    $('#handoverForm').addEventListener('submit', submitHandover);
    $('#incidentForm').addEventListener('submit', submitIncident);
    $$('[data-close]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
  }

  async function init() {
    bindEvents();
    $('#workDate').value = ymd();
    $('#demoBanner').hidden = !demo;
    if (demo) {
      $('#staffCode').value = 'ST003';
      $('#accessCode').value = '3333';
    }

    if (restoreSession()) {
      showWorkspace();
      try { await loadToday(); return; }
      catch { clearSession(); }
    }

    showLogin();
    if (demo) {
      try { await login({ demoLogin: true }); }
      catch (error) { showToast(error.message, true); }
    }
  }

  init();
})();
