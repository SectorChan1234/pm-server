// ==========================================================================
// ProjectBook Collaboration Portal - Core Bus & Shell Engine
// File: /public/js/portal.js
// Standard: Defensive Intranet Architecture (Zero External Dependencies)
// ==========================================================================

// Global Authentication State & Session Context
const token = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token');
const rawUser = JSON.parse(localStorage.getItem('pb_user') || sessionStorage.getItem('pb_user') || '{}');

// 身分欄位雙向大小寫相容 (CamelCase 與 Snake_case 雙向對齊)
const user = {
    ...rawUser,
    pk_t05: rawUser.pk_t05 || rawUser.pkT05,
    pkT05: rawUser.pkT05 || rawUser.pk_t05,
    st_right: rawUser.st_right || rawUser.stRight || '',
    stRight: rawUser.stRight || rawUser.st_right || '',
    name: rawUser.name || 'User',
    email: rawUser.email || ''
};

// Project & Navigation Context State
let userProjects = [];
let currentProjectId = null;
let currentProjectRight = null; // 'FULL', 'GENERAL', 'VIEWER', 'EVENT ONLY', 'ADMIN'
let currentThreadContext = { type: 'project', id: null };
let activeQuote = null;

// Global View Registry (Pluggable modules hook here)
window.PB_Views = window.PB_Views || {};

/**
 * 註冊視圖處理函式 (模組插拔接口)
 * @param {string} actionKey - 視圖識別碼 (例如: 'project-detail', 'project-phase')
 * @param {Function} handlerFn - 主工作畫布渲染函式
 */
function registerView(actionKey, handlerFn) {
    window.PB_Views[actionKey] = handlerFn;
}

// 註冊首頁/系統架構說明視圖
registerView('system-overview', renderSystemOverviewView);

// 基礎身分守衛 (Route Guard)：若未通過驗證，彈窗明確警示具體原因再跳轉
const effectiveUserId = user.pk_t05 || user.pkT05;
if (!token || !effectiveUserId) {
    const missingItems = [];
    if (!token) missingItems.push("Missing authentication token (pb_token)");
    if (!effectiveUserId) missingItems.push("Missing user identifier (pk_t05 / pkT05)");

    const diagnosticMsg = [
        "⚠️【Portal Route Guard Intercepted】",
        "System is redirecting back to index.html due to invalid session credentials:",
        "",
        `• Detected Reason: ${missingItems.join('; ')}`,
        `• Stored Token: ${token ? (token.substring(0, 12) + '...') : 'null'}`,
        `• User Data: ${JSON.stringify(rawUser)}`,
        "",
        "Click OK to return to sign-in page."
    ].join('\n');

    alert(diagnosticMsg);
    window.location.replace('/index.html');
}

/**
 * 取得專案下拉選單 DOM 元素 (防禦性雙向兼容)
 */
function getProjectSelectElement() {
    return document.getElementById('projectSelect') || document.getElementById('currentProjectSelect');
}

// ==========================================================================
// Central Fetch Helper & API Interceptor (整合 MutationGuard 生命週期防衛)
// ==========================================================================
async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isMutation = (method === 'POST' || method === 'PUT' || method === 'DELETE');

    // 1. 寫入前檢查 (斷線防護、印出起跑日誌)
    if (isMutation && window.MutationGuard && typeof window.MutationGuard.beforeMutation === 'function') {
        if (!window.MutationGuard.beforeMutation(path)) {
            return { status: 'FAILED', message: 'Mutation cancelled by guard' };
        }
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    options.headers = { ...headers, ...options.headers };

    try {
        const res = await fetch(path, options);
        if (res.status === 401) {
            alert(`⚠️【Session Expired (HTTP 401)】\nAPI endpoint rejected request: ${path}\nRedirecting to index.html.`);
            logout('API returned HTTP 401 Unauthorized from ' + path);
            return null;
        }
        const data = await res.json();

        // 2. 寫入成功後：全自動觸發階層式快取失效與審計日誌
        if (isMutation && data && data.status === 'SUCCESS') {
            if (window.MutationGuard && typeof window.MutationGuard.notifySuccess === 'function') {
                window.MutationGuard.notifySuccess(path, data);
            }
        }

        return data;
    } catch (err) {
        console.error('API Error:', err);
        return null;
    }
}

function logout(reason) {
    if (reason) {
        alert(`🚪【Portal Sign Out】\nTriggered by: ${reason}\nRedirecting to index.html.`);
    }

    localStorage.removeItem('pb_token');
    localStorage.removeItem('pb_user');
    localStorage.removeItem('pb_roles');
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('admin_user_id');
    localStorage.removeItem('admin_user_name');
    localStorage.removeItem('admin_user_email');
    localStorage.removeItem('admin_user_right');

    sessionStorage.clear();
    window.location.replace('/index.html');
}

// ==========================================================================
// Initialization & Global Event Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initHeaderUserInfo();
    loadUnreadNotifications();

    loadProjectsAndInit().then(() => {
        applyCurrentHashRoute();
    });

    window.addEventListener('hashchange', () => {
        applyCurrentHashRoute();
    });

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        if (href.startsWith('#') || href.includes('portal.html#')) {
            const hashPart = href.includes('#') ? href.split('#')[1] : '';
            if (hashPart) {
                e.preventDefault();
                window.location.hash = hashPart;
            }
        }
    });

    // 監聽專案選單變更事件
    const sel = getProjectSelectElement();
    if (sel) {
        sel.addEventListener('change', (e) => {
            const selectedVal = e.target.value;
            if (!selectedVal) {
                resetToOverview();
            } else {
                onCurrentProjectChanged(selectedVal);
            }
        });
    }
});

function initHeaderUserInfo() {
    const displayName = user.name || 'User';
    const initialEl = document.getElementById('userInitial');
    const nameEl = document.getElementById('headerUserName');
    if (initialEl) initialEl.textContent = displayName.trim().charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = displayName;

    const userRight = (user.st_right || user.stRight || '').toUpperCase();
    if (userRight === 'ADMIN') {
        const btnAdmin = document.getElementById('btnAdminConsole');
        if (btnAdmin) btnAdmin.style.display = 'inline-flex';
    }
}

async function loadUnreadNotifications() {
    const res = await api('/api/portal/message/unread-count');
    if (res && res.status === 'SUCCESS') {
        const badge = document.getElementById('unreadCount');
        if (badge) {
            if (res.unread_count > 0) {
                badge.textContent = res.unread_count;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }
}

// ==========================================================================
// Navigation & Accordion Controls
// ==========================================================================
function switchMainTab(tabKey) {
    document.querySelectorAll('.top-nav-btn').forEach(btn => btn.classList.remove('active'));

    if (tabKey === 'project') {
        const btn = document.getElementById('topNavProject');
        if (btn) btn.classList.add('active');
        expandOnlyAccordion('accGroupProject');
        if (currentProjectId) {
            switchView('project-detail');
        } else {
            resetToOverview();
        }
    } else if (tabKey === 'event') {
        const btn = document.getElementById('topNavEvent');
        if (btn) btn.classList.add('active');
        expandOnlyAccordion('accGroupEvent');
        switchView('my-handle-event');
    } else if (tabKey === 'mission') {
        const btn = document.getElementById('topNavMission');
        if (btn) btn.classList.add('active');
        expandOnlyAccordion('accGroupMission');
        switchView('my-handle-mission');
    }
}

function toggleAccordion(accGroupId) {
    const group = document.getElementById(accGroupId);
    if (!group) return;
    group.classList.toggle('expanded');
    const arrow = group.querySelector('.acc-arrow');
    if (arrow) {
        arrow.textContent = group.classList.contains('expanded') ? '▼' : '▶';
    }
}

function expandOnlyAccordion(accGroupId) {
    document.querySelectorAll('.acc-group').forEach(grp => {
        const arrow = grp.querySelector('.acc-arrow');
        if (grp.id === accGroupId) {
            grp.classList.add('expanded');
            if (arrow) arrow.textContent = '▼';
        } else {
            grp.classList.remove('expanded');
            if (arrow) arrow.textContent = '▶';
        }
    });
}

function syncSidebarMenuHighlight(viewAction) {
    document.querySelectorAll('.acc-item').forEach(it => it.classList.remove('active'));
    if (!viewAction) return;

    const targetItem = document.querySelector(`.acc-item[onclick*="'${viewAction}'"]`);
    if (targetItem) {
        targetItem.classList.add('active');

        const parentGroup = targetItem.closest('.acc-group');
        if (parentGroup && !parentGroup.classList.contains('expanded')) {
            parentGroup.classList.add('expanded');
            const arrow = parentGroup.querySelector('.acc-arrow');
            if (arrow) arrow.textContent = '▼';
        }
    }
}

// ==========================================================================
// Central View Switcher & Dispatcher
// ==========================================================================
function switchView(viewName) {
    if (!viewName) return;

    syncSidebarMenuHighlight(viewName);

    if (currentProjectId) {
        if (viewName === 'project-detail') {
            history.replaceState(null, '', `${window.location.pathname}#pj=${currentProjectId}`);
        } else {
            history.replaceState(null, '', `${window.location.pathname}#pj=${currentProjectId}&view=${viewName}`);
        }
    } else {
        history.replaceState(null, '', `${window.location.pathname}#view=${viewName}`);
    }

    if (typeof window.PB_Views[viewName] === 'function') {
        window.PB_Views[viewName]();
    } else {
        console.warn(`[ProjectBook] No view handler registered for action: ${viewName}`);
        const contentEl = document.getElementById('viewContent');
        if (contentEl) {
            contentEl.innerHTML = `<div class="empty-placeholder">Module action [${escapeHtml(viewName)}] is not loaded.</div>`;
        }
    }
}

function handleMenuAction(actionKey) {
    switchView(actionKey);
}

// ==========================================================================
// Deep Linking (URL Hash Router) & Project Context Switcher
// ==========================================================================
async function loadProjectsAndInit() {
    const res = await api('/api/portal/project/list');
    const select = getProjectSelectElement();
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Project --</option>';

    if (!res || res.status !== 'SUCCESS' || !res.data || res.data.length === 0) {
        userProjects = [];
        return;
    }

    userProjects = res.data;
    userProjects.forEach((pj) => {
        const opt = document.createElement('option');
        opt.value = String(pj.pk_t01);
        opt.textContent = `[${pj.pj_code}] ${pj.pj_name}`;
        select.appendChild(opt);
    });

    if (currentProjectId) {
        select.value = String(currentProjectId);
    }
}

function onCurrentProjectChanged(pjId, targetView) {
    if (!pjId) {
        resetToOverview();
        return;
    }

    currentProjectId = parseInt(pjId, 10);
    const selectedPj = userProjects.find(p => p.pk_t01 === currentProjectId);

    const select = getProjectSelectElement();
    if (select) {
        select.value = String(currentProjectId);
    }

    if (selectedPj) {
        currentProjectRight = (selectedPj.my_right || '').toUpperCase();
        
        const headingEl = document.getElementById('viewHeading');
        const roleEl = document.getElementById('viewRole');
        if (headingEl) headingEl.textContent = `[${selectedPj.pj_code}] ${selectedPj.pj_name}`;
        if (roleEl) roleEl.textContent = `Role: ${currentProjectRight || 'MEMBER'}`;

        const canManageMember = (currentProjectRight === 'FULL');
        const menuManageMember = document.getElementById('menuManageMember');
        if (menuManageMember) menuManageMember.style.display = canManageMember ? 'block' : 'none';

        const viewAction = targetView || 'project-detail';

        if (typeof window.invalidateEventRefsCache === 'function') {
            window.invalidateEventRefsCache();
        }

        if (viewAction === 'project-detail') {
            history.replaceState(null, '', `${window.location.pathname}#pj=${currentProjectId}`);
        } else {
            history.replaceState(null, '', `${window.location.pathname}#pj=${currentProjectId}&view=${viewAction}`);
        }

        syncSidebarMenuHighlight(viewAction);

        if (typeof window.PB_Views[viewAction] === 'function') {
            window.PB_Views[viewAction]();
        }

        loadThread({ pj: currentProjectId }, `Project: ${selectedPj.pj_name}`, 'Project Level');
    }
}

async function applyCurrentHashRoute() {
    let hash = window.location.hash.replace(/^#/, '');

    if (!userProjects || userProjects.length === 0) {
        renderSystemOverviewView();
        return;
    }

    if (!hash) {
        resetToOverview();
        return;
    }

    const params = new URLSearchParams(hash);
    const pjParam = params.get('pj');
    const viewParam = params.get('view');

    if (pjParam) {
        const pjId = parseInt(pjParam, 10);
        const targetPj = userProjects.find(p => p.pk_t01 === pjId);

        if (targetPj) {
            onCurrentProjectChanged(pjId, viewParam);
            return;
        } else {
            const checkRes = await api(`/api/portal/project/check-access?pj=${pjId}`);
            if (checkRes && checkRes.status === 'NOT_FOUND') {
                alert(`【Project Not Found】\nProject [ID: ${pjId}] does not exist.`);
            } else if (checkRes && checkRes.status === 'FORBIDDEN') {
                alert(`【Access Denied (403 Forbidden)】\n${checkRes.message}`);
            } else {
                alert(`【Access Error】\nUnable to access project [ID: ${pjId}].`);
            }
            resetToOverview();
            return;
        }
    }

    if (viewParam) {
        switchView(viewParam);
        return;
    }

    resetToOverview();
}

function resetToOverview() {
    currentProjectId = null;
    currentProjectRight = null;

    const select = getProjectSelectElement();
    if (select) select.value = '';

    const menuManageMember = document.getElementById('menuManageMember');
    if (menuManageMember) menuManageMember.style.display = 'none';

    history.replaceState(null, '', `${window.location.pathname}#view=system-overview`);
    syncSidebarMenuHighlight('');

    const threadTitle = document.getElementById('threadTitle');
    const threadScope = document.getElementById('threadScope');
    const threadMessages = document.getElementById('threadMessages');
    if (threadTitle) threadTitle.textContent = 'Discussion Thread';
    if (threadScope) threadScope.textContent = 'System Scope';
    if (threadMessages) {
        threadMessages.innerHTML = '<div class="empty-placeholder">Select a project, event, or mission to view messages.</div>';
    }

    renderSystemOverviewView();
}

function renderSystemOverviewView() {
    const headingEl = document.getElementById('viewHeading');
    const roleEl = document.getElementById('viewRole');
    const contentEl = document.getElementById('viewContent');

    if (headingEl) headingEl.textContent = 'ProjectBook Architecture & Governance Guide';
    if (roleEl) roleEl.textContent = 'Role: System Overview';

    if (contentEl) {
        contentEl.innerHTML = `
            <div style="padding: 24px; max-width: 1080px; margin: 0 auto;">
                <div id="overviewDiagramContainer" style="background: #ffffff; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 36px 20px; text-align: center; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="font-size: 42px; margin-bottom: 12px;">🗺️</div>
                    <h3 style="color: #1e293b; margin: 0 0 8px 0; font-size: 18px;">ProjectBook System Architecture & Workflow Diagram</h3>
                    <p style="color: #64748b; font-size: 13px; margin: 0 auto; max-width: 640px;">
                        This placeholder is reserved for the system architecture diagram. It provides a visual walkthrough of Project hierarchy, Event scheduling, Mission assignments, and zero-trust permission models.
                    </p>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px;">
                        <h4 style="margin: 0 0 10px 0; color: #0f172a; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                            <span>🏢</span> Multi-Tier Hierarchy
                        </h4>
                        <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0;">
                            <strong>Project:</strong> Top-level operational scope.<br>
                            <strong>Phase:</strong> Sequential milestones (Cascading freeze inheritance).<br>
                            <strong>Event:</strong> Schedule timeline tracked on the Split-Rail Gantt.<br>
                            <strong>Mission:</strong> Execution assignments linked directly to Events.
                        </p>
                    </div>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px;">
                        <h4 style="margin: 0 0 10px 0; color: #0f172a; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                            <span>🛡️</span> Project Role Rights
                        </h4>
                        <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0;">
                            <strong>FULL:</strong> Project Owner. Complete control, role assignment, freeze/delete.<br>
                            <strong>GENERAL:</strong> Standard Editor. Manage Phases, Events, and Missions.<br>
                            <strong>VIEWER:</strong> Absolute Veto. Read-only across all modules.<br>
                            <strong>EVENT ONLY:</strong> Restricted strictly to assigned sub-events.
                        </p>
                    </div>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px;">
                        <h4 style="margin: 0 0 10px 0; color: #0f172a; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                            <span>🚀</span> Quick Start
                        </h4>
                        <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0;">
                            Select a project from the <strong>CURRENT PROJECT</strong> dropdown on the top-left sidebar to open its dashboard and timeline, or click <strong>+ New Project</strong> to register a new initiative.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
}

// ==========================================================================
// Discussion Thread Drawer Engine
// ==========================================================================
async function loadThread(paramObj, displayTitle, scopeLabel) {
    currentThreadContext = paramObj;
    const titleEl = document.getElementById('threadTitle');
    const scopeEl = document.getElementById('threadScope');
    const container = document.getElementById('threadMessages');

    if (titleEl) titleEl.textContent = displayTitle;
    if (scopeEl) scopeEl.textContent = scopeLabel;
    if (!container) return;

    container.innerHTML = '<div class="empty-placeholder">Loading messages...</div>';

    const qs = new URLSearchParams(paramObj).toString();
    const res = await api(`/api/portal/message/thread?${qs}`);

    if (!res || res.status !== 'SUCCESS') {
        container.innerHTML = '<div class="empty-placeholder">Unable to load messages.</div>';
        return;
    }

    if (res.messages.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No messages in this discussion yet.</div>';
        return;
    }

    container.innerHTML = '';
    res.messages.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        let quoteHtml = '';
        if (msg.quote) {
            quoteHtml = `<div class="bubble-quote"><strong>${escapeHtml(msg.quote.from_name)}:</strong> ${escapeHtml(msg.quote.snippet)}</div>`;
        }

        bubble.innerHTML = `
            <div class="bubble-meta">
                <span><strong>${escapeHtml(msg.from_name)}</strong></span>
                <span>${msg.created_datetime ? msg.created_datetime.substring(5, 16) : ''}</span>
            </div>
            ${quoteHtml}
            <div class="bubble-text">${escapeHtml(msg.message)}</div>
            <div class="bubble-actions">
                <button type="button" class="btn-link" onclick="setQuote(${msg.pk_t08}, '${escapeHtml(msg.from_name)}', '${escapeHtml(msg.message)}')">Quote</button>
            </div>
        `;
        container.appendChild(bubble);
    });

    container.scrollTop = container.scrollHeight;
}

function refreshCurrentThread() {
    if (currentThreadContext && currentThreadContext.id) {
        const titleEl = document.getElementById('threadTitle');
        const scopeEl = document.getElementById('threadScope');
        loadThread(currentThreadContext, titleEl ? titleEl.textContent : '', scopeEl ? scopeEl.textContent : '');
    }
}

function setQuote(pkT08, author, text) {
    const snippet = text.length > 36 ? text.substring(0, 36) + '...' : text;
    activeQuote = { pk_t08: pkT08, from_name: author, snippet: snippet };
    const label = document.getElementById('quoteLabel');
    const banner = document.getElementById('quoteBanner');
    const commentInput = document.getElementById('commentText');

    if (label) label.textContent = `Replying to ${author}: "${snippet}"`;
    if (banner) banner.style.display = 'flex';
    if (commentInput) commentInput.focus();
}

function cancelQuote() {
    activeQuote = null;
    const banner = document.getElementById('quoteBanner');
    if (banner) banner.style.display = 'none';
}

function handleCommentKeyDown(event) {
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        submitComment();
    }
}

async function submitComment() {
    const input = document.getElementById('commentText');
    if (!input) return;
    const message = input.value.trim();
    if (!message) return;

    const payload = {
        message: message,
        fk_t08_pk_t01: currentThreadContext.pj || currentProjectId,
        fk_t08_pk_t03: currentThreadContext.ev || null,
        fk_t08_pk_t04: currentThreadContext.ms || null,
        fk_t08_pk_t08_quote: activeQuote ? activeQuote.pk_t08 : null
    };

    const res = await api('/api/portal/message/send', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (res && res.status === 'SUCCESS') {
        input.value = '';
        cancelQuote();
        refreshCurrentThread();
    } else {
        alert('Failed to send comment: ' + (res ? res.message : 'Server error'));
    }
}

// ==========================================================================
// Modal Utilities & Password Change Center
// ==========================================================================
function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'flex';
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
}

function closeUserMenu() {
    const userMenu = document.getElementById('userMenu');
    if (userMenu) userMenu.classList.remove('show');
}

function openPasswordModal() {
    closeUserMenu();
    const oldInput = document.getElementById('oldPwdInput');
    const newInput = document.getElementById('newPwdInput');
    const confInput = document.getElementById('confirmPwdInput');

    if (oldInput) oldInput.value = '';
    if (newInput) newInput.value = '';
    if (confInput) confInput.value = '';

    openModal('pwdModal');
}

async function submitPasswordChange() {
    const oldPwd = (document.getElementById('oldPwdInput').value || '').trim();
    const newPwd = (document.getElementById('newPwdInput').value || '').trim();
    const confirmPwd = (document.getElementById('confirmPwdInput').value || '').trim();

    if (!oldPwd || !newPwd || !confirmPwd) {
        alert('All password fields are required.');
        return;
    }
    if (newPwd !== confirmPwd) {
        alert('New passwords do not match. Please verify and re-enter.');
        document.getElementById('confirmPwdInput').focus();
        return;
    }
    if (newPwd.length < 6) {
        alert('New password must be at least 6 characters long.');
        document.getElementById('newPwdInput').focus();
        return;
    }
    if (newPwd === oldPwd) {
        alert('New password cannot be the same as your current password.');
        document.getElementById('newPwdInput').focus();
        return;
    }

    const res = await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
            old_password: oldPwd,
            new_password: newPwd
        })
    });

    if (res && res.status === 'SUCCESS') {
        alert('Password updated successfully. Please sign in again with your new credentials.');
        closeModal('pwdModal');
        logout();
    } else {
        alert('Password update failed: ' + (res ? res.message : 'Server error'));
    }
}

function resetToHome() {
    resetToOverview();
}

function toggleUserMenu(e) {
    e.stopPropagation();
    const notifMenu = document.getElementById('notifMenu');
    const userMenu = document.getElementById('userMenu');
    if (notifMenu) notifMenu.classList.remove('show');
    if (userMenu) userMenu.classList.toggle('show');
}

function toggleNotifMenu(e) {
    e.stopPropagation();
    const userMenu = document.getElementById('userMenu');
    const notifMenu = document.getElementById('notifMenu');
    if (userMenu) userMenu.classList.remove('show');
    if (notifMenu) notifMenu.classList.toggle('show');
}

document.addEventListener('click', () => {
    closeUserMenu();
    const notifMenu = document.getElementById('notifMenu');
    if (notifMenu) notifMenu.classList.remove('show');
});

// ==========================================================================
// Focus / Visibility Re-validation
// ==========================================================================
(function initVisibilitySyncGuard() {
    let lastBlurTimestamp = Date.now();
    const MIN_BACKGROUND_DURATION_MS = 10000;

    window.addEventListener('blur', () => {
        lastBlurTimestamp = Date.now();
        console.log(`%c[SyncGuard] 👁️ User switched away from tab at ${new Date().toLocaleTimeString()}`, 'color: #64748b; font-size: 11px;');
    });

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            const awayDurationMs = Date.now() - lastBlurTimestamp;
            const awayDurationSec = (awayDurationMs / 1000).toFixed(1);

            if (awayDurationMs < MIN_BACKGROUND_DURATION_MS) {
                console.log(`%c[SyncGuard] ⏭️ Skip background sync (Away for ${awayDurationSec}s < 10s)`, 'color: #94a3b8; font-style: italic;');
                return;
            }

            console.group(`%c[SyncGuard] 🔄 Triggering background re-validation (Away for ${awayDurationSec}s)...`, 'color: #0284c7; font-weight: bold;');

            if (typeof token === 'undefined' || !token) {
                console.warn('[SyncGuard] User not logged in, aborted.');
                console.groupEnd();
                return;
            }

            try {
                if (typeof loadProjectsAndInit === 'function') {
                    console.log('[SyncGuard] 1. Re-validating Project Roster & Roles...');
                    await loadProjectsAndInit();
                }

                if (typeof window.invalidateEventRefsCache === 'function') {
                    console.log('[SyncGuard] 2. Invalidating stale Event & Phase caches...');
                    window.invalidateEventRefsCache();
                }

                console.log(`%c[SyncGuard] ✅ Completed at ${new Date().toLocaleTimeString()} - Context synchronized.`, 'color: #16a34a; font-weight: bold;');
            } catch (err) {
                console.error('[SyncGuard] ❌ Background sync encountered error:', err);
            } finally {
                console.groupEnd();
            }
        }
    });
})();