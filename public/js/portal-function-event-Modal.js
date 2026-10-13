// ==========================================================================
// ProjectBook - Event Modal Submodule
// File: /public/js/portal-function-event-Modal.js
// Standard: VIEWER Gatekeeper, Batch Mode Engine & Guaranteed Self Selection
// ==========================================================================

let eventOriginFrozen = false;
let eventOriginDeleted = false;
let isBatchModeActive = false;

function getLoggedInStaffId() {
    if (typeof user !== 'undefined' && user) {
        if (user.pk_t05 !== undefined && user.pk_t05 !== null) return Number(user.pk_t05);
        if (user.pkT05 !== undefined && user.pkT05 !== null) return Number(user.pkT05);
        if (user.PK_T05 !== undefined && user.PK_T05 !== null) return Number(user.PK_T05);
        if (user.id !== undefined && user.id !== null) return Number(user.id);
    }
    try {
        const uStr = sessionStorage.getItem('user') || localStorage.getItem('user') || sessionStorage.getItem('pb_user') || localStorage.getItem('pb_user');
        if (uStr) {
            const u = JSON.parse(uStr);
            if (u.pk_t05 !== undefined && u.pk_t05 !== null) return Number(u.pk_t05);
            if (u.pkT05 !== undefined && u.pkT05 !== null) return Number(u.pkT05);
            if (u.PK_T05 !== undefined && u.PK_T05 !== null) return Number(u.PK_T05);
            if (u.id !== undefined && u.id !== null) return Number(u.id);
        }
    } catch(e) {}
    return null;
}

function ensureEventModalExists() {
    let modal = document.getElementById('eventModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'eventModal';
    modal.innerHTML = `
        <div class="modal-box" style="width: 630px;">
            <div class="modal-header">
                <h3 id="evModalTitle" style="margin:0;">Event Management</h3>
                <button type="button" class="modal-close-btn" onclick="closeModal('eventModal')">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 75vh; overflow-y: auto;">
                <input type="hidden" id="evPkT03">
                <input type="hidden" id="evParentId">

                <div class="form-field">
                    <label for="evPhaseSelect">Target Phase *</label>
                    <select id="evPhaseSelect" required></select>
                </div>

                <div class="form-field">
                    <label for="evTitle">Event Title (EV_Title) *</label>
                    <input type="text" id="evTitle" placeholder="e.g. Project Steering Committee 1st Meeting" required oninput="updateBatchPreview()">
                </div>

                <!-- 批次新增詳細設定面板 -->
                <div id="evBatchConfigPanel" style="display: none; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                    <div style="font-size: 12px; font-weight: 700; color: #1e40af; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <span>⚡ Batch Event Generator Settings</span>
                        <span style="font-size: 11px; font-weight: normal; color: #3b82f6;">All events will share common schedules & scope</span>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                        <div class="form-field" style="margin-bottom: 0;">
                            <label for="evBatchCount" style="font-size: 11px;">Batch Quantity (2 ~ 20):</label>
                            <input type="number" id="evBatchCount" min="2" max="20" value="3" style="padding: 4px 8px; font-size: 12px;" oninput="updateBatchPreview()">
                        </div>
                        <div class="form-field" style="margin-bottom: 0;">
                            <label for="evBatchNamingMode" style="font-size: 11px;">Sequence Naming:</label>
                            <select id="evBatchNamingMode" style="padding: 4px 8px; font-size: 12px;" onchange="updateBatchPreview()">
                                <option value="SUFFIX">Suffix (e.g. Title - 1)</option>
                                <option value="PREFIX">Prefix (e.g. 1 - Title)</option>
                                <option value="KEEP">Keep Same Name (No seq)</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-field" style="margin-bottom: 8px;">
                        <label for="evBatchSeparator" style="font-size: 11px;">Custom Separator / Symbol:</label>
                        <input type="text" id="evBatchSeparator" value=" - " placeholder="e.g. ' - ' or '#' or ' '" style="padding: 4px 8px; font-size: 12px;" oninput="updateBatchPreview()">
                    </div>

                    <div style="background: #ffffff; border: 1px dashed #93c5fd; border-radius: 4px; padding: 6px 10px; font-size: 11px; color: #1e3a8a;">
                        <span style="font-weight: 700;">Live Preview:</span>
                        <div id="evBatchPreviewText" style="margin-top: 2px; font-family: monospace; color: #0284c7;">-</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-field">
                        <label for="evTypeSelect" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Type (EV_Type)</span>
                            <button type="button" class="btn-ref-add" id="btnEvAddType" onclick="quickAddEventType()" title="Add custom event type">+ Type</button>
                        </label>
                        <select id="evTypeSelect"></select>
                    </div>
                    <div class="form-field">
                        <label for="evStatusSelect" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Status (EV_Status)</span>
                            <button type="button" class="btn-ref-add" onclick="quickAddEventStatus()" title="Add custom event status">+ Status</button>
                        </label>
                        <select id="evStatusSelect"></select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-field">
                        <label for="evStartDate">Start Date & Time</label>
                        <input type="datetime-local" id="evStartDate">
                    </div>
                    <div class="form-field">
                        <label for="evEndDate">End Date & Time</label>
                        <input type="datetime-local" id="evEndDate">
                    </div>
                </div>

                <div class="form-field" style="background: #f8fafc; border: 1px solid var(--border-light); padding: 10px; border-radius: 6px;">
                    <label style="margin-bottom: 6px;">Event Owner (Assignee)</label>
                    <div id="evOwnerTypeSwitchWrap" style="display: flex; gap: 16px; margin-bottom: 8px; font-size: 12px;">
                        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                            <input type="radio" name="evOwnerListType" id="evOwnerTypeA" checked onchange="toggleOwnerListMode()">
                            <span>Current Project Members</span>
                        </label>
                        <label id="evOwnerTypeBLabel" style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                            <input type="radio" name="evOwnerListType" id="evOwnerTypeB" onchange="toggleOwnerListMode()">
                            <span>Other Department Staff</span>
                        </label>
                    </div>
                    <div id="evOwnerWrapA">
                        <select id="evOwnerMemberSelect" style="width: 100%;"></select>
                    </div>
                    <div id="evOwnerWrapB" style="display: none; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <select id="evDeptSelect" onchange="onDeptChanged(this)"></select>
                        <select id="evDeptStaffSelect" disabled onchange="handleDeptStaffSelected()"></select>
                    </div>
                    <div id="evOwnerAutoAssignWarn" style="display: none; margin-top: 8px; font-size: 11px; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 6px 10px; border-radius: 4px; line-height: 1.4;"></div>
                </div>

                <div class="form-field">
                    <label for="evFolderLink">Working Folder Link</label>
                    <input type="text" id="evFolderLink" placeholder="e.g. Z:/Project/Meetings or Web URL">
                </div>

                <div class="form-field">
                    <label for="evDescription">Description / Scope Overview</label>
                    <textarea id="evDescription" rows="2" placeholder="Meeting agenda, targets, deliverables..."></textarea>
                </div>
                <div class="form-field">
                    <label for="evRemark">Remarks</label>
                    <textarea id="evRemark" rows="1" placeholder="Internal remarks..."></textarea>
                </div>

                <div id="evStateControlZone" style="margin-top: 10px; display: none;"></div>

                <div class="form-field" id="evAuditReasonWrap" style="display: none; background: #fffbeb; border: 1px solid #fef3c7; padding: 10px; border-radius: 6px; margin-top: 10px;">
                    <label id="evAuditReasonLabel" for="evAuditReason" style="color: #b45309; font-weight: 700;">
                        ⚠️ Audit Reason Required * (Recorded in Blackbox Ledger)
                    </label>
                    <textarea id="evAuditReason" rows="2" placeholder="State reason..."></textarea>
                </div>
            </div>

            <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <button type="button" class="btn-secondary" id="btnToggleBatchMode" style="border-color: #93c5fd; color: #1d4ed8; background: #eff6ff; font-size: 12px;" onclick="toggleBatchMode()">
                        ⚡ Batch Mode
                    </button>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button type="button" class="btn-secondary" onclick="closeModal('eventModal')">Cancel</button>
                    <button type="button" class="btn-submit" id="btnSubmitSaveEvent" style="background: #0284c7;" onclick="submitCreateEvent()">Save Event</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function toggleBatchMode() {
    isBatchModeActive = !isBatchModeActive;
    const panel = document.getElementById('evBatchConfigPanel');
    const toggleBtn = document.getElementById('btnToggleBatchMode');
    const submitBtn = document.getElementById('btnSubmitSaveEvent');

    if (panel) panel.style.display = isBatchModeActive ? 'block' : 'none';

    if (toggleBtn) {
        if (isBatchModeActive) {
            toggleBtn.textContent = '✕ Single Mode';
            toggleBtn.style.background = '#fef3c7';
            toggleBtn.style.color = '#b45309';
            toggleBtn.style.borderColor = '#fde68a';
        } else {
            toggleBtn.textContent = '⚡ Batch Mode';
            toggleBtn.style.background = '#eff6ff';
            toggleBtn.style.color = '#1d4ed8';
            toggleBtn.style.borderColor = '#93c5fd';
        }
    }

    if (submitBtn) {
        submitBtn.textContent = isBatchModeActive ? 'Batch Create Events' : 'Save Event';
    }

    updateBatchPreview();
}

function updateBatchPreview() {
    if (!isBatchModeActive) return;
    const previewEl = document.getElementById('evBatchPreviewText');
    const baseTitle = document.getElementById('evTitle').value.trim() || 'PSC Meeting';
    const count = parseInt(document.getElementById('evBatchCount').value, 10) || 3;
    const mode = document.getElementById('evBatchNamingMode').value;
    const sep = document.getElementById('evBatchSeparator').value;

    let sampleFirst = baseTitle;
    let sampleLast = baseTitle;

    if (mode === 'PREFIX') {
        sampleFirst = `1${sep}${baseTitle}`;
        sampleLast = `${count}${sep}${baseTitle}`;
    } else if (mode === 'SUFFIX') {
        sampleFirst = `${baseTitle}${sep}1`;
        sampleLast = `${baseTitle}${sep}${count}`;
    }

    if (previewEl) {
        previewEl.textContent = `Generates ${count} events: "${sampleFirst}" ... "${sampleLast}"`;
    }
}

async function openAddEventModal(lockedPhaseId) {
    // ★ VIEWER 防禦攔截
    if (currentProjectRight === 'VIEWER') {
        alert('【Access Denied】You have read-only (VIEWER) permissions in this project. Creating events is prohibited.');
        return;
    }

    const isFullRight = (currentProjectRight === 'FULL');
    if (!isFullRight) {
        alert('【Access Denied】Only members with FULL project role are authorized to create top-level events (Level 1).');
        return;
    }

    ensureEventModalExists();
    targetPhaseLockedId = lockedPhaseId || null;
    targetParentLockedId = null;
    eventOriginFrozen = false;
    eventOriginDeleted = false;

    isBatchModeActive = false;
    const panel = document.getElementById('evBatchConfigPanel');
    if (panel) panel.style.display = 'none';
    const batchBtn = document.getElementById('btnToggleBatchMode');
    if (batchBtn) {
        batchBtn.style.display = 'inline-block';
        batchBtn.textContent = '⚡ Batch Mode';
        batchBtn.style.background = '#eff6ff';
        batchBtn.style.color = '#1d4ed8';
        batchBtn.style.borderColor = '#93c5fd';
    }

    if (typeof window.invalidateEventRefsCache === 'function') {
        window.invalidateEventRefsCache();
    }

    document.getElementById('evPkT03').value = '';
    document.getElementById('evParentId').value = '';
    document.getElementById('evModalTitle').textContent = 'Create New Event';
    document.getElementById('btnSubmitSaveEvent').textContent = 'Save Event';

    resetEventFormInputs();
    setEventFieldsLockdown(false, true, true, false);

    await loadEventInitRefs();

    populateEventPhaseSelect(targetPhaseLockedId);
    populateEventTypeSelect('');
    populateEventStatusSelect('');

    const currentStaffId = getLoggedInStaffId();
    setupOwnerSelector(currentStaffId, true);

    openModal('eventModal');
}

async function openAddSubEventModal(parentEventId, lockedPhaseId, parentTitle) {
    // ★ VIEWER 防禦攔截
    if (currentProjectRight === 'VIEWER') {
        alert('【Access Denied】You have read-only (VIEWER) permissions in this project. Adding sub-events is prohibited.');
        return;
    }

    ensureEventModalExists();
    targetPhaseLockedId = lockedPhaseId;
    targetParentLockedId = parentEventId;
    eventOriginFrozen = false;
    eventOriginDeleted = false;

    isBatchModeActive = false;
    const panel = document.getElementById('evBatchConfigPanel');
    if (panel) panel.style.display = 'none';
    const batchBtn = document.getElementById('btnToggleBatchMode');
    if (batchBtn) {
        batchBtn.style.display = 'inline-block';
        batchBtn.textContent = '⚡ Batch Mode';
        batchBtn.style.background = '#eff6ff';
        batchBtn.style.color = '#1d4ed8';
        batchBtn.style.borderColor = '#93c5fd';
    }

    document.getElementById('evPkT03').value = '';
    document.getElementById('evParentId').value = parentEventId;
    document.getElementById('evModalTitle').textContent = `Add Sub Event to: ${parentTitle}`;
    document.getElementById('btnSubmitSaveEvent').textContent = 'Save Sub Event';

    resetEventFormInputs();

    const isFullRight = (currentProjectRight === 'FULL');
    setEventFieldsLockdown(false, true, isFullRight, false);

    await loadEventInitRefs();

    populateEventPhaseSelect(targetPhaseLockedId);
    populateEventTypeSelect('');
    populateEventStatusSelect('');

    const currentStaffId = getLoggedInStaffId();
    setupOwnerSelector(currentStaffId, isFullRight);

    openModal('eventModal');
}

async function openEditEventModal(pkT03) {
    // ★ VIEWER 防禦攔截
    if (currentProjectRight === 'VIEWER') {
        alert('【Access Denied】You have read-only (VIEWER) permissions in this project. Editing events is prohibited.');
        return;
    }

    ensureEventModalExists();
    await loadEventInitRefs();

    const ev = currentEventList.find(e => e.pk_t03 === pkT03);
    if (!ev) return;

    isBatchModeActive = false;
    const panel = document.getElementById('evBatchConfigPanel');
    if (panel) panel.style.display = 'none';
    const batchBtn = document.getElementById('btnToggleBatchMode');
    if (batchBtn) batchBtn.style.display = 'none';

    const phases = (cachedEventRefs && cachedEventRefs.phases) ? cachedEventRefs.phases : [];
    const targetPhase = phases.find(p => p.pk_t02 === ev.fk_t02);
    const isPhaseFrozen = targetPhase ? Boolean(targetPhase.ph_frozen) : Boolean(ev.ph_frozen);
    if (isPhaseFrozen) {
        alert('【Phase Frozen】This event belongs to a frozen phase and cannot be modified.');
        return;
    }

    targetParentLockedId = getParentId(ev);
    eventOriginFrozen = !!ev.ev_frozen;
    eventOriginDeleted = isEventDeleted(ev);

    const currentUserId = getLoggedInStaffId();
    const isCreator = (ev.creator_id && Number(ev.creator_id) === Number(currentUserId));
    const isFullRight = (currentProjectRight === 'FULL');
    const hasFullFieldEdit = (isFullRight || isCreator);

    document.getElementById('evPkT03').value = ev.pk_t03;
    document.getElementById('evParentId').value = targetParentLockedId || '';
    document.getElementById('evModalTitle').textContent = eventOriginFrozen 
        ? `Unfreeze Event: [P${ev.ph_sequence}] ${ev.ev_title}`
        : `Edit Event: [P${ev.ph_sequence}] ${ev.ev_title}`;
    document.getElementById('btnSubmitSaveEvent').textContent = eventOriginFrozen ? 'Confirm Unfreeze' : 'Update Event';

    document.getElementById('evTitle').value = ev.ev_title || '';

    const toInputDateTime = (dtStr) => {
        if (!dtStr) return '';
        const s = String(dtStr).replace(' ', 'T');
        return s.length >= 16 ? s.substring(0, 16) : s;
    };

    document.getElementById('evStartDate').value = toInputDateTime(ev.ev_start_date);
    document.getElementById('evEndDate').value = toInputDateTime(ev.ev_end_date);

    const pathInfo = normalizePath(ev.ev_folder_link || '');
    document.getElementById('evFolderLink').value = pathInfo.webPath;

    document.getElementById('evDescription').value = ev.ev_description || '';
    document.getElementById('evRemark').value = ev.ev_remark || '';

    setEventFieldsLockdown(true, hasFullFieldEdit, isFullRight, eventOriginFrozen);
    setupEventStateActionOptions(eventOriginFrozen, eventOriginDeleted, isFullRight);

    populateEventPhaseSelect(ev.fk_t02);
    populateEventTypeSelect(ev.ev_type || '');
    populateEventStatusSelect(ev.ev_status || '');
    setupOwnerSelector(ev.owner_id, isFullRight);

    openModal('eventModal');
}

function resetEventFormInputs() {
    document.getElementById('evTitle').value = '';
    document.getElementById('evStartDate').value = '';
    document.getElementById('evEndDate').value = '';
    document.getElementById('evFolderLink').value = '';
    document.getElementById('evDescription').value = '';
    document.getElementById('evRemark').value = '';
    document.getElementById('evOwnerAutoAssignWarn').style.display = 'none';
    document.getElementById('evStateControlZone').style.display = 'none';
    document.getElementById('evAuditReasonWrap').style.display = 'none';
    document.getElementById('evAuditReason').value = '';
}

function setEventFieldsLockdown(isEditMode, hasFullFieldEdit, isFullRight, isEventFrozen) {
    if (isEventFrozen) {
        document.getElementById('evPhaseSelect').disabled = true;
        document.getElementById('evTitle').disabled = true;
        document.getElementById('evTypeSelect').disabled = true;
        const btnType = document.getElementById('btnEvAddType');
        if (btnType) btnType.style.display = 'none';
        document.getElementById('evDescription').disabled = true;
        document.getElementById('evOwnerMemberSelect').disabled = true;
        document.getElementById('evRemark').disabled = true;
        document.getElementById('evFolderLink').disabled = true;
        document.getElementById('evStatusSelect').disabled = true;
        document.getElementById('evStartDate').disabled = true;
        document.getElementById('evEndDate').disabled = true;
        return;
    }

    if (!isEditMode) {
        document.getElementById('evPhaseSelect').disabled = false;
        document.getElementById('evTitle').disabled = false;
        document.getElementById('evTypeSelect').disabled = false;
        const btnType = document.getElementById('btnEvAddType');
        if (btnType) btnType.style.display = 'inline-block';
        document.getElementById('evDescription').disabled = false;
        document.getElementById('evOwnerMemberSelect').disabled = false;
        document.getElementById('evRemark').disabled = false;
        document.getElementById('evFolderLink').disabled = false;
        document.getElementById('evStatusSelect').disabled = false;
        document.getElementById('evStartDate').disabled = false;
        document.getElementById('evEndDate').disabled = false;
        return;
    }

    if (hasFullFieldEdit) {
        document.getElementById('evPhaseSelect').disabled = false;
        document.getElementById('evTitle').disabled = false;
        document.getElementById('evTypeSelect').disabled = false;
        const btnType = document.getElementById('btnEvAddType');
        if (btnType) btnType.style.display = 'inline-block';
        document.getElementById('evDescription').disabled = false;
        document.getElementById('evOwnerMemberSelect').disabled = false;
    } else {
        document.getElementById('evPhaseSelect').disabled = true;
        document.getElementById('evTitle').disabled = true;
        document.getElementById('evTypeSelect').disabled = true;
        const btnType = document.getElementById('btnEvAddType');
        if (btnType) btnType.style.display = 'none';
        document.getElementById('evDescription').disabled = true;
        document.getElementById('evOwnerMemberSelect').disabled = true;
    }

    document.getElementById('evRemark').disabled = false;
    document.getElementById('evFolderLink').disabled = false;
    document.getElementById('evStatusSelect').disabled = false;
    document.getElementById('evStartDate').disabled = false;
    document.getElementById('evEndDate').disabled = false;
}

function setupEventStateActionOptions(isFrozen, isDeleted, isFullRight) {
    const zone = document.getElementById('evStateControlZone');
    zone.style.display = 'block';

    let optionsHtml = '';
    optionsHtml += `
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#334155;">
            <input type="radio" name="evStateAction" value="KEEP" checked onchange="onEventStateActionChanged()">
            <span>Maintain Current State ${isDeleted ? '(Deleted)' : (isFrozen ? '(Frozen)' : '(Active)')}</span>
        </label>
    `;

    if (isDeleted) {
        if (isFullRight) {
            optionsHtml += `
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#059669;">
                    <input type="radio" name="evStateAction" value="RESTORE" onchange="onEventStateActionChanged()">
                    <span>♻️ Restore Event to Active</span>
                </label>
            `;
        }
    } else {
        if (isFrozen) {
            optionsHtml += `
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#2563eb;">
                    <input type="radio" name="evStateAction" value="UNFREEZE" onchange="onEventStateActionChanged()">
                    <span>🔓 Unfreeze Event</span>
                </label>
            `;
        } else {
            optionsHtml += `
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#d97706;">
                    <input type="radio" name="evStateAction" value="FREEZE" onchange="onEventStateActionChanged()">
                    <span>🔒 Freeze Event</span>
                </label>
            `;
        }

        if (isFullRight) {
            optionsHtml += `
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:#dc2626;">
                    <input type="radio" name="evStateAction" value="DELETE" onchange="onEventStateActionChanged()">
                    <span>🗑 Soft Delete Event</span>
                </label>
            `;
        }
    }

    zone.innerHTML = `
        <div style="font-size:12px; font-weight:700; color:#64748b; margin-bottom:6px;">Event Lifecycle & State Control</div>
        <div style="display:flex; flex-direction:column; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; padding:10px; border-radius:6px;">
            ${optionsHtml}
        </div>
    `;

    document.getElementById('evAuditReasonWrap').style.display = 'none';
    document.getElementById('evAuditReason').value = '';
}

function onEventStateActionChanged() {
    const selected = document.querySelector('input[name="evStateAction"]:checked');
    const action = selected ? selected.value : 'KEEP';

    const wrap = document.getElementById('evAuditReasonWrap');
    const label = document.getElementById('evAuditReasonLabel');
    const textarea = document.getElementById('evAuditReason');

    if (action === 'KEEP') {
        wrap.style.display = 'none';
        textarea.value = '';
    } else {
        wrap.style.display = 'block';
        if (action === 'DELETE') {
            label.textContent = '⚠️ Event Removal Reason Required * (Recorded in Blackbox Ledger)';
            textarea.placeholder = 'State reason for deleting this event...';
        } else if (action === 'RESTORE') {
            label.textContent = '⚠️ Event Restoration Reason Required * (Recorded in Blackbox Ledger)';
            textarea.placeholder = 'State reason for restoring this event...';
        } else if (action === 'FREEZE') {
            label.textContent = '⚠️ Event Freeze Reason Required * (Recorded in Blackbox Ledger)';
            textarea.placeholder = 'State reason for freezing this event...';
        } else if (action === 'UNFREEZE') {
            label.textContent = '⚠️ Event Unfreeze Reason Required * (Recorded in Blackbox Ledger)';
            textarea.placeholder = 'State reason for unfreezing this event...';
        }
        textarea.focus();
    }
}

function populateEventPhaseSelect(selectedPhaseId) {
    const sel = document.getElementById('evPhaseSelect');
    if (!sel) return;
    sel.innerHTML = '';

    const phases = (cachedEventRefs && cachedEventRefs.phases) ? cachedEventRefs.phases : [];

    if (phases.length === 0) {
        sel.innerHTML = '<option value="">(No active phases available in this project)</option>';
        sel.disabled = true;
        return;
    }

    if (!selectedPhaseId) {
        sel.innerHTML = '<option value="">-- Select Target Phase * --</option>';
    }

    phases.forEach(ph => {
        const isDeleted = ph.ph_ignore_delete === true;
        const opt = document.createElement('option');
        opt.value = ph.pk_t02;
        opt.textContent = `P${ph.ph_sequence}. ${ph.ph_name} ${isDeleted ? '[Deleted]' : ''}`;
        if (selectedPhaseId && Number(ph.pk_t02) === Number(selectedPhaseId)) {
            opt.selected = true;
        }
        sel.appendChild(opt);
    });

    sel.disabled = !!selectedPhaseId;
}

function populateEventTypeSelect(selectedVal) {
    const sel = document.getElementById('evTypeSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Type --</option>';

    const types = (cachedEventRefs && cachedEventRefs.event_types && cachedEventRefs.event_types.length > 0)
        ? cachedEventRefs.event_types
        : ['Meeting', 'Milestone', 'Review', 'Procurement', 'Task Group'];

    let matched = false;
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (selectedVal && t.toUpperCase() === selectedVal.toUpperCase()) {
            opt.selected = true;
            matched = true;
        }
        sel.appendChild(opt);
    });

    if (selectedVal && !matched) {
        const customOpt = document.createElement('option');
        customOpt.value = selectedVal;
        customOpt.textContent = `${selectedVal} (Custom)`;
        customOpt.selected = true;
        sel.appendChild(customOpt);
    }
}

function populateEventStatusSelect(selectedVal) {
    const sel = document.getElementById('evStatusSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Status --</option>';

    const statuses = (cachedEventRefs && cachedEventRefs.event_statuses && cachedEventRefs.event_statuses.length > 0)
        ? cachedEventRefs.event_statuses
        : ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];

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
        customOpt.textContent = `${selectedVal} (Custom)`;
        customOpt.selected = true;
        sel.appendChild(customOpt);
    }
}

function setupOwnerSelector(targetOwnerId, isFullRight) {
    const listTypeRadioA = document.getElementById('evOwnerTypeA');
    if (listTypeRadioA) listTypeRadioA.checked = true;

    const typeBLabel = document.getElementById('evOwnerTypeBLabel');
    if (typeBLabel) {
        typeBLabel.style.display = isFullRight ? 'flex' : 'none';
    }

    toggleOwnerListMode();
    populateProjectMembersSelect(targetOwnerId);
    if (isFullRight) {
        populateDeptDropdown();
    }
}

function toggleOwnerListMode() {
    const isModeB = document.getElementById('evOwnerTypeB').checked;
    const wrapA = document.getElementById('evOwnerWrapA');
    const wrapB = document.getElementById('evOwnerWrapB');
    const warnBox = document.getElementById('evOwnerAutoAssignWarn');

    if (isModeB) {
        wrapA.style.display = 'none';
        wrapB.style.display = 'grid';
        handleDeptStaffSelected();
    } else {
        wrapA.style.display = 'block';
        wrapB.style.display = 'none';
        if (warnBox) warnBox.style.display = 'none';
    }
}

function populateProjectMembersSelect(selectedStaffId) {
    const sel = document.getElementById('evOwnerMemberSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Project Member (Optional) --</option>';

    const members = (cachedEventRefs && cachedEventRefs.project_members) ? [...cachedEventRefs.project_members] : [];
    let hasMatched = false;

    const targetIdNum = (selectedStaffId !== null && selectedStaffId !== undefined && selectedStaffId !== '')
        ? Number(selectedStaffId) : null;

    if (targetIdNum && !members.some(m => Number(m.pk_t05) === targetIdNum)) {
        const currentU = (typeof user !== 'undefined' && user) ? user : null;
        if (currentU) {
            const uName = currentU.st_name || currentU.ST_Name || 'Current User';
            const uRank = currentU.st_rank || currentU.ST_Rank || 'Staff';
            const uEmail = currentU.st_email || currentU.ST_Email || '';
            members.unshift({
                pk_t05: targetIdNum,
                st_name: uName,
                st_rank: uRank,
                st_email: uEmail,
                pr_roletype: 'Member'
            });
        }
    }

    members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.pk_t05;
        opt.textContent = `[${m.st_rank || 'Staff'}] ${m.st_name} (${m.st_email})`;
        if (targetIdNum && Number(m.pk_t05) === targetIdNum) {
            opt.selected = true;
            hasMatched = true;
        }
        sel.appendChild(opt);
    });

    if (hasMatched && targetIdNum) {
        sel.value = String(targetIdNum);
    }
}

function populateDeptDropdown() {
    const sel = document.getElementById('evDeptSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Step 1: Select Department --</option>';

    const deptTree = (cachedEventRefs && cachedEventRefs.dept_staff_tree) ? cachedEventRefs.dept_staff_tree : {};
    Object.keys(deptTree).forEach(dept => {
        const opt = document.createElement('option');
        opt.value = dept;
        opt.textContent = dept;
        sel.appendChild(opt);
    });

    const staffSel = document.getElementById('evDeptStaffSelect');
    if (staffSel) {
        staffSel.innerHTML = '<option value="">-- Step 2: Select Officer --</option>';
        staffSel.disabled = true;
    }
}

function onDeptChanged(deptSelect) {
    const staffSel = document.getElementById('evDeptStaffSelect');
    const warnBox = document.getElementById('evOwnerAutoAssignWarn');
    if (!staffSel) return;

    const dept = deptSelect.value;
    staffSel.innerHTML = '<option value="">-- Step 2: Select Officer --</option>';

    if (!dept) {
        staffSel.disabled = true;
        if (warnBox) warnBox.style.display = 'none';
        return;
    }

    const deptTree = (cachedEventRefs && cachedEventRefs.dept_staff_tree) ? cachedEventRefs.dept_staff_tree : {};
    const staffList = deptTree[dept] || [];

    staffList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.pk_t05;
        opt.textContent = `[${s.st_rank || 'Staff'}] ${s.st_name} (${s.st_email})`;
        staffSel.appendChild(opt);
    });

    staffSel.disabled = false;
    handleDeptStaffSelected();
}

function handleDeptStaffSelected() {
    const staffSel = document.getElementById('evDeptStaffSelect');
    const warnBox = document.getElementById('evOwnerAutoAssignWarn');
    if (!staffSel || !warnBox) return;

    if (staffSel.value && staffSel.value !== '') {
        const selectedText = staffSel.options[staffSel.selectedIndex].text;
        warnBox.innerHTML = `⚠️ <strong>Notice:</strong> Officer ${escapeHtml(selectedText)} is not currently in this project roster. Saving this event will automatically assign them as a <strong>Member</strong>.`;
        warnBox.style.display = 'block';
    } else {
        warnBox.style.display = 'none';
    }
}

async function quickAddEventType() {
    const val = prompt('Please enter custom Event Type:\n(This will be saved to your personal template dictionary)');
    if (!val || !val.trim()) return;

    const trimmed = val.trim();
    const res = await api('/api/portal/event/ref/create-custom', {
        method: 'POST',
        body: JSON.stringify({ category: 'T03_EV_Type', text: trimmed })
    });

    if (res && res.status === 'SUCCESS') {
        if (cachedEventRefs && !cachedEventRefs.event_types.includes(trimmed)) {
            cachedEventRefs.event_types.push(trimmed);
        }
        populateEventTypeSelect(trimmed);
        alert(`Event Type "${trimmed}" added and selected.`);
    } else {
        alert('Failed to add custom type: ' + (res ? res.message : 'Server error'));
    }
}

async function quickAddEventStatus() {
    const val = prompt('Please enter custom Event Status:\n(This will be saved to your personal template dictionary)');
    if (!val || !val.trim()) return;

    const trimmed = val.trim();
    const res = await api('/api/portal/event/ref/create-custom', {
        method: 'POST',
        body: JSON.stringify({ category: 'T03_EV_Status', text: trimmed })
    });

    if (res && res.status === 'SUCCESS') {
        if (cachedEventRefs && !cachedEventRefs.event_statuses.includes(trimmed)) {
            cachedEventRefs.event_statuses.push(trimmed);
        }
        populateEventStatusSelect(trimmed);
        alert(`Event Status "${trimmed}" added and selected.`);
    } else {
        alert('Failed to add custom status: ' + (res ? res.message : 'Server error'));
    }
}

/**
 * 儲存/更新 Event 提交引擎 (VIEWS 防護 + 批次支援)
 */
async function submitCreateEvent() {
    // ★ VIEWER 防禦攔截
    if (currentProjectRight === 'VIEWER') {
        alert('【Access Denied】You have read-only (VIEWER) permissions in this project. Saving changes is prohibited.');
        return;
    }

    const pkT03 = document.getElementById('evPkT03').value;
    const isEdit = (pkT03 !== '' && !isNaN(pkT03));
    const parentIdRaw = document.getElementById('evParentId').value;
    const parentId = (parentIdRaw && !isNaN(parentIdRaw) && parseInt(parentIdRaw, 10) > 0)
        ? parseInt(parentIdRaw, 10)
        : null;

    const isFullRight = (currentProjectRight === 'FULL');
    if (!isEdit && !parentId && !isFullRight) {
        alert('【Access Denied】Only members with FULL project role are authorized to create top-level events.');
        return;
    }

    const phaseId = parseInt(document.getElementById('evPhaseSelect').value, 10);
    const title = document.getElementById('evTitle').value.trim();
    const type = document.getElementById('evTypeSelect').value;
    const status = document.getElementById('evStatusSelect').value;
    const startDate = document.getElementById('evStartDate').value;
    const endDate = document.getElementById('evEndDate').value;
    const rawFolder = document.getElementById('evFolderLink').value.trim();
    const folderLink = normalizePath(rawFolder).webPath;
    const desc = document.getElementById('evDescription').value.trim();
    const remark = document.getElementById('evRemark').value.trim();

    let targetFrozen = eventOriginFrozen;
    let targetDelete = eventOriginDeleted;
    let auditReason = '';

    if (isEdit) {
        const selected = document.querySelector('input[name="evStateAction"]:checked');
        const action = selected ? selected.value : 'KEEP';

        if (action === 'FREEZE') targetFrozen = true;
        else if (action === 'UNFREEZE') targetFrozen = false;
        else if (action === 'DELETE') targetDelete = true;
        else if (action === 'RESTORE') targetDelete = false;

        if (action !== 'KEEP') {
            auditReason = document.getElementById('evAuditReason').value.trim();
            if (!auditReason) {
                alert('【Audit Warning】Please provide a reason for this event state change.');
                document.getElementById('evAuditReason').focus();
                return;
            }
        }
    }

    const isModeB = document.getElementById('evOwnerTypeB').checked;
    let ownerId = null;
    let autoAssign = false;

    if (isModeB && isFullRight) {
        const valB = document.getElementById('evDeptStaffSelect').value;
        if (valB) {
            ownerId = parseInt(valB, 10);
            autoAssign = true;
        }
    } else {
        const valA = document.getElementById('evOwnerMemberSelect').value;
        if (valA) ownerId = parseInt(valA, 10);
    }

    if (!isEdit && (!ownerId || ownerId <= 0)) {
        ownerId = getLoggedInStaffId();
    }

    const submitBtn = document.getElementById('btnSubmitSaveEvent');

    if (!phaseId) {
        alert('Target Phase is required.');
        document.getElementById('evPhaseSelect').focus();
        return;
    }
    if (!title) {
        alert('Event Title is required.');
        document.getElementById('evTitle').focus();
        return;
    }

    if (startDate && endDate && !validateDateSequence(startDate, endDate)) {
        alert('[Schedule Validation Error]\nEvent End Date cannot precede Start Date.');
        document.getElementById('evEndDate').focus();
        return;
    }

    const phases = (cachedEventRefs && cachedEventRefs.phases) ? cachedEventRefs.phases : [];
    const targetPhase = phases.find(p => p.pk_t02 === phaseId);
    if (targetPhase && startDate) {
        const evStart = startDate.substring(0, 10);
        const pStart = targetPhase.ph_target_start ? targetPhase.ph_target_start.substring(0, 10) : null;
        const pEnd = targetPhase.ph_target_end ? targetPhase.ph_target_end.substring(0, 10) : null;

        let isOutOfBound = false;
        if (pStart && calculateDaysBetween(pStart, evStart) < 0) isOutOfBound = true;
        if (pEnd && calculateDaysBetween(evStart, pEnd) < 0) isOutOfBound = true;

        if (isOutOfBound) {
            const confirmed = confirm(
                `[Schedule Notice]\nThe specified event date (${evStart}) falls outside the scheduled phase timeline ` +
                `(${pStart || 'N/A'} ~ ${pEnd || 'N/A'}).\n\nDo you wish to proceed with this schedule?`
            );
            if (!confirmed) return;
        }
    }

    let batchCount = 1;
    let batchNamingMode = 'SUFFIX';
    let batchSeparator = ' - ';

    if (!isEdit && isBatchModeActive) {
        batchCount = parseInt(document.getElementById('evBatchCount').value, 10) || 1;
        batchNamingMode = document.getElementById('evBatchNamingMode').value;
        batchSeparator = document.getElementById('evBatchSeparator').value;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Updating...' : (batchCount > 1 ? `Creating (${batchCount})...` : 'Saving...');

    const payload = {
        fk_t03_pk_t02: phaseId,
        fk_t01: currentProjectId,
        fk_t03_pk_t03_parent: parentId,
        ev_depth_level: parentId ? 2 : 1,
        ev_title: title,
        ev_type: type || 'Meeting',
        ev_status: status || 'Scheduled',
        ev_start_date: startDate ? `${startDate.replace('T', ' ')}:00` : null,
        ev_end_date: endDate ? `${endDate.replace('T', ' ')}:00` : null,
        fk_t03_pk_t05_owner: ownerId,
        owner_auto_assign: autoAssign,
        ev_folder_link: folderLink,
        ev_description: desc,
        ev_remark: remark,
        ev_frozen: targetFrozen,
        ev_ignore_delete: targetDelete,
        audit_reason: auditReason,
        batch_count: batchCount,
        batch_naming_mode: batchNamingMode,
        batch_separator: batchSeparator
    };

    if (isEdit) {
        payload.pk_t03 = parseInt(pkT03, 10);
    }

    const res = await api('/api/portal/event/create', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    submitBtn.disabled = false;
    submitBtn.textContent = isEdit ? 'Update Event' : 'Save Event';

    if (res && res.status === 'SUCCESS') {
        const msg = isEdit 
            ? 'Event updated successfully.' 
            : (batchCount > 1 ? `Successfully generated ${batchCount} events in batch!` : (parentId ? 'Sub Event created successfully.' : 'Event created successfully.'));
        alert(msg);
        closeModal('eventModal');

        if (parentId) {
            expandedSubEventMap.set(parentId, true);
        }

        if (autoAssign) {
            cachedEventRefs = null;
            cachedEventRefsPjId = null;
            if (typeof loadProjectsAndInit === 'function') loadProjectsAndInit();
        }

        renderEventsView(isMyHandleViewMode);
    } else {
        alert('Operation failed: ' + (res ? res.message : 'Server error'));
    }
}