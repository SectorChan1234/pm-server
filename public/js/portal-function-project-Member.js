// ==========================================================================
// ProjectBook - Project Member Management Submodule
// File: /public/js/portal-function-project-Member.js
// Standard: Full Enterprise Spec (.pb-table, Time-Travel Filter, Integrated Gantt)
// ==========================================================================

let cachedMemberList = [];
let cachedMemberRefs = null;
let currentMemberOriginIsDeleted = false;
let currentContractorOriginIsDeleted = false;

// 唯讀名冊專用時間旅行狀態
let rosterFilterMode = 'EFFECTIVE_AS_OF'; // 'EFFECTIVE_AS_OF' | 'ALL_ACTIVE' | 'ALL_HISTORICAL'
let rosterTargetDate = new Date().toISOString().substring(0, 10);

// 輔助函式：安全輸出文字（不使用 || 運算子，杜絕轉義干擾）
function safeStr(val, defaultVal) {
    var def = defaultVal !== undefined ? defaultVal : '-';
    return (val !== null && val !== undefined && String(val).trim() !== '') ? val : def;
}

// 1. 取得字典參考資料
async function getMemberRefData() {
    if (cachedMemberRefs) return cachedMemberRefs;
    const res = await api('/api/portal/project/member-ref?pj=' + currentProjectId);
    if (res && res.status === 'SUCCESS') {
        cachedMemberRefs = res;
    } else {
        cachedMemberRefs = { statuses: [], role_types: [], rights: [] };
    }
    return cachedMemberRefs;
}

// 快速字典自訂彈窗
async function quickAddMemberRefOption(category, targetSelectId, labelName) {
    const val = prompt('Please enter custom option for [' + labelName + ']:\n(This will be saved to your personal dictionary)');
    if (!val || !val.trim()) return;

    const trimmed = val.trim();
    const res = await api('/api/portal/project/ref/create-custom', {
        method: 'POST',
        body: JSON.stringify({ category: category, text: trimmed })
    });

    if (res && res.status === 'SUCCESS') {
        const sel = document.getElementById(targetSelectId);
        if (sel) {
            let exists = false;
            for (let i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value.toUpperCase() === trimmed.toUpperCase()) {
                    sel.selectedIndex = i;
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = trimmed;
                opt.textContent = trimmed + ' (Custom)';
                opt.selected = true;
                sel.appendChild(opt);
            }
        }

        if (cachedMemberRefs) {
            if (category === 'T06_PR_RoleType' && !cachedMemberRefs.role_types.includes(trimmed)) {
                cachedMemberRefs.role_types.push(trimmed);
            } else if (category === 'T06_PR_Right' && !cachedMemberRefs.rights.includes(trimmed)) {
                cachedMemberRefs.rights.push(trimmed);
            }
        }
        alert('Option "' + trimmed + '" added and selected.');
    } else {
        alert('Failed to add option: ' + (res ? res.message : 'Server error'));
    }
}

// ==========================================================================
// 2. 視圖 1：純唯讀成員名冊 (Member List - 支援時間旅行篩選、拖曳與 CSV 匯出)
// ==========================================================================
async function renderMemberListView() {
    await renderMemberRosterCore(false);
}

// ==========================================================================
// 3. 視圖 2：成員授權與外判管理 (Manage Member - 具備所有管理動作)
// ==========================================================================
async function renderManageMemberView() {
    await renderMemberRosterCore(true);
}

// ==========================================================================
// 4. 時空旅行過濾演算法 (Time-Travel Filtering Engine)
// ==========================================================================
function filterMembersByTimeline(list, mode, targetDateStr) {
    if (!list || list.length === 0) return [];
    if (mode === 'ALL_HISTORICAL') {
        return list; // 全量歷史：不論日期、包含軟刪除
    }

    // 排除軟刪除
    const nonDeleted = list.filter(m => !m.pr_ignore_delete);
    if (mode === 'ALL_ACTIVE') {
        return nonDeleted; // 不理會日期，所有未被刪除者
    }

    // 預設模式：EFFECTIVE_AS_OF (依指定日期篩選)
    const targetMs = new Date(targetDateStr.replace(/-/g, '/') + ' 23:59:59').getTime();
    const targetStartMs = new Date(targetDateStr.replace(/-/g, '/') + ' 00:00:00').getTime();

    return nonDeleted.filter(m => {
        // 1. 若有設定開始日期，且開始日期大於目標基準日，代表「未來生效」，不予顯示
        if (m.pr_start_date) {
            const sMs = new Date(m.pr_start_date.substring(0, 10).replace(/-/g, '/') + ' 00:00:00').getTime();
            if (!isNaN(sMs) && sMs > targetMs) {
                return false;
            }
        }

        // 2. 若有設定結束日期，且結束日期小於目標基準日，代表「已過期」，不予顯示
        if (m.pr_end_date) {
            const eMs = new Date(m.pr_end_date.substring(0, 10).replace(/-/g, '/') + ' 23:59:59').getTime();
            if (!isNaN(eMs) && eMs < targetStartMs) {
                return false;
            }
        }

        return true;
    });
}

// ==========================================================================
// 5. 名冊核心渲染引擎 (Core Roster Engine)
// ==========================================================================
async function renderMemberRosterCore(isManageMode) {
    if (!currentProjectId) {
        const container = document.getElementById('viewContent');
        if (container) container.innerHTML = '<div class="empty-placeholder">Please select a project first.</div>';
        return;
    }

    const headingEl = document.getElementById('viewHeading');
    const roleEl = document.getElementById('viewRole');
    const container = document.getElementById('viewContent');

    if (headingEl) headingEl.textContent = isManageMode ? 'Manage Team Members' : 'Project Team Member List';
    if (roleEl) roleEl.textContent = 'Role: ' + (currentProjectRight ? currentProjectRight : 'MEMBER');
    if (container) container.innerHTML = '<div class="empty-placeholder">Loading team members...</div>';

    const res = await api('/api/portal/project/members?pj=' + currentProjectId);
    if (!res || res.status !== 'SUCCESS' || !res.members) {
        if (container) container.innerHTML = '<div class="empty-placeholder">Unable to load project members.</div>';
        return;
    }

    cachedMemberList = res.members;
    const canManage = isManageMode && (currentProjectRight === 'FULL' || currentProjectRight === 'ADMIN');

    // 依據目前模式進行名單過濾
    const displayList = isManageMode 
        ? cachedMemberList 
        : filterMembersByTimeline(cachedMemberList, rosterFilterMode, rosterTargetDate);

    // 依據 is_contractor 分組
    const deptOfficers = displayList.filter(m => !m.is_contractor);
    const contractors = displayList.filter(m => m.is_contractor);

    // 安全讀取當前使用者 ID
    const currentStaffId = (typeof user !== 'undefined' && user) ? (user.pk_t05 ? user.pk_t05 : user.pkT05) : null;
    const nowTimestamp = Date.now();

    // 輔助函式：產生 Period 標籤與過期警示
    function renderPeriodCell(startDateStr, endDateStr) {
        if (!startDateStr && !endDateStr) {
            return '<span style="color:#94a3b8; font-size:12px;">Permanent</span>';
        }
        const s = startDateStr ? startDateStr.substring(0, 10) : 'Start';
        const e = endDateStr ? endDateStr.substring(0, 10) : 'No End';
        let isExpired = false;
        if (endDateStr) {
            const endMs = new Date(endDateStr.replace(/-/g, '/')).getTime();
            if (!isNaN(endMs) && endMs < nowTimestamp) {
                isExpired = true;
            }
        }
        let html = '<div style="font-size:12px; font-family:monospace; color:#334155;">' + escapeHtml(s) + ' ~ ' + escapeHtml(e) + '</div>';
        if (isExpired) {
            html += '<div style="margin-top:2px;"><span class="badge" style="background:#fef3c7; color:#92400e; font-size:10px; font-weight:700;" title="Access period has ended. Effectively acts as Viewer.">⚠️ Expired (Suggest VIEWER)</span></div>';
        }
        return html;
    }

    // 動態表頭：Member List 顯示 Contact Tel；Manage Member 顯示 Active Period
    const dynamicColHeader = isManageMode ? 'Active Period' : 'Contact Tel';

    // 5.1 內部公務同仁名冊
    let deptTableHtml = '';
    if (deptOfficers.length === 0) {
        deptTableHtml = '<div style="font-size:13px; color:#94a3b8; padding:12px 0;">No departmental officers match the selected criteria.</div>';
    } else {
        deptTableHtml = `
            <table class="pb-table" id="deptOfficersTable">
                <thead>
                    <tr>
                        ${!isManageMode ? '<th style="width: 4%; text-align: center;">⠿</th>' : ''}
                        <th style="width: 18%;">Officer Name</th>
                        <th style="width: 14%;">Rank / Post</th>
                        <th style="width: 18%;">${dynamicColHeader}</th>
                        <th style="width: 18%;">Official Email</th>
                        <th style="width: 12%;">Project Role</th>
                        <th style="width: 8%;">Access Right</th>
                        <th style="width: 8%; text-align: right;">${canManage ? 'Actions' : 'Status'}</th>
                    </tr>
                </thead>
                <tbody class="${!isManageMode ? 'drag-sort-body' : ''}" data-member-group="OFFICER">
                    ${deptOfficers.map(m => {
                        const isDel = Boolean(m.pr_ignore_delete);
                        const isSelf = Boolean(currentStaffId && Number(m.pk_t05) === Number(currentStaffId));
                        const isTargetFull = (m.pr_right === 'FULL');
                        
                        // 同級 FULL 權限保護
                        const canEditThisOfficer = canManage && (!isTargetFull || isSelf);
                        const btnLabel = isSelf ? '✎ Edit (You)' : '✎ Edit';
                        const rankDisplay = escapeHtml(safeStr(m.st_rank)) + (m.st_post ? ' / ' + escapeHtml(m.st_post) : '');
                        
                        // 動態內容
                        const middleCellContent = isManageMode 
                            ? renderPeriodCell(m.pr_start_date, m.pr_end_date)
                            : (m.st_tel ? `📞 ${escapeHtml(m.st_tel)}` : '<span style="color:#64748b; font-size:13px;">-</span>');

                        const youBadgeHtml = (isManageMode && isSelf) 
                            ? '<span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px; margin-left:4px;">You</span>' 
                            : '';

                        return `
                            <tr ${!isManageMode ? 'draggable="true" class="draggable-row"' : ''} style="${isDel ? 'opacity: 0.55; background: #fff5f5;' : ''}" data-staff-id="${m.pk_t05}">
                                ${!isManageMode ? '<td style="text-align:center; color:#94a3b8; cursor:grab; user-select:none;">⋮⋮</td>' : ''}
                                <td>
                                    <strong style="color: #1e293b; font-size: 13px;">${escapeHtml(m.st_name)}</strong>${m.st_nickname ? `<span style="color:#64748b; font-size:11px;"> (${escapeHtml(m.st_nickname)})</span>` : ''}
                                    ${youBadgeHtml}
                                </td>
                                <td style="color: #334155; font-size: 13px;">${rankDisplay}</td>
                                <td>${middleCellContent}</td>
                                <td>
                                    <span style="font-family: monospace; font-size: 12px; color: #0284c7;">${escapeHtml(m.st_email)}</span>
                                </td>
                                <td style="color: #334155; font-size: 13px;">${escapeHtml(m.pr_roletype)}</td>
                                <td>
                                    <span class="badge ${m.pr_right === 'FULL' ? 'badge-active' : (m.pr_right === 'EVENT ONLY' ? 'badge-frozen' : 'badge-info')}" style="font-size: 11px;">
                                        ${escapeHtml(m.pr_right)}
                                    </span>
                                </td>
                                <td style="text-align: right;">
                                    ${canManage ? `
                                        ${canEditThisOfficer ? `
                                            <button type="button" class="btn-submit" style="background: #0284c7; padding: 3px 10px; font-size: 12px; border-radius: 4px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="openEditMemberModal(${m.pk_t06})">
                                                ${btnLabel}
                                            </button>
                                        ` : `
                                            <span style="color: #94a3b8; font-size: 12px;" title="FULL role members cannot edit each other">-</span>
                                        `}
                                    ` : `
                                        ${isDel ? '<span style="color:#ef4444; font-size:11px; font-weight:600;">Deleted</span>' : '<span style="color:#10b981; font-size:11px;">Active</span>'}
                                    `}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    // 5.2 Contractor 名冊
    let contractorTableHtml = '';
    if (contractors.length === 0) {
        contractorTableHtml = '<div style="font-size:13px; color:#94a3b8; padding:12px 0;">No contractors match the selected criteria.</div>';
    } else {
        contractorTableHtml = `
            <table class="pb-table" id="contractorsTable">
                <thead>
                    <tr>
                        ${!isManageMode ? '<th style="width: 4%; text-align: center;">⠿</th>' : ''}
                        <th style="width: 18%;">Officer Name</th>
                        <th style="width: 14%;">Company / Vendor</th>
                        <th style="width: 18%;">${dynamicColHeader}</th>
                        <th style="width: 18%;">Email</th>
                        <th style="width: 12%;">Project Role</th>
                        <th style="width: 8%;">Access Right</th>
                        <th style="width: 8%; text-align: right;">${canManage ? 'Actions' : 'Status'}</th>
                    </tr>
                </thead>
                <tbody class="${!isManageMode ? 'drag-sort-body' : ''}" data-member-group="CONTRACTOR">
                    ${contractors.map(c => {
                        const isDel = Boolean(c.pr_ignore_delete);

                        const middleCellContent = isManageMode
                            ? renderPeriodCell(c.pr_start_date, c.pr_end_date)
                            : (c.st_tel ? `📞 ${escapeHtml(c.st_tel)}` : '<span style="color:#cbd5e1;">-</span>');

                        return `
                            <tr ${!isManageMode ? 'draggable="true" class="draggable-row"' : ''} style="${isDel ? 'opacity: 0.55; background: #fff5f5;' : ''}" data-staff-id="${c.pk_t05}">
                                ${!isManageMode ? '<td style="text-align:center; color:#94a3b8; cursor:grab; user-select:none;">⋮⋮</td>' : ''}
                                <td>
                                    <strong style="color: #1e293b; font-size: 13px;">${escapeHtml(c.st_name)}</strong>${c.st_remark ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px; font-style: italic;">Remark: ${escapeHtml(c.st_remark)}</div>` : ''}
                                </td>
                                <td>
                                    <span class="badge" style="background:#f1f5f9; color:#334155; font-size: 11px;">${escapeHtml(safeStr(c.st_company, 'External Vendor'))}</span>
                                </td>
                                <td>${middleCellContent}</td>
                                <td>
                                    <span style="font-family: monospace; font-size: 12px; color: #0284c7;">${escapeHtml(c.st_email)}</span>
                                </td>
                                <td style="color: #334155; font-size: 13px;">${escapeHtml(c.pr_roletype)}</td>
                                <td>
                                    <span class="badge ${c.pr_right === 'EVENT ONLY' ? 'badge-frozen' : 'badge-info'}" style="font-weight:700; font-size: 11px;">${escapeHtml(c.pr_right)}</span>
                                </td>
                                <td style="text-align: right;">
                                    ${canManage ? `
                                        <button type="button" class="btn-submit" style="background: #0284c7; padding: 3px 10px; font-size: 12px; border-radius: 4px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="openEditContractorModal(${c.pk_t05})">
                                            ✎ Edit
                                        </button>
                                    ` : `
                                        ${isDel ? '<span style="color:#ef4444; font-size:11px; font-weight:600;">Deleted</span>' : '<span style="color:#10b981; font-size:11px;">Active</span>'}
                                    `}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    // 5.3 唯讀名冊專屬：時間濾鏡工具列 HTML
    let filterToolbarHtml = '';
    if (!isManageMode) {
        filterToolbarHtml = `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 12px; font-weight: 700; color: #475569;">🕒 Timeline Filter:</span>
                    <select id="rfModeSelect" style="padding: 4px 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" onchange="handleRosterFilterModeChange(this.value)">
                        <option value="EFFECTIVE_AS_OF" ${rosterFilterMode === 'EFFECTIVE_AS_OF' ? 'selected' : ''}>Effective on Specified Date (Default)</option>
                        <option value="ALL_ACTIVE" ${rosterFilterMode === 'ALL_ACTIVE' ? 'selected' : ''}>All Active Members (Ignore Dates)</option>
                        <option value="ALL_HISTORICAL" ${rosterFilterMode === 'ALL_HISTORICAL' ? 'selected' : ''}>All Historical Records (Include Deleted)</option>
                    </select>

                    <div id="rfDatePickerWrap" style="display: ${rosterFilterMode === 'EFFECTIVE_AS_OF' ? 'inline-flex' : 'none'}; align-items: center; gap: 6px;">
                        <input type="date" id="rfTargetDate" value="${rosterTargetDate}" style="padding: 3px 6px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px;" onchange="handleRosterTargetDateChange(this.value)">
                        <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 11px;" onclick="resetRosterTargetDateToToday()">Today</button>
                    </div>
                </div>
                <div style="font-size: 12px; color: #64748b;">
                    Showing: <strong>${deptOfficers.length + contractors.length}</strong> of ${cachedMemberList.length} records
                </div>
            </div>
        `;
    }

    if (container) {
        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
                <div>
                    <h3 style="margin: 0; font-size: 16px; color: #1e293b;">Project Team Roster</h3>
                    <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                        Departmental Officers: <strong>${deptOfficers.length}</strong> | Contractors: <strong>${contractors.length}</strong>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    ${!isManageMode ? `
                        <button type="button" class="btn-secondary" style="padding: 6px 12px; font-weight: 600;" onclick="exportMemberListToCSV()">📥 Export CSV</button>
                    ` : ''}
                    ${canManage ? `
                        <button type="button" class="btn-submit" onclick="openAddMemberModal()">+ Assign Departmental Officer</button>
                        <button type="button" class="btn-submit" style="background: #0284c7;" onclick="openCreateContractorModal()">+ Create Contractor</button>
                    ` : ''}
                </div>
            </div>

            ${filterToolbarHtml}

            <!-- ★ 掛載點 1：成員排程甘特藍圖容器 (Roster Gantt Chart) -->
            <div id="memberGanttContainer"></div>

            <!-- 分組一：Departmental Officers -->
            <div class="card" style="margin-bottom: 20px; padding: 16px 20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-light); padding-bottom:8px; margin-bottom:8px;">
                    <h4 style="margin:0; font-size:14px; color:#1e293b; display:flex; align-items:center; gap:6px;">
                        🏛️ Departmental Officers (Government Core Team)
                    </h4>
                    <span style="font-size:12px; color:#64748b;">Count: ${deptOfficers.length}</span>
                </div>
                ${deptTableHtml}
            </div>

            <!-- 分組二：Project Contractors & External Partners -->
            <div class="card" style="padding: 16px 20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-light); padding-bottom:8px; margin-bottom:8px;">
                    <h4 style="margin:0; font-size:14px; color:#0369a1; display:flex; align-items:center; gap:6px;">
                        🏢 Project Contractors & External Partners (Project-Scoped)
                    </h4>
                    <span style="font-size:12px; color:#64748b;">Count: ${contractors.length}</span>
                </div>
                ${contractorTableHtml}
            </div>
        `;

        // ★ 掛載點 2：渲染完成後自動觸發甘特圖繪製 (具備防禦性呼叫)
        if (typeof window.renderMemberGanttChart === 'function') {
            window.renderMemberGanttChart('memberGanttContainer', cachedMemberList);
        }

        if (!isManageMode) {
            initTableDragAndDrop();
        }
    }
}

// ==========================================================================
// 6. 時間旅行工具列事件處理 (純前端即時重算)
// ==========================================================================
function handleRosterFilterModeChange(newMode) {
    rosterFilterMode = newMode;
    const dateWrap = document.getElementById('rfDatePickerWrap');
    if (dateWrap) {
        dateWrap.style.display = (newMode === 'EFFECTIVE_AS_OF') ? 'inline-flex' : 'none';
    }
    renderMemberListView();
}

function handleRosterTargetDateChange(newDate) {
    if (!newDate) return;
    rosterTargetDate = newDate;
    renderMemberListView();
}

function resetRosterTargetDateToToday() {
    rosterTargetDate = new Date().toISOString().substring(0, 10);
    const dateInput = document.getElementById('rfTargetDate');
    if (dateInput) dateInput.value = rosterTargetDate;
    renderMemberListView();
}

// ==========================================================================
// 7. HTML5 拖曳排序引擎 (Drag & Drop - 實施同表格同群組硬性邊界隔離防禦)
// ==========================================================================
function initTableDragAndDrop() {
    const bodies = document.querySelectorAll('.drag-sort-body');
    bodies.forEach(tbody => {
        let draggedRow = null;

        tbody.addEventListener('dragstart', (e) => {
            const row = e.target.closest('tr');
            if (!row) return;
            draggedRow = row;
            row.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', ''); // 兼容特定瀏覽器 DND 要求
        });

        tbody.addEventListener('dragover', (e) => {
            // 嚴格邊界檢查：若無拖曳行，或拖曳行所屬的 tbody 與當前目標不同，徹底拒絕放置
            if (!draggedRow || draggedRow.parentNode !== tbody) {
                e.dataTransfer.dropEffect = 'none';
                return;
            }

            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const targetRow = e.target.closest('tr');
            if (targetRow && targetRow !== draggedRow && targetRow.parentNode === tbody) {
                const bounding = targetRow.getBoundingClientRect();
                const offset = bounding.y + bounding.height / 2;
                if (e.clientY - offset > 0) {
                    targetRow.after(draggedRow);
                } else {
                    targetRow.before(draggedRow);
                }
            }
        });

        tbody.addEventListener('drop', (e) => {
            // 防止異質表格非法丟入
            if (!draggedRow || draggedRow.parentNode !== tbody) {
                e.preventDefault();
                return;
            }
        });

        tbody.addEventListener('dragend', () => {
            if (draggedRow) {
                draggedRow.style.opacity = '1';
                draggedRow = null;
            }
        });
    });
}

// ==========================================================================
// 8. CSV 匯出引擎 (依據目前過濾模式與畫面順序輸出，內嵌 UTF-8 BOM)
// ==========================================================================
function exportMemberListToCSV() {
    const rows = [];
    rows.push(['Type', 'Officer Name', 'Rank / Post / Vendor', 'Contact Tel', 'Official Email', 'Project Role', 'Access Right', 'Status']);

    const deptRows = document.querySelectorAll('#deptOfficersTable tbody tr');
    deptRows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 7) {
            const offset = (tds.length === 8) ? 1 : 0;
            const name = tds[offset + 0].innerText.replace(/\n/g, ' ').trim();
            const rank = tds[offset + 1].innerText.trim();
            const tel = tds[offset + 2].innerText.replace(/\n/g, ' ').trim();
            const email = tds[offset + 3].innerText.trim();
            const role = tds[offset + 4].innerText.trim();
            const right = tds[offset + 5].innerText.trim();
            const status = tds[offset + 6].innerText.trim();
            rows.push(['Departmental Officer', name, rank, tel, email, role, right, status]);
        }
    });

    const contractorRows = document.querySelectorAll('#contractorsTable tbody tr');
    contractorRows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 7) {
            const offset = (tds.length === 8) ? 1 : 0;
            const name = tds[offset + 0].innerText.replace(/\n/g, ' ').trim();
            const vendor = tds[offset + 1].innerText.trim();
            const tel = tds[offset + 2].innerText.replace(/\n/g, ' ').trim();
            const email = tds[offset + 3].innerText.trim();
            const role = tds[offset + 4].innerText.trim();
            const right = tds[offset + 5].innerText.trim();
            const status = tds[offset + 6].innerText.trim();
            rows.push(['Contractor', name, vendor, tel, email, role, right, status]);
        }
    });

    const csvContent = rows.map(r => r.map(field => {
        const clean = String(field).replace(/"/g, '""');
        return '"' + clean + '"';
    }).join(',')).join('\r\n');

    let modeSuffix = '_AsOf_' + rosterTargetDate;
    if (rosterFilterMode === 'ALL_ACTIVE') modeSuffix = '_AllActive';
    else if (rosterFilterMode === 'ALL_HISTORICAL') modeSuffix = '_AllHistorical';

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Project_Members_' + (currentProjectId ? currentProjectId : 'Export') + modeSuffix + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==========================================================================
// 9. 一般成員指派 Modal (Assign / Edit Member)
// ==========================================================================
function ensureMemberModalExists() {
    let modal = document.getElementById('assignMemberModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'assignMemberModal';
    modal.innerHTML = `
        <div class="modal-box" style="width: 540px;">
            <div class="modal-header">
                <h3 id="amModalTitle" style="margin:0;">Assign Member to Project</h3>
                <button type="button" class="modal-close-btn" onclick="closeModal('assignMemberModal')">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 75vh; overflow-y: auto;">
                <input type="hidden" id="amPkT06">
                <input type="hidden" id="amHiddenStaffId">

                <div class="form-field" id="amOfficerFieldWrap">
                    <label for="amStaffSelect">Officer *</label>
                    <select id="amStaffSelect" required></select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-field">
                        <label for="amRoleTypeSelect" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Project Role Title *</span>
                            <button type="button" class="btn-ref-add" onclick="quickAddMemberRefOption('T06_PR_RoleType', 'amRoleTypeSelect', 'Role Title')" title="Add custom role title">+ Role</button>
                        </label>
                        <select id="amRoleTypeSelect" required></select>
                    </div>
                    <div class="form-field">
                        <label for="amRightSelect" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Access Right (PR_Right) *</span>
                            <button type="button" class="btn-ref-add" onclick="quickAddMemberRefOption('T06_PR_Right', 'amRightSelect', 'Access Right')" title="Add custom access right">+ Right</button>
                        </label>
                        <select id="amRightSelect" required></select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px;">
                    <div class="form-field">
                        <label for="amStartDate">Start Date</label>
                        <input type="date" id="amStartDate">
                    </div>
                    <div class="form-field">
                        <label for="amEndDate">End Date (Optional)</label>
                        <input type="date" id="amEndDate">
                    </div>
                </div>

                <div class="form-field" id="amDeleteCheckboxWrap" style="display: none; margin-top: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ef4444; font-weight: 600; cursor: pointer;">
                        <input type="checkbox" id="amIgnoreDelete" onchange="evaluateMemberAuditReasonVisibility()">
                        <span>Mark this member as Soft-Deleted (Remove Access)</span>
                    </label>
                </div>

                <div class="form-field" id="amAuditReasonWrap" style="display: none; margin-top: 10px;">
                    <label for="amAuditReason" style="color: #b91c1c; font-weight:600;">Audit Reason (Required for Removal/Restoration) *</label>
                    <textarea id="amAuditReason" rows="2" placeholder="State reason for member removal or reactivation..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeModal('assignMemberModal')">Cancel</button>
                <button type="button" class="btn-submit" onclick="submitSaveMember()">Save Assignment</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function evaluateMemberAuditReasonVisibility() {
    const chk = document.getElementById('amIgnoreDelete');
    const wrap = document.getElementById('amAuditReasonWrap');
    if (!chk || !wrap) return;
    const isStateChanged = (chk.checked !== currentMemberOriginIsDeleted);
    wrap.style.display = isStateChanged ? 'block' : 'none';
}

async function openAddMemberModal() {
    ensureMemberModalExists();
    await getMemberRefData();

    currentMemberOriginIsDeleted = false;

    const officerWrap = document.getElementById('amOfficerFieldWrap');
    if (officerWrap) officerWrap.style.display = 'block';

    const delWrap = document.getElementById('amDeleteCheckboxWrap');
    if (delWrap) delWrap.style.display = 'none';

    const staffSelect = document.getElementById('amStaffSelect');
    staffSelect.innerHTML = '<option value="">Loading available staff...</option>';
    openModal('assignMemberModal');

    const [staffRes, memRes] = await Promise.all([
        api('/api/portal/project/available-staff?pj=' + currentProjectId),
        api('/api/portal/project/members?pj=' + currentProjectId)
    ]);

    staffSelect.innerHTML = '';
    const existingStaffIds = new Set((memRes && memRes.members) ? memRes.members.map(m => Number(m.pk_t05)) : []);

    if (!staffRes || staffRes.status !== 'SUCCESS' || !staffRes.staff || staffRes.staff.length === 0) {
        staffSelect.innerHTML = '<option value="">(No available officers found)</option>';
    } else {
        const validStaff = staffRes.staff.filter(s => !existingStaffIds.has(Number(s.pk_t05)));
        if (validStaff.length === 0) {
            staffSelect.innerHTML = '<option value="">(All eligible officers are already assigned)</option>';
        } else {
            staffSelect.innerHTML = '<option value="">-- Select an Officer --</option>';
            validStaff.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.pk_t05;
                opt.textContent = '[' + (s.st_rank ? s.st_rank : 'Staff') + '] ' + s.st_name + ' (' + s.st_email + ')';
                staffSelect.appendChild(opt);
            });
        }
    }

    document.getElementById('amPkT06').value = '';
    document.getElementById('amHiddenStaffId').value = '';
    document.getElementById('amModalTitle').textContent = 'Assign Departmental Officer';
    document.getElementById('amStartDate').value = new Date().toISOString().substring(0, 10);
    document.getElementById('amEndDate').value = '';
    document.getElementById('amIgnoreDelete').checked = false;
    document.getElementById('amAuditReason').value = '';
    document.getElementById('amAuditReasonWrap').style.display = 'none';

    populateMemberRoleSelect('Member');
    populateMemberRightsSelect('GENERAL');
}

async function openEditMemberModal(pkT06) {
    ensureMemberModalExists();
    await getMemberRefData();

    const mem = cachedMemberList.find(m => m.pk_t06 === pkT06);
    if (!mem) return;

    currentMemberOriginIsDeleted = Boolean(mem.pr_ignore_delete);

    const officerWrap = document.getElementById('amOfficerFieldWrap');
    if (officerWrap) officerWrap.style.display = 'none';

    const delWrap = document.getElementById('amDeleteCheckboxWrap');
    if (delWrap) delWrap.style.display = 'block';

    document.getElementById('amPkT06').value = mem.pk_t06;
    document.getElementById('amHiddenStaffId').value = mem.pk_t05;
    document.getElementById('amModalTitle').textContent = 'Edit Role: ' + mem.st_name;
    document.getElementById('amStartDate').value = mem.pr_start_date ? mem.pr_start_date.substring(0, 10) : '';
    document.getElementById('amEndDate').value = mem.pr_end_date ? mem.pr_end_date.substring(0, 10) : '';
    document.getElementById('amIgnoreDelete').checked = currentMemberOriginIsDeleted;
    document.getElementById('amAuditReason').value = '';
    document.getElementById('amAuditReasonWrap').style.display = 'none';

    populateMemberRoleSelect(mem.pr_roletype);
    populateMemberRightsSelect(mem.pr_right);

    openModal('assignMemberModal');
}

function populateMemberRoleSelect(selectedVal, selectId) {
    const targetId = selectId ? selectId : 'amRoleTypeSelect';
    const sel = document.getElementById(targetId);
    if (!sel) return;
    sel.innerHTML = '';
    const roles = (cachedMemberRefs && cachedMemberRefs.role_types) ? cachedMemberRefs.role_types : ['Project Leader', 'Member', 'Contractor'];
    roles.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        if (r === selectedVal) opt.selected = true;
        sel.appendChild(opt);
    });
}

function populateMemberRightsSelect(selectedVal) {
    const sel = document.getElementById('amRightSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const rights = (cachedMemberRefs && cachedMemberRefs.rights) ? cachedMemberRefs.rights : ['FULL', 'GENERAL', 'VIEWER', 'EVENT ONLY'];
    rights.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        if (r === selectedVal) opt.selected = true;
        sel.appendChild(opt);
    });
}

async function submitSaveMember() {
    const pkT06Str = document.getElementById('amPkT06').value;
    const isEdit = Boolean(pkT06Str && pkT06Str.trim() !== '');

    let staffId = isEdit ? document.getElementById('amHiddenStaffId').value : document.getElementById('amStaffSelect').value;
    if (!staffId) {
        alert('Please select an officer.');
        return;
    }

    if (!isEdit) {
        const existingMember = cachedMemberList.find(m => Number(m.pk_t05) === Number(staffId));
        if (existingMember && existingMember.pr_ignore_delete) {
            alert('【Action Blocked】This officer is already a Soft-Deleted member.\nPlease use the "✎ Edit" button on the roster to restore them.');
            return;
        }
    }

    const isMarkedDelete = isEdit ? document.getElementById('amIgnoreDelete').checked : false;
    const isStateChanged = isEdit && (isMarkedDelete !== currentMemberOriginIsDeleted);
    const auditReason = document.getElementById('amAuditReason').value.trim();

    if (isStateChanged && !auditReason) {
        alert('Audit reason is required when deleting or restoring a member.');
        document.getElementById('amAuditReason').focus();
        return;
    }

    const payload = {
        fk_t06_pk_t01: currentProjectId,
        fk_t06_pk_t05: Number(staffId),
        pk_t06: isEdit ? Number(pkT06Str) : null,
        pr_roletype: document.getElementById('amRoleTypeSelect').value,
        pr_right: document.getElementById('amRightSelect').value,
        pr_start_date: document.getElementById('amStartDate').value ? document.getElementById('amStartDate').value + ' 00:00:00' : null,
        pr_end_date: document.getElementById('amEndDate').value ? document.getElementById('amEndDate').value + ' 23:59:59' : null,
        pr_ignore_delete: isMarkedDelete,
        audit_reason: auditReason
    };

    const res = await api('/api/portal/project/member/save', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (res && res.status === 'SUCCESS') {
        closeModal('assignMemberModal');
        renderManageMemberView();
    } else {
        alert('Operation failed: ' + (res ? res.message : 'Network error'));
    }
}

// ==========================================================================
// 10. Contractor 單一整合 Modal (含 Soft Delete 與 Audit Reason 狀態機)
// ==========================================================================
function ensureContractorModalExists() {
    let modal = document.getElementById('contractorModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'contractorModal';
    modal.innerHTML = `
        <div class="modal-box" style="width: 540px;">
            <div class="modal-header">
                <h3 id="cmModalTitle" style="margin:0;">Create Project Contractor</h3>
                <button type="button" class="modal-close-btn" onclick="closeModal('contractorModal')">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 75vh; overflow-y: auto;">
                <input type="hidden" id="cmPkT05">

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-field">
                        <label for="cmName">Officer Name (Contractor) *</label>
                        <input type="text" id="cmName" required placeholder="e.g. David Wong">
                    </div>
                    <div class="form-field">
                        <label for="cmCompany">Company / Vendor *</label>
                        <input type="text" id="cmCompany" required placeholder="e.g. PCCW, Vendor Ltd">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px;">
                    <div class="form-field">
                        <label for="cmEmail">Email Address *</label>
                        <input type="email" id="cmEmail" required placeholder="e.g. david@vendor.com">
                    </div>
                    <div class="form-field">
                        <label for="cmTel">Contact Phone / Tel</label>
                        <input type="text" id="cmTel" placeholder="e.g. +852 2810 1234">
                    </div>
                </div>

                <div class="form-field" style="margin-top: 6px;">
                    <label for="cmRoleTypeSelect" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>Project Role Title *</span>
                        <button type="button" class="btn-ref-add" onclick="quickAddMemberRefOption('T06_PR_RoleType', 'cmRoleTypeSelect', 'Role Title')" title="Add custom role title">+ Role</button>
                    </label>
                    <select id="cmRoleTypeSelect" required></select>
                </div>

                <!-- Active Period 任期輸入 (Start / End Date) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px;">
                    <div class="form-field">
                        <label for="cmStartDate">Active Start Date</label>
                        <input type="date" id="cmStartDate">
                    </div>
                    <div class="form-field">
                        <label for="cmEndDate">Active End Date (Optional)</label>
                        <input type="date" id="cmEndDate">
                    </div>
                </div>

                <div class="form-field" style="margin-top: 6px;">
                    <label for="cmRemark">Contractor Remark / Scope (ST_Remark)</label>
                    <textarea id="cmRemark" rows="2" placeholder="e.g. Contract No. CT-2026-01, database migration..."></textarea>
                </div>

                <!-- 軟刪除 Checkbox (僅在編輯模式下顯露) -->
                <div class="form-field" id="cmDeleteCheckboxWrap" style="display: none; margin-top: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ef4444; font-weight: 600; cursor: pointer;">
                        <input type="checkbox" id="cmIgnoreDelete" onchange="evaluateContractorAuditReasonVisibility()">
                        <span>Mark this member as Soft-Deleted (Remove Access)</span>
                    </label>
                </div>

                <!-- 軟刪除/復原原因 (狀態變更時強制必填) -->
                <div class="form-field" id="cmAuditReasonWrap" style="display: none; margin-top: 10px;">
                    <label for="cmAuditReason" style="color: #b91c1c; font-weight:600;">Audit Reason (Required for Removal/Restoration) *</label>
                    <textarea id="cmAuditReason" rows="2" placeholder="State reason for contractor removal or reactivation..."></textarea>
                </div>

                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 10px; border-radius: 6px; margin-top: 8px; font-size: 12px; color: #64748b;">
                    🔒 <strong>Access Notice:</strong> Contractors are granted <strong>EVENT ONLY</strong> access automatically. They can only inspect events assigned to themselves or colleagues from the same vendor.
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeModal('contractorModal')">Cancel</button>
                <button type="button" class="btn-submit" style="background: #0284c7;" onclick="submitSaveContractor()">Save Contractor</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function evaluateContractorAuditReasonVisibility() {
    const chk = document.getElementById('cmIgnoreDelete');
    const wrap = document.getElementById('cmAuditReasonWrap');
    if (!chk || !wrap) return;
    const isStateChanged = (chk.checked !== currentContractorOriginIsDeleted);
    wrap.style.display = isStateChanged ? 'block' : 'none';
}

async function openCreateContractorModal() {
    ensureContractorModalExists();
    await getMemberRefData();

    currentContractorOriginIsDeleted = false;

    document.getElementById('cmPkT05').value = '';
    document.getElementById('cmModalTitle').textContent = 'Create Project Contractor';
    document.getElementById('cmName').value = '';
    document.getElementById('cmCompany').value = '';
    document.getElementById('cmEmail').value = '';
    document.getElementById('cmTel').value = '';
    document.getElementById('cmStartDate').value = new Date().toISOString().substring(0, 10);
    document.getElementById('cmEndDate').value = '';
    document.getElementById('cmRemark').value = '';

    const delWrap = document.getElementById('cmDeleteCheckboxWrap');
    if (delWrap) delWrap.style.display = 'none';
    const auditWrap = document.getElementById('cmAuditReasonWrap');
    if (auditWrap) auditWrap.style.display = 'none';

    populateMemberRoleSelect('Contractor', 'cmRoleTypeSelect');
    openModal('contractorModal');
}

async function openEditContractorModal(pkT05) {
    ensureContractorModalExists();
    await getMemberRefData();

    const contractor = cachedMemberList.find(m => Number(m.pk_t05) === Number(pkT05));
    if (!contractor) return;

    currentContractorOriginIsDeleted = Boolean(contractor.pr_ignore_delete);

    document.getElementById('cmPkT05').value = contractor.pk_t05;
    document.getElementById('cmModalTitle').textContent = 'Edit Contractor: ' + contractor.st_name;
    document.getElementById('cmName').value = contractor.st_name ? contractor.st_name : '';
    document.getElementById('cmCompany').value = contractor.st_company ? contractor.st_company : '';
    document.getElementById('cmEmail').value = contractor.st_email ? contractor.st_email : '';
    document.getElementById('cmTel').value = contractor.st_tel ? contractor.st_tel : '';
    document.getElementById('cmStartDate').value = contractor.pr_start_date ? contractor.pr_start_date.substring(0, 10) : '';
    document.getElementById('cmEndDate').value = contractor.pr_end_date ? contractor.pr_end_date.substring(0, 10) : '';
    document.getElementById('cmRemark').value = contractor.st_remark ? contractor.st_remark : '';

    const delWrap = document.getElementById('cmDeleteCheckboxWrap');
    if (delWrap) delWrap.style.display = 'block';
    const chk = document.getElementById('cmIgnoreDelete');
    if (chk) chk.checked = currentContractorOriginIsDeleted;

    const auditWrap = document.getElementById('cmAuditReasonWrap');
    if (auditWrap) auditWrap.style.display = 'none';
    document.getElementById('cmAuditReason').value = '';

    populateMemberRoleSelect(contractor.pr_roletype ? contractor.pr_roletype : 'Contractor', 'cmRoleTypeSelect');
    openModal('contractorModal');
}

async function submitSaveContractor() {
    const pkT05Str = document.getElementById('cmPkT05').value;
    const isEdit = Boolean(pkT05Str && pkT05Str.trim() !== '');

    const isMarkedDelete = isEdit ? document.getElementById('cmIgnoreDelete').checked : false;
    const isStateChanged = isEdit && (isMarkedDelete !== currentContractorOriginIsDeleted);
    const auditReason = document.getElementById('cmAuditReason').value.trim();

    if (isStateChanged && !auditReason) {
        alert('Audit reason is required when deleting or restoring a contractor.');
        document.getElementById('cmAuditReason').focus();
        return;
    }

    const payload = {
        fk_t01: currentProjectId,
        pk_t05: isEdit ? Number(pkT05Str) : null,
        st_name: document.getElementById('cmName').value.trim(),
        st_company: document.getElementById('cmCompany').value.trim(),
        st_email: document.getElementById('cmEmail').value.trim(),
        st_tel: document.getElementById('cmTel').value.trim(),
        pr_roletype: document.getElementById('cmRoleTypeSelect').value.trim(),
        pr_start_date: document.getElementById('cmStartDate').value ? document.getElementById('cmStartDate').value + ' 00:00:00' : null,
        pr_end_date: document.getElementById('cmEndDate').value ? document.getElementById('cmEndDate').value + ' 23:59:59' : null,
        st_remark: document.getElementById('cmRemark').value.trim(),
        pr_ignore_delete: isMarkedDelete,
        audit_reason: auditReason
    };

    if (!payload.st_name || !payload.st_email || !payload.st_company) {
        alert('Please fill in Name, Company, and Email.');
        return;
    }

    const res = await api('/api/portal/project/contractor/save', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (res && res.status === 'SUCCESS') {
        closeModal('contractorModal');
        renderManageMemberView();
    } else {
        alert('Operation failed: ' + (res ? res.message : 'Network error'));
    }
}

// ==========================================================================
// 11. 路由器註冊
// ==========================================================================
if (typeof registerView === 'function') {
    registerView('member-list', renderMemberListView);     // 唯讀名冊
    registerView('manage-member', renderManageMemberView); // 授權管理
}

// 全域導出供降級備用
window.renderMemberListView = renderMemberListView;
window.renderManageMemberView = renderManageMemberView;