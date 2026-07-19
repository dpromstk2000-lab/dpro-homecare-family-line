// DPRO 訪問介護・家族連絡 LINE
// STEP HOMECARE-3-R1: ご本人デモ判定・表示分離修正
(() => {
  'use strict';

  const CONFIG = window.DPRO_HOMECARE_CONFIG || {};
  const PAGE = document.body?.dataset?.page || 'index';
  const qs = new URLSearchParams(location.search);
  const state = {
    identity: null,
    profile: null,
    home: null,
    publicConfig: null
  };

  const labels = {
    service: {
      physical_care: '身体介護',
      daily_living: '生活援助',
      combined: '身体介護・生活援助',
      outing: '通院・外出介助',
      self_pay: '自費サービス',
      other: 'その他'
    },
    status: {
      scheduled: '予定',
      confirmed: '確認済み',
      in_progress: '訪問中',
      completed: '完了',
      cancelled: 'キャンセル',
      no_show: '不在・未実施',
      suspended: '休止',
      open: '受付済み',
      in_progress_message: '対応中',
      answered: '回答済み',
      closed: '完了'
    },
    importance: {
      normal: '通常',
      important: '重要',
      urgent: '至急'
    },
    inquiry: {
      schedule_change: '訪問予定の変更',
      absence: '訪問のキャンセル・不在',
      service_question: 'サービス内容の確認',
      document: '書類について',
      other: 'その他'
    }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function text(value, fallback = '—') {
    const result = String(value ?? '').trim();
    return result || fallback;
  }

  function apiUrl(path, params = {}) {
    const base = String(CONFIG.API_BASE || '').replace(/\/+$/, '');
    if (!base) throw new Error('APIの接続先が設定されていません。');
    const url = new URL(`${base}${path}`);
    url.searchParams.set('office_code', CONFIG.OFFICE_CODE || 'dpro_homecare_demo');
    if (state.identity?.lineUserId) url.searchParams.set('line_user_id', state.identity.lineUserId);
    if (state.identity?.isDemo) {
      url.searchParams.set('demo', '1');
      if (state.identity.demoRole) url.searchParams.set('demo_role', state.identity.demoRole);
    }
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  async function api(path, options = {}, params = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(CONFIG.REQUEST_TIMEOUT_MS || 15000));
    const method = options.method || 'GET';
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({
        ...options.body,
        ...(state.identity?.lineUserId ? { line_user_id: state.identity.lineUserId } : {}),
        ...(state.identity?.isDemo ? { demo: true, demo_role: state.identity.demoRole || 'family' } : {})
      });
    }

    try {
      const response = await fetch(apiUrl(path, params), { method, headers, body, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) {
        const error = new Error(data?.error || `通信に失敗しました（${response.status}）`);
        error.code = data?.error_code || 'API_ERROR';
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('通信がタイムアウトしました。電波状況を確認して再度お試しください。');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function setLoading(show, message = '読み込み中です') {
    const overlay = $('#loadingOverlay');
    if (!overlay) return;
    overlay.hidden = !show;
    const label = $('[data-loading-message]', overlay);
    if (label) label.textContent = message;
  }

  function toast(message, type = 'success') {
    const region = $('#toastRegion');
    if (!region) return;
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    item.textContent = message;
    region.appendChild(item);
    setTimeout(() => item.remove(), 5200);
  }

  function showError(error, target = null) {
    const message = error?.message || '処理に失敗しました。';
    if (target) {
      target.hidden = false;
      target.className = 'alert alert-danger';
      target.innerHTML = `<strong class="alert-title">処理できませんでした</strong>${escapeHtml(message)}`;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      toast(message, 'error');
    }
  }

  async function initializeIdentity() {
    if (qs.get('demo') === '1') {
      // 専用画面を直接開いた場合でも、画面種別とデモ利用区分を必ず一致させる。
      // member.html?demo=1 で家族情報が表示される誤判定を防止する。
      const demoRole = PAGE === 'member'
        ? 'client'
        : PAGE === 'family'
          ? 'family'
          : (qs.get('demo_role') === 'client' ? 'client' : 'family');
      state.identity = {
        lineUserId: demoRole === 'client'
          ? (CONFIG.DEMO_CLIENT_LINE_USER_ID || 'UDEMO_HOMECARE_CLIENT_001')
          : (CONFIG.DEMO_LINE_USER_ID || 'UDEMO_HOMECARE_FAMILY_001'),
        displayName: demoRole === 'client' ? 'デモご本人' : 'デモご家族',
        isDemo: true,
        demoRole,
        source: 'demo'
      };
      return state.identity;
    }

    const liffId = String(CONFIG.LIFF_ID || '').trim();
    if (!liffId) {
      state.identity = { lineUserId: '', displayName: '', isDemo: false, source: 'browser-preview' };
      return state.identity;
    }
    if (!window.liff) throw new Error('LINE LIFFの読み込みに失敗しました。LINEから開き直してください。');

    await window.liff.init({ liffId });
    if (!window.liff.isLoggedIn()) {
      window.liff.login({ redirectUri: location.href });
      return new Promise(() => {});
    }
    const profile = await window.liff.getProfile();
    state.identity = {
      lineUserId: profile.userId,
      displayName: profile.displayName || '',
      pictureUrl: profile.pictureUrl || '',
      isDemo: false,
      source: 'liff'
    };
    return state.identity;
  }

  async function loadPublicConfig() {
    state.publicConfig = await api('/config');
    $$('.js-office-name').forEach((node) => { node.textContent = state.publicConfig.office?.office_name || '訪問介護事業所'; });
    const phone = state.publicConfig.office?.phone;
    $$('.js-office-phone').forEach((node) => {
      if (phone) {
        node.textContent = phone;
        if (node.tagName === 'A') node.href = `tel:${phone.replace(/[^0-9+]/g, '')}`;
      } else {
        node.textContent = '事業所へご確認ください';
        if (node.tagName === 'A') node.removeAttribute('href');
      }
    });
    return state.publicConfig;
  }

  async function loadProfile() {
    state.profile = await api('/line/profile');
    return state.profile;
  }

  function destination(profile = state.profile) {
    const suffix = state.identity?.isDemo
      ? `?demo=1${state.identity.demoRole === 'client' ? '&demo_role=client' : ''}`
      : '';
    return profile?.role === 'client' ? `member.html${suffix}` : `family.html${suffix}`;
  }

  function formatDateTime(value, includeYear = false) {
    if (!value) return '日時未定';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '日時未定';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      ...(includeYear ? { year: 'numeric' } : {}),
      month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function formatDate(value) {
    if (!value) return '日付未定';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '日付未定';
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    }).format(date);
  }

  function durationMinutes(start, end) {
    const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
    return Number.isFinite(minutes) && minutes > 0 ? `${minutes}分` : '';
  }

  function statusPill(status, labelOverride = '') {
    const normalized = status === 'in_progress' ? 'in_progress' : status;
    const label = labelOverride || labels.status[status] || status || '未設定';
    return `<span class="status-pill status-${escapeHtml(normalized)}">${escapeHtml(label)}</span>`;
  }

  function visitItem(visit) {
    const staff = Array.isArray(visit.staff)
      ? visit.staff.map((x) => x.staff_name).filter(Boolean).join('・')
      : '';
    return `
      <li class="list-item">
        <div class="list-item-head">
          <div>
            <p class="list-title">${escapeHtml(formatDateTime(visit.planned_start, true))}</p>
            <p class="list-meta">${escapeHtml(labels.service[visit.service_type] || '訪問介護')}・${escapeHtml(durationMinutes(visit.planned_start, visit.planned_end))}</p>
          </div>
          ${statusPill(visit.status)}
        </div>
        ${staff ? `<p class="list-body">担当：${escapeHtml(staff)}</p>` : ''}
      </li>`;
  }

  function reportItem(report) {
    return `
      <li class="list-item">
        <div class="list-item-head">
          <div>
            <p class="list-title">${escapeHtml(report.report_title || '訪問のご報告')}</p>
            <p class="list-meta">${escapeHtml(formatDate(report.published_at || report.created_at))}</p>
          </div>
          ${statusPill('published', '公開済み')}
        </div>
        <p class="list-body">${escapeHtml(report.public_comment)}</p>
      </li>`;
  }

  function messageItem(message) {
    const direction = message.direction === 'family_to_office' ? 'ご家族から' : '事業所から';
    const statusLabel = labels.status[message.status] || message.status;
    return `
      <li class="list-item">
        <div class="list-item-head">
          <div>
            <p class="list-title">${escapeHtml(message.subject || '事業所への連絡')}</p>
            <p class="list-meta">${escapeHtml(direction)}・${escapeHtml(formatDateTime(message.created_at, true))}</p>
          </div>
          ${statusPill(message.status, statusLabel)}
        </div>
        <p class="list-body">${escapeHtml(message.message_text)}</p>
      </li>`;
  }

  function setList(selector, items, renderer, emptyMessage) {
    const list = $(selector);
    if (!list) return;
    list.innerHTML = items.length
      ? items.map(renderer).join('')
      : `<li class="empty">${escapeHtml(emptyMessage)}</li>`;
  }

  function openModal(id) {
    const modal = $(`#${id}`);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const first = $('input, select, textarea, button', modal);
    setTimeout(() => first?.focus(), 0);
  }

  function closeModal(modal) {
    const root = typeof modal === 'string' ? $(`#${modal}`) : modal?.closest?.('.modal-backdrop') || modal;
    if (!root) return;
    root.hidden = true;
    document.body.style.overflow = '';
  }

  function bindModals() {
    $$('[data-open-modal]').forEach((button) => button.addEventListener('click', () => openModal(button.dataset.openModal)));
    $$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button)));
    $$('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeModal(backdrop);
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') $$('.modal-backdrop:not([hidden])').forEach(closeModal);
    });
  }

  async function initIndex() {
    await Promise.all([loadPublicConfig(), initializeIdentity()]);
    const profile = await loadProfile();
    const status = $('#linkStatus');
    const formCard = $('#linkFormCard');
    const linkedCard = $('#linkedCard');
    const pendingCard = $('#pendingCard');
    const previewCard = $('#previewCard');

    if (profile.linked && profile.approved) {
      linkedCard.hidden = false;
      formCard.hidden = true;
      pendingCard.hidden = true;
      $('#linkedName').textContent = `${profile.user.family_name} 様`;
      $('#linkedClient').textContent = `${profile.client.client_name} 様の情報に連携済みです。`;
      $('#openPortal').href = destination(profile);
      status.hidden = true;
      return;
    }

    if (profile.status === 'pending') {
      pendingCard.hidden = false;
      formCard.hidden = true;
      linkedCard.hidden = true;
      status.hidden = true;
      return;
    }

    formCard.hidden = false;
    status.hidden = true;
    const canApply = Boolean(state.identity?.lineUserId && state.identity.source !== 'browser-preview');
    if (!canApply) {
      previewCard.hidden = false;
      $('#submitLinkRequest').disabled = true;
      $$('input, select', $('#linkRequestForm')).forEach((field) => { field.disabled = true; });
    }

    let role = 'family';
    $$('.segment').forEach((button) => {
      button.addEventListener('click', () => {
        role = button.dataset.role;
        $$('.segment').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        $('#requestedRole').value = role;
      });
    });

    $('#linkRequestForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = $('#formError');
      errorBox.hidden = true;
      const form = new FormData(event.currentTarget);
      const button = $('#submitLinkRequest');
      button.disabled = true;
      button.textContent = '申請しています…';
      try {
        const result = await api('/line/link-request', {
          method: 'POST',
          body: {
            requested_role: role,
            applicant_name: form.get('applicant_name'),
            applicant_phone: form.get('applicant_phone'),
            client_number: form.get('client_number'),
            client_name: form.get('client_name')
          }
        });
        formCard.hidden = true;
        pendingCard.hidden = false;
        $('#pendingMessage').textContent = result.message;
        scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        showError(error, errorBox);
      } finally {
        button.disabled = false;
        button.textContent = 'LINE連携を申請する';
      }
    });
  }

  function renderHome(home, memberMode = false) {
    if (memberMode) {
      // ご本人画面では家族名や続柄を表示せず、本人情報として明確に表示する。
      $('#viewerName').textContent = `${home.client.client_name} 様`;
      $('#viewerRelationship').textContent = 'ご本人';
      $('#clientName').textContent = 'ご利用情報';
      $('#clientNumber').textContent = `利用者番号 ${home.client.client_number}`;
    } else {
      $('#viewerName').textContent = `${home.user.family_name} 様`;
      $('#viewerRelationship').textContent = home.user.relationship || 'ご家族';
      $('#clientName').textContent = `${home.client.client_name} 様`;
      $('#clientNumber').textContent = `利用者番号 ${home.client.client_number}`;
    }
    $('#upcomingCount').textContent = String(home.summary.upcoming_visits);
    $('#reportCount').textContent = String(home.summary.recent_reports);
    $('#messageCount').textContent = String(home.summary.open_messages);

    const next = home.next_visit;
    if (next) {
      $('#nextVisitDate').textContent = formatDateTime(next.planned_start, true);
      $('#nextVisitService').textContent = `${labels.service[next.service_type] || '訪問介護'}・${durationMinutes(next.planned_start, next.planned_end)}`;
      $('#nextVisitStatus').innerHTML = statusPill(next.status);
    } else {
      $('#nextVisitDate').textContent = '現在、表示できる訪問予定はありません';
      $('#nextVisitService').textContent = '予定については事業所へお問い合わせください。';
      $('#nextVisitStatus').innerHTML = '';
    }

    setList('#visitList', home.visits || [], visitItem, '今後の訪問予定はありません。');
    setList('#reportList', home.reports || [], reportItem, '公開されている訪問報告はありません。');
    setList('#messageList', home.messages || [], messageItem, '事業所との連絡履歴はありません。');

    if (!home.permissions.can_view_schedules) $('#visitsSection').innerHTML = '<div class="alert alert-info">訪問予定は事業所の設定により非表示です。</div>';
    if (!home.permissions.can_view_reports) $('#reportsSection').innerHTML = '<div class="alert alert-info">訪問報告は事業所の設定により非表示です。</div>';
    if (!home.permissions.can_send_messages) {
      $$('[data-open-modal="messageModal"], [data-open-modal="inquiryModal"]').forEach((button) => { button.disabled = true; });
      $('#contactPermissionNote').hidden = false;
    }

    if (home.demo) $('#demoBanner').hidden = false;
  }

  async function initPortal(memberMode) {
    await Promise.all([loadPublicConfig(), initializeIdentity()]);
    let home;
    try {
      home = await api(memberMode ? '/member/home' : '/family/home');
    } catch (error) {
      if (['LINE_LINK_NOT_APPROVED', 'LINE_LOGIN_REQUIRED'].includes(error.code)) {
        location.replace(`index.html${state.identity?.isDemo ? '?demo=1' : ''}`);
        return;
      }
      throw error;
    }
    state.home = home;
    if (memberMode && home.role !== 'client' && !home.demo) {
      location.replace('family.html');
      return;
    }
    if (!memberMode && home.role === 'client' && !home.demo) {
      location.replace('member.html');
      return;
    }
    renderHome(home, memberMode);
    bindModals();

    $('#refreshButton')?.addEventListener('click', async () => {
      setLoading(true, '最新情報を確認しています');
      try {
        state.home = await api(memberMode ? '/member/home' : '/family/home');
        renderHome(state.home, memberMode);
        toast('最新情報に更新しました。');
      } catch (error) {
        showError(error);
      } finally {
        setLoading(false);
      }
    });

    $('#loadAllVisits')?.addEventListener('click', async () => {
      const button = $('#loadAllVisits');
      button.disabled = true;
      try {
        const data = await api('/family/visits');
        setList('#visitList', data.visits || [], visitItem, '訪問予定はありません。');
        button.hidden = true;
      } catch (error) { showError(error); }
      finally { button.disabled = false; }
    });

    $('#loadAllReports')?.addEventListener('click', async () => {
      const button = $('#loadAllReports');
      button.disabled = true;
      try {
        const data = await api('/family/reports');
        setList('#reportList', data.reports || [], reportItem, '公開されている訪問報告はありません。');
        button.hidden = true;
      } catch (error) { showError(error); }
      finally { button.disabled = false; }
    });

    $('#loadAllMessages')?.addEventListener('click', async () => {
      const button = $('#loadAllMessages');
      button.disabled = true;
      try {
        const data = await api('/family/messages');
        setList('#messageList', data.messages || [], messageItem, '事業所との連絡履歴はありません。');
        button.hidden = true;
      } catch (error) { showError(error); }
      finally { button.disabled = false; }
    });

    $('#messageForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const submit = $('[type="submit"]', event.currentTarget);
      submit.disabled = true;
      try {
        const data = await api('/family/messages', {
          method: 'POST',
          body: {
            subject: form.get('subject'),
            message_text: form.get('message_text'),
            importance: form.get('importance')
          }
        });
        event.currentTarget.reset();
        closeModal('messageModal');
        toast(data.message);
        const messages = await api('/family/messages');
        setList('#messageList', messages.messages || [], messageItem, '事業所との連絡履歴はありません。');
      } catch (error) { showError(error, $('#messageError')); }
      finally { submit.disabled = false; }
    });

    $('#inquiryForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const submit = $('[type="submit"]', event.currentTarget);
      submit.disabled = true;
      try {
        const data = await api('/family/inquiries', {
          method: 'POST',
          body: {
            inquiry_type: form.get('inquiry_type'),
            subject: form.get('subject'),
            detail: form.get('detail'),
            urgency: form.get('urgency')
          }
        });
        event.currentTarget.reset();
        closeModal('inquiryModal');
        toast(data.message);
      } catch (error) { showError(error, $('#inquiryError')); }
      finally { submit.disabled = false; }
    });
  }

  async function boot() {
    setLoading(true);
    try {
      if (PAGE === 'index') await initIndex();
      else if (PAGE === 'family') await initPortal(false);
      else if (PAGE === 'member') await initPortal(true);
    } catch (error) {
      const fatal = $('#fatalError');
      if (fatal) showError(error, fatal);
      else showError(error);
    } finally {
      setLoading(false);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
