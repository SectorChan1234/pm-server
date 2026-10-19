/**
 * 人員管理與密碼安全治理前端腳本 (Staff & Password Governance Controller)
 *
 * 職責與邊界：
 * 1. 檢驗管理員 Bearer Token，未授權者自動重導回 admin_login.html。
 * 2. 獲取並渲染同仁清單，視覺化標註密碼安全狀態 (isSalted: Salted SHA-256 vs Legacy SHA-256)。
 * 3. 處理新帳號建立：支援「內部全域同仁 (CUSTOM=0)」與「外判專案人員 (CUSTOM>0)」之動態表單切換與後端加鹽建立。
 * 4. 處理管理員密碼重設：彈出 Modal、產生隨機密碼、呼叫後端重設 API 並自動剔除目標使用者活躍 Session。
 * 5. 處理帳號啟用/停用切換與即時篩選檢索。
 */

// 全域狀態儲存
const AdminState = {
    token: '',
    staffList: [],
    projectOptions: [],
    filterKeyword: ''
};

// 頁面載入初始化
document.addEventListener('DOMContentLoaded', () => {
    initAuthToken();
    initEventListeners();
    loadProjectOptions();
    loadStaffList();
});

/**
 * [職責] 初始化並校驗管理員 Token，若不存在則重導向至登入頁
 * [Called By] DOMContentLoaded
 * [Calls] sessionStorage.getItem, localStorage.getItem, window.location.replace
 */
function initAuthToken() {
    AdminState.token = sessionStorage.getItem('adminToken') || 
                       localStorage.getItem('adminToken') || 
                       sessionStorage.getItem('token') || 
                       localStorage.getItem('token');

    if (!AdminState.token) {
        window.location.replace('admin_login.html');
        return;
    }

    const savedEmail = sessionStorage.getItem('adminEmail') || 'Admin';
    const badgeEl = document.getElementById('currentAdminBadge');
    if (badgeEl) {
        badgeEl.textContent = savedEmail;
    }
}

/**
 * [職責] 綁定所有 DOM 事件監聽器
 * [Called By] DOMContentLoaded
 * [Calls] DOM APIs
 */
function initEventListeners() {
    // 登出按鈕
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // 重新整理按鈕
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadStaffList();
    });

    // 關鍵字即時篩選
    document.getElementById('filterKeyword').addEventListener('input', (e) => {
        AdminState.filterKeyword = e.target.value.trim().toLowerCase();
        renderStaffTable();
    });

    // 帳號身分切換 (Internal vs Contractor)
    document.getElementById('accountTypeSelect').addEventListener('change', (e) => {
        const contractorGroup = document.getElementById('contractorProjectGroup');
        const boundSelect = document.getElementById('boundProjectSelect');
        if (e.target.value === 'CONTRACTOR') {
            contractorGroup.style.display = 'block';
            boundSelect.setAttribute('required', 'required');
        } else {
            contractorGroup.style.display = 'none';
            boundSelect.removeAttribute('required');
            boundSelect.value = '';
        }
    });

    // 建立表單：產生隨機密碼按鈕
    document.getElementById('generatePasswordBtn').addEventListener('click', () => {
        const pass = generateSecurePassword(12);
        const passInput = document.getElementById('newPassword');
        passInput.value = pass;
        passInput.type = 'text'; // 暫時以明文顯示方便管理員記錄
        showAlert('Generated temporary password: ' + pass, 'info');
    });

    // 建立表單提交
    document.getElementById('createStaffForm').addEventListener('submit', handleCreateStaff);

    // 重設密碼 Modal 控制
    document.getElementById('closeResetModalBtn').addEventListener('click', closeResetModal);
    document.getElementById('cancelResetModalBtn').addEventListener('click', closeResetModal);
    document.getElementById('modalGeneratePasswordBtn').addEventListener('click', () => {
        const pass = generateSecurePassword(12);
        const modalPassInput = document.getElementById('resetNewPassword');
        modalPassInput.value = pass;
        modalPassInput.type = 'text';
    });
    document.getElementById('resetPasswordForm').addEventListener('submit', handleResetPasswordSubmit);
}

/**
 * [職責] 發送通用授權 API 請求 (帶有 Authorization Bearer 標頭)
 * [Input Contract] url (String), options (Object)
 * [Output Contract] Promise<Response>
 * [Called By] loadProjectOptions, loadStaffList, handleCreateStaff, handleResetPasswordSubmit, toggleStaffActive
 * [Calls] fetch
 */
async function apiRequest(url, options = {}) {
    const defaultHeaders = {
        'Authorization': `Bearer ${AdminState.token}`,
        'Content-Type': 'application/json'
    };

    options.headers = Object.assign(defaultHeaders, options.headers || {});
    const response = await fetch(url, options);

    if (response.status === 401 || response.status === 403) {
        showAlert('Session expired or administrative access denied. Please login again.', 'error');
        setTimeout(() => {
            sessionStorage.removeItem('adminToken');
            localStorage.removeItem('adminToken');
            window.location.replace('admin_login.html');
        }, 1500);
        throw new Error('Unauthorized');
    }

    return response;
}

/**
 * [職責] 載入外判人員可綁定之專案清單目錄
 * [Called By] DOMContentLoaded
 * [Calls] apiRequest, renderProjectSelectOptions
 */
async function loadProjectOptions() {
    try {
        const res = await apiRequest('/api/admin/projects/options');
        const data = await res.json();
        if (data.success && Array.isArray(data.projects)) {
            AdminState.projectOptions = data.projects;
            renderProjectSelectOptions();
        }
    } catch (err) {
        console.error('Failed to load project options:', err);
    }
}

/**
 * [職責] 渲染專案下拉選單選項
 * [Called By] loadProjectOptions
 * [Calls] DOM APIs
 */
function renderProjectSelectOptions() {
    const selectEl = document.getElementById('boundProjectSelect');
    selectEl.innerHTML = '<option value="">-- Select Target Project --</option>';

    AdminState.projectOptions.forEach(proj => {
        const opt = document.createElement('option');
        opt.value = proj.pkT01;
        opt.textContent = `[${proj.pjCode}] ${proj.pjName}`;
        selectEl.appendChild(opt);
    });
}

/**
 * [職責] 載入全體人員資料清單
 * [Called By] DOMContentLoaded, refreshBtn, handleCreateStaff, handleResetPasswordSubmit, toggleStaffActive
 * [Calls] apiRequest, renderStaffTable
 */
async function loadStaffList() {
    const tbody = document.getElementById('staffTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading personnel records...</td></tr>';

    try {
        const res = await apiRequest('/api/admin/staff/list');
        const data = await res.json();
        if (data.success && Array.isArray(data.staffList)) {
            AdminState.staffList = data.staffList;
            renderStaffTable();
        } else {
            showAlert(data.message || 'Failed to load staff list', 'error');
        }
    } catch (err) {
        console.error('Error fetching staff list:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="error-cell">Failed to connect to administrative server.</td></tr>';
    }
}

/**
 * [職責] 根據關鍵字過濾並渲染人員資料表格
 * [Called By] loadStaffList, filterKeyword input
 * [Calls] DOM APIs, openResetModal, toggleStaffActive
 */
function renderStaffTable() {
    const tbody = document.getElementById('staffTableBody');
    tbody.innerHTML = '';

    const filtered = AdminState.staffList.filter(item => {
        if (!AdminState.filterKeyword) return true;
        const kw = AdminState.filterKeyword;
        const nameMatch = (item.name || '').toLowerCase().includes(kw);
        const emailMatch = (item.email || '').toLowerCase().includes(kw);
        const projMatch = (item.customProjectCode || '').toLowerCase().includes(kw) || 
                          (item.customProjectName || '').toLowerCase().includes(kw);
        return nameMatch || emailMatch || projMatch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No matching personnel records found.</td></tr>';
        return;
    }

    filtered.forEach(staff => {
        const tr = document.createElement('tr');

        // 1. ID
        const tdId = document.createElement('td');
        tdId.className = 'font-mono text-muted';
        tdId.textContent = staff.pkT05;
        tr.appendChild(tdId);

        // 2. Staff Information
        const tdInfo = document.createElement('td');
        tdInfo.innerHTML = `
            <div class="staff-name font-bold">${escapeHtml(staff.name)}</div>
            <div class="staff-email text-muted">${escapeHtml(staff.email)}</div>
        `;
        tr.appendChild(tdInfo);

        // 3. Account Scope (Internal vs Contractor)
        const tdScope = document.createElement('td');
        if (staff.customProjectId > 0) {
            tdScope.innerHTML = `
                <span class="scope-pill scope-contractor" title="Bound to ${escapeHtml(staff.customProjectName)}">
                    Contractor: [${escapeHtml(staff.customProjectCode)}]
                </span>
            `;
        } else {
            tdScope.innerHTML = `<span class="scope-pill scope-internal">Internal (Global)</span>`;
        }
        tr.appendChild(tdScope);

        // 4. Role
        const tdRole = document.createElement('td');
        tdRole.innerHTML = staff.stRight === 'ADMIN' 
            ? `<span class="badge badge-admin">ADMIN</span>`
            : `<span class="badge badge-user">USER</span>`;
        tr.appendChild(tdRole);

        // 5. Security Status (Salted SHA-256 vs Legacy SHA-256)
        const tdSec = document.createElement('td');
        if (staff.isSalted) {
            tdSec.innerHTML = `<span class="badge badge-success" title="Protected with 16-byte random salt">🛡️ Salted SHA-256</span>`;
        } else {
            tdSec.innerHTML = `<span class="badge badge-warning" title="Legacy hash. Will automatically upgrade to Salted SHA-256 upon next login.">⚠️ Legacy SHA-256</span>`;
        }
        tr.appendChild(tdSec);

        // 6. Active Status
        const tdStatus = document.createElement('td');
        tdStatus.innerHTML = staff.isActive
            ? `<span class="status-indicator status-active">● Active</span>`
            : `<span class="status-indicator status-inactive">○ Inactive</span>`;
        tr.appendChild(tdStatus);

        // 7. Actions
        const tdActions = document.createElement('td');
        tdActions.className = 'text-right action-cell';

        // Reset Password 按鈕
        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn btn-sm btn-outline';
        resetBtn.textContent = '🔑 Reset Pwd';
        resetBtn.addEventListener('click', () => openResetModal(staff));
        tdActions.appendChild(resetBtn);

        // 啟用 / 停用按鈕
        const toggleBtn = document.createElement('button');
        toggleBtn.className = staff.isActive ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-success';
        toggleBtn.textContent = staff.isActive ? 'Disable' : 'Enable';
        toggleBtn.addEventListener('click', () => toggleStaffActive(staff));
        tdActions.appendChild(toggleBtn);

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
}

/**
 * [職責] 處理建立新同仁表單提交
 * [Called By] createStaffForm submit
 * [Calls] apiRequest, loadStaffList, showAlert
 */
async function handleCreateStaff(e) {
    e.preventDefault();

    const email = document.getElementById('newEmail').value.trim();
    const name = document.getElementById('newName').value.trim();
    const password = document.getElementById('newPassword').value;
    const stRight = document.getElementById('newRight').value;
    const accountType = document.getElementById('accountTypeSelect').value;
    let customProjectId = 0;

    if (accountType === 'CONTRACTOR') {
        const boundVal = document.getElementById('boundProjectSelect').value;
        if (!boundVal) {
            showAlert('Please select a target project for the contractor profile.', 'error');
            return;
        }
        customProjectId = parseInt(boundVal, 10);
    }

    if (!email || !name || !password) {
        showAlert('Please fill in all mandatory fields.', 'error');
        return;
    }

    const submitBtn = document.getElementById('createSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
        const payload = {
            email: email,
            name: name,
            password: password, // 明文傳輸給後端 Java 執行加鹽雜湊 (杜絕前端 Web Crypto 限制)
            stRight: stRight,
            customProjectId: customProjectId
        };

        const res = await apiRequest('/api/admin/staff/create', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            showAlert('Staff account successfully created with Salted SHA-256!', 'success');
            document.getElementById('createStaffForm').reset();
            document.getElementById('contractorProjectGroup').style.display = 'none';
            document.getElementById('boundProjectSelect').removeAttribute('required');
            loadStaffList();
        } else {
            showAlert(data.message || 'Failed to create staff account', 'error');
        }
    } catch (err) {
        console.error('Create staff error:', err);
        showAlert('An unexpected server error occurred.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
    }
}

/**
 * [職責] 開啟重設密碼 Modal 並帶入目標同仁資料
 * [Called By] renderStaffTable
 * [Calls] DOM APIs
 */
function openResetModal(staff) {
    document.getElementById('resetTargetPkT05').value = staff.pkT05;
    document.getElementById('resetTargetStaffName').textContent = staff.name;
    document.getElementById('resetTargetStaffEmail').textContent = staff.email;
    const passInput = document.getElementById('resetNewPassword');
    passInput.value = '';
    passInput.type = 'password';

    document.getElementById('resetPasswordModal').style.display = 'flex';
}

/**
 * [職責] 關閉重設密碼 Modal
 * [Called By] closeResetModalBtn, cancelResetModalBtn, handleResetPasswordSubmit
 * [Calls] DOM APIs
 */
function closeResetModal() {
    document.getElementById('resetPasswordModal').style.display = 'none';
    document.getElementById('resetPasswordForm').reset();
}

/**
 * [職責] 處理管理員提交重設密碼
 * [Called By] resetPasswordForm submit
 * [Calls] apiRequest, loadStaffList, closeResetModal, showAlert
 */
async function handleResetPasswordSubmit(e) {
    e.preventDefault();

    const pkT05 = document.getElementById('resetTargetPkT05').value;
    const newPassword = document.getElementById('resetNewPassword').value;

    if (!pkT05 || !newPassword) {
        showAlert('Please enter a valid new password.', 'error');
        return;
    }

    const confirmBtn = document.getElementById('confirmResetBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';

    try {
        const payload = {
            pkT05: parseInt(pkT05, 10),
            newPassword: newPassword // 直接交由後端使用 Security.hashPassword 加鹽
        };

        const res = await apiRequest('/api/admin/staff/reset-password', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            showAlert('Password successfully reset and upgraded to Salted SHA-256!', 'success');
            closeResetModal();
            loadStaffList();
        } else {
            showAlert(data.message || 'Failed to reset password', 'error');
        }
    } catch (err) {
        console.error('Reset password error:', err);
        showAlert('An error occurred while resetting the password.', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Save & Enforce Salt';
    }
}

/**
 * [職責] 切換帳號之啟用/停用狀態
 * [Called By] renderStaffTable
 * [Calls] apiRequest, loadStaffList, showAlert
 */
async function toggleStaffActive(staff) {
    const actionText = staff.isActive ? 'DEACTIVATE' : 'ACTIVATE';
    const warningMsg = staff.isActive 
        ? `Are you sure you want to ${actionText} ${staff.name} (${staff.email})?\nThis will immediately terminate all active sessions for this account.`
        : `Are you sure you want to ${actionText} ${staff.name} (${staff.email})?`;

    if (!confirm(warningMsg)) {
        return;
    }

    try {
        const payload = {
            pkT05: staff.pkT05,
            isActive: !staff.isActive
        };

        const res = await apiRequest('/api/admin/staff/toggle-active', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            showAlert(`Staff account successfully updated to ${!staff.isActive ? 'ACTIVE' : 'INACTIVE'}.`, 'success');
            loadStaffList();
        } else {
            showAlert(data.message || 'Failed to update account status', 'error');
        }
    } catch (err) {
        console.error('Toggle active error:', err);
        showAlert('An error occurred while updating account status.', 'error');
    }
}

/**
 * [職責] 產生指定長度之高強度隨機密碼 (含大小寫字母、數字與安全符號)
 * [Input Contract] length (number)
 * [Output Contract] (string)
 * [Called By] generatePasswordBtn, modalGeneratePasswordBtn
 */
function generateSecurePassword(length = 12) {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let result = '';
    const array = new Uint8Array(length);
    // 密碼產生器使用隨機數填充
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        result += charset[array[i] % charset.length];
    }
    return result;
}

/**
 * [職責] 處理管理員登出邏輯
 * [Called By] logoutBtn
 * [Calls] apiRequest, sessionStorage.clear, window.location.replace
 */
async function handleLogout() {
    try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (e) {
        // 忽略連線異常直接清空本地會話
    } finally {
        sessionStorage.removeItem('adminToken');
        sessionStorage.removeItem('adminEmail');
        localStorage.removeItem('adminToken');
        window.location.replace('admin_login.html');
    }
}

/**
 * [職責] 在頁面頂部顯示浮動提示橫幅
 * [Input Contract] message (String), type ("success" | "error" | "info")
 * [Called By] 各非同步操作回調
 * [Calls] DOM APIs
 */
function showAlert(message, type = 'info') {
    const banner = document.getElementById('alertBanner');
    banner.textContent = message;
    banner.className = `alert-banner alert-${type}`;
    banner.style.display = 'block';

    setTimeout(() => {
        banner.style.display = 'none';
    }, 4500);
}

/**
 * [職責] 轉義 HTML 特殊字元防止 XSS 注入
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}