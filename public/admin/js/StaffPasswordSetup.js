/**
 * 同仁帳號與密碼加鹽治理控制器 (Staff & Salted Password Governance Controller)
 * File: /public/admin/js/StaffPasswordSetup.js
 * Standard: Defensive Intranet Architecture (Zero External Dependencies)
 *
 * 職責與邊界：
 * 1. 權限守衛：相容 pb_token, pb_user (portal.js 標準) 與 adminToken, admin_user_right (後台標準)。
 * 2. 驗證 Stage 1 加鹽成果：以可視化徽章即時標註「🔒 Salted SHA-256」與「⚠️ Legacy Unsalted」。
 * 3. 執行管理員密碼重設 (強制加鹽並剔除會話)、帳號啟用/停用與新建同仁。
 * 4. 提供頂部導航列跳轉回 portal.html 與切換至 DB_TableControl.html。
 */

let currentAuth = null;
let projectOptions = [];

document.addEventListener('DOMContentLoaded', () => {
    if (!verifyAdminAuth()) {
        return;
    }
    initHeaderLinks();
    initEventListeners();
    loadProjectOptions();
    loadStaffList();
});

/**
 * [職責] 多軌相容驗證管理員身分 (支援 portal.html 與後台所有憑證金鑰)
 */
function verifyAdminAuth() {
    const token = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token') ||
                  localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken') ||
                  localStorage.getItem('token') || sessionStorage.getItem('token');

    let userObj = {};
    try {
        userObj = JSON.parse(
            localStorage.getItem('pb_user') || sessionStorage.getItem('pb_user') ||
            localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || '{}'
        );
    } catch (e) {
        userObj = {};
    }

    const right = (
        userObj.st_right || userObj.stRight ||
        localStorage.getItem('admin_user_right') || sessionStorage.getItem('admin_user_right') || ''
    ).toUpperCase();

    if (!token || right !== 'ADMIN') {
        alert('⚠️【Access Denied】\nAdministrator privileges required to access Staff & Password Governance.\nRedirecting to Admin Sign In.');
        window.location.replace('admin_login.html');
        return false;
    }

    currentAuth = {
        token: token,
        email: userObj.email || localStorage.getItem('admin_user_email') || 'Admin',
        name: userObj.name || localStorage.getItem('admin_user_name') || 'Administrator',
        pkT05: userObj.pkT05 || userObj.pk_t05 || localStorage.getItem('admin_user_id') || 1
    };

    // 顯示管理員資訊
    const adminLabel = document.getElementById('adminUserDisplay') || document.getElementById('currentAdminName');
    if (adminLabel) {
        adminLabel.textContent = `${currentAuth.name} (${currentAuth.email})`;
    }

    return true;
}

/**
 * [職責] 初始化頂部導航列快速跳轉按鈕
 */
function initHeaderLinks() {
    // 尋找或注入導航連結
    const headerNav = document.querySelector('.admin-nav') || document.querySelector('.admin-header-actions');
    if (headerNav && !document.getElementById('navBackPortal')) {
        const portalLink = document.createElement('a');
        portalLink.id = 'navBackPortal';
        portalLink.href = '../portal.html';
        portalLink.className = 'btn-link-nav';
        portalLink.style.cssText = 'color: #38bdf8; text-decoration: none; font-size: 0.82rem; margin-right: 1rem; font-weight: 500;';
        portalLink.innerHTML = '← Return to Portal Workspace';
        headerNav.prepend(portalLink);
    }
}

/**
 * [職責] 統一 API 請求封裝 (自動附帶 Bearer Token)
 */
async function adminFetch(url, options = {}) {
    const headers = {
        'Authorization': `Bearer ${currentAuth.token}`,
        'Content-Type': 'application/json'
    };
    options.headers = { ...headers, ...options.headers };

    try {
        const res = await fetch(url, options);
        if (res.status === 401 || res.status === 403) {
            alert('⚠️【Session Expired / Unauthorized】\nYour administrative session has expired. Please sign in again.');
            window.location.replace('admin_login.html');
            return null;
        }
        return await res.json();
    } catch (err) {
        console.error('Admin API Network Error:', err);
        showBanner(`Network request failed: ${err.message}`, 'error');
        return null;
    }
}

/**
 * [職責] 載入外判專案選單
 */
async function loadProjectOptions() {
    const data = await adminFetch('/api/admin/projects/options');
    if (!data || !data.success) return;

    projectOptions = data.projects || [];
    const select = document.getElementById('staffCustomProject') || document.getElementById('newStaffProject');
    if (!select) return;

    select.innerHTML = '<option value="0">-- Internal Staff (No Project Restriction) --</option>';
    projectOptions.forEach(p => {
        const opt = document.createElement('option');
        opt.value = String(p.pkT01);
        opt.textContent = `[${p.pjCode}] ${p.pjName}`;
        select.appendChild(opt);
    });
}

/**
 * [職責] 載入全體人員清單並呈現 Salted 雜湊診斷徽章
 */
async function loadStaffList() {
    const tableBody = document.getElementById('staffTableBody') || document.querySelector('#staffTable tbody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#64748b;">Loading staff records & password security metrics...</td></tr>';

    const data = await adminFetch('/api/admin/staff/list');
    if (!data || !data.success) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#ef4444;">Failed to load staff list. Ensure backend server is operational.</td></tr>';
        return;
    }

    const list = data.staffList || [];
    if (list.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#64748b;">No staff records found in T05_Staff.</td></tr>';
        return;
    }

    tableBody.innerHTML = '';
    list.forEach(staff => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e2e8f0';

        // 密碼安全狀態徽章 (直接檢驗 Stage 1 Salted 成果)
        let hashBadgeHtml = '';
        if (staff.isSalted) {
            hashBadgeHtml = '<span style="display:inline-flex; align-items:center; gap:4px; background:#dcfce7; color:#15803d; border:1px solid #86efac; border-radius:4px; padding:2px 8px; font-size:0.75rem; font-weight:600;" title="Password protected with 16-byte random salt + SHA-256">'
                          + '🔒 Salted SHA-256</span>';
        } else {
            hashBadgeHtml = '<span style="display:inline-flex; align-items:center; gap:4px; background:#fef3c7; color:#b45309; border:1px solid #fde68a; border-radius:4px; padding:2px 8px; font-size:0.75rem; font-weight:600;" title="Legacy unsalted SHA-256. Auto-upgrades to Salted on next login">'
                          + '⚠️ Legacy Unsalted</span>';
        }

        // 身分屬性標籤
        const rightBadge = staff.stRight === 'ADMIN'
            ? '<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:600; font-size:0.75rem;">ADMIN</span>'
            : '<span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; font-size:0.75rem;">USER</span>';

        // 關聯外判專案標籤
        let projectInfoHtml = '<span style="color:#94a3b8; font-size:0.78rem;">Global (Internal)</span>';
        if (staff.customProjectId > 0) {
            projectInfoHtml = `<span style="color:#0284c7; font-weight:500; font-size:0.78rem;">[${escapeHtml(staff.customProjectCode)}] ${escapeHtml(staff.customProjectName)}</span>`;
        }

        // 啟用狀態標籤
        const activeHtml = staff.isActive
            ? '<span style="color:#16a34a; font-weight:600; font-size:0.78rem;">● Active</span>'
            : '<span style="color:#dc2626; font-weight:600; font-size:0.78rem;">○ Inactive</span>';

        tr.innerHTML = `
            <td style="padding:0.75rem 0.5rem; text-align:center; font-family:monospace; color:#64748b;">${staff.pkT05}</td>
            <td style="padding:0.75rem 0.5rem;">
                <div style="font-weight:600; color:#1e293b;">${escapeHtml(staff.name)}</div>
                <div style="font-size:0.78rem; color:#64748b;">${escapeHtml(staff.email)}</div>
            </td>
            <td style="padding:0.75rem 0.5rem; text-align:center;">${rightBadge}</td>
            <td style="padding:0.75rem 0.5rem;">${projectInfoHtml}</td>
            <td style="padding:0.75rem 0.5rem; text-align:center;">${hashBadgeHtml}</td>
            <td style="padding:0.75rem 0.5rem; text-align:center;">${activeHtml}</td>
            <td style="padding:0.75rem 0.5rem; text-align:center;">
                <div style="display:inline-flex; gap:6px;">
                    <button type="button" class="btn-action-sm btn-reset" onclick="openResetPasswordModal(${staff.pkT05}, '${escapeJs(staff.name)}', '${escapeJs(staff.email)}')">
                        🔑 Reset
                    </button>
                    <button type="button" class="btn-action-sm ${staff.isActive ? 'btn-deactivate' : 'btn-activate'}" onclick="toggleStaffActive(${staff.pkT05}, ${!staff.isActive}, '${escapeJs(staff.name)}')">
                        ${staff.isActive ? 'Disable' : 'Enable'}
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * [職責] 管理員重設密碼 (全面以 Salted SHA-256 儲存並踢除活躍 Session)
 */
async function openResetPasswordModal(pkT05, name, email) {
    const newPassword = prompt(`🔑 Reset Password for:\n${name} (${email})\n\nEnter new password (at least 6 characters):`);
    if (newPassword === null) return; // 使用者按取消

    if (newPassword.trim().length < 6) {
        alert('Password must be at least 6 characters long.');
        return;
    }

    const payload = {
        pkT05: pkT05,
        newPassword: newPassword.trim()
    };

    const res = await adminFetch('/api/admin/staff/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (res && res.success) {
        alert(`✅【Password Reset Successful】\nPassword for ${name} has been updated to Salted SHA-256.\nAll previous active sessions have been invalidated.`);
        showBanner(`Password for ${name} successfully reset to Salted SHA-256.`, 'success');
        loadStaffList();
    } else {
        alert(`❌【Password Reset Failed】\n${res ? res.message : 'Server error'}`);
    }
}

/**
 * [職責] 切換人員帳號啟用/停用狀態
 */
async function toggleStaffActive(pkT05, newStatus, name) {
    const confirmMsg = newStatus
        ? `Are you sure you want to ENABLE account: "${name}"?`
        : `Are you sure you want to DISABLE account: "${name}"?\nThe user will be disconnected immediately.`;

    if (!confirm(confirmMsg)) return;

    const res = await adminFetch('/api/admin/staff/toggle-active', {
        method: 'POST',
        body: JSON.stringify({
            pkT05: pkT05,
            isActive: newStatus
        })
    });

    if (res && res.success) {
        showBanner(`Account status for "${name}" updated to: ${newStatus ? 'ACTIVE' : 'INACTIVE'}`, 'success');
        loadStaffList();
    } else {
        alert(`❌ Update failed: ${res ? res.message : 'Server error'}`);
    }
}

/**
 * [職責] 綁定表單與按鈕事件
 */
function initEventListeners() {
    // 建立新人員表單
    const createForm = document.getElementById('createStaffForm');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleCreateStaff();
        });
    }

    // 重新整理清單按鈕
    const refreshBtn = document.getElementById('btnRefreshList');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadStaffList());
    }

    // 登出按鈕
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Sign out from System Administration?')) {
                localStorage.removeItem('adminToken');
                sessionStorage.removeItem('adminToken');
                localStorage.removeItem('admin_user_right');
                sessionStorage.removeItem('admin_user_right');
                window.location.replace('admin_login.html');
            }
        });
    }
}

/**
 * [職責] 建立同仁提交
 */
async function handleCreateStaff() {
    const emailInput = document.getElementById('staffEmail') || document.getElementById('newStaffEmail');
    const nameInput = document.getElementById('staffName') || document.getElementById('newStaffName');
    const pwdInput = document.getElementById('staffPassword') || document.getElementById('newStaffPassword');
    const rightInput = document.getElementById('staffRight') || document.getElementById('newStaffRight');
    const projInput = document.getElementById('staffCustomProject') || document.getElementById('newStaffProject');

    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const name = nameInput ? nameInput.value.trim() : '';
    const password = pwdInput ? pwdInput.value : '';
    const stRight = rightInput ? rightInput.value : 'USER';
    const customProjectId = projInput ? parseInt(projInput.value, 10) || 0 : 0;

    if (!email || !name || !password) {
        alert('Email, Name, and Initial Password are all required.');
        return;
    }

    if (password.length < 6) {
        alert('Initial password must be at least 6 characters.');
        return;
    }

    const payload = {
        email: email,
        name: name,
        password: password,
        stRight: stRight,
        customProjectId: customProjectId
    };

    const res = await adminFetch('/api/admin/staff/create', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (res && res.success) {
        alert(`✅【Account Created】\nStaff member "${name}" created successfully with Salted SHA-256.`);
        showBanner(`Staff member "${name}" created with Salted SHA-256.`, 'success');
        if (createForm) createForm.reset();
        loadStaffList();
    } else {
        alert(`❌【Creation Failed】\n${res ? res.message : 'Server error'}`);
    }
}

/**
 * [職責] 顯示頂部操作結果橫幅
 */
function showBanner(msg, type = 'info') {
    const banner = document.getElementById('statusBanner') || document.getElementById('alertBanner');
    if (!banner) return;

    banner.textContent = msg;
    banner.style.display = 'block';
    banner.style.backgroundColor = type === 'success' ? '#ecfdf5' : (type === 'error' ? '#fef2f2' : '#f0f9ff');
    banner.style.color = type === 'success' ? '#065f46' : (type === 'error' ? '#991b1b' : '#075985');
    banner.style.border = `1px solid ${type === 'success' ? '#6ee7b7' : (type === 'error' ? '#fca5a5' : '#7dd3fc')}`;

    setTimeout(() => {
        banner.style.display = 'none';
    }, 4500);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// 供全域 onclick 調用
window.openResetPasswordModal = openResetPasswordModal;
window.toggleStaffActive = toggleStaffActive;