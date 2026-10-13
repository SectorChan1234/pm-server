let currentTable = '';
let currentView = 'data';
let currentPrimaryKey = '';
let tableColumns = [];
let allTablesList = [];

let uniqueConstraintsMap = {}; 
let indexesMap = {};           
let foreignKeysMap = {};

let currentSortColumn = '';     
let currentSortOrder = 'DESC';   
let currentFilters = {};        
let currentLimit = 100;

// ==========================================
// 權限檢查與通訊工具 (全面遷移至 localStorage)
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
    throw new Error(data.message || '操作被拒絕：權限不足或日誌受保護');
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.style.color = isError ? 'var(--danger)' : '#16a34a';
  setTimeout(() => el.textContent = '', 4000);
}

// ==========================================
// 1. 初始化資料表清單
// ==========================================
async function loadTableList() {
  try {
    const sql = `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'PUBLIC' ORDER BY TABLE_NAME`;
    const list = await dbQuery(sql);
    allTablesList = list.map(t => t.TABLE_NAME);
    
    const sel = document.getElementById('table-select');
    sel.innerHTML = '';

    if (list.length === 0) {
      sel.innerHTML = '<option value="">(無可用資料表)</option>';
      return;
    }

    list.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.TABLE_NAME;
      opt.textContent = t.TABLE_NAME;
      sel.appendChild(opt);
    });

    currentTable = list[0].TABLE_NAME;
    loadCurrentTable();
  } catch (err) {
    alert('取得資料表清單失敗: ' + err.message);
  }
}

function onTableSelectChanged() {
  currentSortColumn = '';
  currentSortOrder = 'DESC';
  currentFilters = {};
  loadCurrentTable();
}

function isAuditLogTable() {
  return currentTable.toUpperCase() === 'T99_AUDITLOG';
}

// ==========================================
// 2. 檢視切換與載入
// ==========================================
function switchTab(view) {
  currentView = view;
  document.getElementById('tab-data-btn').className = 'tab-btn ' + (view === 'data' ? 'active' : '');
  document.getElementById('tab-schema-btn').className = 'tab-btn ' + (view === 'schema' ? 'active' : '');
  document.getElementById('schema-tools').style.display = (view === 'schema' && !isAuditLogTable()) ? 'block' : 'none';
  document.getElementById('ddl-section').style.display = view === 'schema' ? 'block' : 'none';
  document.getElementById('table-info-bar').style.display = view === 'data' ? 'flex' : 'none';
  loadCurrentTable();
}

async function loadCurrentTable() {
  const sel = document.getElementById('table-select');
  currentTable = sel.value;
  if (!currentTable) return;

  const isAudit = isAuditLogTable();
  document.getElementById('btn-insert-single').style.display = isAudit ? 'none' : 'inline-block';
  document.getElementById('btn-insert-batch').style.display = isAudit ? 'none' : 'inline-block';
  document.getElementById('btn-truncate').style.display = isAudit ? 'none' : 'inline-block';
  document.getElementById('append-only-badge').style.display = isAudit ? 'inline' : 'none';
  if (currentView === 'schema') {
    document.getElementById('schema-tools').style.display = isAudit ? 'none' : 'block';
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
    alert('讀取失敗: ' + err.message);
  }
}

async function detectTableMetadata() {
  const metaSql = `
    SELECT COLUMN_NAME, TYPE_NAME, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME = '${currentTable}'
    ORDER BY ORDINAL_POSITION
  `;
  tableColumns = await dbQuery(metaSql);

  const pkCol = tableColumns.find(c => c.COLUMN_NAME.startsWith('PK_') || c.COLUMN_NAME.toLowerCase().includes('id'));
  currentPrimaryKey = pkCol ? pkCol.COLUMN_NAME : (tableColumns[0] ? tableColumns[0].COLUMN_NAME : '');

  uniqueConstraintsMap = {};
  try {
    const uqSql = `
      SELECT CONSTRAINT_NAME, COLUMN_LIST
      FROM INFORMATION_SCHEMA.CONSTRAINTS
      WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME = '${currentTable}' AND CONSTRAINT_TYPE = 'UNIQUE'
    `;
    const uqs = await dbQuery(uqSql);
    uqs.forEach(u => {
      if (u.COLUMN_LIST) uniqueConstraintsMap[u.COLUMN_LIST.trim()] = u.CONSTRAINT_NAME;
    });
  } catch (e) { console.warn('UQ 探測失敗:', e); }

  indexesMap = {};
  try {
    const idxSql = `
      SELECT INDEX_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.INDEXES
      WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME = '${currentTable}' 
        AND PRIMARY_KEY = FALSE AND NON_UNIQUE = TRUE
    `;
    const idxs = await dbQuery(idxSql);
    idxs.forEach(i => {
      if (i.COLUMN_NAME) indexesMap[i.COLUMN_NAME.trim()] = i.INDEX_NAME;
    });
  } catch (e) { console.warn('Index 探測失敗:', e); }

  foreignKeysMap = {};
  try {
    const fkSql = `
      SELECT FKCOLUMN_NAME, PKTABLE_NAME, PKCOLUMN_NAME, FK_NAME
      FROM INFORMATION_SCHEMA.CROSS_REFERENCES
      WHERE FKTABLE_SCHEMA = 'PUBLIC' AND FKTABLE_NAME = '${currentTable}'
    `;
    const fks = await dbQuery(fkSql);
    fks.forEach(f => {
      foreignKeysMap[f.FKCOLUMN_NAME] = {
        constraintName: f.FK_NAME,
        pkTable: f.PKTABLE_NAME,
        pkCol: f.PKCOLUMN_NAME
      };
    });
  } catch (e) { console.warn('FK 探測失敗:', e); }
}

// ==========================================
// 2.1 渲染資料內容 (Data View)
// ==========================================
async function renderDataView() {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  const isAudit = isAuditLogTable();
  
  thead.innerHTML = buildTableHeadHtml();
  tbody.innerHTML = '<tr><td colspan="' + (tableColumns.length + 1) + '" style="text-align:center; padding: 25px; color:#64748b;">正在載入資料...</td></tr>';

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
    document.getElementById('active-filter-badge').style.display = hasFilters ? 'inline' : 'none';
    document.getElementById('record-count-info').innerHTML = `顯示 <strong>${rows.length}</strong> 筆 / 篩選命中 <strong>${filteredCount}</strong> 筆 (全表共 ${totalCount} 筆)`;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${tableColumns.length + 1}" style="text-align:center; padding: 30px; color:#94a3b8;">無符合條件的記錄</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const pkVal = row[currentPrimaryKey];

      let rowHtml = isAudit 
        ? `<td style="text-align:center; color:#94a3b8; font-size:11px;">🔒 唯讀</td>`
        : `<td style="text-align:center;"><button class="danger" style="padding: 2px 7px; font-size: 11px;" onclick="deleteRow('${pkVal}')">刪除</button></td>`;
      
      tableColumns.forEach(c => {
        const colName = c.COLUMN_NAME;
        const val = row[colName];
        const displayVal = val === null ? '<span style="color:#cbd5e1;">NULL</span>' : escapeHtml(val.toString());
        const isEditable = !isAudit && colName !== currentPrimaryKey;

        rowHtml += `<td class="${isEditable ? 'editable' : ''}" 
                        ${isEditable ? `ondblclick="editCell(this, '${pkVal}', '${colName}')"` : ''} 
                        title="${isEditable ? '雙擊以修改內容' : (isAudit ? '稽核表不可修改' : '主鍵不可編輯')}">${displayVal}</td>`;
      });

      tr.innerHTML = rowHtml;
      tbody.appendChild(tr);
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${tableColumns.length + 1}" style="text-align:center; padding: 20px; color:var(--danger);">查詢執行失敗: ${err.message}</td></tr>`;
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
      <th class="sortable-th" onclick="handleSortClick('${col}')" title="點擊切換升降序排序">
        ${col}
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
    const type = c.TYPE_NAME.toUpperCase();
    const currentVal = currentFilters[col] || '';

    if (type === 'BOOLEAN') {
      row2 += `
        <th>
          <select class="filter-input" onchange="onFilterChanged('${col}', this.value)">
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
                 onchange="onFilterChanged('${col}', this.value)"
                 onkeydown="if(event.key==='Enter') onFilterChanged('${col}', this.value)">
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
// 2.2 渲染表結構 (Schema View)
// ==========================================
async function renderSchemaView() {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
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
    const canChangeLength = ['VARCHAR', 'CHARACTER VARYING', 'CHAR'].includes(c.TYPE_NAME.toUpperCase());
    
    const uqConstraint = uniqueConstraintsMap[col];
    const isUnique = !!uqConstraint;

    const idxName = indexesMap[col];
    const hasIndex = !!idxName;

    const fkInfo = foreignKeysMap[col];

    tr.innerHTML = `
      <td><strong>${col}</strong> ${isPk ? '<span class="badge badge-pk">PK</span>' : ''}</td>
      <td><span class="badge">${c.TYPE_NAME}</span></td>
      
      <td>
        ${canChangeLength && !isPk && !isAudit
          ? `<button class="secondary" style="padding: 2px 7px; font-size: 11px;" onclick="alterColumnLength('${col}', '${c.TYPE_NAME}', ${c.CHARACTER_MAXIMUM_LENGTH || 255})">
               長度: ${c.CHARACTER_MAXIMUM_LENGTH || '-'} ✎
             </button>`
          : (c.CHARACTER_MAXIMUM_LENGTH || '-')}
      </td>

      <td>
        ${!isPk && !isAudit
          ? `<button class="secondary" style="padding: 2px 7px; font-size: 11px;" onclick="alterColumnDefault('${col}', '${escapeJs(c.COLUMN_DEFAULT || '')}')">
               ${c.COLUMN_DEFAULT ? escapeHtml(c.COLUMN_DEFAULT) : '無 (設定) ✎'}
             </button>`
          : (c.COLUMN_DEFAULT ? escapeHtml(c.COLUMN_DEFAULT) : '-')}
      </td>

      <td style="text-align: center;">
        ${!isPk && !isAudit
          ? `<button style="padding: 2px 8px; font-size: 11px; background: ${isNullable ? '#0284c7' : '#e11d48'};" 
                     onclick="toggleNullable('${col}', ${isNullable})">
               ${isNullable ? 'YES (允許)' : 'NO (必填)'}
             </button>`
          : (isNullable ? 'YES' : 'NO')}
      </td>

      <td style="text-align: center;">
        ${!isPk && !isAudit
          ? `<button class="${isUnique ? 'purple' : 'secondary'}" style="padding: 2px 8px; font-size: 11px;" 
                     onclick="toggleUnique('${col}', ${isUnique}, '${uqConstraint || ''}')">
               ${isUnique ? 'YES (唯一值)' : 'NO (一般)'}
             </button>`
          : (isPk ? '<span class="badge badge-pk">PK 固有</span>' : '-')}
      </td>

      <td style="text-align: center;">
        ${!isPk && !isUnique && !isAudit
          ? `<button class="${hasIndex ? 'success' : 'secondary'}" style="padding: 2px 8px; font-size: 11px;" 
                     onclick="toggleIndex('${col}', ${hasIndex}, '${idxName || ''}')">
               ${hasIndex ? 'YES (已建)' : 'NO (建立)'}
             </button>`
          : (hasIndex ? 'YES' : '-')}
      </td>

      <td>
        ${!isPk && !isAudit
          ? (fkInfo
              ? `<div>
                   <span class="badge badge-fk" title="FK 約束: ${fkInfo.constraintName}">→ ${fkInfo.pkTable}.${fkInfo.pkCol}</span>
                 </div>`
              : '-')
          : '-'}
      </td>

      <td style="text-align: center;">
        ${!isPk && !isAudit ? `<button class="danger" style="padding: 2px 6px; font-size: 11px;" onclick="dropColumn('${col}')">刪除</button>` : '-'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 2.3 單一 Table 原生 DDL 輸出
// ==========================================
async function loadTableDDL() {
  const textarea = document.getElementById('ddl-textarea');
  try {
    const sql = `SCRIPT NODATA NOSETTINGS`;
    const res = await dbQuery(sql);
    
    const currentTableUpper = currentTable.toUpperCase();
    const ddlLines = res
      .map(r => r.SCRIPT || r.script)
      .filter(stmt => {
        if (!stmt) return false;
        const s = stmt.toUpperCase();
        return s.includes(`"${currentTableUpper}"`) || s.includes(` ${currentTableUpper} `) || s.includes(` ${currentTableUpper}(`);
      });

    if (ddlLines.length > 0) {
      textarea.value = ddlLines.join('\n\n');
    } else {
      textarea.value = `-- 未能取得 ${currentTable} 的 DDL 腳本`;
    }
  } catch (err) {
    textarea.value = `-- 產生 DDL 失敗: ${err.message}`;
  }
}

function copyDDL() {
  const textarea = document.getElementById('ddl-textarea');
  textarea.select();
  navigator.clipboard.writeText(textarea.value).then(() => {
    alert('DDL SQL 語句已複製到剪貼簿！');
  }).catch(err => {
    alert('複製失敗，請手動複製: ' + err);
  });
}

// ==========================================
// 3. 批次匯入 (Excel 複製貼上)
// ==========================================
let parsedExcelData = [];
let parsedColCount = 0;

function openBatchInsertModal() {
  if (!currentTable || isAuditLogTable()) return;
  document.getElementById('batch-modal-table-name').textContent = currentTable;
  document.getElementById('batch-paste-textarea').value = '';
  document.getElementById('batch-paste-stat').textContent = '尚未貼入任何資料';
  document.getElementById('batch-preview-head').innerHTML = '';
  document.getElementById('batch-preview-body').innerHTML = '<tr><td style="text-align: center; color: #94a3b8; padding: 20px;">請先於上方貼上 Excel 資料</td></tr>';
  document.getElementById('batch-submit-btn').disabled = true;
  document.getElementById('batch-import-status').textContent = '';
  document.getElementById('batch-insert-modal').style.display = 'flex';
}

function closeBatchInsertModal() {
  document.getElementById('batch-insert-modal').style.display = 'none';
}

function parseExcelPasteData() {
  const raw = document.getElementById('batch-paste-textarea').value.trim();
  const hasHeader = document.getElementById('batch-has-header').checked;
  const statEl = document.getElementById('batch-paste-stat');
  const submitBtn = document.getElementById('batch-submit-btn');

  if (!raw) {
    statEl.textContent = '尚未貼入任何資料';
    document.getElementById('batch-preview-head').innerHTML = '';
    document.getElementById('batch-preview-body').innerHTML = '<tr><td style="text-align: center; color: #94a3b8; padding: 20px;">請先於上方貼上 Excel 資料</td></tr>';
    submitBtn.disabled = true;
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
  statEl.textContent = `成功解析：共偵測到 ${dataRows.length} 筆資料記錄，每筆包含 ${parsedColCount} 個欄位。`;

  renderBatchMappingAndPreview(headerRow, dataRows);
  submitBtn.disabled = dataRows.length === 0;
}

function renderBatchMappingAndPreview(headerRow, dataRows) {
  const thead = document.getElementById('batch-preview-head');
  const tbody = document.getElementById('batch-preview-body');
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
      selectHtml += `<option value="${c.COLUMN_NAME}" ${isSelected}>${c.COLUMN_NAME} (${c.TYPE_NAME})</option>`;
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
    alert('多個 Excel 欄位映射到了同一個資料庫欄位，請修正後再試！');
    return;
  }

  if (!confirm(`即將批次匯入 ${parsedExcelData.length} 筆記錄到 [${currentTable}]，確定繼續？`)) return;

  const submitBtn = document.getElementById('batch-submit-btn');
  const statusEl = document.getElementById('batch-import-status');
  submitBtn.disabled = true;
  statusEl.style.color = 'var(--primary)';
  statusEl.textContent = '正在寫入資料庫，請稍候...';

  const colMetaMap = {};
  tableColumns.forEach(c => {
    colMetaMap[c.COLUMN_NAME] = {
      type: c.TYPE_NAME.toUpperCase(),
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
      statusEl.textContent = `已寫入 ${totalSuccess} / ${parsedExcelData.length} 筆...`;
    }

    setStatus(`成功批次匯入 ${totalSuccess} 筆記錄！`);
    alert(`【批次匯入成功】\n共成功匯入 ${totalSuccess} 筆資料至 [${currentTable}]！`);
    closeBatchInsertModal();
    loadCurrentTable();
  } catch (err) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = `匯入中斷: ${err.message}`;
    alert(`批次匯入失敗 (已成功寫入 ${totalSuccess} 筆)：\n${err.message}`);
  } finally {
    submitBtn.disabled = false;
  }
}

// ==========================================
// 4. 全 DB 架構檢視與匯出
// ==========================================
let fullSchemaCurrentTab = 'ui';
let fullDbDdlText = '';
let fullDbMarkdownText = '';

async function openFullDbSchemaModal() {
  document.getElementById('full-schema-modal').style.display = 'flex';
  switchFullSchemaTab('ui');
  await loadFullDbSchemaData();
}

function closeFullDbSchemaModal() {
  document.getElementById('full-schema-modal').style.display = 'none';
}

function switchFullSchemaTab(tab) {
  fullSchemaCurrentTab = tab;
  document.getElementById('btn-schema-ui').className = 'tab-btn ' + (tab === 'ui' ? 'active' : '');
  document.getElementById('btn-schema-ddl').className = 'tab-btn ' + (tab === 'ddl' ? 'active' : '');
  document.getElementById('btn-schema-md').className = 'tab-btn ' + (tab === 'md' ? 'active' : '');

  const uiBox = document.getElementById('full-schema-content-ui');
  const textBox = document.getElementById('full-schema-content-text');
  const textarea = document.getElementById('full-schema-textarea');

  if (tab === 'ui') {
    uiBox.style.display = 'block';
    textBox.style.display = 'none';
  } else if (tab === 'ddl') {
    uiBox.style.display = 'none';
    textBox.style.display = 'block';
    textarea.value = fullDbDdlText || '-- 正在提取 DDL...';
  } else if (tab === 'md') {
    uiBox.style.display = 'none';
    textBox.style.display = 'block';
    textarea.value = fullDbMarkdownText || '<!-- 正在編譯 Markdown... -->';
  }
}

async function loadFullDbSchemaData() {
  const container = document.getElementById('full-schema-cards-container');
  container.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;">正在全面檢索資料庫結構與約束...</div>';

  try {
    const colsSql = `
      SELECT TABLE_NAME, COLUMN_NAME, TYPE_NAME, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'PUBLIC'
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `;
    const allCols = await dbQuery(colsSql);

    const constrSql = `
      SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE, COLUMN_LIST
      FROM INFORMATION_SCHEMA.CONSTRAINTS
      WHERE TABLE_SCHEMA = 'PUBLIC'
    `;
    const allConstraints = await dbQuery(constrSql);

    const fkSql = `
      SELECT FKTABLE_NAME, FKCOLUMN_NAME, PKTABLE_NAME, PKCOLUMN_NAME, FK_NAME
      FROM INFORMATION_SCHEMA.CROSS_REFERENCES
      WHERE FKTABLE_SCHEMA = 'PUBLIC'
    `;
    const allFks = await dbQuery(fkSql);

    const ddlSql = `SCRIPT NODATA NOSETTINGS`;
    const ddlRes = await dbQuery(ddlSql);
    fullDbDdlText = ddlRes.map(r => r.SCRIPT || r.script).join('\n');

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
            <td style="font-weight:600;">${c.COLUMN_NAME}</td>
            <td><span class="badge">${c.TYPE_NAME}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''}</span></td>
            <td>${c.IS_NULLABLE === 'YES' ? '<span style="color:#64748b;">YES</span>' : '<span style="color:var(--danger); font-weight:bold;">NOT NULL</span>'}</td>
            <td>${c.COLUMN_DEFAULT ? `<code>${escapeHtml(c.COLUMN_DEFAULT)}</code>` : '<span style="color:#cbd5e1;">-</span>'}</td>
            <td>
              ${isPk ? '<span class="badge badge-pk">PRIMARY KEY</span> ' : ''}
              ${isUq ? '<span class="badge badge-uq">UNIQUE</span> ' : ''}
              ${fk ? `<span class="badge badge-fk">FK → ${fk.PKTABLE_NAME}.${fk.PKCOLUMN_NAME}</span>` : ''}
              ${!isPk && !isUq && !fk ? '<span style="color:#cbd5e1;">-</span>' : ''}
            </td>
          </tr>
        `;
      });

      card.innerHTML = `
        <div class="schema-table-card-header">
          <span>📋 資料表：<span style="color:var(--primary); font-size:15px;">${tbl}</span> (${cols.length} 欄位)</span>
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
        let badges = [];
        if (isPk) badges.push('**PK**');
        if (isUq) badges.push('**UQ**');
        if (fk) badges.push(`FK → ${fk.PKTABLE_NAME}.${fk.PKCOLUMN_NAME}`);

        mdOutput += `| \`${c.COLUMN_NAME}\` | ${c.TYPE_NAME}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''} | ${c.IS_NULLABLE} | ${c.COLUMN_DEFAULT || '-'} | ${badges.join(', ') || '-'} |\n`;
      });
      mdOutput += `\n---\n\n`;
    });

    fullDbMarkdownText = mdOutput;

  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger); padding:20px;">載入全資料庫結構失敗: ${err.message}</div>`;
  }
}

function copyFullSchemaContent() {
  let content = (fullSchemaCurrentTab === 'ddl') ? fullDbDdlText : fullDbMarkdownText;
  navigator.clipboard.writeText(content).then(() => {
    alert('已成功將資料庫架構內容複製至剪貼簿！');
  }).catch(err => {
    alert('複製失敗: ' + err);
  });
}

function downloadFullSchemaFile() {
  let content = (fullSchemaCurrentTab === 'ddl') ? fullDbDdlText : fullDbMarkdownText;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
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
// 5. 新增單筆記錄
// ==========================================
function openInsertModal() {
  if (!currentTable || isAuditLogTable()) return;
  document.getElementById('modal-table-name').textContent = currentTable;
  const container = document.getElementById('insert-form-container');
  container.innerHTML = '';

  tableColumns.forEach(c => {
    const isPk = c.COLUMN_NAME === currentPrimaryKey;
    const isNullable = c.IS_NULLABLE === 'YES';
    const type = c.TYPE_NAME.toUpperCase();
    const maxLen = c.CHARACTER_MAXIMUM_LENGTH;
    const isUnique = !!uniqueConstraintsMap[c.COLUMN_NAME];
    const hasFk = !!foreignKeysMap[c.COLUMN_NAME];

    const group = document.createElement('div');
    group.className = 'form-group';

    let hints = [];
    hints.push(`型態: ${type}`);
    if (!isNullable) hints.push('<span class="req-mark">* 必填 (不允許 NULL)</span>');
    else hints.push('允許 NULL');
    
    if (c.COLUMN_DEFAULT) hints.push(`預設值: ${escapeHtml(c.COLUMN_DEFAULT)}`);
    if (isUnique) hints.push('<span style="color:var(--purple); font-weight:bold;">[UNIQUE 唯一值]</span>');
    if (hasFk) hints.push(`<span style="color:var(--amber); font-weight:bold;">[FK → ${foreignKeysMap[c.COLUMN_NAME].pkTable}]</span>`);
    if (maxLen) hints.push(`最長: <strong>${maxLen}</strong> 字元`);

    let inputHtml = '';
    if (isPk) {
      inputHtml = `<input type="text" disabled value="(自動流水號 / 自增主鍵)" style="background:#f1f5f9; color:#94a3b8;">`;
    } else if (type.includes('TIMESTAMP')) {
      inputHtml = `
        <div class="date-input-wrap">
          <input type="datetime-local" step="1" data-col="${c.COLUMN_NAME}" data-type="TIMESTAMP" data-nullable="${isNullable}">
          <button type="button" class="clear-btn" onclick="clearNativeInput(this)">清除</button>
        </div>
      `;
    } else if (type.includes('DATE')) {
      inputHtml = `
        <div class="date-input-wrap">
          <input type="date" data-col="${c.COLUMN_NAME}" data-type="DATE" data-nullable="${isNullable}">
          <button type="button" class="clear-btn" onclick="clearNativeInput(this)">清除</button>
        </div>
      `;
    } else if (type === 'BOOLEAN') {
      inputHtml = `
        <select data-col="${c.COLUMN_NAME}" data-type="${type}" data-nullable="${isNullable}">
          ${isNullable ? '<option value="__NULL__">-- NULL (預設空值) --</option>' : ''}
          <option value="TRUE">TRUE (是)</option>
          <option value="FALSE" selected>FALSE (否)</option>
        </select>
      `;
    } else if (type === 'CLOB') {
      inputHtml = `<textarea rows="3" data-col="${c.COLUMN_NAME}" data-type="${type}" data-nullable="${isNullable}" style="padding:8px; border:1px solid var(--border); border-radius:6px;"></textarea>`;
    } else {
      const lenAttr = maxLen ? `maxlength="${maxLen}"` : '';
      const placeholder = !isNullable ? '必填欄位 (不可留空)' : '若留空將寫入 NULL 或預設值';
      inputHtml = `<input type="text" data-col="${c.COLUMN_NAME}" data-type="${type}" data-nullable="${isNullable}" data-maxlen="${maxLen || ''}" ${lenAttr} placeholder="${placeholder}">`;
    }

    group.innerHTML = `
      <label class="form-label">${c.COLUMN_NAME} ${!isNullable && !isPk ? '<span class="req-mark">*</span>' : ''}</label>
      ${inputHtml}
      <div class="form-hint">${hints.join(' | ')}</div>
    `;
    container.appendChild(group);
  });

  document.getElementById('insert-modal').style.display = 'flex';
}

function clearNativeInput(btn) {
  btn.previousElementSibling.value = '';
}

function closeInsertModal() {
  document.getElementById('insert-modal').style.display = 'none';
}

async function submitInsert() {
  if (isAuditLogTable()) return;
  const inputs = document.querySelectorAll('#insert-form-container [data-col]');
  let colNames = [];
  let colValues = [];

  for (const el of inputs) {
    const col = el.dataset.col;
    const type = el.dataset.type;
    const isNullable = el.dataset.nullable === 'true';
    const maxLen = el.dataset.maxlen ? parseInt(el.dataset.maxlen, 10) : null;
    let val = el.value.trim();

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
    } else if (['INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'DOUBLE'].includes(type)) {
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
// 6. 結構修改 (長度 / NULL / 欄位變更 / DDL)
// ==========================================
async function alterColumnLength(colName, typeName, currentLen) {
  if (isAuditLogTable()) return;
  const newLen = prompt(`請輸入欄位 [${colName}] 的新長度：`, currentLen);
  if (!newLen || isNaN(newLen)) return;

  const sql = `ALTER TABLE "${currentTable}" ALTER COLUMN "${colName}" ${typeName}(${parseInt(newLen, 10)})`;
  try {
    await dbExecute(sql);
    setStatus(`成功將 [${colName}] 長度修改為: ${newLen}`);
    loadCurrentTable();
  } catch (err) {
    alert('修改長度失敗: ' + err.message);
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

  let sql = (trimmed.toUpperCase() === 'DROP' || trimmed === '')
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
  const colName = document.getElementById('new-col-name').value.trim();
  const colType = document.getElementById('new-col-type').value;
  if (!colName) return;

  const sql = `ALTER TABLE "${currentTable}" ADD "${colName}" ${colType}`;
  try {
    await dbExecute(sql);
    setStatus(`成功新增欄位: ${colName}`);
    document.getElementById('new-col-name').value = '';
    loadCurrentTable();
  } catch (err) {
    alert('新增欄位失敗: ' + err.message);
  }
}

async function dropColumn(colName) {
  if (isAuditLogTable()) return;
  if (!confirm(`確定要刪除欄位 [${colName}] 嗎？這將永久刪除該欄位的所有資料！`)) return;

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
  const sql = document.getElementById('custom-ddl').value.trim();
  if (!sql) return;
  if (!confirm(`即將執行自訂 DDL:\n${sql}\n確定繼續嗎？`)) return;

  try {
    await dbExecute(sql);
    setStatus('自訂 DDL 執行成功');
    document.getElementById('custom-ddl').value = '';
    loadCurrentTable();
  } catch (err) {
    alert('DDL 執行錯誤: ' + err.message);
  }
}

// ==========================================
// 7. 單元格編輯 / 刪除列 / 清空表 / 備份
// ==========================================
async function editCell(td, pkVal, colName) {
  if (isAuditLogTable()) {
    alert('【唯讀鎖定】T99_AuditLog 為稽核歷史日誌，不可修改！');
    return;
  }

  const currentVal = td.textContent === 'NULL' ? '' : td.textContent;
  const newVal = prompt(`修改 [${colName}] 的值 (留空確認代表空字串，輸入 NULL 設為空值)：`, currentVal);
  if (newVal === null) return;

  let sql = '';
  if (newVal.toUpperCase() === 'NULL') {
    sql = `UPDATE "${currentTable}" SET "${colName}" = NULL WHERE "${currentPrimaryKey}" = ${pkVal}`;
  } else {
    const escaped = newVal.replace(/'/g, "''");
    sql = `UPDATE "${currentTable}" SET "${colName}" = '${escaped}' WHERE "${currentPrimaryKey}" = ${pkVal}`;
  }

  try {
    await dbExecute(sql);
    setStatus(`已更新 ${colName}`);
    td.textContent = newVal.toUpperCase() === 'NULL' ? 'NULL' : newVal;
    if (newVal.toUpperCase() === 'NULL') td.style.color = '#cbd5e1';
  } catch (err) {
    alert('更新失敗: ' + err.message);
  }
}

async function deleteRow(pkVal) {
  if (isAuditLogTable()) {
    alert('【唯讀鎖定】T99_AuditLog 為稽核歷史日誌，嚴禁刪除任何紀錄！');
    return;
  }

  if (!confirm(`確定要刪除主鍵值為 [${pkVal}] 的整筆資料嗎？`)) return;

  const sql = `DELETE FROM "${currentTable}" WHERE "${currentPrimaryKey}" = ${pkVal}`;
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
    alert('【安全違規】稽核表嚴禁清空！');
    return;
  }
  if (!currentTable) return;
  const confirmText = prompt(`【危險操作】即將清空 [${currentTable}] 的所有資料！\n請在此輸入 table 名稱 "${currentTable}" 確認執行：`);
  if (confirmText !== currentTable) {
    alert('名稱輸入不一致，操作已取消');
    return;
  }

  const sql = `DELETE FROM "${currentTable}"`;
  try {
    await dbExecute(sql);
    setStatus(`已清空資料表 ${currentTable}`);
    loadCurrentTable();
  } catch (err) {
    alert('清空失敗: ' + err.message);
  }
}

async function backupDatabase() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  
  const defaultFileName = `D:/pm-server/backups/backup_${timestamp}.zip`;
  const targetPath = prompt('請輸入備份檔案儲存路徑（伺服器本機路徑）：', defaultFileName);
  if (!targetPath) return;

  setStatus('正在建立資料庫備份壓縮包，請稍候...');
  const sql = `SCRIPT TO '${targetPath}' COMPRESSION ZIP`;

  try {
    await dbQuery(sql);
    setStatus(`備份成功！檔案已輸出至: ${targetPath}`);
    alert(`【備份成功】\n檔案已產生在伺服器本機：\n${targetPath}`);
  } catch (err) {
    alert('備份失敗: ' + err.message);
    setStatus('備份失敗', true);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

document.addEventListener('DOMContentLoaded', () => {
  if (checkAdminAuth()) {
    loadTableList();
  }
});