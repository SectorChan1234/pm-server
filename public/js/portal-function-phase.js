// ==========================================================================
// ProjectBook Collaboration Portal - Phase Management Master Module
// File: /public/js/portal-function-phase.js
// Submodules: portal-function-phase-GanttChart.js & portal-function-phase-Modal.js
// Strictly aligned with H2 Schema for T02_Phase, T06_ProjectRoles & T00_Ref
// Integrated with: common-function.js & Central Router (portal.js)
// ==========================================================================

registerView('project-phase', renderProjectPhaseView);

let cachedPhaseRefs = null;
let currentPhaseList = [];
let showPhaseDeleted = false;

/**
 * 檢查 Phase 是否處於軟刪除狀態
 */
function isPhaseDeleted(p) {
    if (!p) return false;
    const val = (p.ph_ignore_delete !== undefined) ? p.ph_ignore_delete :
                (p.PH_ignore_delete !== undefined) ? p.PH_ignore_delete : false;
    return val === true || val === 'true' || val === 1 || val === '1';
}

/**
 * 切換已刪除 Phase 的顯示/隱藏狀態
 */
function togglePhaseDeletedVisibility() {
    showPhaseDeleted = !showPhaseDeleted;
    renderProjectPhaseView();
}

// ==========================================================================
// 1. Project Phase 主畫面渲染 (工具列 + 甘特圖 + 卡片清單)
// ==========================================================================
async function renderProjectPhaseView() {
    if (!currentProjectId) {
        const container = document.getElementById('viewContent');
        if (container) container.innerHTML = '<div class="empty-placeholder">Please select a project first.</div>';
        return;
    }

    const headingEl = document.getElementById('viewHeading');
    const roleEl = document.getElementById('viewRole');
    const container = document.getElementById('viewContent');

    if (headingEl) headingEl.textContent = 'Project Phases & Milestones';
    if (roleEl) roleEl.textContent = `Role: ${currentProjectRight || 'MEMBER'}`;
    if (container) container.innerHTML = '<div class="empty-placeholder">Loading project phases...</div>';

    const res = await api(`/api/portal/phase/list?pj=${currentProjectId}`);
    if (!res || res.status !== 'SUCCESS' || !res.phases) {
        if (container) container.innerHTML = '<div class="empty-placeholder">Unable to load phase records.</div>';
        return;
    }

    currentPhaseList = res.phases;

    const isFullRight = (currentProjectRight === 'FULL' || currentProjectRight === 'ADMIN');
    const deletedCount = currentPhaseList.filter(isPhaseDeleted).length;
    const shouldShowDeleted = (isFullRight && showPhaseDeleted);

    const visiblePhases = shouldShowDeleted
        ? currentPhaseList
        : currentPhaseList.filter(p => !isPhaseDeleted(p));

    let cardsHtml = '';
    visiblePhases.forEach(ph => {
        const rawFolder = (ph.ph_folder_link || '').trim();
        const pathInfo = normalizePath(rawFolder);
        let folderHtml = '<span style="color:#94a3b8;">None</span>';

        if (rawFolder) {
            if (pathInfo.isHttp) {
                folderHtml = `<a href="${escapeHtml(pathInfo.webPath)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:underline;">${escapeHtml(pathInfo.webPath)}</a>`;
            } else {
                folderHtml = `
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <code>${escapeHtml(pathInfo.webPath)}</code>
                        <button type="button" class="btn-secondary" style="padding:1px 6px; font-size:11px;" 
                                data-copy-path="${escapeHtml(pathInfo.winPath)}"
                                onclick="copyToClipboard(this.getAttribute('data-copy-path'), 'Folder path copied!')">📋 Copy Path</button>
                    </div>
                `;
            }
        }

        const isDeleted = isPhaseDeleted(ph);
        const isFrozen = !!ph.ph_frozen;

        let statusBadgeClass = 'badge-active';
        if (isFrozen) statusBadgeClass = 'badge-frozen';
        else if (ph.ph_status === 'Completed') statusBadgeClass = 'badge-info';

        cardsHtml += `
            <div class="phase-card ${isFrozen ? 'phase-card-frozen' : ''} ${isDeleted ? 'phase-card-deleted' : ''}" 
                 id="phaseCard_${ph.pk_t02}"
                 style="${isDeleted ? 'opacity: 0.65; border: 1px dashed #cbd5e1; background: #f8fafc;' : ''}">
                <div class="phase-card-header">
                    <div class="phase-card-title-zone">
                        <span class="phase-seq-tag">Phase ${ph.ph_sequence}</span>
                        <span class="phase-card-title">${escapeHtml(ph.ph_name)}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        ${isDeleted ? '<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">🗑 Deleted</span>' : ''}
                        <span class="badge ${statusBadgeClass}">${escapeHtml(ph.ph_status || '-')}</span>
                        ${isFrozen ? '<span class="badge badge-frozen">🔒 Frozen</span>' : ''}

						<!-- 跨模組跳轉：+ Event (鎖定當前 Phase，未凍結且未刪除時可用) -->
                        ${(isFullRight && !isDeleted && !isFrozen) ? `
                            <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:11px;" 
                                    onclick="handlePhaseAddEvent(${ph.pk_t02})">+ Event</button>
                        ` : ''}

                        <!-- 跨模組跳轉：View Events (帶入篩選條件) -->
                        <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:11px;" 
                                onclick="handlePhaseViewEvents(${ph.pk_t02})">View Events</button>

                        <!-- 限具備 FULL 權限者操作：若已凍結則顯示 🔓 Unfreeze，未凍結顯示 ✎ Edit -->
                        ${isFullRight ? (isFrozen ? `
                            <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:11px; color:#2563eb; border-color:#93c5fd; background:#eff6ff;" onclick="openEditPhaseModal(${ph.pk_t02})">🔓 Unfreeze</button>
                        ` : `
                            <button type="button" class="btn-submit" style="background:#0284c7; padding:2px 8px; font-size:11px;" onclick="openEditPhaseModal(${ph.pk_t02})">✎ Edit</button>
                        `) : ''}
                    </div>
                </div>

                ${ph.ph_description ? `<div class="phase-card-desc">${escapeHtml(ph.ph_description)}</div>` : ''}

                <div class="phase-schedule-grid">
                    <div class="schedule-box">
                        <span class="schedule-lbl">Target Timeline:</span>
                        <span class="schedule-val">${formatDate(ph.ph_target_start)} ~ ${formatDate(ph.ph_target_end)}</span>
                    </div>
                    <div class="schedule-box">
                        <span class="schedule-lbl">Actual Timeline:</span>
                        <span class="schedule-val">${formatDate(ph.ph_actual_start)} ~ ${formatDate(ph.ph_actual_end)}</span>
                    </div>
                    <div class="schedule-box full-width">
                        <span class="schedule-lbl">Folder:</span>
                        <span class="schedule-val">${folderHtml}</span>
                    </div>
                </div>
            </div>
        `;
    });

    const ganttHtml = (typeof renderPhaseGanttChart === 'function')
        ? renderPhaseGanttChart(visiblePhases)
        : '';

    let deletedBtnHtml = '';
    if (isFullRight && deletedCount > 0) {
        deletedBtnHtml = `
            <button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 12px; cursor: pointer;" onclick="togglePhaseDeletedVisibility()">
                ${showPhaseDeleted ? 'Hide Deleted Phases' : `Show Deleted Phases (${deletedCount})`}
            </button>
        `;
    }

    if (container) {
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                <div>
                    <span style="font-size:14px; font-weight:700; color:#334155;">
                        Total Defined Phases: ${visiblePhases.length}
                        ${(isFullRight && !showPhaseDeleted && deletedCount > 0) ? `<span style="font-size:12px; color:#94a3b8; font-weight:normal;">(${deletedCount} deleted hidden)</span>` : ''}
                    </span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${isFullRight ? `<button type="button" class="btn-submit" onclick="openAddPhaseModal()">+ Add New Phase</button>` : ''}
                    ${deletedBtnHtml}
                </div>
            </div>

            ${ganttHtml}

            <div class="phase-list-container">
                ${cardsHtml || '<div class="empty-placeholder">No phases defined for this project.</div>'}
            </div>
        `;
    }
}

// ==========================================================================
// 2. 跨模組導引與跳轉 (Phase -> Event)
// ==========================================================================
function handlePhaseAddEvent(pkT02) {
    if (!currentProjectId) return;

    // 同步中央視圖至 Event Detail，自動高亮頂部導航與展開左側手風琴
    switchMainTab('event');
    switchView('event-detail');

    if (typeof window.openAddEventModalForPhase === 'function') {
        window.openAddEventModalForPhase(currentProjectId, pkT02);
    }
}

function handlePhaseViewEvents(pkT02) {
    if (!currentProjectId || !pkT02) return;

    document.querySelectorAll('.top-nav-btn').forEach(btn => btn.classList.remove('active'));
    const topNavEvent = document.getElementById('topNavEvent');
    if (topNavEvent) topNavEvent.classList.add('active');

    if (typeof expandOnlyAccordion === 'function') {
        expandOnlyAccordion('accGroupEvent');
    }

    window.location.hash = `#pj=${currentProjectId}&view=event-detail&ph=${pkT02}`;
}

// ==========================================================================
// 3. 字典快取載入器
// ==========================================================================
async function loadPhaseRefs() {
    if (cachedPhaseRefs) return cachedPhaseRefs;
    const res = await api(`/api/portal/phase/refs?pj=${currentProjectId}`);
    if (res && res.status === 'SUCCESS') {
        cachedPhaseRefs = res;
    } else {
        cachedPhaseRefs = { statuses: [], phase_templates: [] };
    }
    return cachedPhaseRefs;
}