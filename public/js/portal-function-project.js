// ==========================================================================
// ProjectBook - Project Master Module
// File: /public/js/portal-function-project.js
// Submodules: portal-function-project-Modal.js & portal-function-project-Member.js
// Standard: Append-Only Blackbox Ledger & Robust Architecture
// ==========================================================================

registerView('project-detail', renderProjectDetail);

let activeProjectDetail = null;
let cachedMemberRef = null;

// ==========================================================================
// 1. Project Detail View (以只讀黑盒子呈現 PJ_Remark)
// ==========================================================================
async function renderProjectDetail() {
    if (!currentProjectId) {
        const container = document.getElementById('viewContent');
        if (container) {
            container.innerHTML = '<div class="empty-placeholder">Please select a project from the left navigation or dropdown.</div>';
        }
        return;
    }

    const container = document.getElementById('viewContent');
    if (container) {
        container.innerHTML = '<div class="empty-placeholder">Loading project details...</div>';
    }

    const res = await api(`/api/portal/project/detail?pj=${currentProjectId}`);
    if (!res || res.status !== 'SUCCESS' || !res.data) {
        if (container) {
            container.innerHTML = '<div class="empty-placeholder">Failed to load project details or project not found.</div>';
        }
        return;
    }

    const data = res.data;
    const myRight = (res.my_right || 'VIEWER').toUpperCase();
    activeProjectDetail = { ...data, my_right: myRight };

    const canManage = (myRight === 'FULL');

    const headingEl = document.getElementById('viewHeading');
    const roleEl = document.getElementById('viewRole');
    if (headingEl) headingEl.textContent = `[${data.PJ_Code || '-'}] ${data.PJ_Name || '-'}`;
    if (roleEl) roleEl.textContent = `Role: ${myRight}`;

    const menuManageMember = document.getElementById('menuManageMember');
    if (menuManageMember) {
        menuManageMember.style.display = canManage ? 'block' : 'none';
    }

    let statusBadgeClass = 'badge-active';
    if (data.PJ_Status === 'FROZEN') statusBadgeClass = 'badge-frozen';
    else if (data.PJ_Status === 'ARCHIVED' || data.PJ_Status === 'COMPLETED') statusBadgeClass = 'badge-info';

    const rawFolderLink = (data.PJ_FolderLink || '').trim();
    const pathInfo = normalizePath(rawFolderLink);
    let folderDisplayHtml = '<span style="color:#94a3b8;">-</span>';

    if (rawFolderLink) {
        if (pathInfo.isHttp) {
            folderDisplayHtml = `<a href="${escapeHtml(pathInfo.webPath)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">${escapeHtml(pathInfo.webPath)}</a>`;
        } else {
            folderDisplayHtml = `
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <code>${escapeHtml(pathInfo.webPath)}</code>
                    <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 11px;" 
                            data-copy-path="${escapeHtml(pathInfo.winPath)}"
                            onclick="copyToClipboard(this.getAttribute('data-copy-path'), 'Folder path copied to clipboard!')">📋 Copy Path</button>
                </div>
            `;
        }
    }

    if (!container) return;

    container.innerHTML = `
        <!-- Top Toolbar & Quick Actions -->
        <div class="detail-grid" style="margin-bottom: 20px;">
            <div class="detail-item full-width">
                <div class="detail-label">Project Access Level & Quick Actions</div>
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 8px;">
                    <div>
                        <span class="badge ${myRight === 'FULL' ? 'badge-active' : (myRight === 'VIEWER' ? 'badge-frozen' : 'badge-info')}" style="font-size: 12px; padding: 4px 10px;">
                            Authorization: ${escapeHtml(myRight)}
                        </span>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${canManage ? `<button type="button" class="btn-submit" onclick="openEditProjectModal()">✎ Edit Project Detail</button>` : ''}
                        <button type="button" class="btn-secondary" onclick="switchView('project-phase')">View Phases</button>
                        <button type="button" class="btn-secondary" onclick="switchView('member-list')">View Members</button>
                        ${canManage ? `<button type="button" class="btn-secondary" onclick="switchView('manage-member')">Manage Members</button>` : ''}
                        ${canManage ? `<button type="button" class="btn-secondary" style="background:#fee2e2; color:#b91c1c; border-color:#fca5a5;" onclick="openDeleteProjectModal()">🗑 Delete Project</button>` : ''}
                    </div>
                </div>
            </div>
        </div>

        <!-- 1. Core Project Information -->
        <h4 style="margin: 0 0 12px; font-size: 14px; color: #1e293b;">Core Project Information</h4>
        <div class="detail-grid">
            <div class="detail-item">
                <div class="detail-label">Project Code</div>
                <div class="detail-val"><code>${escapeHtml(data.PJ_Code || '-')}</code></div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Status</div>
                <div class="detail-val">
                    <span class="badge ${statusBadgeClass}">${escapeHtml(data.PJ_Status || 'ACTIVE')}</span>
                </div>
            </div>
            <div class="detail-item full-width">
                <div class="detail-label">Project Title</div>
                <div class="detail-val">${escapeHtml(data.PJ_Name || '-')}</div>
            </div>
            <div class="detail-item full-width">
                <div class="detail-label">Description & Scope Overview</div>
                <div class="detail-val" style="white-space: pre-wrap; line-height: 1.5;">${escapeHtml(data.PJ_Description || '(No description recorded for this project.)')}</div>
            </div>
        </div>

        <!-- 2. Procurement & Agreement Details -->
        <h4 style="margin: 20px 0 12px; font-size: 14px; color: #1e293b;">Procurement & Agreement Details</h4>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div class="detail-item">
                <div class="detail-label">SOA</div>
                <div class="detail-val">${escapeHtml(data.PJ_SOA || '-')}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Contract No</div>
                <div class="detail-val">${escapeHtml(data.PJ_ContractNo || '-')}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">QPS</div>
                <div class="detail-val">${escapeHtml(data.PJ_QPS || '-')}</div>
            </div>
        </div>

        <!-- 3. Schedule & Timeline -->
        <h4 style="margin: 20px 0 12px; font-size: 14px; color: #1e293b;">Schedule & Timeline</h4>
        <div class="detail-grid-compact">
            <div class="detail-item date-item">
                <div class="detail-label">Target Start</div>
                <div class="detail-val date-val">${formatDate(data.PJ_TargetStartDate)}</div>
            </div>
            <div class="detail-item date-item">
                <div class="detail-label">Target End</div>
                <div class="detail-val date-val">${formatDate(data.PJ_TargetEndDate)}</div>
            </div>
            <div class="detail-item date-item">
                <div class="detail-label">Actual Start</div>
                <div class="detail-val date-val">${formatDate(data.PJ_ActualStartDate)}</div>
            </div>
            <div class="detail-item date-item">
                <div class="detail-label">Actual End</div>
                <div class="detail-val date-val">${formatDate(data.PJ_ActualEndDate)}</div>
            </div>
            <div class="detail-item date-item">
                <div class="detail-label">Created At</div>
                <div class="detail-val date-val">${formatDate(data.PJ_CreatedDate)}</div>
            </div>
        </div>

        <!-- 4. Reference & Blackbox Audit Ledger -->
        <h4 style="margin: 20px 0 12px; font-size: 14px; color: #1e293b;">
            ${canManage ? 'Reference & Blackbox Audit Ledger' : 'Reference & Documentation'}
        </h4>
        <div class="detail-grid">
            <div class="detail-item full-width">
                <div class="detail-label">Working Folder Link</div>
                <div class="detail-val">${folderDisplayHtml}</div>
            </div>
            <!-- ★ 選項 A：只有具備 FULL 權限者才會渲染整個黑盒子 Ledger 區塊 -->
            ${canManage ? `
                <div class="detail-item full-width">
                    <div class="detail-label">Project Blackbox Ledger & Remarks (Append-Only, Immutable)</div>
                    <div class="detail-val" style="background: #0f172a; color: #38bdf8; font-family: monospace; font-size: 11px; padding: 12px; border-radius: 6px; max-height: 240px; overflow-y: auto; white-space: pre-wrap; line-height: 1.45; border: 1px solid #1e293b;">
                        ${escapeHtml(data.PJ_Remark || '(No critical audit events recorded yet.)')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// 供全局讀取專案字典快取
async function getMemberRefData() {
    if (cachedMemberRef) return cachedMemberRef;
    const res = await api('/api/portal/project/member-ref');
    if (res && res.status === 'SUCCESS') {
        cachedMemberRef = {
            statuses: res.statuses || [],
            role_types: res.role_types || [],
            rights: res.rights || []
        };
    } else {
        cachedMemberRef = {
            statuses: [],
            role_types: [],
            rights: []
        };
    }
    return cachedMemberRef;
}

// 通用加號自訂字典功能
async function quickAddRefOption(category, targetSelectId, labelName) {
    const val = prompt(`Please enter custom option for [${labelName}]:\n(This will be saved to your personal dictionary)`);
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
                opt.textContent = `${trimmed} (Custom)`;
                opt.selected = true;
                sel.appendChild(opt);
            }
        }

        if (cachedMemberRef) {
            if (category === 'T01_PJ_Status' && !cachedMemberRef.statuses.includes(trimmed)) {
                cachedMemberRef.statuses.push(trimmed);
            } else if (category === 'T06_PR_RoleType' && !cachedMemberRef.role_types.includes(trimmed)) {
                cachedMemberRef.role_types.push(trimmed);
            } else if (category === 'T06_PR_Right' && !cachedMemberRef.rights.includes(trimmed)) {
                cachedMemberRef.rights.push(trimmed);
            }
        }
        alert(`Option "${trimmed}" added and selected.`);
    } else {
        alert('Failed to add option: ' + (res ? res.message : 'Server error'));
    }
}