// ==========================================================================
// ProjectBook Collaboration Portal - Staff Password Setup Module
// File: /public/admin/js/StaffPasswordSetup.js
// ==========================================================================

// ==========================================
// 權限檢查與通訊工具
// ==========================================
function checkAdminAuth() {
  const token = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token');
  const role = localStorage.getItem('admin_user_right') || sessionStorage.getItem('admin_user_right');
  const userId = localStorage.getItem('admin_user_id') || sessionStorage.getItem('admin_user_id');

  if (!token || !userId || role !== 'ADMIN') {
    alert('【存取拒絕】您尚未登入管理員帳號或無管理員 (ADMIN) 權限，即將返回首頁！');
    window.location.replace('/admin/admin_login.html');
    return false;
  }
  return true;
}

async function dbQuery(sql) {
  const token = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token');
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'Authorization': `Bearer ${token}`
    },
    body: sql
  });

  if (res.status === 401 || res.status === 403) {
    alert('身分認證失效或無管理權限，請重新登入。');
    window.location.replace('/admin/admin_login.html');
    return [];
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function dbExecute(sql) {
  const token = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token');
  const adminId = localStorage.getItem('admin_user_id') || sessionStorage.getItem('admin_user_id') || '';
  const adminEmail = localStorage.getItem('admin_user_email') || sessionStorage.getItem('admin_user_email') || '';

  const res = await fetch('/api/execute', {
    method: 'POST',
    headers: { 
      'Content-Type': 'text/plain; charset=UTF-8',
      'Authorization': `Bearer ${token}`,
      'X-Admin-User-Id': adminId,
      'X-Admin-Email': adminEmail
    },
    body: sql
  });

  if (res.status === 401 || res.status === 403) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || '操作被拒絕：權限不足');
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function showAlert(msg, isSuccess = true) {
  const box = document.getElementById('alert-box');
  box.textContent = msg;
  box.className = 'alert ' + (isSuccess ? 'alert-success' : 'alert-danger');
  box.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => { box.style.display = 'none'; }, 5000);
}

// ==========================================
// 介面模式切換
// ==========================================
function switchMode(mode) {
  const sec1 = document.getElementById('section-mode-1');
  const sec2 = document.getElementById('section-mode-2');
  const btn1 = document.getElementById('btn-mode-1');
  const btn2 = document.getElementById('btn-mode-2');

  if (mode === 1) {
    sec1.style.display = 'block';
    sec2.style.display = 'none';
    btn1.className = 'mode-btn active';
    btn2.className = 'mode-btn';
  } else {
    sec1.style.display = 'none';
    sec2.style.display = 'block';
    btn1.className = 'mode-btn';
    btn2.className = 'mode-btn active';
    loadUsersWithoutPassword();
  }
}

// ==========================================
// 模式 1：新增登記用戶
// ==========================================
async function handleCreateUser(e) {
  e.preventDefault();

  const name = document.getElementById('m1-name').value.trim();
  let email = document.getElementById('m1-email').value.trim();
  const nickname = document.getElementById('m1-nickname').value.trim();
  const rank = document.getElementById('m1-rank').value.trim();
  const post = document.getElementById('m1-post').value.trim();
  const dept = document.getElementById('m1-dept').value.trim();
  const right = document.getElementById('m1-right').value;
  const rawPassword = document.getElementById('m1-password').value;

  if (!name || !rawPassword || !email) {
    showAlert('姓名、電郵與初始密碼為必填項目！', false);
    return;
  }

  if (!email.toLowerCase().endsWith('@swd.gov.hk') && !email.contains('@')) {
    email = email + '@swd.gov.hk';
  }

  try {
    const escapeSql = (str) => str ? `'${str.replace(/'/g, "''")}'` : 'NULL';

    // 1. 先建立員工基本資料 (ST_password_hash 先暫留 NULL)
    const sql = `
      INSERT INTO "T05_Staff" (
        "ST_Name", "ST_Email", "ST_NickName", "ST_Rank", "ST_Post",
        "ST_Company_Department", "ST_Right", "ST_IsActive", "ST_ActiveDate"
      ) VALUES (
        ${escapeSql(name)},
        ${escapeSql(email)},
        ${escapeSql(nickname)},
        ${escapeSql(rank)},
        ${escapeSql(post)},
        ${escapeSql(dept)},
        ${escapeSql(right)},
        TRUE,
        CURRENT_TIMESTAMP
      )
    `;

    await dbExecute(sql);

    // 2. 抓取剛建立的使用者 PK_T05
    const querySql = `SELECT "PK_T05" FROM "T05_Staff" WHERE "ST_Email" = ${escapeSql(email)}`;
    const result = await dbQuery(querySql);

    if (result && result.length > 0) {
      const newStaffId = result[0].PK_T05 || result[0].pk_t05;
      // 3. 呼叫後端 API 統一使用 Java 原生 Security.sha256 設定密碼
      const token = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token');
      const pwdRes = await fetch('/api/auth/admin-set-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          staff_id: parseInt(newStaffId, 10),
          password: rawPassword
        })
      });

      const pwdData = await pwdRes.json();
      if (!pwdRes.ok || pwdData.status !== 'SUCCESS') {
        throw new Error(pwdData.message || '密碼設定失敗');
      }
    }

    showAlert(`成功建立新同仁帳號 [${name}] 並完成標準密碼設定！`, true);
    e.target.reset();
    document.getElementById('m1-right').value = 'GENERAL';
  } catch (err) {
    showAlert('建立用戶失敗: ' + err.message, false);
  }
}

// ==========================================
// 模式 2：載入未設定密碼的名冊
// ==========================================
async function loadUsersWithoutPassword() {
  const tbody = document.getElementById('no-pwd-tbody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">名冊載入中...</td></tr>';

  try {
    const sql = `
      SELECT "PK_T05", "ST_Name", "ST_NickName", "ST_Rank", "ST_Company_Department", "ST_Right"
      FROM "T05_Staff"
      WHERE "ST_password_hash" IS NULL OR "ST_password_hash" = ''
      ORDER BY "PK_T05" ASC
    `;
    const staffList = await dbQuery(sql);

    if (staffList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--success); font-weight: 600;">✓ 所有員工皆已完成密碼設定，目前無待處理帳號！</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    staffList.forEach(user => {
      const tr = document.createElement('tr');
      const pkId = user.PK_T05 || user.pk_t05;
      const stName = user.ST_Name || user.st_name || '-';
      const stNickName = user.ST_NickName || user.st_nickname || '-';
      const stRank = user.ST_Rank || user.st_rank || '-';
      const stDept = user.ST_Company_Department || user.st_company_department || '-';
      const stRight = user.ST_Right || user.st_right || '未設定';

      tr.innerHTML = `
        <td>${pkId}</td>
        <td><strong>${escapeHtml(stName)}</strong></td>
        <td>${escapeHtml(stNickName)}</td>
        <td>${escapeHtml(stRank)}</td>
        <td>${escapeHtml(stDept)}</td>
        <td><span class="badge">${escapeHtml(stRight)}</span></td>
        <td>
          <div class="action-cell">
            <input type="password" id="pwd-input-${pkId}" placeholder="輸入新密碼">
            <button onclick="setStaffPassword(${pkId}, '${escapeJs(stName)}')">儲存密碼</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showAlert('讀取名冊失敗: ' + err.message, false);
  }
}

// ==========================================
// 為指定員工儲存密碼 (改呼叫後端 API 由 Java 進行標準 Hash)
// ==========================================
async function setStaffPassword(staffId, staffName) {
  const input = document.getElementById(`pwd-input-${staffId}`);
  const rawPassword = input.value;

  if (!rawPassword) {
    alert('請先輸入密碼！');
    input.focus();
    return;
  }

  try {
    const token = localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token');
    const res = await fetch('/api/auth/admin-set-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        staff_id: parseInt(staffId, 10),
        password: rawPassword
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'SUCCESS') {
      showAlert(`已為同仁 [${staffName}] 成功啟用帳號並儲存新密碼！`, true);
      loadUsersWithoutPassword();
    } else {
      throw new Error(data.message || '密碼設定失敗');
    }
  } catch (err) {
    showAlert(`設定密碼失敗: ` + err.message, false);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

document.addEventListener('DOMContentLoaded', () => {
  if (checkAdminAuth()) {
    // 預設處於模式 1
  }
});