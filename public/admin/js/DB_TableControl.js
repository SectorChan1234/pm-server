/**
 * H2 資料庫萬用控制台核心控制器 (Universal Database Control Engine)
 * File: /public/admin/js/DB_TableControl.js
 * Architecture: Zero-Trust Intranet, Vanilla JS (No External Dependencies)
 * 
 * 核心功能：
 * 1. 完整相容 DBAdminHandler.java JSON 傳輸契約與 Bearer Token 鑑權。
 * 2. 嚴格貫徹 H2 雙引號轉義規範 ("TableName", "ColumnName")，防止大小寫識別失敗。
 * 3. 雙檢視支援：資料檢視 (Data View) 與綱要結構檢視 (Schema View)。
 * 4. 完整實作單筆新增、Excel 批次貼上匯入映射、全 DB 架構匯出 (UI/DDL/Markdown)。
 * 5. 稽核保護：T99_AuditLog 自動鎖定唯讀，阻斷任何修改、刪除或清空操作。
 * 6. 即時動態排序、多欄位篩選、單元格雙擊快編、整庫 SCRIPT 備份下載。
 */

// ==========================================
// 全域狀態管理 (State Management)
// ==========================================
let currentTable = '';
let currentView = 'data';          // 'data' | 'schema'
let currentPrimaryKey = '';
let tableColumns = [];             // 欄位中繼資料清單
let allTablesList = [];            // 資料表清單

let uniqueConstraintsMap = {};     // 唯一性約束快取 { colName: constraintName }
let indexesMap = {};               // 索引快取 { colName: indexName }
let foreignKeysMap = {};           // 外鍵快取 { colName: { constraintName, pkTable, pkCol } }

let currentSortColumn = '';        // 當前排序欄位
let currentSortOrder = 'DESC';     // 'ASC' | 'DESC'
let currentFilters = {};           // 篩選條件快取 { colName: filterValue }
let currentLimit = 100;            // 查詢上限筆數

// ==========================================
// 權限檢核與 API 通訊層 (Auth & Transport)
// ==========================================
function getActiveToken() {
  return localStorage.getItem('pb_token') || sessionStorage.getItem('pb_token') ||
         localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken') ||
         localStorage.getItem('token') || sessionStorage.getItem('token') || '';
}

function checkAdminAuth() {
  const token = getActiveToken();
  let userRight = (localStorage.getItem('admin_user_right') || sessionStorage.getItem('admin_user_right') || '').toUpperCase();

  if (!userRight) {
    try {
      const userStr = localStorage.getItem('pb_user') || sessionStorage.getItem('pb_user') ||
                      localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || '{}';
      const u = JSON.parse(userStr);
      userRight = (u.stRight || u.st_right || '').toUpperCase();
    } catch (e) {
      userRight = '';
    }
  }

  if (!token || userRight !== 'ADMIN') {
    alert('⚠️【Access Denied】需要管理員 (ADMIN) 權限方可存取資料庫主控台。即將返回登入頁。');
    window.location.replace('admin_login.html');
    return false;
  }
  return true;
}

/**
 * 執行 SQL 查詢 (支援 /api/query 與 /api/admin/query 雙向回退)
 */
async function dbQuery(sql) {
  const token = getActiveToken();
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Authorization': `Bearer ${token}`
  };

  const endpoints = ['/api/query', '/api/admin/query'];
  let lastError = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ sql: sql })
      });

      if (res.status === 404) continue;
      if (res.status === 401 || res.status === 403) {
        alert('身分驗證失效或無管理權限，請重新登入。');
        window.location.replace('admin_login.html');
        throw new Error('未授權的操作');
      }

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || `HTTP ${res.status}`);
      }

      // 解包 DBAdminHandler 所回傳之 data 陣列
      return Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('後端連線失敗 (/api/query 與 /api/admin/query 均無回應)');
}

/**
 * 執行 SQL 更新/變更 (INSERT / UPDATE / DELETE / DDL)
 */
async function dbExecute(sql) {
  const token = getActiveToken();
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Authorization': `Bearer ${token}`
  };

  const endpoints = ['/api/execute', '/api/admin/execute'];
  let lastError = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ sql: sql })
      });

      if (res.status === 404) continue;
      if (res.status === 401 || res.status === 403) {
        alert('身分驗證失效或無管理權限，請重新登入。');
        window.location.replace('admin_login.html');
        throw new Error('未授權的操作');
      }

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || `HTTP ${res.status}`);
      }
      return json;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('後端連線失敗 (/api/execute 與 /api/admin/execute 均無回應)');
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--danger)' : '#16a34a';
  setTimeout(() => {
    if (el.textContent === msg) el.textContent = '';
  }, 4500);
}

function isAuditLogTable() {
  return (currentTable || '').toUpperCase() === 'T99_AUDITLOG';
}

// ==========================================
// 1. 初始化與資料表載入 (Table Loading)
// ==========================================
async function loadTableList() {
  try {
    const sql = `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE UPPER(TABLE_SCHEMA) = 'PUBLIC' ORDER BY TABLE_NAME ASC`;
    const list = await dbQuery(sql);
    allTablesList = list.map(t => t.TABLE_NAME || Object.values(t)[0]);

    const sel = document.getElementById('table-select');
    if (!sel) return;
    sel.innerHTML = '';

    if (allTablesList.length === 0) {
      sel.innerHTML = '<option value="">(無可用資料表)</option>';
      return;
    }

    allTablesList.forEach(tbl => {
      const opt = document.createElement('option');
      opt.value = tbl;
      opt.textContent = tbl;
      sel.appendChild(opt);
    });

    // 優先選取 T05_Staff 或第一張表
    const preferred = allTablesList.find(t => t.toUpperCase() === 'T05_STAFF') || allTablesList[0];
    sel.value = preferred;
    currentTable = preferred;
    await loadCurrentTable();
  } catch (err) {
    console.error('載入資料表清單失敗:', err);
    setStatus('取得資料表清單失敗: ' + err.message, true);
  }
}

function onTableSelectChanged() {
  const sel = document.getElementById('table-select');
  currentTable = sel ? sel.value : '';
  currentSortColumn = '';
  currentSortOrder = 'DESC';
  currentFilters = {};
  loadCurrentTable();
}

function switchTab(view) {
  currentView = view;
  const dataBtn = document.getElementById('tab-data-btn');
  const schemaBtn = document.getElementById('tab-schema-btn');
  if (dataBtn) dataBtn.className = 'tab-btn ' + (view === 'data' ? 'active' : '');
  if (schemaBtn) schemaBtn.className = 'tab-btn ' + (view === 'schema' ? 'active' : '');

  const isAudit = isAuditLogTable();
  const schemaTools = document.getElementById('schema-tools');
  const ddlSection = document.getElementById('ddl-section');
  const infoBar = document.getElementById('table-info-bar');

  if (schemaTools) schemaTools.style.display = (view === 'schema' && !isAudit) ? 'block' : 'none';
  if (ddlSection) ddlSection.style.display = view === 'schema' ? 'block' : 'none';
  if (infoBar) infoBar.style.display = view === 'data' ? 'flex' : 'none';

  loadCurrentTable();
}

async function loadCurrentTable() {
  const sel = document.getElementById('table-select');
  if (sel && sel.value) {
    currentTable = sel.value;
  }
  if (!currentTable) return;

  const isAudit = isAuditLogTable();
  const btnSingle = document.getElementById('btn-insert-single');
  const btnBatch = document.getElementById('btn-insert-batch');
  const btnTruncate = document.getElementById('btn-truncate');
  const auditBadge = document.getElementById('append-only-badge');
  const schemaTools = document.getElementById('schema-tools');

  if (btnSingle) btnSingle.style.display = isAudit ? 'none' : 'inline-block';
  if (btnBatch) btnBatch.style.display = isAudit ? 'none' : 'inline-block';
  if (btnTruncate) btnTruncate.style.display = isAudit ? 'none' : 'inline-block';
  if (auditBadge) auditBadge.style.display = isAudit ? 'inline' : 'none';
  if (schemaTools && currentView === 'schema') {
    schemaTools.style.display = isAudit ? 'none' : 'block';
  }

  try {
    await detectTableMetadata();

    if (currentView === 'data') {
      await renderDataView();
    } else {
      await renderSchemaView();
      await loadTableDDL();
    }
  } catch (err) {
    console.error('載入資料表失敗:', err);
    setStatus('讀取失敗: ' + err.message, true);
  }
}

// ==========================================
// 2. 中繼資料探測 (Metadata Detection)
// ==========================================
async function detectTableMetadata() {
  const metaSql = `
    SELECT COLUMN_NAME, TYPE_NAME, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE UPPER(TABLE_SCHEMA) = 'PUBLIC' AND UPPER(TABLE_NAME) = UPPER('${currentTable}')
    ORDER BY ORDINAL_POSITION ASC
  `;
  tableColumns = await dbQuery(metaSql);

  // 1. 探測 Primary Key (優先從 INFORMATION_SCHEMA.CONSTRAINTS 獲取)
  currentPrimaryKey = '';
  try {
    const pkSql = `
      SELECT COLUMN_LIST
      FROM INFORMATION_SCHEMA.CONSTRAINTS
      WHERE UPPER(TABLE_SCHEMA) = 'PUBLIC' AND UPPER(TABLE_NAME) = UPPER('${currentTable}') AND CONSTRAINT_TYPE = 'PRIMARY KEY'
    `;
    const pks = await dbQuery(pkSql);
    if (pks.length > 0 && pks[0].COLUMN_LIST) {
      currentPrimaryKey = pks[0].COLUMN_LIST.split(',')[0].trim();
    }
  } catch (e) {
    console.warn('PK 約束探測降級:', e);
  }

  if (!currentPrimaryKey) {
    const pkCol = tableColumns.find(c => c.COLUMN_NAME.toUpperCase().startsWith('PK_') || c.COLUMN_NAME.toUpperCase().endsWith('_ID'));
    currentPrimaryKey = pkCol ? pkCol.COLUMN_NAME : (tableColumns[0] ? tableColumns[0].COLUMN_NAME : '');
  }

  // 2. 探測 UNIQUE 約束
  uniqueConstraintsMap = {};
  try {
    const uqSql = `
      SELECT CONSTRAINT_NAME, COLUMN_LIST
      FROM INFORMATION_SCHEMA.CONSTRAINTS
      WHERE UPPER(TABLE_SCHEMA) = 'PUBLIC' AND UPPER(TABLE_NAME) = UPPER('${currentTable}') AND CONSTRAINT_TYPE = 'UNIQUE'
    `;
    const uqs = await dbQuery(uqSql);
    uqs.forEach(u => {
      if (u.COLUMN_LIST) {
        uniqueConstraintsMap[u.COLUMN_LIST.trim()] = u.CONSTRAINT_NAME;
      }
    });
  } catch (e) {
    console.warn('UQ 約束探測失敗:', e);
  }

  // 3. 探測獨立 INDEX
  indexesMap = {};
  try {
    const idxSql = `
      SELECT INDEX_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.INDEXES
      WHERE UPPER(TABLE_SCHEMA) = 'PUBLIC' AND UPPER(TABLE_NAME) = UPPER('${currentTable}') 
        AND PRIMARY_KEY = FALSE AND NON_UNIQUE = TRUE
    `;
    const idxs = await dbQuery(idxSql);
    idxs.forEach(i => {
      if (i.COLUMN_NAME) {
        indexesMap[i.COLUMN_NAME.trim()] = i.INDEX_NAME;
      }
    });
  } catch (e) {
    console.warn('Index 探測失敗:', e);
  }

  // 4. 探測外鍵 (Foreign Keys)
  foreignKeysMap = {};
  try {
    const fkSql = `
      SELECT FKCOLUMN_NAME, PKTABLE_NAME, PKCOLUMN_NAME, FK_NAME
      FROM INFORMATION_SCHEMA.CROSS_REFERENCES
      WHERE UPPER(FKTABLE_SCHEMA) = 'PUBLIC' AND UPPER(FKTABLE_NAME) = UPPER('${currentTable}')
    `;
    const fks = await dbQuery(fkSql);
    fks.forEach(f => {
      if (f.FKCOLUMN_NAME) {
        foreignKeysMap[f.FKCOLUMN_NAME.trim()] = {
          constraintName: f.FK_NAME,
          pkTable: f.PKTABLE_NAME,
          pkCol: f.PKCOLUMN_NAME
        };
      }
    });
  } catch (e) {
    console.warn('FK 探測失敗:', e);
  }
}

// ==========================================
// 3. 資料檢視渲染 (Data View & Filtering)
// ==========================================
async function renderDataView() {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  if (!thead || !tbody) return;

  const isAudit = isAuditLogTable();
  thead.innerHTML = buildTableHeadHtml();
  tbody.innerHTML = `<tr><td colspan="${tableColumns.length + 1}" style="text-align:center; padding: 25px; color:#64748b;">正在載入資料...</td></tr>`;

  const dataSql = buildDynamicSelectSql();
  const countSql = buildDynamicCountSql();

  try {
    const [rows, countRes, totalRes] = await Promise.all([
      dbQuery(dataSql),
      dbQuery(countSql),
      dbQuery(`SELECT COUNT(*) AS TOTAL FROM "${currentTable}"`)
    ]);

    const filteredCount = countRes[0] ? (countRes[0].CNT || countRes[0].cnt || 0) : 0;
    const totalCount = totalRes[0] ? (totalRes[0].TOTAL || totalRes[0].total || 0) : 0;

    const hasFilters = Object.keys(currentFilters).length > 0;
    const filterBadge = document.getElementById('active-filter-badge');
    if (filterBadge) filterBadge.style.display = hasFilters ? 'inline' : 'none';

    const countInfo = document.getElementById('record-count-info');
    if (countInfo) {
      countInfo.innerHTML = `顯示 <strong>${rows.length}</strong> 筆 / 篩選命中 <strong>${filteredCount}</strong> 筆 (全表共 ${totalCount} 筆)`;
    }

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${tableColumns.length + 1}" style="text-align:center; padding: 30px; color:#94a3b8;">無符合條件的記錄</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const pkVal = row[currentPrimaryKey] !== undefined ? row[currentPrimaryKey] : '';

      let rowHtml = isAudit
        ? `<td style="text-align:center; color:#94a3b8; font-size:11px; font-weight:600;">🔒 唯讀</td>`
        : `<td style="text-align:center;"><button class="danger" style="padding: 2px 7px; font-size: 11px;" onclick="deleteRow('${escapeJs(String(pkVal))}')">刪除</button></td>`;

      tableColumns.forEach(c => {
        const colName = c.COLUMN_NAME;
        const val = row[colName];
        let displayVal = '';

        if (val === null || val === undefined) {
          displayVal = '<span style="color:#cbd5e1; font-style:italic;">NULL</span>';
        } else if (typeof val === 'boolean') {
          displayVal = val ? '<span style="color:#16a34a; font-weight:bold;">TRUE</span>' : '<span style="color:#dc2626; font-weight:bold;">FALSE</span>';
        } else {
          const strVal = String(val);
          // 密碼雜湊防禦標記 (Stage 1 Salted 成果檢驗)
          if (colName.toUpperCase().includes('PASSWORD') || colName.toUpperCase().includes('HASH')) {
            if (strVal.includes(':')) {
              displayVal = `<span style="background:#dcfce7; color:#15803d; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-family:monospace;" title="${escapeHtml(strVal)}">🔒 Salted (${strVal.substring(0, 10)}...)</span>`;
            } else {
              displayVal = `<span style="background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-family:monospace;" title="${escapeHtml(strVal)}">⚠️ Legacy (${strVal.substring(0, 8)}...)</span>`;
            }
          } else {
            const truncated = strVal.length > 55 ? strVal.substring(0, 55) + '...' : strVal;
            displayVal = `<span title="${escapeHtml(strVal)}">${escapeHtml(truncated)}</span>`;
          }
        }

        const isEditable = !isAudit && colName !== currentPrimaryKey;
        rowHtml += `<td class="${isEditable ? 'editable' : ''}" 
                        ${isEditable ? `ondblclick="editCell(this, '${escapeJs(String(pkVal))}', '${escapeJs(colName)}')"` : ''} 
                        title="${isEditable ? '雙擊以修改欄位內容' : (isAudit ? '稽核表不可修改' : '主鍵不可編輯')}">${displayVal}</td>`;
      });

      tr.innerHTML = rowHtml;
      tbody.appendChild(tr);
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${tableColumns.length + 1}" style="text-align:center; padding: 20px; color:var(--danger);">查詢執行失敗: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function buildTableHeadHtml() {
  let row1 = '<tr><th style="width: 65px; text-align: center;">操作</th>';
  tableColumns.forEach(c => {
    const col = c.COLUMN_NAME;
    const isPk = col === currentPrimaryKey;
    const isUq = !!uniqueConstraintsMap[col];
    const isFk = !!foreignKeysMap[col];
    const isIdx = !!indexesMap[col];

    let sortIcon = '<span style="color:#cbd5e1; font-size:10px; margin-left:4px;">↕</span>';
    if (currentSortColumn === col) {
      sortIcon = currentSortOrder === 'ASC'
        ? '<span style="color:var(--primary); font-weight:bold; margin-left:4px;">▲</span>'
        : '<span style="color:var(--primary); font-weight:bold; margin-left:4px;">▼</span>';
    } else if (!currentSortColumn && isPk) {
      sortIcon = currentSortOrder === 'ASC'
        ? '<span style="color:#94a3b8; margin-left:4px;">▲</span>'
        : '<span style="color:#94a3b8; margin-left:4px;">▼</span>';
    }

    row1 += `
      <th class="sortable-th" onclick="handleSortClick('${escapeJs(col)}')" title="點擊切換排序">
        ${escapeHtml(col)}
        ${isPk ? '<span class="badge badge-pk">PK</span>' : ''} 
        ${isUq ? '<span class="badge badge-uq">UQ</span>' : ''} 
        ${isFk ? '<span class="badge badge-fk">FK</span>' : ''}
        ${isIdx ? '<span class="badge badge-idx">IDX</span>' : ''}
        ${sortIcon}
      </th>
    `;
  });
  row1 += '</tr>';

  let row2 = '<tr class="filter-row"><th style="text-align:center;"><button class="secondary" style="padding: 2px 5px; font-size: 10px;" onclick="clearAllFilters()" title="清除所有條件">✕ 清空</button></th>';
  tableColumns.forEach(c => {
    const col = c.COLUMN_NAME;
    const type = (c.TYPE_NAME || '').toUpperCase();
    const currentVal = currentFilters[col] || '';

    if (type === 'BOOLEAN') {
      row2 += `
        <th>
          <select class="filter-input" onchange="onFilterChanged('${escapeJs(col)}', this.value)">
            <option value="">(全部)</option>
            <option value="TRUE" ${currentVal === 'TRUE' ? 'selected' : ''}>TRUE</option>
            <option value="FALSE" ${currentVal === 'FALSE' ? 'selected' : ''}>FALSE</option>
            <option value="NULL" ${currentVal === 'NULL' ? 'selected' : ''}>NULL</option>
          </select>
        </th>
      `;
    } else {
      row2 += `
        <th>
          <input type="text" class="filter-input" placeholder="篩選..." value="${escapeHtml(currentVal)}"
                 onchange="onFilterChanged('${escapeJs(col)}', this.value)"
                 onkeydown="if(event.key==='Enter') onFilterChanged('${escapeJs(col)}', this.value)">
        </th>
      `;
    }
  });
  row2 += '</tr>';

  return row1 + row2;
}

function buildWhereClauses() {
  const whereClauses = [];
  for (const [col, rawVal] of Object.entries(currentFilters)) {
    const val = rawVal.trim();
    if (!val) continue;

    const colMeta = tableColumns.find(c => c.COLUMN_NAME === col);
    const type = colMeta ? colMeta.TYPE_NAME.toUpperCase() : 'VARCHAR';

    if (val.toUpperCase() === 'NULL') {
      whereClauses.push(`"${col}" IS NULL`);
    } else if (val.toUpperCase() === 'NOT NULL') {
      whereClauses.push(`"${col}" IS NOT NULL`);
    } else if (type === 'BOOLEAN') {
      if (val === 'TRUE' || val === 'FALSE') whereClauses.push(`"${col}" = ${val}`);
    } else if (['INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'DOUBLE', 'NUMERIC'].includes(type)) {
      if (val.startsWith('>') || val.startsWith('<') || val.startsWith('=')) {
        whereClauses.push(`"${col}" ${val}`);
      } else if (!isNaN(val.replace(/,/g, ''))) {
        whereClauses.push(`"${col}" = ${val.replace(/,/g, '')}`);
      } else {
        whereClauses.push(`CAST("${col}" AS VARCHAR) LIKE '%${val.replace(/'/g, "''")}%'`);
      }
    } else {
      const escaped = val.replace(/'/g, "''");
      whereClauses.push(`CAST("${col}" AS VARCHAR) ILIKE '%${escaped}%'`);
    }
  }
  return whereClauses;
}

function buildDynamicSelectSql() {
  let sql = `SELECT * FROM "${currentTable}"`;
  const whereClauses = buildWhereClauses();
  if (whereClauses.length > 0) sql += ` WHERE ` + whereClauses.join(' AND ');

  const sortCol = currentSortColumn || currentPrimaryKey;
  if (sortCol) sql += ` ORDER BY "${sortCol}" ${currentSortOrder}`;

  if (currentLimit > 0) sql += ` LIMIT ${currentLimit}`;
  return sql;
}

function buildDynamicCountSql() {
  let sql = `SELECT COUNT(*) AS CNT FROM "${currentTable}"`;
  const whereClauses = buildWhereClauses();
  if (whereClauses.length > 0) sql += ` WHERE ` + whereClauses.join(' AND ');
  return sql;
}

function handleSortClick(colName) {
  if (currentSortColumn === colName) {
    if (currentSortOrder === 'ASC') {
      currentSortOrder = 'DESC';
    } else {
      currentSortColumn = '';
      currentSortOrder = 'DESC';
    }
  } else {
    currentSortColumn = colName;
    currentSortOrder = 'ASC';
  }
  renderDataView();
}

function onFilterChanged(colName, value) {
  if (!value || value.trim() === '') {
    delete currentFilters[colName];
  } else {
    currentFilters[colName] = value.trim();
  }
  renderDataView();
}

function onLimitChanged(limitVal) {
  currentLimit = parseInt(limitVal, 10);
  renderDataView();
}

function clearAllFilters() {
  currentFilters = {};
  currentSortColumn = '';
  currentSortOrder = 'DESC';
  renderDataView();
}

// ==========================================
// 4. 表結構檢視與 DDL (Schema View & DDL)
// ==========================================
async function renderSchemaView() {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  if (!thead || !tbody) return;
  const isAudit = isAuditLogTable();

  thead.innerHTML = `
    <tr>
      <th>欄位名稱</th>
      <th>型態 (TYPE)</th>
      <th style="width: 120px;">長度 (點擊修改)</th>
      <th style="width: 130px;">預設值 (DEFAULT)</th>
      <th style="width: 110px; text-align: center;">允許 NULL</th>
      <th style="width: 120px; text-align: center;">唯一值 (UNIQUE)</th>
      <th style="width: 110px; text-align: center;">單欄索引</th>
      <th style="width: 180px;">外鍵關聯 (FK)</th>
      <th style="width: 70px; text-align: center;">操作</th>
    </tr>
  `;

  tbody.innerHTML = '';
  tableColumns.forEach(c => {
    const tr = document.createElement('tr');
    const col = c.COLUMN_NAME;
    const isPk = col === currentPrimaryKey;
    const isNullable = c.IS_NULLABLE === 'YES';
	const colTypeUpper = (c.TYPE_NAME || '').toUpperCase();
	const stringTypes = ['VARCHAR', 'CHARACTER VARYING', 'CHAR', 'VARCHAR_IGNORECASE', 'NVARCHAR', 'VARCHAR2'];
	const canChangeLength = stringTypes.includes(colTypeUpper) || colTypeUpper.includes('VARCHAR');
    const uqConstraint = uniqueConstraintsMap[col];
    const isUnique = !!uqConstraint;

    const idxName = indexesMap[col];
    const hasIndex = !!idxName;

    const fkInfo = foreignKeysMap[col];

    tr.innerHTML = `
      <td><strong>${escapeHtml(col)}</strong> ${isPk ? '<span class="badge badge-pk">PK</span>' : ''}</td>
      <td><span class="badge">${escapeHtml(c.TYPE_NAME)}</span></td>
      
		<td>
		  ${canChangeLength && !isPk && !isAudit
			? `<button class="secondary" style="padding: 2px 7px; font-size: 11px;" onclick="alterColumnLength('${escapeJs(col)}', '${escapeJs(c.TYPE_NAME)}', ${c.CHARACTER_MAXIMUM_LENGTH || 255})">
				 長度: ${c.CHARACTER_MAXIMUM_LENGTH || '-'} ✎
			   </button>`
			: (c.CHARACTER_MAXIMUM_LENGTH || '-')}
		</td>
      <td>
        ${!isPk && !isAudit
          ? `<button class="secondary" style="padding: 2px 7px; font-size: 11px;" onclick="alterColumnDefault('${escapeJs(col)}', '${escapeJs(c.COLUMN_DEFAULT || '')}')">
               ${c.COLUMN_DEFAULT ? escapeHtml(c.COLUMN_DEFAULT) : '無 (設定) ✎'}
             </button>`
          : (c.COLUMN_DEFAULT ? escapeHtml(c.COLUMN_DEFAULT) : '-')}
      </td>

      <td style="text-align: center;">
        ${!isPk && !isAudit
          ? `<button style="padding: 2px 8px; font-size: 11px; background: ${isNullable ? '#0284c7' : '#e11d48'}; color:#fff; border:none; border-radius:4px; cursor:pointer;" 
                     onclick="toggleNullable('${escapeJs(col)}',${isNullable})">
               ${isNullable ? 'YES (允許)' : 'NO (必填)'}
             </button>`
          : (isNullable ? 'YES' : 'NO')}
      </td>

      <td style="text-align: center;">
        ${!isPk && !isAudit
          ? `<button class="${isUnique ? 'purple' : 'secondary'}" style="padding: 2px 8px; font-size: 11px;" 
                     onclick="toggleUnique('${escapeJs(col)}', ${isUnique}, '${escapeJs(uqConstraint || '')}')">
               ${isUnique ? 'YES (唯一值)' : 'NO (一般)'}
             </button>`
          : (isPk ? '<span class="badge badge-pk">PK 固有</span>' : '-')}
      </td>

      <td style="text-align: center;">
        ${!isPk && !isUnique && !isAudit
          ? `<button class="${hasIndex ? 'success' : 'secondary'}" style="padding: 2px 8px; font-size: 11px;" 
                     onclick="toggleIndex('${escapeJs(col)}', ${hasIndex}, '${escapeJs(idxName || '')}')">
               ${hasIndex ? 'YES (已建)' : 'NO (建立)'}
             </button>`
          : (hasIndex ? 'YES' : '-')}
      </td>

      <td>
        ${fkInfo
          ? `<div><span class="badge badge-fk" title="FK 約束: ${escapeHtml(fkInfo.constraintName)}">→ ${escapeHtml(fkInfo.pkTable)}.${escapeHtml(fkInfo.pkCol)}</span></div>`
          : '-'}
      </td>

      <td style="text-align: center;">
        ${!isPk && !isAudit ? `<button class="danger" style="padding: 2px 6px; font-size: 11px;" onclick="dropColumn('${escapeJs(col)}')">刪除</button>` : '-'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadTableDDL() {
  const textarea = document.getElementById('ddl-textarea');
  if (!textarea) return;

  try {
    const res = await dbQuery(`SCRIPT NODATA NOSETTINGS`);
    const currentTableUpper = currentTable.toUpperCase();
    const ddlLines = res
      .map(r => r.SCRIPT || Object.values(r)[0])
      .filter(stmt => {
        if (!stmt) return false;
        const s = stmt.toUpperCase();
        return s.includes(`"${currentTableUpper}"`) || s.includes(` ${currentTableUpper} `) || s.includes(` ${currentTableUpper}(`);
      });

    if (ddlLines.length > 0) {
      textarea.value = ddlLines.join('\n\n');
    } else {
      textarea.value = `-- 未能取得資料表 ${currentTable} 的原生 DDL 定義`;
    }
  } catch (err) {
    textarea.value = `-- 產生 DDL 失敗: ${err.message}`;
  }
}

function copyDDL() {
  const textarea = document.getElementById('ddl-textarea');
  if (!textarea) return;
  textarea.select();
  navigator.clipboard.writeText(textarea.value).then(() => {
    alert('DDL SQL 語句已成功複製至剪貼簿！');
  }).catch(err => {
    alert('複製失敗，請手動全選複製: ' + err);
  });
}

// ==========================================
// 5. 批次匯入 (Excel 複製貼上與欄位映射)
// ==========================================
let parsedExcelData = [];
let parsedColCount = 0;

function openBatchInsertModal() {
  if (!currentTable || isAuditLogTable()) return;
  const nameSpan = document.getElementById('batch-modal-table-name');
  if (nameSpan) nameSpan.textContent = currentTable;

  const textarea = document.getElementById('batch-paste-textarea');
  const stat = document.getElementById('batch-paste-stat');
  const head = document.getElementById('batch-preview-head');
  const body = document.getElementById('batch-preview-body');
  const submitBtn = document.getElementById('batch-submit-btn');
  const statusEl = document.getElementById('batch-import-status');

  if (textarea) textarea.value = '';
  if (stat) stat.textContent = '尚未貼入任何資料';
  if (head) head.innerHTML = '';
  if (body) body.innerHTML = '<tr><td style="text-align: center; color: #94a3b8; padding: 20px;">請先於上方貼上 Excel 資料</td></tr>';
  if (submitBtn) submitBtn.disabled = true;
  if (statusEl) statusEl.textContent = '';

  const modal = document.getElementById('batch-insert-modal');
  if (modal) modal.style.display = 'flex';
}

function closeBatchInsertModal() {
  const modal = document.getElementById('batch-insert-modal');
  if (modal) modal.style.display = 'none';
}

function parseExcelPasteData() {
  const textarea = document.getElementById('batch-paste-textarea');
  const statEl = document.getElementById('batch-paste-stat');
  const submitBtn = document.getElementById('batch-submit-btn');
  const hasHeaderEl = document.getElementById('batch-has-header');

  const raw = textarea ? textarea.value.trim() : '';
  const hasHeader = hasHeaderEl ? hasHeaderEl.checked : true;

  if (!raw) {
    if (statEl) statEl.textContent = '尚未貼入任何資料';
    const head = document.getElementById('batch-preview-head');
    const body = document.getElementById('batch-preview-body');
    if (head) head.innerHTML = '';
    if (body) body.innerHTML = '<tr><td style="text-align: center; color: #94a3b8; padding: 20px;">請先於上方貼上 Excel 資料</td></tr>';
    if (submitBtn) submitBtn.disabled = true;
    parsedExcelData = [];
    return;
  }

  const lines = raw.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return;

  const rawRows = lines.map(line => line.split('\t').map(c => c.trim()));
  parsedColCount = Math.max(...rawRows.map(r => r.length));

  let headerRow = null;
  let dataRows = [];

  if (hasHeader && rawRows.length > 0) {
    headerRow = rawRows[0];
    dataRows = rawRows.slice(1);
  } else {
    dataRows = rawRows;
  }

  parsedExcelData = dataRows;
  if (statEl) statEl.textContent = `成功解析：共偵測到 ${dataRows.length} 筆資料記錄，每筆包含 ${parsedColCount} 個欄位。`;

  renderBatchMappingAndPreview(headerRow, dataRows);
  if (submitBtn) submitBtn.disabled = dataRows.length === 0;
}

function renderBatchMappingAndPreview(headerRow, dataRows) {
  const thead = document.getElementById('batch-preview-head');
  const tbody = document.getElementById('batch-preview-body');
  if (!thead || !tbody) return;
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const targetCols = tableColumns.filter(c => c.COLUMN_NAME !== currentPrimaryKey);

  let trMapping = '<tr><th style="width: 50px; text-align: center;">列號</th>';
  for (let i = 0; i < parsedColCount; i++) {
    const excelColHeader = headerRow && headerRow[i] ? headerRow[i] : `Excel 欄位 ${i + 1}`;

    let matchedColName = '';
    if (headerRow && headerRow[i]) {
      const rawHeaderName = headerRow[i].toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = targetCols.find(c => c.COLUMN_NAME.toLowerCase().replace(/[^a-z0-9]/g, '') === rawHeaderName);
      if (match) matchedColName = match.COLUMN_NAME;
    }

    if (!matchedColName && targetCols[i]) {
      matchedColName = targetCols[i].COLUMN_NAME;
    }

    let selectHtml = `<select class="mapping-select" data-col-idx="${i}">`;
    selectHtml += '<option value="__IGNORE__">(忽略不匯入)</option>';
    targetCols.forEach(c => {
      const isSelected = c.COLUMN_NAME === matchedColName ? 'selected' : '';
      selectHtml += `<option value="${escapeHtml(c.COLUMN_NAME)}" ${isSelected}>${escapeHtml(c.COLUMN_NAME)} (${escapeHtml(c.TYPE_NAME)})</option>`;
    });
    selectHtml += '</select>';

    trMapping += `
      <th>
        <div style="font-weight: bold; margin-bottom: 4px; color: var(--primary);">${escapeHtml(excelColHeader)}</div>
        ${selectHtml}
      </th>
    `;
  }
  trMapping += '</tr>';
  thead.innerHTML = trMapping;

  const previewRows = dataRows.slice(0, 10);
  previewRows.forEach((row, rIdx) => {
    const tr = document.createElement('tr');
    let rowHtml = `<td style="text-align: center; color: #94a3b8; font-size: 11px;">#${rIdx + 1}</td>`;
    for (let i = 0; i < parsedColCount; i++) {
      const val = row[i] !== undefined ? row[i] : '';
      rowHtml += `<td>${val === '' ? '<span style="color:#cbd5e1;">(空值)</span>' : escapeHtml(val)}</td>`;
    }
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });

  if (dataRows.length > 10) {
    const trMore = document.createElement('tr');
    trMore.innerHTML = `<td colspan="${parsedColCount + 1}" style="text-align: center; color: #64748b; font-style: italic; background: #f8fafc;">... 還有其餘 ${dataRows.length - 10} 筆記錄將一併匯入 ...</td>`;
    tbody.appendChild(trMore);
  }
}

async function submitBatchInsert() {
  if (!parsedExcelData || parsedExcelData.length === 0 || isAuditLogTable()) return;

  const selects = document.querySelectorAll('#batch-preview-head select[data-col-idx]');
  const mapping = [];
  selects.forEach(sel => mapping.push(sel.value));

  const activeMappings = mapping.filter(m => m !== '__IGNORE__');
  if (activeMappings.length === 0) {
    alert('請至少將一個 Excel 欄位映射至資料庫欄位！');
    return;
  }

  const hasDuplicate = new Set(activeMappings).size !== activeMappings.length;
  if (hasDuplicate) {
    alert('偵測到多個 Excel 欄位映射到了同一個資料庫欄位，請修正後再試！');
    return;
  }

  if (!confirm(`即將批次匯入 ${parsedExcelData.length} 筆記錄到 [${currentTable}]，確定繼續？`)) return;

  const submitBtn = document.getElementById('batch-submit-btn');
  const statusEl = document.getElementById('batch-import-status');
  if (submitBtn) submitBtn.disabled = true;
  if (statusEl) {
    statusEl.style.color = 'var(--primary)';
    statusEl.textContent = '正在寫入資料庫，請稍候...';
  }

  const colMetaMap = {};
  tableColumns.forEach(c => {
    colMetaMap[c.COLUMN_NAME] = {
      type: (c.TYPE_NAME || 'VARCHAR').toUpperCase(),
      nullable: c.IS_NULLABLE === 'YES',
      maxLen: c.CHARACTER_MAXIMUM_LENGTH
    };
  });

  const batchSize = 50;
  let totalSuccess = 0;

  try {
    for (let i = 0; i < parsedExcelData.length; i += batchSize) {
      const chunk = parsedExcelData.slice(i, i + batchSize);
      const valuesSqlList = [];

      chunk.forEach((row) => {
        const rowValues = [];
        mapping.forEach((targetCol, colIdx) => {
          if (targetCol === '__IGNORE__') return;

          const val = row[colIdx] !== undefined ? row[colIdx].trim() : '';
          const meta = colMetaMap[targetCol] || { type: 'VARCHAR', nullable: true };

          if (val === '' || val.toUpperCase() === 'NULL') {
            rowValues.push('NULL');
          } else if (meta.type === 'BOOLEAN') {
            const bVal = ['1', 'true', 'yes', 'y', '是'].includes(val.toLowerCase()) ? 'TRUE' : 'FALSE';
            rowValues.push(bVal);
          } else if (meta.type.includes('TIMESTAMP')) {
            let formatted = val.replace('T', ' ');
            if (formatted.length === 10) formatted += ' 00:00:00';
            else if (formatted.length === 16) formatted += ':00';
            rowValues.push(`'${formatted.replace(/'/g, "''")}'`);
          } else if (['INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'DOUBLE', 'NUMERIC'].includes(meta.type)) {
            const cleanNum = val.replace(/,/g, '');
            rowValues.push(isNaN(cleanNum) ? 'NULL' : cleanNum);
          } else {
            rowValues.push(`'${val.replace(/'/g, "''")}'`);
          }
        });

        valuesSqlList.push(`(${rowValues.join(', ')})`);
      });

      const sqlColNames = mapping.filter(m => m !== '__IGNORE__').map(m => `"${m}"`).join(', ');
      const sql = `INSERT INTO "${currentTable}" (${sqlColNames}) VALUES ${valuesSqlList.join(', ')}`;

      await dbExecute(sql);
      totalSuccess += chunk.length;
      if (statusEl) statusEl.textContent = `已寫入 ${totalSuccess} / ${parsedExcelData.length} 筆...`;
    }

    setStatus(`成功批次匯入 ${totalSuccess} 筆記錄！`);
    alert(`【批次匯入成功】\n共成功匯入 ${totalSuccess} 筆資料至 [${currentTable}]！`);
    closeBatchInsertModal();
    loadCurrentTable();
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = `匯入中斷: ${err.message}`;
    }
    alert(`批次匯入失敗 (已成功寫入 ${totalSuccess} 筆)：\n${err.message}`);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ==========================================
// 6. 全 DB 架構檢視與匯出 (Full DB Schema)
// ==========================================
let fullSchemaCurrentTab = 'ui';
let fullDbDdlText = '';
let fullDbMarkdownText = '';

async function openFullDbSchemaModal() {
  const modal = document.getElementById('full-schema-modal');
  if (modal) modal.style.display = 'flex';
  switchFullSchemaTab('ui');
  await loadFullDbSchemaData();
}

function closeFullDbSchemaModal() {
  const modal = document.getElementById('full-schema-modal');
  if (modal) modal.style.display = 'none';
}

function switchFullSchemaTab(tab) {
  fullSchemaCurrentTab = tab;
  const btnUI = document.getElementById('btn-schema-ui');
  const btnDDL = document.getElementById('btn-schema-ddl');
  const btnMD = document.getElementById('btn-schema-md');

  if (btnUI) btnUI.className = 'tab-btn ' + (tab === 'ui' ? 'active' : '');
  if (btnDDL) btnDDL.className = 'tab-btn ' + (tab === 'ddl' ? 'active' : '');
  if (btnMD) btnMD.className = 'tab-btn ' + (tab === 'md' ? 'active' : '');

  const uiBox = document.getElementById('full-schema-content-ui');
  const textBox = document.getElementById('full-schema-content-text');
  const textarea = document.getElementById('full-schema-textarea');

  if (tab === 'ui') {
    if (uiBox) uiBox.style.display = 'block';
    if (textBox) textBox.style.display = 'none';
  } else if (tab === 'ddl') {
    if (uiBox) uiBox.style.display = 'none';
    if (textBox) textBox.style.display = 'block';
    if (textarea) textarea.value = fullDbDdlText || '-- 正在提取全庫 DDL...';
  } else if (tab === 'md') {
    if (uiBox) uiBox.style.display = 'none';
    if (textBox) textBox.style.display = 'block';
    if (textarea) textarea.value = fullDbMarkdownText || '<!-- 正在編譯 Markdown... -->';
  }
}

async function loadFullDbSchemaData() {
  const container = document.getElementById('full-schema-cards-container');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;">正在全面檢索資料庫結構與約束中繼資料...</div>';

  try {
    const colsSql = `
      SELECT TABLE_NAME, COLUMN_NAME, TYPE_NAME, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE UPPER(TABLE_SCHEMA) = 'PUBLIC'
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `;
    const allCols = await dbQuery(colsSql);

    const constrSql = `
      SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE, COLUMN_LIST
      FROM INFORMATION_SCHEMA.CONSTRAINTS
      WHERE UPPER(TABLE_SCHEMA) = 'PUBLIC'
    `;
    const allConstraints = await dbQuery(constrSql);

    const fkSql = `
      SELECT FKTABLE_NAME, FKCOLUMN_NAME, PKTABLE_NAME, PKCOLUMN_NAME, FK_NAME
      FROM INFORMATION_SCHEMA.CROSS_REFERENCES
      WHERE UPPER(FKTABLE_SCHEMA) = 'PUBLIC'
    `;
    const allFks = await dbQuery(fkSql);

    const ddlRes = await dbQuery(`SCRIPT NODATA NOSETTINGS`);
    fullDbDdlText = ddlRes.map(r => r.SCRIPT || Object.values(r)[0]).join('\n');

    const tableMap = {};
    allCols.forEach(col => {
      if (!tableMap[col.TABLE_NAME]) tableMap[col.TABLE_NAME] = [];
      tableMap[col.TABLE_NAME].push(col);
    });

    container.innerHTML = '';
    let mdOutput = `# 資料庫結構總覽 (Database Schema Export)\n*匯出時間: ${new Date().toLocaleString()}*\n\n`;

    Object.keys(tableMap).sort().forEach(tbl => {
      const cols = tableMap[tbl];

      const pkList = allConstraints
        .filter(c => c.TABLE_NAME === tbl && c.CONSTRAINT_TYPE === 'PRIMARY KEY')
        .flatMap(c => (c.COLUMN_LIST || '').split(',').map(s => s.trim()));

      const uqList = allConstraints
        .filter(c => c.TABLE_NAME === tbl && c.CONSTRAINT_TYPE === 'UNIQUE')
        .flatMap(c => (c.COLUMN_LIST || '').split(',').map(s => s.trim()));

      const tblFks = allFks.filter(f => f.FKTABLE_NAME === tbl);

      const card = document.createElement('div');
      card.className = 'schema-table-card';

      let rowsHtml = '';
      cols.forEach(c => {
        const isPk = pkList.includes(c.COLUMN_NAME);
        const isUq = uqList.includes(c.COLUMN_NAME);
        const fk = tblFks.find(f => f.FKCOLUMN_NAME === c.COLUMN_NAME);

        rowsHtml += `
          <tr>
            <td style="font-weight:600;">${escapeHtml(c.COLUMN_NAME)}</td>
            <td><span class="badge">${escapeHtml(c.TYPE_NAME)}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''}</span></td>
            <td>${c.IS_NULLABLE === 'YES' ? '<span style="color:#64748b;">YES</span>' : '<span style="color:var(--danger); font-weight:bold;">NOT NULL</span>'}</td>
            <td>${c.COLUMN_DEFAULT ? `<code>${escapeHtml(c.COLUMN_DEFAULT)}</code>` : '<span style="color:#cbd5e1;">-</span>'}</td>
            <td>
              ${isPk ? '<span class="badge badge-pk">PRIMARY KEY</span> ' : ''}
              ${isUq ? '<span class="badge badge-uq">UNIQUE</span> ' : ''}
              ${fk ? `<span class="badge badge-fk">FK → ${escapeHtml(fk.PKTABLE_NAME)}.${escapeHtml(fk.PKCOLUMN_NAME)}</span>` : ''}
              ${!isPk && !isUq && !fk ? '<span style="color:#cbd5e1;">-</span>' : ''}
            </td>
          </tr>
        `;
      });

      card.innerHTML = `
        <div class="schema-table-card-header">
          <span>📋 資料表：<span style="color:var(--primary); font-size:15px;">${escapeHtml(tbl)}</span> (${cols.length} 欄位)</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>欄位名稱</th>
              <th>型態 (Type)</th>
              <th>允許 NULL</th>
              <th>預設值 (Default)</th>
              <th>約束與關聯 (Key / Constraints)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
      container.appendChild(card);

      mdOutput += `### 資料表：\`${tbl}\`\n\n`;
      mdOutput += `| 欄位名稱 | 型態 | Nullable | 預設值 | 約束/關聯 |\n`;
      mdOutput += `| :--- | :--- | :--- | :--- | :--- |\n`;
      cols.forEach(c => {
        const isPk = pkList.includes(c.COLUMN_NAME);
        const isUq = uqList.includes(c.COLUMN_NAME);
        const fk = tblFks.find(f => f.FKCOLUMN_NAME === c.COLUMN_NAME);
        const badges = [];
        if (isPk) badges.push('**PK**');
        if (isUq) badges.push('**UQ**');
        if (fk) badges.push(`FK → ${fk.PKTABLE_NAME}.${fk.PKCOLUMN_NAME}`);

        mdOutput += `| \`${c.COLUMN_NAME}\` | ${c.TYPE_NAME}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''} | ${c.IS_NULLABLE} | ${c.COLUMN_DEFAULT || '-'} | ${badges.join(', ') || '-'} |\n`;
      });
      mdOutput += `\n---\n\n`;
    });

    fullDbMarkdownText = mdOutput;

    // 若使用者停留在 DDL 或 MD 標籤，同步重新整理文字內容
    if (fullSchemaCurrentTab === 'ddl') {
      const textarea = document.getElementById('full-schema-textarea');
      if (textarea) textarea.value = fullDbDdlText;
    } else if (fullSchemaCurrentTab === 'md') {
      const textarea = document.getElementById('full-schema-textarea');
      if (textarea) textarea.value = fullDbMarkdownText;
    }

  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger); padding:20px;">載入全資料庫結構失敗: ${escapeHtml(err.message)}</div>`;
  }
}

function copyFullSchemaContent() {
  const content = (fullSchemaCurrentTab === 'ddl') ? fullDbDdlText : fullDbMarkdownText;
  navigator.clipboard.writeText(content).then(() => {
    alert('已成功將資料庫架構內容複製至剪貼簿！');
  }).catch(err => {
    alert('複製失敗: ' + err);
  });
}

function downloadFullSchemaFile() {
  const content = (fullSchemaCurrentTab === 'ddl') ? fullDbDdlText : fullDbMarkdownText;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const ext = (fullSchemaCurrentTab === 'ddl') ? 'sql' : 'md';
  const fileName = `H2_Database_Schema_${timeStr}.${ext}`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================
// 7. 單筆記錄新增 (Single Insert Modal)
// ==========================================
function openInsertModal() {
  if (!currentTable || isAuditLogTable()) return;
  const nameEl = document.getElementById('modal-table-name');
  if (nameEl) nameEl.textContent = currentTable;

  const container = document.getElementById('insert-form-container');
  if (!container) return;
  container.innerHTML = '';

  tableColumns.forEach(c => {
    const isPk = c.COLUMN_NAME === currentPrimaryKey;
    const isNullable = c.IS_NULLABLE === 'YES';
    const type = (c.TYPE_NAME || '').toUpperCase();
    const maxLen = c.CHARACTER_MAXIMUM_LENGTH;
    const isUnique = !!uniqueConstraintsMap[c.COLUMN_NAME];
    const hasFk = !!foreignKeysMap[c.COLUMN_NAME];

    const group = document.createElement('div');
    group.className = 'form-group';

    const hints = [];
    hints.push(`型態: ${type}`);
    if (!isNullable && !isPk) hints.push('<span class="req-mark">* 必填 (不允許 NULL)</span>');
    else hints.push('允許 NULL');

    if (c.COLUMN_DEFAULT) hints.push(`預設值: ${escapeHtml(c.COLUMN_DEFAULT)}`);
    if (isUnique) hints.push('<span style="color:var(--purple); font-weight:bold;">[UNIQUE 唯一值]</span>');
    if (hasFk) hints.push(`<span style="color:var(--amber); font-weight:bold;">[FK → ${escapeHtml(foreignKeysMap[c.COLUMN_NAME].pkTable)}]</span>`);
    if (maxLen) hints.push(`最長: <strong>${maxLen}</strong> 字元`);

    let inputHtml = '';
    if (isPk) {
      inputHtml = `<input type="text" disabled value="(自動流水號 / 自增主鍵)" style="background:#f1f5f9; color:#94a3b8;">`;
    } else if (type.includes('TIMESTAMP')) {
      inputHtml = `
        <div class="date-input-wrap">
          <input type="datetime-local" step="1" data-col="${escapeHtml(c.COLUMN_NAME)}" data-type="TIMESTAMP" data-nullable="${isNullable}">
          <button type="button" class="clear-btn" onclick="clearNativeInput(this)">清除</button>
        </div>
      `;
    } else if (type.includes('DATE')) {
      inputHtml = `
        <div class="date-input-wrap">
          <input type="date" data-col="${escapeHtml(c.COLUMN_NAME)}" data-type="DATE" data-nullable="${isNullable}">
          <button type="button" class="clear-btn" onclick="clearNativeInput(this)">清除</button>
        </div>
      `;
    } else if (type === 'BOOLEAN') {
      inputHtml = `
        <select data-col="${escapeHtml(c.COLUMN_NAME)}" data-type="${type}" data-nullable="${isNullable}">
          ${isNullable ? '<option value="__NULL__">-- NULL (預設空值) --</option>' : ''}
          <option value="TRUE">TRUE (是)</option>
          <option value="FALSE" selected>FALSE (否)</option>
        </select>
      `;
    } else if (type === 'CLOB') {
      inputHtml = `<textarea rows="3" data-col="${escapeHtml(c.COLUMN_NAME)}" data-type="${type}" data-nullable="${isNullable}" style="padding:8px; border:1px solid var(--border); border-radius:6px;"></textarea>`;
    } else {
      const lenAttr = maxLen ? `maxlength="${maxLen}"` : '';
      const placeholder = !isNullable ? '必填欄位 (不可留空)' : '若留空將寫入 NULL 或預設值';
      inputHtml = `<input type="text" data-col="${escapeHtml(c.COLUMN_NAME)}" data-type="${type}" data-nullable="${isNullable}" data-maxlen="${maxLen || ''}" ${lenAttr} placeholder="${placeholder}">`;
    }

    group.innerHTML = `
      <label class="form-label">${escapeHtml(c.COLUMN_NAME)} ${!isNullable && !isPk ? '<span class="req-mark">*</span>' : ''}</label>
      ${inputHtml}
      <div class="form-hint">${hints.join(' | ')}</div>
    `;
    container.appendChild(group);
  });

  const modal = document.getElementById('insert-modal');
  if (modal) modal.style.display = 'flex';
}

function clearNativeInput(btn) {
  if (btn && btn.previousElementSibling) {
    btn.previousElementSibling.value = '';
  }
}

function closeInsertModal() {
  const modal = document.getElementById('insert-modal');
  if (modal) modal.style.display = 'none';
}

async function submitInsert() {
  if (isAuditLogTable()) return;
  const inputs = document.querySelectorAll('#insert-form-container [data-col]');
  const colNames = [];
  const colValues = [];

  for (const el of inputs) {
    const col = el.dataset.col;
    const type = el.dataset.type;
    const isNullable = el.dataset.nullable === 'true';
    const maxLen = el.dataset.maxlen ? parseInt(el.dataset.maxlen, 10) : null;
    const val = el.value.trim();

    if (!isNullable && (val === '' || val === '__NULL__')) {
      alert(`欄位 [${col}] 為必填欄位，不允許 NULL！`);
      el.focus();
      return;
    }

    if (maxLen && val.length > maxLen) {
      alert(`欄位 [${col}] 長度超過限制！最大: ${maxLen} 字元，目前: ${val.length} 字元。`);
      el.focus();
      return;
    }

    if (val === '' || val === '__NULL__') {
      colNames.push(`"${col}"`);
      colValues.push("NULL");
    } else if (type === 'BOOLEAN') {
      colNames.push(`"${col}"`);
      colValues.push(val);
    } else if (type === 'TIMESTAMP') {
      let formattedTs = val.replace('T', ' ');
      if (formattedTs.length === 16) formattedTs += ':00';
      colNames.push(`"${col}"`);
      colValues.push(`'${formattedTs}'`);
    } else if (['INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'DOUBLE', 'NUMERIC'].includes(type)) {
      if (isNaN(val)) {
        alert(`欄位 [${col}] 必須為數值型態！`);
        el.focus();
        return;
      }
      colNames.push(`"${col}"`);
      colValues.push(val);
    } else {
      const escaped = val.replace(/'/g, "''");
      colNames.push(`"${col}"`);
      colValues.push(`'${escaped}'`);
    }
  }

  if (colNames.length === 0) {
    alert('無有效欄位可寫入');
    return;
  }

  const sql = `INSERT INTO "${currentTable}" (${colNames.join(', ')}) VALUES (${colValues.join(', ')})`;
  try {
    await dbExecute(sql);
    setStatus('成功新增 1 筆記錄！');
    closeInsertModal();
    loadCurrentTable();
  } catch (err) {
    alert('新增記錄失敗: ' + err.message);
  }
}

// ==========================================
// 8. 結構修改 (Schema Modifications & DDL)
// ==========================================
async function alterColumnLength(colName, typeName, currentLen) {
  if (isAuditLogTable()) return;

  const promptVal = prompt(`請輸入欄位 [${colName}] (${typeName}) 的新長度：`, currentLen || 255);
  if (promptVal === null) return; // 使用者按取消

  const newLen = parseInt(promptVal.trim(), 10);
  if (isNaN(newLen) || newLen <= 0) {
    alert('長度必須為大於 0 的正整數！');
    return;
  }

  // H2 標準語法：ALTER TABLE "表名" ALTER COLUMN "欄位名" 型態(長度)
  const sql = `ALTER TABLE "${currentTable}" ALTER COLUMN "${colName}" ${typeName}(${newLen})`;

  try {
    setStatus(`正在更新 [${colName}] 長度為 ${newLen}...`);
    await dbExecute(sql);
    setStatus(`✅ 成功將 [${colName}] 長度修改為: ${newLen}`);
    loadCurrentTable();
  } catch (err) {
    alert(`修改長度失敗: ${err.message}`);
    setStatus(`❌ 修改失敗: ${err.message}`, true);
  }
}

async function toggleNullable(colName, currentlyNullable) {
  if (isAuditLogTable()) return;
  const targetAction = currentlyNullable ? 'SET NOT NULL' : 'SET NULL';
  if (!confirm(`即將將 [${colName}] 設為 ${targetAction}，確定執行？`)) return;

  const sql = `ALTER TABLE "${currentTable}" ALTER COLUMN "${colName}" ${targetAction}`;
  try {
    await dbExecute(sql);
    setStatus(`已更新 [${colName}] 約束`);
    loadCurrentTable();
  } catch (err) {
    alert('變更 NULL 約束失敗: ' + err.message);
  }
}

async function alterColumnDefault(colName, currentDefault) {
  if (isAuditLogTable()) return;
  const promptVal = prompt(`請輸入欄位 [${colName}] 的新 DEFAULT 值 (輸入 DROP 清除)：`, currentDefault || '');
  if (promptVal === null) return;
  const trimmed = promptVal.trim();

  const sql = (trimmed.toUpperCase() === 'DROP' || trimmed === '')
    ? `ALTER TABLE "${currentTable}" ALTER COLUMN "${colName}" DROP DEFAULT`
    : `ALTER TABLE "${currentTable}" ALTER COLUMN "${colName}" SET DEFAULT ${trimmed}`;

  try {
    await dbExecute(sql);
    setStatus(`已更新 [${colName}] 的 DEFAULT 預設值！`);
    loadCurrentTable();
  } catch (err) {
    alert('設定 DEFAULT 失敗: ' + err.message);
  }
}

async function toggleIndex(colName, hasIndex, existingIdxName) {
  if (isAuditLogTable()) return;
  const sql = hasIndex
    ? `DROP INDEX "${existingIdxName}"`
    : `CREATE INDEX "IDX_${currentTable}_${colName}" ON "${currentTable}" ("${colName}")`;

  if (!confirm(`確定切換欄位 [${colName}] 的索引狀態嗎？`)) return;

  try {
    await dbExecute(sql);
    setStatus(`已更新 [${colName}] 的索引狀態！`);
    loadCurrentTable();
  } catch (err) {
    alert('索引操作失敗: ' + err.message);
  }
}

async function toggleUnique(colName, isCurrentlyUnique, existingConstraintName) {
  if (isAuditLogTable()) return;
  const constraintName = existingConstraintName || `UQ_${currentTable}_${colName}`;
  const sql = isCurrentlyUnique
    ? `ALTER TABLE "${currentTable}" DROP CONSTRAINT "${constraintName}"`
    : `ALTER TABLE "${currentTable}" ADD CONSTRAINT "${constraintName}" UNIQUE ("${colName}")`;

  if (!confirm(`確定切換欄位 [${colName}] 的 UNIQUE 約束嗎？`)) return;

  try {
    await dbExecute(sql);
    setStatus(`已更新 [${colName}] 的 UNIQUE 約束！`);
    loadCurrentTable();
  } catch (err) {
    alert('唯一約束變更失敗: ' + err.message);
  }
}

async function addColumn() {
  if (isAuditLogTable()) return;
  const nameEl = document.getElementById('new-col-name');
  const typeEl = document.getElementById('new-col-type');
  const colName = nameEl ? nameEl.value.trim() : '';
  const colType = typeEl ? typeEl.value : 'VARCHAR(255)';

  if (!colName) {
    alert('請輸入欲新增的欄位名稱！');
    return;
  }

  const sql = `ALTER TABLE "${currentTable}" ADD "${colName}" ${colType}`;
  try {
    await dbExecute(sql);
    setStatus(`成功新增欄位: ${colName}`);
    if (nameEl) nameEl.value = '';
    loadCurrentTable();
  } catch (err) {
    alert('新增欄位失敗: ' + err.message);
  }
}

async function dropColumn(colName) {
  if (isAuditLogTable()) return;
  if (!confirm(`確定要刪除欄位 [${colName}] 嗎？此操作將永久抹除該欄位之資料！`)) return;

  const sql = `ALTER TABLE "${currentTable}" DROP COLUMN "${colName}"`;
  try {
    await dbExecute(sql);
    setStatus(`已移除欄位: ${colName}`);
    loadCurrentTable();
  } catch (err) {
    alert('刪除欄位失敗: ' + err.message);
  }
}

async function executeCustomDDL() {
  if (isAuditLogTable()) return;
  const ddlInput = document.getElementById('custom-ddl');
  const sql = ddlInput ? ddlInput.value.trim() : '';
  if (!sql) {
    alert('請輸入自訂 DDL 語句！');
    return;
  }

  if (!confirm(`即將執行自訂 DDL 語句：\n${sql}\n\n確定繼續嗎？`)) return;

  try {
    await dbExecute(sql);
    setStatus('自訂 DDL 執行成功！');
    if (ddlInput) ddlInput.value = '';
    loadCurrentTable();
  } catch (err) {
    alert('DDL 執行錯誤: ' + err.message);
  }
}

// ==========================================
// 9. 單元格編輯 / 刪除列 / 清空表 / 備份整庫
// ==========================================
async function editCell(td, pkVal, colName) {
  if (isAuditLogTable()) {
    alert('【唯讀鎖定】T99_AuditLog 為稽核歷史日誌，不可修改！');
    return;
  }

  const currentVal = td.textContent === 'NULL' ? '' : td.textContent.trim();
  const newVal = prompt(`修改 [${colName}] 的值 (留空確認代表設為空字串，輸入 NULL 設為空值)：`, currentVal);
  if (newVal === null) return;

  const pkCondition = isNaN(pkVal)
    ? `"${currentPrimaryKey}" = '${pkVal.replace(/'/g, "''")}'`
    : `"${currentPrimaryKey}" = ${pkVal}`;

  let sql = '';
  if (newVal.toUpperCase() === 'NULL') {
    sql = `UPDATE "${currentTable}" SET "${colName}" = NULL WHERE ${pkCondition}`;
  } else {
    const escaped = newVal.replace(/'/g, "''");
    sql = `UPDATE "${currentTable}" SET "${colName}" = '${escaped}' WHERE ${pkCondition}`;
  }

  try {
    await dbExecute(sql);
    setStatus(`已成功更新欄位 [${colName}]！`);
    if (newVal.toUpperCase() === 'NULL') {
      td.innerHTML = '<span style="color:#cbd5e1; font-style:italic;">NULL</span>';
    } else {
      td.textContent = newVal;
    }
  } catch (err) {
    alert('更新失敗: ' + err.message);
  }
}

async function deleteRow(pkVal) {
  if (isAuditLogTable()) {
    alert('【唯讀鎖定】T99_AuditLog 為稽核歷史日誌，嚴禁刪除任何紀錄！');
    return;
  }

  if (!confirm(`確定要刪除主鍵值為 [${pkVal}] 的整筆記錄嗎？`)) return;

  const pkCondition = isNaN(pkVal)
    ? `"${currentPrimaryKey}" = '${pkVal.replace(/'/g, "''")}'`
    : `"${currentPrimaryKey}" = ${pkVal}`;

  const sql = `DELETE FROM "${currentTable}" WHERE ${pkCondition}`;
  try {
    await dbExecute(sql);
    setStatus(`已刪除記錄 PK: ${pkVal}`);
    renderDataView();
  } catch (err) {
    alert('刪除列失敗: ' + err.message);
  }
}

async function truncateTable() {
  if (isAuditLogTable()) {
    alert('【安全違規】稽核日誌表嚴禁清空！');
    return;
  }
  if (!currentTable) return;

  const confirmText = prompt(`⚠️【危險操作】即將清空 [${currentTable}] 的全部資料！\n請在此輸入資料表全名 "${currentTable}" 以確認執行：`);
  if (confirmText !== currentTable) {
    alert('名稱輸入不一致，操作已取消。');
    return;
  }

  const sql = `DELETE FROM "${currentTable}"`;
  try {
    await dbExecute(sql);
    setStatus(`已成功清空資料表: ${currentTable}`);
    loadCurrentTable();
  } catch (err) {
    alert('清空失敗: ' + err.message);
  }
}

/**
 * 整庫備份：直接透過 H2 SCRIPT 指令匯出 SQL 並於瀏覽器一鍵下載
 */
async function backupDatabase() {
  if (!confirm('📦 確定要備份整個資料庫嗎？系統將為您直接匯出包含完整 Schema 與 Data 的 H2 SQL 備份檔案。')) return;

  setStatus('正在編譯資料庫備份 SQL，請稍候...');
  try {
    const res = await dbQuery('SCRIPT');
    if (!res || res.length === 0) {
      throw new Error('未取得任何備份指令');
    }

    const sqlLines = res.map(r => r.SCRIPT || Object.values(r)[0]).join('\n');
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `H2_Database_Backup_${timeStr}.sql`;

    const blob = new Blob([sqlLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setStatus(`✅ 資料庫備份成功！已下載 ${fileName}`);
    alert(`【備份成功】\n資料庫備份檔案已成功下載：\n${fileName}`);
  } catch (err) {
    alert('備份失敗: ' + err.message);
    setStatus('❌ 備份失敗: ' + err.message, true);
  }
}

// ==========================================
// 10. 工具輔助函式 (Utility Functions)
// ==========================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
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

// ==========================================
// 11. 全域匯出與初始化掛載 (Global Window Binding)
// ==========================================
window.loadTableList = loadTableList;
window.loadCurrentTable = loadCurrentTable;
window.onTableSelectChanged = onTableSelectChanged;
window.switchTab = switchTab;
window.handleSortClick = handleSortClick;
window.onFilterChanged = onFilterChanged;
window.onLimitChanged = onLimitChanged;
window.clearAllFilters = clearAllFilters;
window.editCell = editCell;
window.deleteRow = deleteRow;
window.truncateTable = truncateTable;
window.backupDatabase = backupDatabase;
window.copyDDL = copyDDL;

window.openInsertModal = openInsertModal;
window.closeInsertModal = closeInsertModal;
window.submitInsert = submitInsert;
window.clearNativeInput = clearNativeInput;

window.openBatchInsertModal = openBatchInsertModal;
window.closeBatchInsertModal = closeBatchInsertModal;
window.parseExcelPasteData = parseExcelPasteData;
window.submitBatchInsert = submitBatchInsert;

window.openFullDbSchemaModal = openFullDbSchemaModal;
window.closeFullDbSchemaModal = closeFullDbSchemaModal;
window.switchFullSchemaTab = switchFullSchemaTab;
window.copyFullSchemaContent = copyFullSchemaContent;
window.downloadFullSchemaFile = downloadFullSchemaFile;

window.alterColumnLength = alterColumnLength;
window.toggleNullable = toggleNullable;
window.alterColumnDefault = alterColumnDefault;
window.toggleIndex = toggleIndex;
window.toggleUnique = toggleUnique;
window.addColumn = addColumn;
window.dropColumn = dropColumn;
window.executeCustomDDL = executeCustomDDL;

document.addEventListener('DOMContentLoaded', () => {
  if (checkAdminAuth()) {
    loadTableList();
  }
});