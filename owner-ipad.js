(() => {
  'use strict';

  const CONFIG = window.DPRO_HOMECARE_CONFIG || {};
  const API_BASE = String(CONFIG.API_BASE || '').replace(/\/+$/, '');
  const OFFICE_CODE = CONFIG.OFFICE_CODE || 'dpro_homecare_demo';
  const TIMEOUT = Number(CONFIG.REQUEST_TIMEOUT_MS || 15000);
  const STORAGE_KEY = CONFIG.OWNER_ADMIN_STORAGE_KEY || 'dpro_homecare_owner_admin_code';
  const params = new URLSearchParams(location.search);
  const demo = ['1', 'true', 'yes'].includes(String(params.get('demo') || '').toLowerCase());

  const state = {
    adminCode: '',
    data: null,
    selectedVisitId: null,
    selectedRecordId: null,
    selectedTab: 'today'
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));

  function ymd(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function formatDate(dateString) {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    }).format(new Date(`${dateString}T12:00:00+09:00`));
  }

  function formatTime(iso) {
    if (!iso) return '--:--';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso));
  }

  function formatDateTime(iso) {
    if (!iso) return '未登録';
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

  function statusLabel(value) {
    return ({
      scheduled: '予定', confirmed: '確認済み', in_progress: '訪問中', completed: '完了',
      cancelled: 'キャンセル', no_show: '不在', suspended: '中止', submitted: '提出済み',
      returned: '差戻し', approved: '承認済み', pending: '承認待ち', published: '公開済み',
      open: '未対応', waiting: '確認待ち', resolved: '解決', closed: '完了',
      investigating: '確認中', action_required: '対応必要'
    })[value] || value || '未設定';
  }

  function incidentLabel(value) {
    return ({
      near_miss: 'ヒヤリハット', fall: '転倒', injury: '外傷', medication_concern: '服薬に関する懸念',
      missing_item: '物品紛失', property_damage: '物損', complaint: '苦情', other: 'その他'
    })[value] || value || '事故・ヒヤリハット';
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

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const url = new URL(`${API_BASE}${path}`);
    if (!url.searchParams.has('office_code')) url.searchParams.set('office_code', OFFICE_CODE);
    const headers = { 'Content-Type': 'application/json', 'X-Admin-Code': state.adminCode, ...(options.headers || {}) };

    try {
      const response = await fetch(url, {
        method: options.method || 'GET', headers, signal: controller.signal,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const error = new Error(data.error || `通信エラー（${response.status}）`);
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('通信がタイムアウトしました。もう一度お試しください。');
      if (error.status === 401) logout(false);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function showLogin(show) {
    $('#loginPanel').hidden = !show;
    $('#ipadApp').hidden = show;
    $('#logoutButton').hidden = show;
  }

  async function login(event) {
    event?.preventDefault();
    state.adminCode = $('#adminCode').value.trim();
    if (!state.adminCode) return showToast('管理コードを入力してください。', true);
    setLoading(true);
    try {
      await api('/admin/verify', { method: 'POST', body: { admin_code: state.adminCode } });
      sessionStorage.setItem(STORAGE_KEY, state.adminCode);
      showLogin(false);
      await loadOverview();
      showToast('iPad業務画面を開きました。');
    } catch (error) {
      showToast(error.message, true);
      showLogin(true);
    } finally {
      setLoading(false);
    }
  }

  function logout(notify = true) {
    state.adminCode = '';
    state.data = null;
    sessionStorage.removeItem(STORAGE_KEY);
    $('#adminCode').value = demo ? '1234' : '';
    showLogin(true);
    if (notify) showToast('ログアウトしました。');
  }

  async function loadOverview() {
    const date = $('#workDate').value || ymd();
    setLoading(true);
    try {
      const data = await api(`/admin/owner/overview?date=${encodeURIComponent(date)}`);
      state.data = data;
      renderAll(data);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  function setTab(name) {
    state.selectedTab = name;
    $$('.tab-button').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
    $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function empty(text) {
    return `<div class="empty-box">${escapeHtml(text)}</div>`;
  }

  function pill(text, type = '') {
    return `<span class="status-pill ${type}">${escapeHtml(text)}</span>`;
  }

  function activeStaff() {
    return (state.data?.staff || []).filter((staff) => staff.is_active);
  }

  function renderAll(data) {
    $('#officeTitle').textContent = data.office?.office_name || '訪問介護ステーション';
    $('#dateLabel').textContent = `${formatDate(data.date)}の業務状況`;
    $('#demoBanner').hidden = !demo;
    const counts = data.counts || {};
    $('#countVisits').textContent = counts.today_visits || 0;
    $('#countUnassigned').textContent = counts.unassigned || 0;
    $('#countRecords').textContent = counts.pending_records || 0;
    $('#countReports').textContent = counts.pending_family_reports || 0;
    $('#countAlerts').textContent = (counts.open_incidents || 0) + (counts.open_inquiries || 0) + (counts.urgent_handovers || 0);
    renderToday(data.visits || []);
    renderPriority(data);
    renderAssignments(data.visits || []);
    renderRecords(data.records || []);
    renderReports(data.family_reports || []);
    renderHandovers(data.handovers || []);
    renderIncidents(data.incidents || []);
    renderInquiries(data.inquiries || []);
  }

  function renderToday(visits) {
    $('#todayVisitList').innerHTML = visits.length ? visits.map((visit) => {
      const staff = (visit.assignments || []).map((row) => row.staff?.staff_name).filter(Boolean).join('、') || '未割当て';
      const type = ['cancelled', 'no_show', 'suspended'].includes(visit.status) ? 'danger' : visit.status === 'in_progress' ? 'warning' : '';
      return `<article class="visit-item">
        <div class="visit-time">${formatTime(visit.planned_start)}<br><small>〜${formatTime(visit.planned_end)}</small></div>
        <div class="visit-main"><strong>${escapeHtml(visit.client?.client_name || '利用者')}</strong><p>${escapeHtml(serviceLabel(visit.service_type))}・${escapeHtml(staff)}</p></div>
        ${pill(statusLabel(visit.status), type)}
      </article>`;
    }).join('') : empty('この日の訪問はありません。');
  }

  function renderPriority(data) {
    const rows = [];
    (data.incidents || []).filter((item) => ['high', 'critical'].includes(item.severity)).forEach((item) => rows.push({
      title: `事故・${item.client?.client_name || ''}`, detail: item.fact_summary, type: 'danger', tab: 'alerts'
    }));
    (data.inquiries || []).filter((item) => ['urgent', 'emergency'].includes(item.urgency)).forEach((item) => rows.push({
      title: `問い合わせ・${item.client?.client_name || ''}`, detail: item.subject || item.detail, type: 'danger', tab: 'alerts'
    }));
    (data.handovers || []).filter((item) => item.importance === 'urgent').forEach((item) => rows.push({
      title: `申し送り・${item.client?.client_name || ''}`, detail: item.title, type: '', tab: 'handovers'
    }));
    $('#priorityList').innerHTML = rows.length ? rows.map((row) => `<button class="priority-item ${row.type}" data-priority-tab="${row.tab}" type="button"><strong>${escapeHtml(row.title)}</strong><p>${escapeHtml(row.detail || '')}</p></button>`).join('') : empty('緊急対応が必要な項目はありません。');
    $$('[data-priority-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.priorityTab)));
  }

  function renderAssignments(visits) {
    const rows = visits.filter((visit) => ['scheduled', 'confirmed'].includes(visit.status));
    rows.sort((a, b) => Number(a.fully_assigned) - Number(b.fully_assigned) || new Date(a.planned_start) - new Date(b.planned_start));
    $('#assignmentList').innerHTML = rows.length ? rows.map((visit) => {
      const assigned = (visit.assignments || []).filter((row) => row.assignment_role !== 'observer');
      const names = assigned.map((row) => row.staff?.staff_name).filter(Boolean).join('、') || '未割当て';
      const short = assigned.length < Number(visit.required_staff_count || 1);
      return `<article class="task-item">
        <div class="task-main"><h3>${formatTime(visit.planned_start)}・${escapeHtml(visit.client?.client_name || '利用者')}</h3><p>${escapeHtml(serviceLabel(visit.service_type))}／必要${Number(visit.required_staff_count || 1)}名</p><p class="task-detail">現在：${escapeHtml(names)}</p></div>
        <div class="task-actions">${pill(short ? '未割当て' : '割当て済み', short ? 'danger' : '')}<button class="button primary" data-assign-visit="${visit.id}" type="button">担当を変更</button></div>
      </article>`;
    }).join('') : empty('変更可能な訪問予定はありません。');
    $$('[data-assign-visit]').forEach((button) => button.addEventListener('click', () => openAssignment(button.dataset.assignVisit)));
  }

  function renderRecords(records) {
    const rows = records.filter((record) => record.record_status === 'submitted');
    $('#recordList').innerHTML = rows.length ? rows.map((record) => `<article class="task-item"><div class="task-main"><h3>${escapeHtml(record.client?.client_name || '利用者')}・${formatDateTime(record.visit?.planned_start)}</h3><p>${escapeHtml(serviceLabel(record.visit?.service_type))}／提出者 ${escapeHtml(record.created_by_staff?.staff_name || 'スタッフ')}</p><p class="task-detail">${escapeHtml(record.service_summary || '実施内容未入力')}</p></div><div class="task-actions">${pill('提出済み', 'warning')}<button class="button primary" data-record-id="${record.id}" type="button">記録を確認</button></div></article>`).join('') : empty('確認待ちの訪問記録はありません。');
    $$('[data-record-id]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.recordId)));
  }

  function renderReports(reports) {
    $('#reportList').innerHTML = reports.length ? reports.map((report) => {
      const canPublish = report.record_status === 'approved';
      return `<article class="task-item"><div class="task-main"><h3>${escapeHtml(report.client?.client_name || '利用者')}・${escapeHtml(report.report_title || '訪問報告')}</h3><p>${formatDateTime(report.visit?.planned_start)}／記録 ${escapeHtml(statusLabel(report.record_status))}</p><p class="task-detail">${escapeHtml(report.public_comment || '')}</p></div><div class="task-actions"><button class="button danger" data-report-reject="${report.id}" type="button">非公開</button><button class="button primary" data-report-publish="${report.id}" type="button" ${canPublish ? '' : 'disabled'}>${canPublish ? '家族へ公開' : '記録承認待ち'}</button></div></article>`;
    }).join('') : empty('家族公開の承認待ちはありません。');
    $$('[data-report-publish]').forEach((button) => button.addEventListener('click', () => reportAction(button.dataset.reportPublish, 'publish')));
    $$('[data-report-reject]').forEach((button) => button.addEventListener('click', () => reportAction(button.dataset.reportReject, 'reject')));
  }

  function renderHandovers(handovers) {
    $('#handoverList').innerHTML = handovers.length ? handovers.map((item) => `<article class="task-item"><div class="task-main"><h3>${escapeHtml(item.client?.client_name || '利用者')}・${escapeHtml(item.title)}</h3><p>${escapeHtml(item.created_by_staff?.staff_name || 'スタッフ')}／${formatDateTime(item.created_at)}</p><p class="task-detail">${escapeHtml(item.note_text)}</p></div><div class="task-actions"><span class="importance-pill ${item.importance}">${escapeHtml(item.importance === 'urgent' ? '緊急' : item.importance === 'high' ? '重要' : '通常')}</span><button class="button primary" data-resolve-handover="${item.id}" type="button">対応済みにする</button></div></article>`).join('') : empty('未解決の申し送りはありません。');
    $$('[data-resolve-handover]').forEach((button) => button.addEventListener('click', () => resolveHandover(button.dataset.resolveHandover)));
  }

  function staffOptions(selected) {
    return `<option value="">未割当て</option>${activeStaff().map((staff) => `<option value="${staff.id}" ${staff.id === selected ? 'selected' : ''}>${escapeHtml(staff.staff_name)}</option>`).join('')}`;
  }

  function renderIncidents(incidents) {
    $('#incidentList').innerHTML = incidents.length ? incidents.map((item) => `<article class="task-item"><div class="task-main"><h3>${escapeHtml(item.client?.client_name || '利用者')}・${escapeHtml(incidentLabel(item.incident_type))}</h3><p>${formatDateTime(item.occurred_at)}／重大度 ${escapeHtml(item.severity)}</p><p class="task-detail">${escapeHtml(item.fact_summary)}</p></div><div class="task-actions task-control"><select data-incident-status="${item.id}"><option value="open" ${item.manager_status === 'open' ? 'selected' : ''}>未確認</option><option value="investigating" ${item.manager_status === 'investigating' ? 'selected' : ''}>確認中</option><option value="action_required" ${item.manager_status === 'action_required' ? 'selected' : ''}>対応必要</option><option value="closed">完了</option></select><select data-incident-family="${item.id}"><option value="not_required" ${item.family_contact_status === 'not_required' ? 'selected' : ''}>家族連絡不要</option><option value="pending" ${item.family_contact_status === 'pending' ? 'selected' : ''}>家族連絡待ち</option><option value="contacted" ${item.family_contact_status === 'contacted' ? 'selected' : ''}>家族連絡済み</option><option value="unable_to_contact" ${item.family_contact_status === 'unable_to_contact' ? 'selected' : ''}>連絡つかず</option></select><button class="button primary" data-save-incident="${item.id}" type="button">保存</button></div></article>`).join('') : empty('未完了の事故・ヒヤリハットはありません。');
    $$('[data-save-incident]').forEach((button) => button.addEventListener('click', () => saveIncident(button.dataset.saveIncident)));
  }

  function renderInquiries(inquiries) {
    $('#inquiryList').innerHTML = inquiries.length ? inquiries.map((item) => `<article class="task-item"><div class="task-main"><h3>${escapeHtml(item.client?.client_name || '利用者未指定')}・${escapeHtml(item.subject || item.inquiry_type)}</h3><p>${escapeHtml(item.channel)}／${formatDateTime(item.created_at)}</p><p class="task-detail">${escapeHtml(item.detail)}</p></div><div class="task-actions task-control"><select data-inquiry-status="${item.id}"><option value="open" ${item.status === 'open' ? 'selected' : ''}>未対応</option><option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>対応中</option><option value="waiting" ${item.status === 'waiting' ? 'selected' : ''}>確認待ち</option><option value="resolved">解決</option><option value="closed">完了</option></select><select data-inquiry-staff="${item.id}">${staffOptions(item.assigned_staff_id)}</select><button class="button primary" data-save-inquiry="${item.id}" type="button">保存</button></div></article>`).join('') : empty('未完了の問い合わせはありません。');
    $$('[data-save-inquiry]').forEach((button) => button.addEventListener('click', () => saveInquiry(button.dataset.saveInquiry)));
  }

  function openAssignment(visitId) {
    const visit = (state.data?.visits || []).find((item) => item.id === visitId);
    if (!visit) return showToast('訪問予定が見つかりません。', true);
    state.selectedVisitId = visitId;
    $('#assignmentTitle').textContent = `${visit.client?.client_name || '利用者'} 様の担当変更`;
    $('#assignmentMeta').textContent = `${formatTime(visit.planned_start)}〜${formatTime(visit.planned_end)}・必要${Number(visit.required_staff_count || 1)}名`;
    const assignedIds = new Set((visit.assignments || []).filter((row) => row.assignment_role !== 'observer').map((row) => row.staff_id));
    $('#assignmentStaffList').innerHTML = activeStaff().map((staff) => `<label class="staff-check"><input type="checkbox" value="${staff.id}" ${assignedIds.has(staff.id) ? 'checked' : ''}><span>${escapeHtml(staff.staff_name)}<small>${escapeHtml(staff.qualification || '')}</small></span></label>`).join('');
    $('#assignmentReason').value = '';
    $('#assignmentDialog').showModal();
  }

  async function submitAssignment(event) {
    event.preventDefault();
    const staffIds = $$('#assignmentStaffList input:checked').map((input) => input.value);
    const reason = $('#assignmentReason').value.trim();
    if (!reason) return showToast('変更理由を入力してください。', true);
    setLoading(true);
    try {
      await api(`/admin/visits/${state.selectedVisitId}/assign`, { method: 'POST', body: { staff_ids: staffIds, reason } });
      $('#assignmentDialog').close();
      showToast('担当スタッフを更新しました。');
      await loadOverview();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function openRecord(recordId) {
    state.selectedRecordId = recordId;
    setLoading(true);
    try {
      const data = await api(`/admin/owner/records/${recordId}`);
      $('#recordDialogTitle').textContent = `${data.client?.client_name || '利用者'} 様の訪問記録`;
      $('#recordDialogMeta').textContent = `${formatDateTime(data.visit?.planned_start)}・${serviceLabel(data.visit?.service_type)}`;
      const record = data.record || {};
      $('#recordDialogContent').innerHTML = `
        <section class="detail-grid"><div class="detail-block"><h3>利用者の様子</h3><p>${escapeHtml(record.client_condition || '未入力')}</p></div><div class="detail-block"><h3>実施内容</h3><p>${escapeHtml(record.service_summary || '未入力')}</p></div></section>
        <section class="detail-block"><h3>実施項目</h3>${(data.items || []).length ? data.items.map((item) => `<div class="record-row"><span>${escapeHtml(item.item_name)}</span><strong>${escapeHtml(({ done: '実施', partial: '一部実施', not_done: '未実施', not_applicable: '対象外' })[item.result] || item.result)}</strong></div>`).join('') : '<p>実施項目はありません。</p>'}</section>
        <section class="detail-block internal-block"><h3>職員向け申し送り</h3><p>${escapeHtml(record.internal_handover || 'なし')}</p><h3>次回注意事項</h3><p>${escapeHtml(record.next_visit_attention || 'なし')}</p></section>
        <section class="detail-block family-block"><h3>家族向けコメント</h3><p>${escapeHtml(record.family_public_comment || '入力なし')}</p></section>`;
      $('#recordReviewComment').value = '';
      $('#recordDialog').showModal();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function recordAction(action) {
    const comment = $('#recordReviewComment').value.trim();
    if (action === 'return' && !comment) return showToast('差戻し理由を入力してください。', true);
    if (!confirm(action === 'approve' ? 'この訪問記録を承認しますか？' : 'この訪問記録を差戻しますか？')) return;
    setLoading(true);
    try {
      await api(`/admin/owner/records/${state.selectedRecordId}/${action}`, { method: 'POST', body: { comment } });
      $('#recordDialog').close();
      showToast(action === 'approve' ? '訪問記録を承認しました。' : '訪問記録を差戻しました。');
      await loadOverview();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function reportAction(reportId, action) {
    const message = action === 'publish' ? '家族画面へ公開しますか？' : 'この報告を非公開にしますか？';
    if (!confirm(message)) return;
    setLoading(true);
    try {
      await api(`/admin/owner/family-reports/${reportId}/${action}`, { method: 'POST', body: { comment: '' } });
      showToast(action === 'publish' ? '家族画面へ公開しました。' : '家族報告を非公開にしました。');
      await loadOverview();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function resolveHandover(handoverId) {
    if (!confirm('この申し送りを対応済みにしますか？')) return;
    setLoading(true);
    try {
      await api(`/admin/owner/handovers/${handoverId}/resolve`, { method: 'POST', body: {} });
      showToast('申し送りを対応済みにしました。');
      await loadOverview();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function saveIncident(incidentId) {
    const managerStatus = $(`[data-incident-status="${incidentId}"]`).value;
    const familyContactStatus = $(`[data-incident-family="${incidentId}"]`).value;
    setLoading(true);
    try {
      await api(`/admin/owner/incidents/${incidentId}/update`, { method: 'POST', body: { manager_status: managerStatus, family_contact_status: familyContactStatus, action_detail: '' } });
      showToast('事故対応状況を更新しました。');
      await loadOverview();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  async function saveInquiry(inquiryId) {
    const status = $(`[data-inquiry-status="${inquiryId}"]`).value;
    const assignedStaffId = $(`[data-inquiry-staff="${inquiryId}"]`).value || null;
    setLoading(true);
    try {
      await api(`/admin/owner/inquiries/${inquiryId}/update`, { method: 'POST', body: { status, assigned_staff_id: assignedStaffId } });
      showToast('問い合わせを更新しました。');
      await loadOverview();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setLoading(false);
    }
  }

  function bindEvents() {
    $('#loginForm').addEventListener('submit', login);
    $('#clearAdminCode').addEventListener('click', () => { $('#adminCode').value = ''; $('#adminCode').focus(); });
    $('#logoutButton').addEventListener('click', () => logout());
    $('#refreshButton').addEventListener('click', () => state.adminCode ? loadOverview() : login());
    $('#workDate').addEventListener('change', loadOverview);
    $$('.tab-button').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
    $$('[data-tab-jump]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tabJump)));
    $$('[data-close]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.close)?.close()));
    $('#assignmentForm').addEventListener('submit', submitAssignment);
    $('#approveRecordButton').addEventListener('click', () => recordAction('approve'));
    $('#returnRecordButton').addEventListener('click', () => recordAction('return'));
  }

  async function initialize() {
    bindEvents();
    $('#workDate').value = ymd();
    $('#demoBanner').hidden = !demo;
    if (demo) $('#adminCode').value = '1234';
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      state.adminCode = stored;
      $('#adminCode').value = stored;
      showLogin(false);
      await loadOverview();
    } else if (demo) {
      await login();
    } else {
      showLogin(true);
    }
  }

  initialize().catch((error) => showToast(error.message, true));
})();
