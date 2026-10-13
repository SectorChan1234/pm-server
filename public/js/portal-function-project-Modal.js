// ==========================================================================
// ProjectBook - Project Modal Submodule
// File: /public/js/portal-function-project-Modal.js
// Handles: Create Project, Edit Project (Immutable PJ_Remark), Delete Project Modal
// ==========================================================================

registerView('new-project', renderNewProjectModal);

// ==========================================================================
// 1. Create New Project Modal
// ==========================================================================
function ensureNewProjectModalExists() {
    let modal = document.getElementById('newProjectModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'newProjectModal';
    modal.innerHTML = `
        <div class="modal-box" style="width: 520px;">
            <div class="modal-header">
                <h3 style="margin:0;">Create New Project</h3>
                <button type="button" class="modal-close-btn" onclick="closeModal('newProjectModal')">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-field">
                    <label for="npCode">Project Code *</label>
                    <input type="text" id="npCode" placeholder="e.g. PB-2026-001" required>
                </div>
                <div class="form-field">
                    <label for="npName">Project Name *</label>
                    <input type="text" id="npName" placeholder="Enter project title" required>
                </div>
                <div class="form-field">
                    <label for="npDesc">Description</label>
                    <textarea id="npDesc" rows="3" placeholder="Project overview and targets..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeModal('newProjectModal')">Cancel</button>
                <button type="button" class="btn-submit" id="btnSubmitNewProject" onclick="submitCreateProject()">Create Project</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function renderNewProjectModal() {
    ensureNewProjectModalExists();

    const headingEl = document.getElementById('viewHeading');
    const roleEl = document.getElementById('viewRole');
    const container = document.getElementById('viewContent');

    if (headingEl) headingEl.textContent = 'Create New Project';
    if (roleEl) roleEl.textContent = 'Role: Project Initiator';
    if (container) {
        container.innerHTML = `
            <div class="empty-placeholder" style="padding: 40px; text-align: center;">
                <h3 style="color: #334155; margin-bottom: 8px;">Create New Project</h3>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 16px;">
                    The creation dialog is currently active. If closed, click below to reopen.
                </p>
                <button type="button" class="btn-submit" onclick="openModal('newProjectModal')">+ Open Create Dialog</button>
            </div>
        `;
    }

    openModal('newProjectModal');
}

async function submitCreateProject() {
    const code = document.getElementById('npCode').value.trim();
    const name = document.getElementById('npName').value.trim();
    const desc = document.getElementById('npDesc').value.trim();
    const submitBtn = document.getElementById('btnSubmitNewProject');

    if (!code || !name) {
        alert('Project Code and Project Name are required.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
    }

    const res = await api('/api/portal/project/create', {
        method: 'POST',
        body: JSON.stringify({
            pj_code: code,
            pj_name: name,
            pj_description: desc
        })
    });

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Project';
    }

    if (res && res.status === 'SUCCESS') {
        alert('Project created successfully!');
        closeModal('newProjectModal');
        document.getElementById('npCode').value = '';
        document.getElementById('npName').value = '';
        document.getElementById('npDesc').value = '';
        
        await loadProjectsAndInit();
        if (res.pk_t01) {
            onCurrentProjectChanged(res.pk_t01, 'project-detail');
        } else {
            resetToOverview();
        }
    } else {
        alert('Failed to create project: ' + (res ? res.message : 'Server error'));
    }
}

// ==========================================================================
// 2. Edit Project Detail Modal (對齊 Edit Member 原則：隱藏 Code 輸入框，於標題完整呈現)
// ==========================================================================
function ensureEditProjectModalExists() {
    let modal = document.getElementById('editProjectModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'editProjectModal';
    modal.innerHTML = `
        <div class="modal-box" style="width: 580px;">
            <div class="modal-header">
                <h3 id="epModalTitle" style="margin:0;">Edit Project Detail</h3>
                <button type="button" class="modal-close-btn" onclick="closeModal('editProjectModal')">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 75vh; overflow-y: auto;">
                <div class="form-field">
                    <label for="epName">Project Name *</label>
                    <input type="text" id="epName" placeholder="Enter project name" required>
                </div>

                <div class="form-field">
                    <label for="epStatus" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>Status *</span>
                        <button type="button" class="btn-ref-add" onclick="quickAddRefOption('T01_PJ_Status', 'epStatus', 'Project Status')" title="Add custom status to your personal dictionary">+ Status</button>
                    </label>
                    <select id="epStatus"></select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                    <div class="form-field">
                        <label for="epSOA">SOA</label>
                        <input type="text" id="epSOA" placeholder="e.g. SOA-IT18">
                    </div>
                    <div class="form-field">
                        <label for="epContractNo">Contract No</label>
                        <input type="text" id="epContractNo" placeholder="e.g. GC/2026/01">
                    </div>
                    <div class="form-field">
                        <label for="epQPS">QPS</label>
                        <input type="text" id="epQPS" placeholder="e.g. Cat 1">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px;">
                    <div class="form-field">
                        <label for="epTargetStart">Target Start Date</label>
                        <input type="date" id="epTargetStart">
                    </div>
                    <div class="form-field">
                        <label for="epTargetEnd">Target End Date</label>
                        <input type="date" id="epTargetEnd">
                    </div>
                    <div class="form-field">
                        <label for="epActualStart">Actual Start Date</label>
                        <input type="date" id="epActualStart">
                    </div>
                    <div class="form-field">
                        <label for="epActualEnd">Actual End Date</label>
                        <input type="date" id="epActualEnd">
                    </div>
                </div>

                <div class="form-field" style="margin-top: 6px;">
                    <label for="epFolderLink">Working Folder Link</label>
                    <input type="text" id="epFolderLink" placeholder="e.g. Z:/src/handlers or Web URL">
                </div>
                <div class="form-field">
                    <label for="epDesc">Description / Scope Overview</label>
                    <textarea id="epDesc" rows="3" placeholder="Enter project scope..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeModal('editProjectModal')">Cancel</button>
                <button type="button" class="btn-submit" id="btnSubmitEditProject" onclick="submitUpdateProject()">Save Changes</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

async function openEditProjectModal() {
    if (!activeProjectDetail || (activeProjectDetail.my_right || '').toUpperCase() !== 'FULL') {
        alert('【Access Denied】Only members with FULL project role are authorized to edit project details.');
        return;
    }

    ensureEditProjectModalExists();
    await getMemberRefData();

    const toInputDate = (d) => (d ? String(d).substring(0, 10) : '');

    const pjCode = activeProjectDetail.PJ_Code || '-';
    const pjName = activeProjectDetail.PJ_Name || '';
    const titleEl = document.getElementById('epModalTitle');
    if (titleEl) {
        titleEl.textContent = `Edit Project: [${pjCode}] ${pjName}`;
    }

    document.getElementById('epName').value = activeProjectDetail.PJ_Name || '';

    populateProjectStatusSelect(activeProjectDetail.PJ_Status || 'ACTIVE');

    document.getElementById('epSOA').value = activeProjectDetail.PJ_SOA || '';
    document.getElementById('epContractNo').value = activeProjectDetail.PJ_ContractNo || '';
    document.getElementById('epQPS').value = activeProjectDetail.PJ_QPS || '';

    document.getElementById('epTargetStart').value = toInputDate(activeProjectDetail.PJ_TargetStartDate);
    document.getElementById('epTargetEnd').value = toInputDate(activeProjectDetail.PJ_TargetEndDate);
    document.getElementById('epActualStart').value = toInputDate(activeProjectDetail.PJ_ActualStartDate);
    document.getElementById('epActualEnd').value = toInputDate(activeProjectDetail.PJ_ActualEndDate);

    const pathInfo = normalizePath(activeProjectDetail.PJ_FolderLink || '');
    document.getElementById('epFolderLink').value = pathInfo.webPath;

    document.getElementById('epDesc').value = activeProjectDetail.PJ_Description || '';

    openModal('editProjectModal');
}

function populateProjectStatusSelect(selectedVal) {
    const sel = document.getElementById('epStatus');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Status --</option>';

    const statuses = (cachedMemberRef && cachedMemberRef.statuses && cachedMemberRef.statuses.length > 0)
        ? cachedMemberRef.statuses
        : ['ACTIVE', 'PLANNING', 'FROZEN', 'COMPLETED', 'ARCHIVED'];

    let matched = false;
    statuses.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (selectedVal && s.toUpperCase() === selectedVal.toUpperCase()) {
            opt.selected = true;
            matched = true;
        }
        sel.appendChild(opt);
    });

    if (selectedVal && !matched) {
        const customOpt = document.createElement('option');
        customOpt.value = selectedVal;
        customOpt.textContent = selectedVal;
        customOpt.selected = true;
        sel.appendChild(customOpt);
    }
}

async function submitUpdateProject() {
    const name = document.getElementById('epName').value.trim();
    const status = document.getElementById('epStatus').value;
    const soa = document.getElementById('epSOA').value.trim();
    const contractNo = document.getElementById('epContractNo').value.trim();
    const qps = document.getElementById('epQPS').value.trim();
    
    const rawFolder = document.getElementById('epFolderLink').value.trim();
    const pathInfo = normalizePath(rawFolder);
    const folderLink = pathInfo.webPath;

    const desc = document.getElementById('epDesc').value.trim();

    const targetStart = document.getElementById('epTargetStart').value;
    const targetEnd = document.getElementById('epTargetEnd').value;
    const actualStart = document.getElementById('epActualStart').value;
    const actualEnd = document.getElementById('epActualEnd').value;

    const submitBtn = document.getElementById('btnSubmitEditProject');

    if (!name) {
        alert('Project Name cannot be empty.');
        document.getElementById('epName').focus();
        return;
    }
    if (!status) {
        alert('Please select a Project Status.');
        document.getElementById('epStatus').focus();
        return;
    }

    if (targetStart && targetEnd && !validateDateSequence(targetStart, targetEnd)) {
        alert('[Schedule Validation Error]\nTarget End Date cannot precede Target Start Date.');
        document.getElementById('epTargetEnd').focus();
        return;
    }
    if (actualStart && actualEnd && !validateDateSequence(actualStart, actualEnd)) {
        alert('[Schedule Validation Error]\nActual End Date cannot precede Actual Start Date.');
        document.getElementById('epActualEnd').focus();
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    const res = await api('/api/portal/project/update', {
        method: 'POST',
        body: JSON.stringify({
            pk_t01: currentProjectId,
            pj_name: name,
            pj_status: status,
            pj_soa: soa,
            pj_contract_no: contractNo,
            pj_qps: qps,
            pj_target_start_date: targetStart ? `${targetStart} 00:00:00` : null,
            pj_target_end_date: targetEnd ? `${targetEnd} 23:59:59` : null,
            pj_actual_start_date: actualStart ? `${actualStart} 00:00:00` : null,
            pj_actual_end_date: actualEnd ? `${actualEnd} 23:59:59` : null,
            pj_folder_link: folderLink,
            pj_description: desc
        })
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Changes';

    if (res && res.status === 'SUCCESS') {
        alert('Project details updated successfully.');
        closeModal('editProjectModal');
        await loadProjectsAndInit();
        renderProjectDetail();
    } else {
        alert('Failed to update project: ' + (res ? res.message : 'Server error'));
    }
}

// ==========================================================================
// 3. Delete Project Confirmation Modal (必填刪除原因)
// ==========================================================================
function ensureDeleteProjectModalExists() {
    let modal = document.getElementById('deleteProjectModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'deleteProjectModal';
    modal.innerHTML = `
        <div class="modal-box" style="width: 500px; border-top: 4px solid #ef4444;">
            <div class="modal-header">
                <h3 style="margin:0; color:#b91c1c;">⚠️ Delete Project Confirmation</h3>
                <button type="button" class="modal-close-btn" onclick="closeModal('deleteProjectModal')">&times;</button>
            </div>
            <div class="modal-body">
                <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-bottom: 12px;">
                    You are attempting to delete project <strong id="dpTargetProjectTitle" style="color:#0f172a;"></strong>.
                </p>
                <div style="background: #fef2f2; border: 1px solid #fee2e2; padding: 12px; border-radius: 6px; margin-bottom: 14px;">
                    <p style="color: #991b1b; font-size: 12px; margin: 0; line-height: 1.4;">
                        <strong>Warning:</strong> This project will be marked as soft-deleted and removed from the active registry. A permanent record will be appended to the Project Blackbox Ledger.
                    </p>
                </div>
                <div class="form-field" style="margin-bottom: 12px;">
                    <label for="dpReasonInput" style="font-weight: 600; color: #b91c1c;">
                        Reason for Deletion * (Recorded in Blackbox Ledger)
                    </label>
                    <textarea id="dpReasonInput" rows="2" placeholder="State reason for project deletion..." required style="border-color: #fca5a5; width: 100%;"></textarea>
                </div>
                <div class="form-field">
                    <label for="dpConfirmCodeInput" style="font-weight: 600; color: #475569;">
                        To confirm, type <code id="dpRequiredCodePrompt" style="color: #b91c1c; font-weight:700;"></code> below:
                    </label>
                    <input type="text" id="dpConfirmCodeInput" autocomplete="off" placeholder="Enter project code here..." 
                           oninput="handleDeleteCodeValidation()" 
                           style="border-color: #fca5a5; font-weight: 700; font-family: monospace;">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeModal('deleteProjectModal')">Cancel</button>
                <button type="button" class="btn-submit" id="btnConfirmDeleteProject" disabled 
                        style="background: #ef4444; border-color: #dc2626; cursor: not-allowed; opacity: 0.5;" 
                        onclick="submitDeleteProject()">Confirm Delete</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function openDeleteProjectModal() {
    if (!activeProjectDetail || (activeProjectDetail.my_right || '').toUpperCase() !== 'FULL') {
        alert('【Access Denied】Only members with FULL project role are authorized to delete this project.');
        return;
    }

    ensureDeleteProjectModalExists();

    const pjCode = (activeProjectDetail.PJ_Code || '').trim();
    const pjName = activeProjectDetail.PJ_Name || '';

    document.getElementById('dpTargetProjectTitle').textContent = `[${pjCode}] ${pjName}`;
    document.getElementById('dpRequiredCodePrompt').textContent = pjCode;

    const input = document.getElementById('dpConfirmCodeInput');
    const reasonInput = document.getElementById('dpReasonInput');
    input.value = '';
    reasonInput.value = '';

    const btn = document.getElementById('btnConfirmDeleteProject');
    btn.disabled = true;
    btn.style.cursor = 'not-allowed';
    btn.style.opacity = '0.5';

    openModal('deleteProjectModal');
    setTimeout(() => reasonInput.focus(), 100);
}

function handleDeleteCodeValidation() {
    if (!activeProjectDetail) return;

    const requiredCode = (activeProjectDetail.PJ_Code || '').trim().toUpperCase();
    const typedCode = (document.getElementById('dpConfirmCodeInput').value || '').trim().toUpperCase();
    const btn = document.getElementById('btnConfirmDeleteProject');

    if (typedCode === requiredCode && requiredCode !== '') {
        btn.disabled = false;
        btn.style.cursor = 'pointer';
        btn.style.opacity = '1';
    } else {
        btn.disabled = true;
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.5';
    }
}

async function submitDeleteProject() {
    if (!currentProjectId || !activeProjectDetail) return;

    const requiredCode = (activeProjectDetail.PJ_Code || '').trim().toUpperCase();
    const typedCode = (document.getElementById('dpConfirmCodeInput').value || '').trim().toUpperCase();
    const reason = (document.getElementById('dpReasonInput').value || '').trim();

    if (!reason) {
        alert('Please provide a reason for deleting this project.');
        document.getElementById('dpReasonInput').focus();
        return;
    }

    if (typedCode !== requiredCode) {
        alert('Verification code does not match.');
        return;
    }

    const btn = document.getElementById('btnConfirmDeleteProject');
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    const res = await api('/api/portal/project/delete', {
        method: 'POST',
        body: JSON.stringify({
            pk_t01: currentProjectId,
            reason: reason
        })
    });

    btn.disabled = false;
    btn.textContent = 'Confirm Delete';

    if (res && res.status === 'SUCCESS') {
        alert(`Project [${activeProjectDetail.PJ_Code}] has been soft-deleted successfully.`);
        closeModal('deleteProjectModal');

        await loadProjectsAndInit();
        resetToOverview();
    } else {
        alert('Failed to delete project: ' + (res ? res.message : 'Server error'));
    }
}