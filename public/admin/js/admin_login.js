/**
 * 系統後台管理員認證控制器 (Admin Authentication Controller)
 * File: /public/admin/js/admin_login.js
 * Standard: Defensive Intranet Architecture (Zero External Dependencies)
 *
 * 職責與邊界：
 * 1. 偵測既有 Portal ADMIN 會話狀態，若已於主工作台登入 ADMIN，自動橋接各模組憑證並提供一鍵直達。
 * 2. 徹底阻斷瀏覽器原生表單提交，杜絕密碼透過 URL 洩漏。
 * 3. 呼叫後端加鹽驗證端點 (/api/auth/admin-login)，廢除前端 Web Crypto/crypto.subtle 依賴。
 * 4. 登入成功後一次性同步寫入全套憑證金鑰 (pb_token, pb_user, adminToken, admin_user_right, admin_user_id)，
 *    使 DB_TableControl.html 與 StaffPasswordSetup.html 均能無縫通過權限守衛。
 * 5. 內建 Admin Auth Diagnostic Log 除錯日誌面板，即時捕捉 HTTP 狀態與原始回應。
 */

// 頁面載入初始化
document.addEventListener('DOMContentLoaded', () => {
    cleanResidualUrlParams();
    initDebugPanel();
    checkExistingAdminSession();
    initAdminLoginEvents();
});

/**
 * [職責] 清理網址列殘留之敏感查詢字串
 */
function cleanResidualUrlParams() {
    if (window.location.search && window.location.search.length > 1) {
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        logDebug("Detected and safely stripped residual query parameters from address bar.", "warn");
    }
}

/**
 * [職責] 初始化除錯日誌面板與清除按鈕
 */
function initDebugPanel() {
    const clearBtn = document.getElementById('clearAdminDebugBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const logEl = document.getElementById('adminDebugLog');
            if (logEl) {
                logEl.textContent = '[System] Debug log cleared.';
            }
        });
    }
    logDebug("Admin Authentication Controller initialized. Zero-Trust mode active.");
}

/**
 * [職責] 檢查是否已在 portal.html 或先前會話中具備有效 ADMIN 身分
 * 若偵測到 ADMIN 身分，自動補齊後台所需金鑰並展開一鍵直達橫幅
 */
function checkExistingAdminSession() {
    const existingToken = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token') ||
                          localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
    const existingUserStr = localStorage.getItem('pb_user') || sessionStorage.getItem('pb_user') ||
                            localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');

    if (!existingToken || !existingUserStr) return;

    try {
        const u = JSON.parse(existingUserStr);
        const right = (u.st_right || u.stRight || localStorage.getItem('admin_user_right') || sessionStorage.getItem('admin_user_right') || '').toUpperCase();

        if (right === 'ADMIN') {
            logDebug(`Active ADMIN session detected for: ${u.email || u.name || 'Administrator'}`, 'info');

            // 自動將後台專用金鑰補齊回 storage
            syncAdminStorageKeys(existingToken, {
                pkT05: u.pk_t05 || u.pkT05 || 1,
                email: u.email || '',
                name: u.name || 'Administrator',
                stRight: 'ADMIN'
            });

            // 展開快速進入橫幅
            const sessionBox = document.getElementById('existingAdminSessionBox');
            const emailSpan = document.getElementById('detectedAdminEmail');
            if (emailSpan) emailSpan.textContent = u.email || u.name || 'ADMIN';
            if (sessionBox) sessionBox.style.display = 'block';

            // 綁定一鍵進入按鈕
            const btnDB = document.getElementById('btnContinueDBConsole');
            const btnStaff = document.getElementById('btnContinueStaffSetup');
            if (btnDB) btnDB.addEventListener('click', () => window.location.href = 'DB_TableControl.html');
            if (btnStaff) btnStaff.addEventListener('click', () => window.location.href = 'StaffPasswordSetup.html');

            // 預填 Email 欄位便於切換
            const emailInput = document.getElementById('adminEmail');
            if (emailInput && !emailInput.value && u.email) {
                emailInput.value = u.email;
            }
        }
    } catch (e) {
        console.warn('Failed to parse existing user session:', e);
    }
}

/**
 * [職責] 綁定管理員登入表單互動事件
 */
function initAdminLoginEvents() {
    const form = document.getElementById('adminLoginForm');
    const submitBtn = document.getElementById('adminLoginBtn');
    const emailInput = document.getElementById('adminEmail');

    // 1. 阻斷原生提交
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            logDebug("Intercepted native admin form submit. Delegating to handleAdminLoginSubmit().");
            handleAdminLoginSubmit();
            return false;
        });
    }

    // 2. 授權按鈕點擊
    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAdminLoginSubmit();
        });
    }

    // 3. Enter 鍵監聽
    ['adminEmail', 'adminPassword'].forEach(id => {
        const inputEl = document.getElementById(id);
        if (inputEl) {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAdminLoginSubmit();
                }
            });
        }
    });

    if (emailInput && !emailInput.value) {
        emailInput.focus();
    }
}

/**
 * [職責] 處理管理員登入提交，呼叫 /api/auth/admin-login 伺服器端驗證
 */
async function handleAdminLoginSubmit() {
    const emailInput = document.getElementById('adminEmail');
    const passwordInput = document.getElementById('adminPassword');
    const targetSelect = document.getElementById('adminTargetPage');
    const submitBtn = document.getElementById('adminLoginBtn');

    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const password = passwordInput ? passwordInput.value : '';
    const destination = targetSelect ? targetSelect.value : 'DB_TableControl.html';

    logDebug(`[Step 1] Form extracted: email="${email}", passwordLen=${password.length}, target="${destination}"`);

    if (!email || !password) {
        const msg = 'Please enter both administrator email and password.';
        showAlert(msg, 'error');
        logDebug(`[Validation Failed] ${msg}`, 'error');
        if (!email && emailInput) emailInput.focus();
        else if (passwordInput) passwordInput.focus();
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        const textSpan = submitBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = 'Verifying Salted Hash...';
    }

    const targetUrl = '/api/auth/admin-login';
    const payload = {
        email: email,
        password: password
    };

    logDebug(`[Step 2] Sending POST to: "${targetUrl}"`);

    try {
        const startTime = Date.now();
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const elapsed = Date.now() - startTime;
        logDebug(`[Step 3] Received HTTP Status: ${response.status} (${response.statusText}) in ${elapsed}ms`);

        const rawText = await response.text();
        logDebug(`[Step 4] Raw Server Response: ${rawText}`);

        let data = null;
        try {
            data = JSON.parse(rawText);
        } catch (jsonErr) {
            logDebug(`[JSON Parse Error] Server returned non-JSON response: ${jsonErr.message}`, 'error');
            showAlert('Server returned an invalid non-JSON response.', 'error');
            return;
        }

        if (response.ok && data.success) {
            logDebug(`[Step 5] Administrator authentication SUCCESS! Token granted.`);
            showAlert('Administrator authorized! Launching management console...', 'info');

            const adminInfo = data.admin || {};
            // 一次性寫入跨前台與後台的所有相容 Storage 金鑰
            syncAdminStorageKeys(data.token, adminInfo);

            setTimeout(() => {
                window.location.replace(destination);
            }, 350);
        } else {
            const errorMsg = data.message || 'Invalid administrator credentials or access denied.';
            logDebug(`[Auth Rejected] ${errorMsg}`, 'error');
            showAlert(errorMsg, 'error');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }

    } catch (networkErr) {
        logDebug(`[Network Exception] Request failed: ${networkErr.message}`, 'error');
        console.error('Admin login request failed:', networkErr);
        showAlert(`Connection failed: ${networkErr.message}. Ensure backend server is running.`, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            const textSpan = submitBtn.querySelector('.btn-text');
            if (textSpan) textSpan.textContent = 'Authorize & Enter Console';
        }
    }
}

/**
 * [職責] 同步全套管理員身分憑證至 localStorage 與 sessionStorage
 * 徹底消滅 DB_TableControl.js 與 StaffPasswordSetup.js 的金鑰不匹配
 */
function syncAdminStorageKeys(token, adminInfo) {
    if (!token) return;

    const pkT05 = adminInfo.pkT05 || adminInfo.pk_t05 || 1;
    const email = adminInfo.email || '';
    const name = adminInfo.name || 'Administrator';

    const unifiedUser = {
        pkT05: pkT05,
        pk_t05: pkT05,
        email: email,
        name: name,
        stRight: 'ADMIN',
        st_right: 'ADMIN',
        fkT05PkT01Custom: 0
    };

    const userJson = JSON.stringify(unifiedUser);

    // 1. 主工作台標準金鑰 (portal.js 標準)
    localStorage.setItem('pb_token', token);
    sessionStorage.setItem('pb_token', token);
    localStorage.setItem('pb_user', userJson);
    sessionStorage.setItem('pb_user', userJson);

    // 2. 舊版向下相容金鑰
    localStorage.setItem('token', token);
    sessionStorage.setItem('token', token);
    localStorage.setItem('currentUser', userJson);
    sessionStorage.setItem('currentUser', userJson);

    // 3. Staff 密碼設定標準金鑰 (StaffPasswordSetup.js 標準)
    localStorage.setItem('adminToken', token);
    sessionStorage.setItem('adminToken', token);

    // 4. 資料庫控制台標準金鑰 (DB_TableControl.js 標準)
    localStorage.setItem('admin_user_id', String(pkT05));
    sessionStorage.setItem('admin_user_id', String(pkT05));
    localStorage.setItem('admin_user_name', name);
    sessionStorage.setItem('admin_user_name', name);
    localStorage.setItem('admin_user_email', email);
    sessionStorage.setItem('admin_user_email', email);
    localStorage.setItem('admin_user_right', 'ADMIN');
    sessionStorage.setItem('admin_user_right', 'ADMIN');
}

/**
 * [職責] 向 Diagnostic Debug Panel 寫入結構化日誌
 */
function logDebug(msg, level = 'info') {
    const logEl = document.getElementById('adminDebugLog');
    if (!logEl) return;

    const d = new Date();
    const timeStr = d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
    let color = '#a7f3d0';
    if (level === 'warn') color = '#fde047';
    if (level === 'error') color = '#f87171';

    const line = document.createElement('div');
    line.style.color = color;
    line.textContent = `[${timeStr}] [${level.toUpperCase()}] ${msg}`;

    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
}

/**
 * [職責] 在表單頂部顯示警示橫幅
 */
function showAlert(message, type = 'error') {
    const alertEl = document.getElementById('adminLoginAlert');
    if (!alertEl) return;

    alertEl.textContent = message;
    alertEl.className = `alert-banner alert-${type}`;
    alertEl.style.display = 'flex';
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}