/**
 * 系統主登入認證前端控制器 (Portal Authentication & Debug Controller)
 * File: /public/js/login.js
 *
 * 職責與邊界：
 * 1. 物理阻斷任何形式的瀏覽器原生表單提交，徹底消除密碼外洩於網址列之安全漏洞。
 * 2. 頁面載入時自動清理網址列歷史殘留之 Query String (?email=...&password=...)。
 * 3. 實作已登入狀態預檢 (GET /api/auth/me)：若已具備有效 pb_token 則自動導向 portal.html。
 * 4. 實作 Auth Debug Diagnostic Panel 即時除錯記錄，完整捕捉並視覺化 HTTP 狀態碼與後端原始回應。
 * 5. 實作外判身分狀態機 (REQUIRE_PROJECT_CODE) 與伺服器端 Salted SHA-256 身分驗證。
 * 6. 登入成功後嚴格寫入 pb_token 與雙向正規化之 pb_user，並為 ADMIN 自動橋接後台憑證。
 */

document.addEventListener('DOMContentLoaded', () => {
    cleanResidualUrlParams();
    initDebugPanel();
    initLoginEvents();
    verifyExistingSessionAndRedirect();
});

/**
 * [職責] 清理網址列歷史殘留之查詢字串，防止密碼等敏感資料暴露於瀏覽器網址列或歷史紀錄
 */
function cleanResidualUrlParams() {
    if (window.location.search && window.location.search.length > 1) {
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        logDebug("Detected and safely stripped sensitive query parameters from URL address bar.", "warn");
    }
}

/**
 * [職責] 初始化除錯面板與清除按鈕
 */
function initDebugPanel() {
    const clearBtn = document.getElementById('clearDebugBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const logEl = document.getElementById('loginDebugLog');
            if (logEl) {
                logEl.textContent = '[System] Debug log cleared.';
            }
        });
    }
    logDebug("Auth Controller initialized. Listening for credentials submission.");
}

/**
 * [職責] 檢查是否已具備有效登入 Session，若有則自動導向 portal.html
 */
async function verifyExistingSessionAndRedirect() {
    const existingToken = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token');
    if (!existingToken) {
        return;
    }

    logDebug("[Session Pre-check] Found existing pb_token. Verifying validity via GET /api/auth/me...");

    try {
        const res = await fetch('/api/auth/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${existingToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            const data = await res.json();
            if (data && (data.success || data.status === 'SUCCESS') && data.user) {
                logDebug(`[Session Pre-check] Active session verified for "${data.user.email}". Auto-redirecting to portal.html...`);
                showAlert('Active session detected. Redirecting to workspace...', 'info');
                handleLoginSuccess({ token: existingToken, user: data.user });
                return;
            }
        }

        logDebug("[Session Pre-check] Stored token is expired or invalid. Cleared stale credentials.", "warn");
        clearStaleSession();
    } catch (err) {
        logDebug(`[Session Pre-check] Verification skipped: ${err.message}`, "warn");
    }
}

/**
 * [職責] 清除過期或失效的會話憑證
 */
function clearStaleSession() {
    ['pb_token', 'pb_user', 'token', 'currentUser', 'adminToken', 'admin_user_id', 'admin_user_name', 'admin_user_email', 'admin_user_right'].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
}

/**
 * [職責] 綁定所有登入互動事件，杜絕原生提交
 */
function initLoginEvents() {
    const form = document.getElementById('loginForm');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const emailInput = document.getElementById('loginEmail');

    // 1. 表單層級絕對封殺原生提交
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            logDebug("Intercepted native form submit event. Delegating to handleLoginSubmit().");
            handleLoginSubmit();
            return false;
        });
    }

    // 2. 按鈕點擊綁定
    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            logDebug("Sign In button clicked.");
            handleLoginSubmit();
        });
    }

    // 3. 輸入框 Enter 鍵監聽
    ['loginEmail', 'loginPassword', 'loginProjectCode'].forEach(id => {
        const inputEl = document.getElementById(id);
        if (inputEl) {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    logDebug(`Enter key pressed inside input: #${id}. Triggering login.`);
                    handleLoginSubmit();
                }
            });
        }
    });

    // 4. 初始焦點聚焦於 Email
    if (emailInput) {
        emailInput.focus();
    }
}

/**
 * [職責] 核心登入處理邏輯，輸出完整診斷資訊至 Debug 面板
 */
async function handleLoginSubmit() {
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const projectCodeGroup = document.getElementById('projectCodeGroup');
    const projectCodeInput = document.getElementById('loginProjectCode');
    const submitBtn = document.getElementById('loginSubmitBtn');

    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const password = passwordInput ? passwordInput.value : '';
    const projectCode = projectCodeInput ? projectCodeInput.value.trim().toUpperCase() : '';

    logDebug(`[Step 1] Form inputs extracted: email="${email}", passwordLen=${password.length}, projectCode="${projectCode}"`);

    if (!email || !password) {
        const msg = 'Please enter both email and password.';
        showAlert(msg, 'error');
        logDebug(`[Validation Failed] ${msg}`, 'error');
        if (!email && emailInput) emailInput.focus();
        else if (passwordInput) passwordInput.focus();
        return;
    }

    const isProjectCodeRequired = projectCodeGroup && projectCodeGroup.style.display !== 'none';
    if (isProjectCodeRequired && !projectCode) {
        const msg = 'Project Code is required for contractor profile.';
        showAlert(msg, 'error');
        logDebug(`[Validation Failed] ${msg}`, 'error');
        if (projectCodeInput) projectCodeInput.focus();
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        const textSpan = submitBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = 'Verifying...';
    }

    const targetUrl = '/api/auth/login';
    const payload = {
        email: email,
        password: password,
        projectCode: projectCode
    };

    logDebug(`[Step 2] Sending POST request to: "${targetUrl}"`);

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
            logDebug(`[JSON Parse Error] Failed to parse response as JSON: ${jsonErr.message}`, 'error');
            showAlert('Server returned an invalid non-JSON response.', 'error');
            return;
        }

        if (response.ok && (data.success || data.status === 'SUCCESS')) {
            const pk = data.user ? (data.user.pkT05 || data.user.pk_t05) : 'N/A';
            logDebug(`[Step 5] Authentication SUCCESS! Token granted. User PK_T05=${pk}`);
            showAlert('Sign in successful! Redirecting to workspace...', 'info');
            handleLoginSuccess(data);
        } else if (data.code === 'REQUIRE_PROJECT_CODE' || data.requireProjectCode) {
            logDebug(`[State Transition] Backend requested contractor Project Code (REQUIRE_PROJECT_CODE).`, 'warn');
            showAlert(data.message || 'Project Code is required for contractor profile.', 'info');
            if (projectCodeGroup) {
                projectCodeGroup.style.display = 'block';
                if (projectCodeInput) {
                    projectCodeInput.setAttribute('required', 'required');
                    projectCodeInput.focus();
                }
            }
        } else {
            const errorMsg = data.message || 'Invalid email or password.';
            logDebug(`[Auth Rejected] ${errorMsg}`, 'error');
            showAlert(errorMsg, 'error');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }

    } catch (networkErr) {
        logDebug(`[Network Exception] Request failed: ${networkErr.message}`, 'error');
        console.error('Login request failed:', networkErr);
        showAlert(`Connection failed: ${networkErr.message}. Ensure backend server is running.`, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            const textSpan = submitBtn.querySelector('.btn-text');
            if (textSpan) textSpan.textContent = 'Sign In';
        }
    }
}

/**
 * [職責] 登入成功後保存 Token 與雙向正規化 User 物件，並平滑跳轉至 portal.html
 */
function handleLoginSuccess(data) {
    const token = data.token;
    const rawUser = (typeof data.user === 'string') ? JSON.parse(data.user || '{}') : (data.user || {});

    const pkT05 = rawUser.pkT05 || rawUser.pk_t05 || 0;
    const stRight = (rawUser.stRight || rawUser.st_right || 'USER').toUpperCase();
    const email = rawUser.email || '';
    const name = rawUser.name || 'User';
    const customPj = rawUser.fkT05PkT01Custom || rawUser.fk_t05_pk_t01_custom || 0;

    const normalizedUser = {
        ...rawUser,
        pkT05: pkT05,
        pk_t05: pkT05,
        email: email,
        name: name,
        stRight: stRight,
        st_right: stRight,
        fkT05PkT01Custom: customPj
    };

    const userStr = JSON.stringify(normalizedUser);

    if (token) {
        localStorage.setItem('pb_token', token);
        sessionStorage.setItem('pb_token', token);
        localStorage.setItem('token', token);
        sessionStorage.setItem('token', token);
    }

    localStorage.setItem('pb_user', userStr);
    sessionStorage.setItem('pb_user', userStr);
    localStorage.setItem('currentUser', userStr);
    sessionStorage.setItem('currentUser', userStr);

    // 若為 ADMIN 身分，同步寫入後台管理金鑰，確保點擊 Admin Console 無縫進入
    if (stRight === 'ADMIN' && token) {
        localStorage.setItem('adminToken', token);
        sessionStorage.setItem('adminToken', token);
        localStorage.setItem('admin_user_id', String(pkT05));
        sessionStorage.setItem('admin_user_id', String(pkT05));
        localStorage.setItem('admin_user_name', name);
        sessionStorage.setItem('admin_user_name', name);
        localStorage.setItem('admin_user_email', email);
        sessionStorage.setItem('admin_user_email', email);
        localStorage.setItem('admin_user_right', 'ADMIN');
        sessionStorage.setItem('admin_user_right', 'ADMIN');
    }

    setTimeout(() => {
        window.location.replace('portal.html');
    }, 350);
}

/**
 * [職責] 向 Diagnostic Debug Panel 寫入結構化日誌
 */
function logDebug(msg, level = 'info') {
    const logEl = document.getElementById('loginDebugLog');
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
 * [職責] 在表單頂部顯示高對比警示橫幅
 */
function showAlert(message, type = 'error') {
    const alertEl = document.getElementById('loginAlert');
    if (!alertEl) return;

    alertEl.textContent = message;
    alertEl.className = `alert-banner alert-${type}`;
    alertEl.style.display = 'flex';
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}