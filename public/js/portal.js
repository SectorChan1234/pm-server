// ==========================================================================
// ProjectBook Collaboration Portal - Core Bus & Shell Controller
// File: /public/js/portal.js
// Standard: Defensive Intranet Architecture (Zero External Dependencies)
// ==========================================================================

const token = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token');
const rawUser = JSON.parse(localStorage.getItem('pb_user') || sessionStorage.getItem('pb_user') || '{}');

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

let userProjects = [];
let currentProjectId = null;
let currentProjectRight = null;
let activeQuote = null;

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

function getProjectSelectElement() {
    return document.getElementById('projectSelect') || document.getElementById('currentProjectSelect');
}

async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isMutation = (method === 'POST' || method === 'PUT' || method === 'DELETE');

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

document.addEventListener('DOMContentLoaded', async () => {
    initHeaderUserInfo();
    initSidebarPreference();
    loadUnreadNotifications();
    loadTopShortcuts();

    await loadProjectsAndInit();

    if (window.PortalRouter) {
        window.PortalRouter.init({
            onSyncProject: syncZone4ProjectContext,
            onSyncMenu: syncSidebarMenuHighlight
        });
    }

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

    document.addEventListener('click', (e) => {
        closeUserMenu();
        closeShortcutMenu();

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

function initHeaderUserInfo() {
    const displayName = user.name || 'User';
    const initialEl = document.getElementById('userInitial');
    const nameEl = document.getElementById('headerUserName');
    if (initialEl) initialEl.textContent = displayName.trim().charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = displayName;

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

function initSidebarPreference() {
    const isCollapsed = localStorage.getItem('pb_sidebar_collapsed') === 'true';
    if (isCollapsed) {
        const workspaceEl = document.getElementById('mainWorkspace') || document.querySelector('.workspace');
        if (workspaceEl) {
            workspaceEl.classList.add('sidebar-collapsed');
        }
    }
}

function toggleSidebarCollapse() {
    const workspaceEl = document.getElementById('mainWorkspace') || document.querySelector('.workspace');
    if (!workspaceEl) return;

    workspaceEl.classList.toggle('sidebar-collapsed');
    const isCollapsed = workspaceEl.classList.contains('sidebar-collapsed');
    localStorage.setItem('pb_sidebar_collapsed', isCollapsed ? 'true' : 'false');
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
// Zone 2: My Shortcut Dropdown Management
// ==========================================================================
async function loadTopShortcuts() {
    const res = await api('/api/setting/shortcut/list');
    if (res && res.status === 'SUCCESS' && res.shortcuts) {
        if (window.PortalZone8 && typeof window.PortalZone8.renderTopShortcutMenu === 'function') {
            window.PortalZone8.renderTopShortcutMenu(res.shortcuts);
        }
    }
}

function toggleShortcutMenu(e) {
    e.stopPropagation();
    closeUserMenu();
    const menu = document.getElementById('shortcutMenu');
    if (menu) menu.classList.toggle('show');
}

function closeShortcutMenu() {
    const menu = document.getElementById('shortcutMenu');
    if (menu) menu.classList.remove('show');
}

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
// Central View Switcher
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

function registerView(actionKey, handlerFn) {
    if (window.PortalRouter) {
        window.PortalRouter.registerLegacyView(actionKey, handlerFn);
    } else {
        window.PB_Views[actionKey] = handlerFn;
    }
}

registerView('system-overview', renderSystemOverviewView);

// ==========================================================================
// Zone 4: Project Context & Folder Management Synchronization
// ==========================================================================
async function loadProjectsAndInit() {
    const [pjRes, folderRes] = await Promise.all([
        api('/api/portal/project/list'),
        api('/api/setting/folder/list').catch(() => null)
    ]);

    const select = getProjectSelectElement();
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Project --</option>';

    if (!pjRes || pjRes.status !== 'SUCCESS' || !pjRes.data || pjRes.data.length === 0) {
        userProjects = [];
        return;
    }

    userProjects = pjRes.data;

    const allFolders = (folderRes && folderRes.folders) ? folderRes.folders : [];
    const mappings = (folderRes && folderRes.mappings) ? folderRes.mappings : [];

    // 計算所有「已被指派到任何資料夾」的專案 ID 集合（全域排他）
    const allAssignedPjIds = new Set(mappings.map(m => Number(m.pjId)));

   // 篩選出需要呈現的資料夾（系統資料夾與自訂資料夾一律嚴格依據 zone4Visible === true 決定是否顯示）
    const visibleFolders = allFolders.filter(f => f.status === 'Enable' && f.zone4Visible === true);

    if (visibleFolders.length > 0) {
        visibleFolders.forEach(f => {
            const groupEl = document.createElement('optgroup');
            groupEl.label = `📁 ${f.folderName} ${f.isSystem ? '(System)' : ''}`;

            const matchedMappings = mappings.filter(m => m.folderName === f.folderName);
            matchedMappings.forEach(m => {
                const pj = userProjects.find(p => Number(p.pk_t01) === Number(m.pjId));
                if (pj) {
                    const opt = document.createElement('option');
                    opt.value = String(pj.pk_t01);
                    opt.textContent = `[${pj.pj_code}] ${pj.pj_name}`;
                    groupEl.appendChild(opt);
                }
            });

            if (groupEl.children.length > 0) {
                select.appendChild(groupEl);
            }
        });

        // 只有「從未被指派至任何資料夾」的專案，才歸入 Uncategorized Projects
        const trueUnassignedProjects = userProjects.filter(p => !allAssignedPjIds.has(Number(p.pk_t01)));
        if (trueUnassignedProjects.length > 0) {
            const unassignedGroup = document.createElement('optgroup');
            unassignedGroup.label = '📂 Uncategorized Projects';
            trueUnassignedProjects.forEach(pj => {
                const opt = document.createElement('option');
                opt.value = String(pj.pk_t01);
                opt.textContent = `[${pj.pj_code}] ${pj.pj_name}`;
                unassignedGroup.appendChild(opt);
            });
            select.appendChild(unassignedGroup);
        }
    } else {
        // 全域無自訂分組時的標準平鋪展示
        userProjects.forEach((pj) => {
            const opt = document.createElement('option');
            opt.value = String(pj.pk_t01);
            opt.textContent = `[${pj.pj_code}] ${pj.pj_name}`;
            select.appendChild(opt);
        });
    }

    if (currentProjectId) {
        select.value = String(currentProjectId);
    }
}

window.syncZone4WithFolderSettings = async function () {
    await loadProjectsAndInit();
};

async function syncZone4ProjectContext(targetPjId, targetView) {
    const select = getProjectSelectElement();

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
    closeShortcutMenu();
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
    closeShortcutMenu();
    const userMenu = document.getElementById('userMenu');
    if (userMenu) userMenu.classList.toggle('show');
}

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
                loadTopShortcuts();
                if (typeof window.invalidateEventRefsCache === 'function') {
                    window.invalidateEventRefsCache();
                }
            } catch (err) {
                console.error('[SyncGuard] Background sync error:', err);
            }
        }
    });
})();