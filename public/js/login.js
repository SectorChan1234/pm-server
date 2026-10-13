// ==========================================
// ProjectBook Collaboration Portal - Login Module
// File: /public/js/login.js
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('loginForm');
  var errorBox = document.getElementById('errorBox');
  var submitBtn = document.getElementById('submitBtn');
  var emailInput = document.getElementById('emailInput');
  var passwordInput = document.getElementById('passwordInput');

  form.addEventListener('submit', async function(event) {
    event.preventDefault();

    errorBox.style.display = 'none';
    errorBox.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';

    try {
      var rawEmail = emailInput.value.trim();
      var password = passwordInput.value;
      var processedEmail = rawEmail;

      // 自動補全公務郵件 Domain
      if (!processedEmail.toLowerCase().endsWith('@swd.gov.hk') && !processedEmail.includes('@')) {
        processedEmail = processedEmail + '@swd.gov.hk';
      }

      // 直接傳遞明文 password 給後端，由後端 Java 統一執行標準 SHA-256
      var response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: processedEmail,
          password: password
        })
      });

      var data = {};
      var rawText = await response.text();
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (jsonErr) {
        console.error('JSON parse error:', jsonErr);
      }

      if (response.ok && data.status === 'SUCCESS') {
        localStorage.setItem('pb_token', data.token);
        localStorage.setItem('pb_user', JSON.stringify(data.user));
        localStorage.setItem('pb_roles', JSON.stringify(data.project_roles || {}));

        localStorage.setItem('admin_user_id', data.user.pk_t05);
        localStorage.setItem('admin_user_name', data.user.name);
        localStorage.setItem('admin_user_email', data.user.email);
        localStorage.setItem('admin_user_right', data.user.st_right);

        // 管理員轉向確認
        if (data.user.st_right && data.user.st_right.toUpperCase() === 'ADMIN') {
          if (confirm('Administrator privileges detected.\nWould you like to enter the Admin Console?\n\n[OK] Go to Admin Console\n[Cancel] Continue to Collaboration Portal')) {
            window.location.replace('/admin/DB_TableControl.html');
            return;
          }
        }

        window.location.replace('/portal.html');
      } else {
        errorBox.textContent = data.message || 'Invalid username or password. Please try again.';
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    } catch (err) {
      console.error('Login request failed:', err);
      errorBox.textContent = 'Connection error: ' + err.message;
      errorBox.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
});