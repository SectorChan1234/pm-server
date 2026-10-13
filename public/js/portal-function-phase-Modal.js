// ==========================================================================
// ProjectBook - Phase Modal Submodule
// File: /public/js/portal-function-phase-Modal.js
// Handles: Add/Edit Phase Modal, 4-in-1 State Machine, Audit Reason Validation
// ==========================================================================

registerView('new-phase', renderNewPhaseModal);

// 記錄打開 Modal 時的原始狀態
let phaseOriginFrozen = false;
let phaseOriginDeleted = false;

// ==========================================================================
// 1. New Phase View 入口
// ==========================================================================
function renderNewPhaseModal() {
    ensurePhaseModalExists();
    const headingEl = document.getElementById('viewHeading');
    const container = document.getElementById('viewContent');

    if (headingEl) headingEl.textContent = 'Create New Phase';
    if (container) {
        container.innerHTML = `
            <div class="empty-placeholder" style="padding: 40px; text-align: center;">
                <h3 style="color: #334155; margin-bottom: 8px;">Create New Phase</h3>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 16px;">
                    The phase creation dialog is active. If closed, click below to reopen.
                </p>
                <button type="button" class="btn-submit" onclick="openAddPhaseModal()">+ Open Create Dialog</button>
            </div>
        `;
    }
    openAddPhaseModal();
}

// ==========================================================================
// 2. Open Add Phase Modal (解決問題 2: Max Seq + 1, 解決問題 3: 隱藏 Frozen)
// ==========================================================================
async function openAddPhaseModal() {
    ensurePhaseModalExists();
    phaseOriginFrozen = false;
    phaseOriginDeleted = false;

    document.getElementById('phPkT02').value = '';
    document.getElementById('phModalTitle').textContent = 'Create New Phase';
    document.getElementById('btnSubmitSavePhase').textContent = 'Save Phase';

    document.getElementById('phNameInput').value = '';
    document.getElementById('phDesc').value = '';

    // 解決問題 2：Max of Sequence (non-deleted) + 1，且允許 min = 0
    const activePhases = currentPhaseList.filter(p => !isPhaseDeleted(p));
    let maxSeq = 0;
    if (activePhases.length > 0) {
        const seqs = activePhases.map(p => Number(p.ph_sequence)).filter(n => !isNaN(n));
        if (seqs.length > 0) maxSeq = Math.max(...seqs);
    }
    const seqInput = document.getElementById('phSeq');
    seqInput.min = '0';
    seqInput.value = maxSeq + 1;

    document.getElementById('phTargetStart').value = '';
    document.getElementById('phTargetEnd').value = '';
    document.getElementById('phActualStart').value = '';
    document.getElementById('phActualEnd').value = '';
    document.getElementById('phFolderLink').value = '';

    // 解決問題 3：新增時完全隱藏狀態操作區與審計原因區
    document.getElementById('phStateControlZone').style.display = 'none';
    document.getElementById('phAuditReasonWrap').style.display = 'none';
    document.getElementById('phAuditReason').value = '';

    await loadPhaseRefs();
    populatePhaseStatusSelect('');
    populatePhaseNameDatalist();

    openModal('phaseModal');
}

// ==========================================================================
// 3. Open Edit Phase Modal (凍結狀態全面鎖死欄位)
// ==========================================================================
async function openEditPhaseModal(pkT02) {
    ensurePhaseModalExists();
    await loadPhaseRefs();

    const ph = currentPhaseList.find(p => p.pk_t02 === pkT02);
    if (!ph) return;

    phaseOriginFrozen = !!ph.ph_frozen;
    phaseOriginDeleted = isPhaseDeleted(ph);

    document.getElementById('phPkT02').value = ph.pk_t02;
    document.getElementById('phModalTitle').textContent = phaseOriginFrozen 
        ? `Unfreeze Phase: [P${ph.ph_sequence}] ${ph.ph_name}`
        : `Edit Phase: [P${ph.ph_sequence}] ${ph.ph_name}`;
    document.getElementById('btnSubmitSavePhase').textContent = phaseOriginFrozen ? 'Confirm Unfreeze' : 'Update Phase';

    document.getElementById('phNameInput').value = ph.ph_name || '';
    document.getElementById('phDesc').value = ph.ph_description || '';

    const seqInput = document.getElementById('phSeq');
    seqInput.min = '0';
    seqInput.value = (ph.ph_sequence !== undefined) ? ph.ph_sequence : 1;

    const toInputDate = (d) => (d ? String(d).substring(0, 10) : '');
    document.getElementById('phTargetStart').value = toInputDate(ph.ph_target_start);
    document.getElementById('phTargetEnd').value = toInputDate(ph.ph_target_end);
    document.getElementById('phActualStart').value = toInputDate(ph.ph_actual_start);
    document.getElementById('phActualEnd').value = toInputDate(ph.ph_actual_end);

    const pathInfo = normalizePath(ph.ph_folder_link || '');
    document.getElementById('phFolderLink').value = pathInfo.webPath;

    // ★ 關鍵防禦：若 Phase 處於凍結狀態，所有輸入欄位全面鎖死唯讀，禁止任何編輯
    const isLocked = phaseOriginFrozen;
    document.getElementById('phNameInput').disabled = isLocked;
    document.getElementById('phDesc').disabled = isLocked;
    document.getElementById('phSeq').disabled = isLocked;
    document.getElementById('phTargetStart').disabled = isLocked;
    document.getElementById('phTargetEnd').disabled = isLocked;
    document.getElementById('phActualStart').disabled = isLocked;
    document.getElementById('phActualEnd').disabled = isLocked;
    document.getElementById('phFolderLink').disabled = isLocked;
    document.getElementById('phStatusSelect').disabled = isLocked;

    // 建構 4 擇 1 狀態切換器
    setupPhaseStateActionOptions(phaseOriginFrozen, phaseOriginDeleted);

    populatePhaseStatusSelect(ph.ph_status || '');
    populatePhaseNameDatalist();

    openModal('phaseModal');
}

// 4 擇 1 狀態操作渲染器
function setupPhaseStateActionOptions(isFrozen, isDeleted) {
    const zone = document.getElementById('phStateControlZone');
    zone.style.display = 'block';

    let optionsHtml = '';
    // 預設為 KEEP (維持現狀)
    optionsHtml += `
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#334155;">
            <input type="radio" name="phStateAction" value="KEEP" checked onchange="onPhaseStateActionChanged()">
            <span>Maintain Current State ${isDeleted ? '(Deleted)' : (isFrozen ? '(Frozen)' : '(Active)')}</span>
        </label>
    `;

    if (isDeleted) {
        // 已刪除狀態下：提供 Restore 救回選項
        optionsHtml += `
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#059669;">
                <input type="radio" name="phStateAction" value="RESTORE" onchange="onPhaseStateActionChanged()">
                <span>♻️ Restore Phase to Active</span>
            </label>
        `;
    } else {
        // 未刪除狀態下：
        if (isFrozen) {
            optionsHtml += `
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#2563eb;">
                    <input type="radio" name="phStateAction" value="UNFREEZE" onchange="onPhaseStateActionChanged()">
                    <span>🔓 Unfreeze Phase</span>
                </label>
            `;
        } else {
            optionsHtml += `
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#d97706;">
                    <input type="radio" name="phStateAction" value="FREEZE" onchange="onPhaseStateActionChanged()">
                    <span>🔒 Freeze Phase</span>
                </label>
            `;
        }

        optionsHtml += `
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#dc2626;">
                <input type="radio" name="phStateAction" value="DELETE" onchange="onPhaseStateActionChanged()">
                <span>🗑 Soft Delete Phase</span>
            </label>
        `;
    }

    zone.innerHTML = `
        <div style="font-size:12px; font-weight:700; color:#64748b; margin-bottom:6px;">Phase Lifecycle & State Control (Mutually Exclusive)</div>
        <div style="display:flex; flex-direction:column; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; padding:10px; border-radius:6px;">
            ${optionsHtml}
        </div>
    `;

    document.getElementById('phAuditReasonWrap').style.display = 'none';
    document.getElementById('phAuditReason').value = '';
}

function onPhaseStateActionChanged() {
    const selected = document.querySelector('input[name="phStateAction"]:checked');
    const action = selected ? selected.value : 'KEEP';

    const wrap = document.getElementById('phAuditReasonWrap');
    const label = document.getElementById('phAuditReasonLabel');
    const textarea = document.getElementById('phAuditReason');

    if (action === 'KEEP') {
        wrap.style.display = 'none';
        textarea.value = '';
    } else {
        wrap.style.display = 'block';
        if (action === 'DELETE') {
            label.textContent = '⚠️ Phase Removal Reason Required * (Recorded in Blackbox Ledger)';
            textarea.placeholder = 'State why this Phase is being deleted...';
        } else if (action === 'RESTORE') {
            label.textContent = '⚠️ Phase Restoration Reason Required * (Recorded in Blackbox Ledger)';
            textarea.placeholder = 'State why this Phase is being restored back to active...';
        } else if (action === 'FREEZE') {
            label.textContent = '⚠️ Phase Freeze Reason Required * (Recorded in Blackbox Ledger)';
            textarea.placeholder = 'State reason for locking/freezing this Phase (e.g. Scope completed)...';
        } else if (action === 'UNFREEZE') {
            label.textContent = '⚠️ Phase Unfreeze Reason Required * (Recorded in Blackbox Ledger)';
            textarea.placeholder = 'State reason for unfreezing this Phase...';
        }
        textarea.focus();
    }
}

// ==========================================================================
// 4. Submit Save Phase (解決附圖 Bug: 完整夾帶 audit_reason)
// ==========================================================================
async function submitSavePhase() {
    const pkT02 = document.getElementById('phPkT02').value;
    const isEdit = pkT02 !== '';

    const name = document.getElementById('phNameInput').value.trim();
    const desc = document.getElementById('phDesc').value.trim();
    const seq = parseInt(document.getElementById('phSeq').value, 10);
    const status = document.getElementById('phStatusSelect').value;

    const targetStart = document.getElementById('phTargetStart').value;
    const targetEnd = document.getElementById('phTargetEnd').value;
    const actualStart = document.getElementById('phActualStart').value;
    const actualEnd = document.getElementById('phActualEnd').value;

    const rawFolder = document.getElementById('phFolderLink').value.trim();
    const folderLink = normalizePath(rawFolder).webPath;

    let targetFrozen = false;
    let targetDelete = false;
    let auditReason = '';

    if (isEdit) {
        const selected = document.querySelector('input[name="phStateAction"]:checked');
        const action = selected ? selected.value : 'KEEP';

        targetFrozen = phaseOriginFrozen;
        targetDelete = phaseOriginDeleted;

        if (action === 'FREEZE') targetFrozen = true;
        else if (action === 'UNFREEZE') targetFrozen = false;
        else if (action === 'DELETE') targetDelete = true;
        else if (action === 'RESTORE') targetDelete = false;

        // 若狀態有改變，必須檢驗 reason
        if (action !== 'KEEP') {
            auditReason = document.getElementById('phAuditReason').value.trim();
            if (!auditReason) {
                alert('【Audit Warning】Please provide a reason for this phase state change.');
                document.getElementById('phAuditReason').focus();
                return;
            }
        }
    }

    const submitBtn = document.getElementById('btnSubmitSavePhase');

    if (!name) {
        alert('Phase Name is required.');
        document.getElementById('phNameInput').focus();
        return;
    }

    if (targetStart && targetEnd && !validateDateSequence(targetStart, targetEnd)) {
        alert('[Schedule Validation Error]\nTarget End Date cannot precede Target Start Date.');
        document.getElementById('phTargetEnd').focus();
        return;
    }
    if (actualStart && actualEnd && !validateDateSequence(actualStart, actualEnd)) {
        alert('[Schedule Validation Error]\nActual End Date cannot precede Actual Start Date.');
        document.getElementById('phActualEnd').focus();
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    // ★ 關鍵修復：保證完整夾帶 audit_reason，解決後端拒絕的問題
    const payload = {
        fk_t01: currentProjectId,
        ph_name: name,
        ph_description: desc,
        ph_sequence: isNaN(seq) ? 1 : seq,
        ph_status: status || 'Planning',
        ph_target_start: targetStart ? `${targetStart} 00:00:00` : null,
        ph_target_end: targetEnd ? `${targetEnd} 23:59:59` : null,
        ph_actual_start: actualStart ? `${actualStart} 00:00:00` : null,
        ph_actual_end: actualEnd ? `${actualEnd} 23:59:59` : null,
        ph_folder_link: folderLink,
        ph_frozen: targetFrozen,
        ph_ignore_delete: targetDelete,
        audit_reason: auditReason
    };

    if (isEdit) {
        payload.pk_t02 = parseInt(pkT02, 10);
    }

    const res = await api('/api/portal/phase/save', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    submitBtn.disabled = false;
    submitBtn.textContent = isEdit ? 'Update Phase' : 'Save Phase';

    if (res && res.status === 'SUCCESS') {
        alert(isEdit ? 'Phase updated successfully.' : 'Phase created successfully.');
        closeModal('phaseModal');

        if (typeof window.invalidateEventRefsCache === 'function') {
            window.invalidateEventRefsCache();
        }
        renderProjectPhaseView();
    } else {
        alert('Operation failed: ' + (res ? res.message : 'Server error'));
    }
}

// ==========================================================================
// 5. 構建 Phase Modal DOM (單例保護)
// ==========================================================================
function ensurePhaseModalExists() {
    let modal = document.getElementById('phaseModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'phaseModal';
    modal.innerHTML = `
        <div class="modal-box" style="width: 580px;">
            <div class="modal-header">
                <h3 id="phModalTitle" style="margin:0;">Phase Management</h3>
                <button type="button" class="modal-close-btn" onclick="closeModal('phaseModal')">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 75vh; overflow-y: auto;">
                <input type="hidden" id="phPkT02">

                <!-- 階段名稱與排序序號 -->
                <div style="display: grid; grid-template-columns: 3fr 1fr; gap: 10px;">
                    <div class="form-field">
                        <label for="phNameInput">Phase Name (PH_Name) *</label>
                        <input type="text" id="phNameInput" list="phNameDatalist" placeholder="Select template or enter name" required>
                        <datalist id="phNameDatalist"></datalist>
                    </div>
                    <div class="form-field">
                        <label for="phSeq">Sequence</label>
                        <input type="number" id="phSeq" min="0" max="99" value="1" required>
                    </div>
                </div>

                <!-- 狀態 (附帶 + 按鈕) -->
                <div class="form-field">
                    <label for="phStatusSelect" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>Status (PH_Status)</span>
                        <button type="button" class="btn-ref-add" onclick="quickAddPhaseStatus()" title="Add custom status to your personal dictionary">+ Status</button>
                    </label>
                    <select id="phStatusSelect"></select>
                </div>

                <!-- 排程時間 -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-field">
                        <label for="phTargetStart">Target Start Date</label>
                        <input type="date" id="phTargetStart">
                    </div>
                    <div class="form-field">
                        <label for="phTargetEnd">Target End Date</label>
                        <input type="date" id="phTargetEnd">
                    </div>
                    <div class="form-field">
                        <label for="phActualStart">Actual Start Date</label>
                        <input type="date" id="phActualStart">
                    </div>
                    <div class="form-field">
                        <label for="phActualEnd">Actual End Date</label>
                        <input type="date" id="phActualEnd">
                    </div>
                </div>

                <!-- 資料夾路徑 -->
                <div class="form-field">
                    <label for="phFolderLink">Working Folder Link</label>
                    <input type="text" id="phFolderLink" placeholder="e.g. Z:/Project/Phase1 or Web URL">
                </div>

                <!-- 描述說明 -->
                <div class="form-field">
                    <label for="phDesc">Description & Scope</label>
                    <textarea id="phDesc" rows="3" placeholder="Phase deliverables, milestones..."></textarea>
                </div>

                <!-- 4 擇 1 生命週期與狀態操作區 (新增時隱藏，編輯時呈現) -->
                <div id="phStateControlZone" style="margin-top: 10px; display: none;"></div>

                <!-- 動態審計原因必填輸入框 -->
                <div class="form-field" id="phAuditReasonWrap" style="display: none; background: #fffbeb; border: 1px solid #fef3c7; padding: 10px; border-radius: 6px; margin-top: 10px;">
                    <label id="phAuditReasonLabel" for="phAuditReason" style="color: #b45309; font-weight: 700;">
                        ⚠️ Audit Reason Required * (Recorded in Blackbox Ledger)
                    </label>
                    <textarea id="phAuditReason" rows="2" placeholder="State reason..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeModal('phaseModal')">Cancel</button>
                <button type="button" class="btn-submit" id="btnSubmitSavePhase" onclick="submitSavePhase()">Save Phase</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function populatePhaseStatusSelect(selectedVal) {
    const sel = document.getElementById('phStatusSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Status --</option>';

    const statuses = (cachedPhaseRefs && cachedPhaseRefs.statuses && cachedPhaseRefs.statuses.length > 0)
        ? cachedPhaseRefs.statuses
        : ['Planning', 'In Progress', 'Completed', 'Suspended'];

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

function populatePhaseNameDatalist() {
    const dl = document.getElementById('phNameDatalist');
    if (!dl) return;
    dl.innerHTML = '';

    const templates = (cachedPhaseRefs && cachedPhaseRefs.phase_templates && cachedPhaseRefs.phase_templates.length > 0)
        ? cachedPhaseRefs.phase_templates
        : ['Initiation', 'Requirements Analysis', 'System Design', 'Development & Unit Test', 'User Acceptance Test', 'Production Rollout'];

    templates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        dl.appendChild(opt);
    });
}

async function quickAddPhaseStatus() {
    const val = prompt('Please enter custom Phase Status:\n(This will be saved to your personal template dictionary)');
    if (!val || !val.trim()) return;

    const trimmed = val.trim();
    const res = await api('/api/portal/phase/ref/create-custom', {
        method: 'POST',
        body: JSON.stringify({ category: 'T02_PH_Status', text: trimmed })
    });

    if (res && res.status === 'SUCCESS') {
        if (cachedPhaseRefs) {
            if (!cachedPhaseRefs.statuses.includes(trimmed)) cachedPhaseRefs.statuses.push(trimmed);
        }
        populatePhaseStatusSelect(trimmed);
        alert(`Status "${trimmed}" added and selected.`);
    } else {
        alert('Failed to add status: ' + (res ? res.message : 'Server error'));
    }
}