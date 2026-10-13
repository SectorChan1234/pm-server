// ==========================================================================
// ProjectBook Collaboration Portal - Admin Login Module
// File: /public/admin/js/admin_login.js
// ==========================================================================

function showError(msg) {
  const errEl = document.getElementById('error-msg');
  errEl.textContent = msg;
  errEl.style.display = 'block';
}

function clearError() {
  const errEl = document.getElementById('error-msg');
  errEl.textContent = '';
  errEl.style.display = 'none';
}

// 登入驗證
async function handleLogin() {
  const emailInput = document.getElementById('admin-email').value.trim();
  const pwdInput = document.getElementById('admin-password').value;
  const loginBtn = document.getElementById('login-btn');
  clearError();

  if (!emailInput) {
    showError('請輸入管理員 Email 帳號！');
    return;
  }
  if (!pwdInput) {
    showError('請輸入密碼！');
    return;
  }

  let email = emailInput;
  if (!email.toLowerCase().endsWith('@swd.gov.hk') && !email.contains('@')) {
    email = email + '@swd.gov.hk';
  }

  loginBtn.disabled = true;
  loginBtn.textContent = '登入驗證中...';

  try {
    // 直接傳送 password 給後端，由後端 Java 執行標準 SHA-256 驗證
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: pwdInput
      })
    });

    const data = await response.json();

    if (response.ok && data.status === 'SUCCESS') {
      if (!data.user.st_right || data.user.st_right.toUpperCase() !== 'ADMIN') {
        showError('【存取拒絕】此帳號不具備管理員 (ADMIN) 權限！');
        loginBtn.disabled = false;
        loginBtn.textContent = '登入系統';
        return;
      }

      // 儲存身分資訊與 Token 至 localStorage
      localStorage.setItem('pb_token', data.token);
      localStorage.setItem('pb_user', JSON.stringify(data.user));
      localStorage.setItem('admin_user_id', data.user.pk_t05);
      localStorage.setItem('admin_user_name', data.user.name);
      localStorage.setItem('admin_user_email', data.user.email);
      localStorage.setItem('admin_user_right', 'ADMIN');

      window.location.replace('/admin/DB_TableControl.html');
    } else {
      showError(data.message || '帳號或密碼錯誤，請重新輸入！');
      loginBtn.disabled = false;
      loginBtn.textContent = '登入系統';
    }
  } catch (err) {
    showError('連線異常或發生錯誤: ' + err.message);
    loginBtn.disabled = false;
    loginBtn.textContent = '登入系統';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('admin-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
});