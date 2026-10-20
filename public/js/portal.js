// ==========================================================================
// ProjectBook Collaboration Portal - Core Bus & Shell Controller
// File: /public/js/portal.js
// Standard: Defensive Intranet Architecture (Zero External Dependencies)
// ==========================================================================

// Global Authentication State & Session Context (對齊 Stage 1 雙向相容金鑰)
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
    email: rawUser.email || '',
    fkT05PkT01Custom: rawUser.fkT05PkT01Custom || rawUser.fk_t05_pk_t01_custom || 0
};

// Project & Context State
let userProjects = [];
let currentProjectId = null;
let currentProjectRight = null; // 'FULL', 'GENERAL', 'VIEWER', 'EVENT ONLY', 'ADMIN'
let activeQuote = null;

// 基礎身分守衛 (Route Guard)：未通過驗證則彈窗明確警示並跳轉
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
        if (isMutation && data && (data.status === 'SUCCESS' || data.success === true)) {
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
    localStorage.removeItem('adminToken');
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
document.addEventListener('DOMContentLoaded', async () => {
    initHeaderUserInfo();
    initSidebarPreference();
    loadUnreadNotifications();

    // 載入專案選單資料庫清單
    await loadProjectsAndInit();

    // 啟動通用路由器分發引擎 (注入 Zone 4 專案同步與左側選單高亮回呼)
    if (window.PortalRouter) {
        window.PortalRouter.init({
            onSyncProject: syncZone4ProjectContext,
            onSyncMenu: syncSidebarMenuHighlight
        });
    }

    // 綁定 Zone 4 專案下拉選單變更事件 (主動切換專案)
    const sel = getProjectSelectElement();
    if (sel) {
        sel.addEventListener('change', (e) => {
            const selectedVal = e.target.value;
            if (!selectedVal) {
                resetToOverview();
            } else {
                window.PortalRouter.navigateToProject(selectedVal, 'project-detail');
            }
        });
    }

    // 攔截頁面內局部深層錨點點擊
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
});

/**
 * [職責] 初始化 Zone 3 使用者中心與零信任 Admin Console 進入按鈕
 */
function initHeaderUserInfo() {
    const displayName = user.name || 'User';
    const initialEl = document.getElementById('userInitial');
    const nameEl = document.getElementById('headerUserName');
    if (initialEl) initialEl.textContent = displayName.trim().charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = displayName;

    // ★ 零信任安全注入：僅當身分為 ADMIN 時動態建立 DOM 節點插入 #adminActionSlot
    const userRight = (user.st_right || user.stRight || '').toUpperCase();
    const adminSlot = document.getElementById('adminActionSlot');
    if (adminSlot) {
        adminSlot.innerHTML = '';
        if (userRight === 'ADMIN') {
            const adminBtn = document.createElement('a');
            adminBtn.href = '/admin/DB_TableControl.html';
            adminBtn.className = 'btn-admin';
            adminBtn.id = 'btnAdminConsole';
            adminBtn.innerHTML = '⚙ Admin Console';
            adminSlot.appendChild(adminBtn);
        }
    }
}

/**
 * [職責] 初始化 Zone 1 側欄偏好狀態 (向後端 SettingRefHandler 查詢)
 */
async function initSidebarPreference() {
    const res = await api('/api/setting/sidebar-pref');
    if (res && res.status === 'SUCCESS' && res.collapsed === true) {
        const workspaceEl = document.getElementById('mainWorkspace') || document.querySelector('.workspace');
        if (workspaceEl) {
            workspaceEl.classList.add('sidebar-collapsed');
        }
    }
}

/**
 * [職責] 切換 Zone 1 側欄收合狀態，並非同步持久化至 T00_Ref (0 台帳污染)
 */
async function toggleSidebarCollapse() {
    const workspaceEl = document.getElementById('mainWorkspace') || document.querySelector('.workspace');
    if (!workspaceEl) return;

    workspaceEl.classList.toggle('sidebar-collapsed');
    const isCollapsed = workspaceEl.classList.contains('sidebar-collapsed');

    // 非同步向後端同步偏好 (即使失敗亦不影響前台操作流暢度)
    await api('/api/setting/sidebar-pref', {
        method: 'POST',
        body: JSON.stringify({ collapsed: isCollapsed })
    });
}

/**
 * [職責] 讀取並更新未讀通知數量 (Zone 3 鈴鐺標籤)
 */
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

/**
 * [職責] 點擊 Zone 3 鈴鐺切換 Zone 9 隨選列表面板
 */
function toggleNotificationsSidePanel(event) {
    if (event) {
        event.stopPropagation();
    }
    if (window.PortalRouter) {
        window.PortalRouter.toggleSidePanel('notifications');
    }
}

// ==========================================================================
// Navigation & Accordion Controls (Zone 2, Zone 5–8)
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
// Central View Switcher (委派予 PortalRouter)
// ==========================================================================
function switchView(viewName) {
    if (!viewName) return;
    if (window.PortalRouter) {
        window.PortalRouter.switchView(viewName);
    }
}

function handleMenuAction(actionKey) {
    switchView(actionKey);
}

// 向下相容全域 registerView 註冊入口
function registerView(actionKey, handlerFn) {
    if (window.PortalRouter) {
        window.PortalRouter.registerLegacyView(actionKey, handlerFn);
    } else {
        window.PB_Views[actionKey] = handlerFn;
    }
}

// 註冊首頁系統架構說明視圖
registerView('system-overview', renderSystemOverviewView);

// ==========================================================================
// Zone 4: Project Context & Deep Linking Synchronization
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

/**
 * [職責] 被動接收 PortalRouter 的分發通知，同步 Zone 4 專案上下文與權限
 */
async function syncZone4ProjectContext(targetPjId, targetView) {
    const select = getProjectSelectElement();

    // 1. 若無指定專案 (pj == null)
    if (!targetPjId) {
        currentProjectId = null;
        currentProjectRight = null;
        if (select) select.value = '';
        const menuManageMember = document.getElementById('menuManageMember');
        if (menuManageMember) menuManageMember.style.display = 'none';
        return true;
    }

    const numericPj = parseInt(targetPjId, 10);
    const matchedPj = userProjects.find(p => p.pk_t01 === numericPj);

    // 2. 若清單中有此專案，立即同步上下文
    if (matchedPj) {
        currentProjectId = numericPj;
        currentProjectRight = (matchedPj.my_right || '').toUpperCase();
        if (select) select.value = String(currentProjectId);

        const canManageMember = (currentProjectRight === 'FULL' || currentProjectRight === 'ADMIN');
        const menuManageMember = document.getElementById('menuManageMember');
        if (menuManageMember) menuManageMember.style.display = canManageMember ? 'block' : 'none';

        if (typeof window.invalidateEventRefsCache === 'function') {
            window.invalidateEventRefsCache();
        }
        return true;
    }

    // 3. 若清單未命中，向後端核驗權限
    const checkRes = await api(`/api/portal/project/check-access?pj=${numericPj}`);
    if (checkRes && checkRes.status === 'NOT_FOUND') {
        alert(`【Project Not Found】\nProject [ID: ${numericPj}] does not exist.`);
        resetToOverview();
        return false;
    } else if (checkRes && checkRes.status === 'FORBIDDEN') {
        alert(`【Access Denied (403 Forbidden)】\n${checkRes.message}`);
        resetToOverview();
        return false;
    } else if (checkRes && checkRes.status === 'AUTHORIZED') {
        await loadProjectsAndInit();
        currentProjectId = numericPj;
        if (select) select.value = String(currentProjectId);
        return true;
    }

    alert(`【Access Error】\nUnable to access project [ID: ${numericPj}].`);
    resetToOverview();
    return false;
}

function resetToOverview() {
    if (window.PortalRouter) {
        window.PortalRouter.navigateToProject(null, 'system-overview');
    }
}

function resetToHome() {
    resetToOverview();
}

/**
 * [職責] 渲染 Zone 11 首頁系統架構與治理導引 (System Overview)
 */
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
                        This workspace is governed by a zero-trust multi-tier hierarchy: Projects contain sequential Phases, Phases schedule Events on the Split-Rail Gantt, and Events dispatch actionable Missions.
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
// Zone 10: Discussion Thread Engine
// ==========================================================================
async function renderThreadMessagesInZone10(queryObj, displayTitle, scopeLabel) {
    const titleEl = document.getElementById('threadTitle');
    const scopeEl = document.getElementById('threadScope');
    const container = document.getElementById('threadMessages');

    if (titleEl) titleEl.textContent = displayTitle;
    if (scopeEl) scopeEl.textContent = scopeLabel;
    if (!container) return;

    container.innerHTML = '<div class="empty-placeholder">Loading messages...</div>';

    const qs = new URLSearchParams(queryObj).toString();
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
    if (window.PortalRouter) {
        const params = window.PortalRouter.getCurrentParams();
        if (params.msgId) {
            window.PortalRouter.openSideDetail(params.msgId);
        }
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

    const routerParams = window.PortalRouter ? window.PortalRouter.getCurrentParams() : {};
    const msgId = String(routerParams.msgId || '');

    let pjId = currentProjectId || routerParams.pj || null;
    let evId = routerParams.ev || null;
    let msId = routerParams.ms || null;

    if (msgId.startsWith('MS_')) msId = parseInt(msgId.replace('MS_', ''), 10);
    else if (msgId.startsWith('EV_')) evId = parseInt(msgId.replace('EV_', ''), 10);
    else if (msgId.startsWith('PJ_')) pjId = parseInt(msgId.replace('PJ_', ''), 10);

    const payload = {
        message: message,
        fk_t08_pk_t01: pjId,
        fk_t08_pk_t03: evId,
        fk_t08_pk_t04: msId,
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

    if (res && (res.status === 'SUCCESS' || res.success === true)) {
        alert('Password updated successfully. Please sign in again with your new credentials.');
        closeModal('pwdModal');
        logout('Password changed');
    } else {
        alert('Password update failed: ' + (res ? res.message : 'Server error'));
    }
}

function toggleUserMenu(e) {
    e.stopPropagation();
    const userMenu = document.getElementById('userMenu');
    if (userMenu) userMenu.classList.toggle('show');
}

document.addEventListener('click', () => {
    closeUserMenu();
});

// ==========================================================================
// Focus / Visibility Re-validation
// ==========================================================================
(function initVisibilitySyncGuard() {
    let lastBlurTimestamp = Date.now();
    const MIN_BACKGROUND_DURATION_MS = 10000;

    window.addEventListener('blur', () => {
        lastBlurTimestamp = Date.now();
    });

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            const awayDurationMs = Date.now() - lastBlurTimestamp;
            if (awayDurationMs < MIN_BACKGROUND_DURATION_MS) return;

            if (!token) return;

            try {
                await loadProjectsAndInit();
                if (typeof window.invalidateEventRefsCache === 'function') {
                    window.invalidateEventRefsCache();
                }
            } catch (err) {
                console.error('[SyncGuard] Background sync error:', err);
            }
        }
    });
})();
