(() => {
  'use strict';

  const CONFIG = window.DPRO_HOMECARE_CONFIG || {};
  const API_BASE = String(CONFIG.API_BASE || '').replace(/\/+$/, '');
  const OFFICE_CODE = CONFIG.OFFICE_CODE || 'dpro_homecare_demo';
  const REQUEST_TIMEOUT_MS = Number(CONFIG.REQUEST_TIMEOUT_MS || 15000);
  const params = new URLSearchParams(location.search);
  const demo = ['1', 'true', 'yes'].includes(String(params.get('demo') || '').toLowerCase());

  const state = {
    adminCode: '',
    options: null,
    overview: null,
    recurring: [],
    selectedVisit: null,
    selectedRecurring: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  const pad = (value) => String(value).padStart(2, '0');

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

  function dateParts(iso) {
    const date = new Date(iso);
    const dateText = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short'
    }).format(date);
    const timeText = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
    const isoDate = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
    const isoTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
    return { dateText, timeText, isoDate, isoTime };
  }

  function durationMinutes(start, end) {
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  }

  function serviceLabel(value) {
    return state.options?.service_types?.find((item) => item.value === value)?.label || value || '未設定';
  }

  function statusLabel(status) {
    return ({
      scheduled: '予定', confirmed: '確認済み', in_progress: '訪問中', completed: '完了',
      cancelled: 'キャンセル', no_show: '不在', suspended: '中止'
    })[status] || status;
  }

  function showToast(message, isError = false) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function setLoading(active) {
    $('#loadingOverlay').hidden = !active;
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const url = new URL(`${API_BASE}${path}`);
    if (!url.searchParams.has('office_code')) url.searchParams.set('office_code', OFFICE_CODE);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.adminCode) headers['X-Admin-Code'] = state.adminCode;
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        signal: controller.signal,
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || `通信エラー（${response.status}）`);
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('通信がタイムアウトしました。もう一度お試しください。');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function makeOption(value, label, selected = false) {
    return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }

  function fillCommonFormOptions() {
    const options = state.options;
    if (!options) return;

    $$('[data-client-select]').forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">選択してください</option>' + options.clients
        .map((client) => makeOption(client.id, `${client.client_number}　${client.client_name}`, client.id === current)).join('');
    });

    $$('[data-service-select]').forEach((select) => {
      const current = select.value;
      select.innerHTML = options.service_types.map((item) => makeOption(item.value, item.label, item.value === current)).join('');
    });

    $$('[data-weekday-select]').forEach((select) => {
      const current = select.value;
      select.innerHTML = options.weekdays.map((item) => makeOption(item.value, `${item.label}曜日`, String(item.value) === current)).join('');
    });

    const timeOptions = [];
    for (let hour = 0; hour < 24; hour += 1) {
      for (const minute of [0, 30]) timeOptions.push(`${pad(hour)}:${pad(minute)}`);
    }
    $$('[data-time-select]').forEach((select) => {
      const current = select.value || '09:00';
      select.innerHTML = timeOptions.map((value) => makeOption(value, value, value === current)).join('');
    });

    const durations = [15, 20, 30, 45, 60, 90, 120, 150, 180, 240];
    $$('[data-duration-select]').forEach((select) => {
      const current = Number(select.value || 60);
      select.innerHTML = durations.map((value) => makeOption(value, `${value}分`, value === current)).join('');
    });

    $$('[data-required-count]').forEach((select) => {
      const current = Number(select.value || 1);
      select.innerHTML = [1, 2, 3, 4].map((value) => makeOption(value, `${value}名`, value === current)).join('');
    });

    $$('[data-staff-select]').forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">未指定</option>' + options.staff
        .map((staff) => makeOption(staff.id, `${staff.staff_code}　${staff.staff_name}`, staff.id === current)).join('');
    });

    $$('[data-staff-checks]').forEach((container) => {
      const selected = new Set($$('input:checked', container).map((input) => input.value));
      container.innerHTML = options.staff.map((staff) => `
        <label class="staff-check">
          <input type="checkbox" name="staff_ids" value="${escapeHtml(staff.id)}"${selected.has(staff.id) ? ' checked' : ''}>
          <span>${escapeHtml(staff.staff_name)}<small> ${escapeHtml(staff.qualification || staff.primary_role || '')}</small></span>
        </label>`).join('');
    });

    const staffFilter = $('#staffFilter');
    const filterValue = staffFilter.value;
    staffFilter.innerHTML = '<option value="">すべて</option>' + options.staff
      .map((staff) => makeOption(staff.id, staff.staff_name, staff.id === filterValue)).join('');
  }

  function updatePlanOptions(form) {
    const clientId = $('[data-client-select]', form)?.value || '';
    const planSelect = $('[data-plan-select]', form);
    if (!planSelect || !state.options) return;
    const current = planSelect.value;
    const rows = state.options.plans.filter((plan) => plan.client_id === clientId);
    planSelect.innerHTML = '<option value="">指定なし</option>' + rows
      .map((plan) => makeOption(plan.id, `${plan.plan_code}　${plan.plan_title}`, plan.id === current)).join('');
  }

  function renderSummary() {
    const counts = state.overview?.counts || {};
    $('#countVisits').textContent = counts.visits ?? 0;
    $('#countUnassigned').textContent = counts.unassigned ?? 0;
    $('#countMultiStaff').textContent = counts.multi_staff ?? 0;
    $('#countRecurring').textContent = counts.active_recurring ?? 0;
    $('#rangeLabel').textContent = `${state.overview?.date_from || '-'} ～ ${state.overview?.date_to || '-'}`;
  }

  function filteredVisits() {
    const status = $('#statusFilter').value;
    const staffId = $('#staffFilter').value;
    return (state.overview?.visits || []).filter((visit) => {
      if (status && visit.status !== status) return false;
      if (staffId && !visit.assignments.some((row) => row.staff_id === staffId)) return false;
      return true;
    });
  }

  function renderVisits() {
    const rows = filteredVisits();
    $('#visibleCount').textContent = `${rows.length}件`;
    const container = $('#visitsList');
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state">条件に合う訪問予定はありません。</div>';
      return;
    }
    container.innerHTML = rows.map((visit) => {
      const start = dateParts(visit.planned_start);
      const end = dateParts(visit.planned_end);
      const activeAssignments = visit.assignments.filter((row) => row.assignment_role !== 'observer');
      const missing = Math.max(0, Number(visit.required_staff_count || 1) - activeAssignments.length);
      const staffChips = activeAssignments.map((row) => `<span class="staff-chip">${escapeHtml(row.staff?.staff_name || 'スタッフ不明')}</span>`).join('') +
        (missing ? `<span class="staff-chip missing">あと${missing}名必要</span>` : '');
      const editable = ['scheduled', 'confirmed'].includes(visit.status);
      const cancelled = visit.status === 'cancelled';
      return `
        <article class="visit-card ${cancelled ? 'cancelled' : ''}" data-visit-id="${escapeHtml(visit.id)}">
          <div class="visit-time">${escapeHtml(start.timeText)}<small>${escapeHtml(start.dateText)} ～ ${escapeHtml(end.timeText)}</small></div>
          <div class="visit-main">
            <h3>${escapeHtml(visit.client?.client_name || '利用者不明')}</h3>
            <p>${escapeHtml(serviceLabel(visit.service_type))}・${durationMinutes(visit.planned_start, visit.planned_end)}分・必要${Number(visit.required_staff_count || 1)}名</p>
            ${visit.change_reason ? `<p>変更理由：${escapeHtml(visit.change_reason)}</p>` : ''}
            ${visit.cancel_reason ? `<p>キャンセル理由：${escapeHtml(visit.cancel_reason)}</p>` : ''}
            <div class="assignment-line">${staffChips}</div>
          </div>
          <div class="visit-actions">
            <span class="status-pill ${escapeHtml(visit.status)}">${escapeHtml(statusLabel(visit.status))}</span>
            ${editable ? `<button class="small-action" type="button" data-edit-visit="${escapeHtml(visit.id)}">変更</button>` : ''}
            ${editable ? `<button class="small-action danger" type="button" data-cancel-visit="${escapeHtml(visit.id)}">キャンセル</button>` : ''}
            ${cancelled ? `<button class="small-action" type="button" data-restore-visit="${escapeHtml(visit.id)}">復元</button>` : ''}
          </div>
        </article>`;
    }).join('');
  }

  function renderRecurring() {
    const container = $('#recurringList');
    const rows = state.recurring || [];
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state">定期予定はありません。</div>';
      return;
    }
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    container.innerHTML = rows.map((row) => `
      <article class="recurring-item ${row.is_active ? '' : 'inactive'}">
        <div class="recurring-title">
          <strong>${escapeHtml(row.client?.client_name || '利用者不明')}</strong>
          <span class="status-pill ${row.is_active ? 'confirmed' : 'neutral'}">${row.is_active ? '有効' : '停止中'}</span>
        </div>
        <p class="recurring-meta">毎週${weekdays[Number(row.weekday)]}曜日 ${escapeHtml(String(row.start_time).slice(0, 5))}・${row.duration_minutes}分<br>${escapeHtml(serviceLabel(row.service_type))}・必要${row.required_staff_count}名<br>希望担当：${escapeHtml(row.preferred_staff?.staff_name || '未指定')}</p>
        <div class="recurring-actions">
          <button class="small-action" type="button" data-edit-recurring="${escapeHtml(row.id)}">編集</button>
          <button class="small-action" type="button" data-toggle-recurring="${escapeHtml(row.id)}" data-active="${row.is_active ? '1' : '0'}">${row.is_active ? '停止' : '再開'}</button>
        </div>
      </article>`).join('');
  }

  async function loadAll() {
    setLoading(true);
    try {
      const dateFrom = $('#dateFrom').value || ymd();
      const dateTo = $('#dateTo').value || addDays(dateFrom, 6);
      const [options, overview, recurring] = await Promise.all([
        api('/admin/schedule/options'),
        api(`/admin/schedule/overview?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`),
        api('/admin/recurring-schedules')
      ]);
      state.options = options;
      state.overview = overview;
      state.recurring = recurring.schedules || [];
      fillCommonFormOptions();
      renderSummary();
      renderVisits();
      renderRecurring();
      $('#workspace').hidden = false;
      $('#adminGate').hidden = true;
    } catch (error) {
      showToast(error.message, true);
      if (/管理コード/.test(error.message)) {
        state.adminCode = '';
        $('#workspace').hidden = true;
        $('#adminGate').hidden = false;
      }
    } finally {
      setLoading(false);
    }
  }

  function openPanel(id) {
    $('#panelBackdrop').hidden = false;
    $(`#${id}`).hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closePanels() {
    $('#panelBackdrop').hidden = true;
    $$('.edit-panel').forEach((panel) => { panel.hidden = true; });
    document.body.style.overflow = '';
  }

  function resetVisitCreateForm() {
    const form = $('#visitCreateForm');
    form.reset();
    fillCommonFormOptions();
    form.elements.date.value = addDays(ymd(), 1);
    form.elements.start_time.value = '09:00';
    form.elements.duration_minutes.value = '60';
    form.elements.service_type.value = 'combined';
    form.elements.required_staff_count.value = '1';
    updatePlanOptions(form);
  }

  function resetRecurringForm() {
    const form = $('#recurringForm');
    form.reset();
    form.elements.schedule_id.value = '';
    form.elements.is_active.value = 'true';
    $('#recurringTitle').textContent = '定期予定を追加';
    fillCommonFormOptions();
    form.elements.weekday.value = String(new Date().getDay());
    form.elements.start_time.value = '09:00';
    form.elements.duration_minutes.value = '60';
    form.elements.service_type.value = 'combined';
    form.elements.required_staff_count.value = '1';
    form.elements.effective_from.value = ymd();
    updatePlanOptions(form);
  }

  function selectedStaffIds(form) {
    return $$('input[name="staff_ids"]:checked', form).map((input) => input.value);
  }

  function visitFormBody(form) {
    const data = new FormData(form);
    return {
      client_id: data.get('client_id') || undefined,
      service_plan_id: data.get('service_plan_id') || null,
      date: data.get('date'),
      start_time: data.get('start_time'),
      duration_minutes: Number(data.get('duration_minutes')),
      service_type: data.get('service_type'),
      required_staff_count: Number(data.get('required_staff_count')),
      staff_ids: selectedStaffIds(form),
      reason: data.get('reason') || ''
    };
  }

  function recurringFormBody(form) {
    const data = new FormData(form);
    return {
      client_id: data.get('client_id'),
      service_plan_id: data.get('service_plan_id') || null,
      weekday: Number(data.get('weekday')),
      start_time: data.get('start_time'),
      duration_minutes: Number(data.get('duration_minutes')),
      service_type: data.get('service_type'),
      required_staff_count: Number(data.get('required_staff_count')),
      preferred_staff_id: data.get('preferred_staff_id') || null,
      effective_from: data.get('effective_from'),
      effective_to: data.get('effective_to') || null,
      is_active: String(data.get('is_active')) !== 'false'
    };
  }

  function editVisit(id) {
    const visit = state.overview?.visits.find((row) => row.id === id);
    if (!visit) return;
    state.selectedVisit = visit;
    const form = $('#visitEditForm');
    fillCommonFormOptions();
    const start = dateParts(visit.planned_start);
    form.elements.visit_id.value = visit.id;
    form.elements.date.value = start.isoDate;
    form.elements.start_time.value = start.isoTime;
    form.elements.duration_minutes.value = String(durationMinutes(visit.planned_start, visit.planned_end));
    form.elements.service_type.value = visit.service_type;
    form.elements.required_staff_count.value = String(visit.required_staff_count);
    form.elements.reason.value = '';
    $('#editClientName').textContent = `${visit.client?.client_name || '利用者不明'} 様`;
    const selected = new Set(visit.assignments.filter((row) => row.assignment_role !== 'observer').map((row) => row.staff_id));
    $$('input[name="staff_ids"]', form).forEach((input) => { input.checked = selected.has(input.value); });
    openPanel('visitEditPanel');
  }

  function editRecurring(id) {
    const row = state.recurring.find((item) => item.id === id);
    if (!row) return;
    state.selectedRecurring = row;
    const form = $('#recurringForm');
    fillCommonFormOptions();
    form.elements.schedule_id.value = row.id;
    form.elements.is_active.value = String(row.is_active);
    form.elements.client_id.value = row.client_id;
    updatePlanOptions(form);
    form.elements.service_plan_id.value = row.service_plan_id || '';
    form.elements.weekday.value = String(row.weekday);
    form.elements.start_time.value = String(row.start_time).slice(0, 5);
    form.elements.duration_minutes.value = String(row.duration_minutes);
    form.elements.service_type.value = row.service_type;
    form.elements.required_staff_count.value = String(row.required_staff_count);
    form.elements.preferred_staff_id.value = row.preferred_staff_id || '';
    form.elements.effective_from.value = row.effective_from;
    form.elements.effective_to.value = row.effective_to || '';
    $('#recurringTitle').textContent = '定期予定を編集';
    openPanel('recurringCreatePanel');
  }

  async function cancelVisit(id) {
    const reason = prompt('キャンセル理由を入力してください。');
    if (!reason) return;
    setLoading(true);
    try {
      await api(`/admin/visits/${id}/cancel`, { method: 'POST', body: { reason } });
      showToast('訪問予定をキャンセルしました。');
      await loadAll();
    } catch (error) { showToast(error.message, true); }
    finally { setLoading(false); }
  }

  async function restoreVisit(id) {
    const reason = prompt('復元理由を入力してください（任意）。') ?? '';
    setLoading(true);
    try {
      await api(`/admin/visits/${id}/restore`, { method: 'POST', body: { reason } });
      showToast('訪問予定を復元しました。');
      await loadAll();
    } catch (error) { showToast(error.message, true); }
    finally { setLoading(false); }
  }

  async function toggleRecurring(id, active) {
    const next = !active;
    if (!confirm(`この定期予定を${next ? '再開' : '停止'}しますか？`)) return;
    setLoading(true);
    try {
      await api(`/admin/recurring-schedules/${id}/toggle`, { method: 'POST', body: { is_active: next } });
      showToast(`定期予定を${next ? '再開' : '停止'}しました。`);
      await loadAll();
    } catch (error) { showToast(error.message, true); }
    finally { setLoading(false); }
  }

  function bindEvents() {
    $('#adminForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      state.adminCode = $('#adminCode').value.trim();
      if (!state.adminCode) return;
      await loadAll();
    });

    $('#clearAdminCode').addEventListener('click', () => {
      $('#adminCode').value = '';
      state.adminCode = '';
      $('#adminCode').focus();
    });

    $('#reloadButton').addEventListener('click', () => state.adminCode ? loadAll() : location.reload());
    $('#applyRangeButton').addEventListener('click', loadAll);
    $('#statusFilter').addEventListener('change', renderVisits);
    $('#staffFilter').addEventListener('change', renderVisits);

    $$('[data-open-panel]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.openPanel;
      if (id === 'visitCreatePanel') resetVisitCreateForm();
      if (id === 'recurringCreatePanel') resetRecurringForm();
      openPanel(id);
    }));
    $$('[data-close-panel]').forEach((button) => button.addEventListener('click', closePanels));
    $('#panelBackdrop').addEventListener('click', closePanels);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanels(); });

    $$('[data-client-select]').forEach((select) => select.addEventListener('change', () => updatePlanOptions(select.form)));

    $('#visitsList').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-visit]');
      const cancel = event.target.closest('[data-cancel-visit]');
      const restore = event.target.closest('[data-restore-visit]');
      if (edit) editVisit(edit.dataset.editVisit);
      if (cancel) cancelVisit(cancel.dataset.cancelVisit);
      if (restore) restoreVisit(restore.dataset.restoreVisit);
    });

    $('#recurringList').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-recurring]');
      const toggle = event.target.closest('[data-toggle-recurring]');
      if (edit) editRecurring(edit.dataset.editRecurring);
      if (toggle) toggleRecurring(toggle.dataset.toggleRecurring, toggle.dataset.active === '1');
    });

    $('#visitCreateForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      setLoading(true);
      try {
        await api('/admin/visits/create', { method: 'POST', body: visitFormBody(event.currentTarget) });
        showToast('単発訪問を登録しました。');
        closePanels();
        await loadAll();
      } catch (error) { showToast(error.message, true); }
      finally { setLoading(false); }
    });

    $('#visitEditForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const id = form.elements.visit_id.value;
      setLoading(true);
      try {
        const body = visitFormBody(form);
        delete body.client_id;
        delete body.service_plan_id;
        await api(`/admin/visits/${id}/update`, { method: 'POST', body });
        showToast('訪問予定を変更しました。');
        closePanels();
        await loadAll();
      } catch (error) { showToast(error.message, true); }
      finally { setLoading(false); }
    });

    $('#recurringForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const id = form.elements.schedule_id.value;
      setLoading(true);
      try {
        const path = id ? `/admin/recurring-schedules/${id}/update` : '/admin/recurring-schedules';
        await api(path, { method: 'POST', body: recurringFormBody(form) });
        showToast(id ? '定期予定を更新しました。' : '定期予定を登録しました。');
        closePanels();
        await loadAll();
      } catch (error) { showToast(error.message, true); }
      finally { setLoading(false); }
    });

    $('#generateForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setLoading(true);
      try {
        const result = await api('/admin/recurring-schedules/generate', {
          method: 'POST', body: { date_from: form.get('date_from'), date_to: form.get('date_to') }
        });
        const box = $('#generateResult');
        box.hidden = false;
        box.textContent = `新規 ${result.created || 0}件／既存 ${result.existing || 0}件／競合 ${result.conflicts || 0}件／未割当て ${result.unassigned_created || 0}件`;
        showToast('定期予定から訪問予定を生成しました。');
        await loadAll();
      } catch (error) { showToast(error.message, true); }
      finally { setLoading(false); }
    });
  }

  function init() {
    if (!API_BASE) {
      showToast('API_BASEが設定されていません。', true);
      return;
    }
    const today = ymd();
    $('#dateFrom').value = today;
    $('#dateTo').value = addDays(today, 6);
    $('#generateFrom').value = addDays(today, 1);
    $('#generateTo').value = addDays(today, 14);
    if (demo) {
      $('#demoBanner').hidden = false;
      $('#adminCode').value = '1234';
    }
    bindEvents();
  }

  init();
})();
