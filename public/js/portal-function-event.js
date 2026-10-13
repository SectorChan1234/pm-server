// ==========================================================================
// ProjectBook Collaboration Portal - Event Management Master Module
// File: /public/js/portal-function-event.js
// Standard: VIEWER Strict Veto, Ancestor Context Inclusion & Ghost Hierarchy
// ==========================================================================

registerView('new-event', renderNewEventModal);
registerView('event-detail', () => renderEventsView(false));
registerView('my-handle-event', () => renderEventsView(true));

let cachedEventRefs = null;
let cachedEventRefsPjId = null;
let currentEventList = [];

// 多維度過濾狀態機 (空陣列代表 All)
let selectedPhaseFilterIds = [];
let selectedOwnerFilterIds = [];
let selectedTypeFilterNames = [];
let selectedStatusFilterNames = [];

let showDeletedEvents = false;
let isMyHandleViewMode = false;
let targetPhaseLockedId = null;
let targetParentLockedId = null;
let isCurrentProjectDepthUnlimited = false;

const expandedSubEventMap = new Map();

function getParentId(ev) {
    if (!ev) return null;
    const val = (ev.parent_id !== undefined && ev.parent_id !== null) ? ev.parent_id :
                (ev.FK_T03_PK_T03_Parent !== undefined && ev.FK_T03_PK_T03_Parent !== null) ? ev.FK_T03_PK_T03_Parent : null;
    if (val === null || val === 'null' || val === '' || val === 0 || val === '0') return null;
    const num = parseInt(val, 10);
    return isNaN(num) || num <= 0 ? null : num;
}

function isEventDeleted(ev) {
    if (!ev) return false;
    const val = (ev.ev_ignore_delete !== undefined) ? ev.ev_ignore_delete :
                (ev.EV_ignore_delete !== undefined) ? ev.EV_ignore_delete : false;
    return val === true || val === 'true' || val === 1 || val === '1';
}

function toggleDeletedEventsVisibility() {
    showDeletedEvents = !showDeletedEvents;
    renderEventsView(isMyHandleViewMode);
}

async function loadEventInitRefs() {
    if (cachedEventRefs && cachedEventRefsPjId === currentProjectId) {
        return cachedEventRefs;
    }

    const res = await api(`/api/portal/event/init-refs?pj=${currentProjectId}`);
    if (res && res.status === 'SUCCESS') {
        cachedEventRefs = res;
        cachedEventRefsPjId = currentProjectId;
        isCurrentProjectDepthUnlimited = Boolean(res.depth_limit_unlimited);
    } else {
        cachedEventRefs = {
            phases: [],
            project_members: [],
            dept_staff_tree: {},
            event_types: [],
            event_statuses: [],
            depth_limit_unlimited: false
        };
        cachedEventRefsPjId = null;
        isCurrentProjectDepthUnlimited = false;
    }
    return cachedEventRefs;
}

window.invalidateEventRefsCache = function(clearFilters = false) {
    cachedEventRefs = null;
    cachedEventRefsPjId = null;
    if (clearFilters) {
        selectedPhaseFilterIds = [];
        selectedOwnerFilterIds = [];
        selectedTypeFilterNames = [];
        selectedStatusFilterNames = [];
    }
};

async function toggleDepthLimitSetting() {
    if (!currentProjectId) return;
    const targetState = !isCurrentProjectDepthUnlimited;
    const confirmMsg = targetState
        ? 'Are you sure you want to UNLOCK the sub-event depth limit for this project?\n(Allows sub-events beyond Level 3)'
        : 'Are you sure you want to LOCK the sub-event depth limit back to Default (Max 3 Levels)?';

    if (!confirm(confirmMsg)) return;

    const res = await api('/api/portal/event/depth-limit/toggle', {
        method: 'POST',
        body: JSON.stringify({
            pj: currentProjectId,
            unlimited: targetState
        })
    });

    if (res && res.status === 'SUCCESS') {
        isCurrentProjectDepthUnlimited = Boolean(res.depth_limit_unlimited);
        if (cachedEventRefs) {
            cachedEventRefs.depth_limit_unlimited = isCurrentProjectDepthUnlimited;
        }
        renderEventsView(isMyHandleViewMode);
    } else {
        alert('Failed to update depth limit: ' + (res ? res.message : 'Server error'));
    }
}

window.ensureEventCardVisible = function(pkT03) {
    if (!currentEventList || currentEventList.length === 0) return;

    let targetEv = currentEventList.find(e => e.pk_t03 === pkT03);
    if (!targetEv) return;

    let curr = targetEv;
    while (curr) {
        const pId = getParentId(curr);
        if (!pId) break;

        expandedSubEventMap.set(pId, true);

        const zone = document.getElementById(`subEventZone_${pId}`);
        if (zone) zone.style.display = 'block';

        const btn = document.getElementById(`btnToggleSub_${pId}`);
        if (btn) {
            const countMatch = btn.textContent.match(/\(\d+\)/);
            const countText = countMatch ? countMatch[0] : '';
            btn.textContent = `▼ Sub Events ${countText}`;
        }

        curr = currentEventList.find(e => e.pk_t03 === pId);
    }
};

async function renderEventsView(myHandleOnly = false) {
    if (!currentProjectId) {
        const container = document.getElementById('viewContent');
        if (container) container.innerHTML = '<div class="empty-placeholder">Please select a project first.</div>';
        return;
    }

    isMyHandleViewMode = myHandleOnly;

    window.invalidateEventRefsCache(false);

    const headingEl = document.getElementById('viewHeading');
    const roleEl = document.getElementById('viewRole');
    const container = document.getElementById('viewContent');

    if (headingEl) {
        headingEl.textContent = myHandleOnly 
            ? 'My Handled Events (Assigned to Me)' 
            : 'Project Events Timeline & Hierarchy';
    }
    if (roleEl) roleEl.textContent = `Role: ${currentProjectRight || 'MEMBER'}`;
    if (container) container.innerHTML = '<div class="empty-placeholder">Loading events...</div>';

    let url = `/api/portal/event/list?pj=${currentProjectId}&include_deleted=true`;
    if (myHandleOnly) url += `&my_handle=true`;

    const [refData, res] = await Promise.all([
        loadEventInitRefs(),
        api(url)
    ]);

    if (!res || res.status !== 'SUCCESS' || !res.events) {
        if (container) container.innerHTML = '<div class="empty-placeholder">Unable to load event records.</div>';
        return;
    }

    currentEventList = res.events;
    if (res.depth_limit_unlimited !== undefined) {
        isCurrentProjectDepthUnlimited = Boolean(res.depth_limit_unlimited);
    }

    const currentUserId = (typeof user !== 'undefined' && user && user.pk_t05) ? parseInt(user.pk_t05, 10) : -1;
    
    // ★ VIEWER 最高否決權
    const isViewer = (currentProjectRight === 'VIEWER');
    const isFullRight = (!isViewer && (currentProjectRight === 'FULL' || currentProjectRight === 'ADMIN'));

    const deletedCount = currentEventList.filter(isEventDeleted).length;
    const shouldShowDeleted = (isFullRight && showDeletedEvents);
    let baseEvents = shouldShowDeleted
        ? currentEventList
        : currentEventList.filter(e => !isEventDeleted(e));

    // 1. 執行四維度聯合交集過濾 (直接命中事件)
    const directlyMatchedEvents = baseEvents.filter(ev => {
        if (selectedPhaseFilterIds.length > 0 && !selectedPhaseFilterIds.includes(Number(ev.fk_t02))) {
            return false;
        }
        if (selectedOwnerFilterIds.length > 0) {
            const oKey = ev.owner_id ? String(ev.owner_id) : (ev.owner_name ? String(ev.owner_name) : 'UNASSIGNED');
            if (!selectedOwnerFilterIds.includes(oKey)) {
                return false;
            }
        }
        if (selectedTypeFilterNames.length > 0 && (!ev.ev_type || !selectedTypeFilterNames.includes(ev.ev_type))) {
            return false;
        }
        if (selectedStatusFilterNames.length > 0 && (!ev.ev_status || !selectedStatusFilterNames.includes(ev.ev_status))) {
            return false;
        }
        return true;
    });

    // 2. ★ 方案 A 核心：多層級向上回溯所有祖先節點 (Context Parents)
    const directlyMatchedIdSet = new Set(directlyMatchedEvents.map(e => e.pk_t03));
    const contextParentIdSet = new Set();
    const baseEventMap = new Map(baseEvents.map(e => [e.pk_t03, e]));

    directlyMatchedEvents.forEach(ev => {
        let currPId = getParentId(ev);
        while (currPId !== null) {
            const parentEv = baseEventMap.get(currPId);
            if (!parentEv) break;
            if (!directlyMatchedIdSet.has(parentEv.pk_t03)) {
                contextParentIdSet.add(parentEv.pk_t03);
            }
            currPId = getParentId(parentEv);
        }
    });

    // 3. 整合最終展示清單 (直接命中者 + 向上溯源容器)
    const allDisplayEvents = baseEvents.filter(e => 
        directlyMatchedIdSet.has(e.pk_t03) || contextParentIdSet.has(e.pk_t03)
    );

    const allDisplayIdSet = new Set(allDisplayEvents.map(e => e.pk_t03));
    const topLevelEvents = [];
    const subEventsMap = new Map();

    allDisplayEvents.forEach(ev => {
        const pId = getParentId(ev);
        // 若無父級，或父級因特殊狀況不在展示池中，提升為頂層展示以防孤立
        if (pId === null || !allDisplayIdSet.has(pId)) {
            topLevelEvents.push(ev);
        } else {
            if (!subEventsMap.has(pId)) {
                subEventsMap.set(pId, []);
            }
            subEventsMap.get(pId).push(ev);
        }
    });

    let cardsHtml = '';
    topLevelEvents.forEach(ev => {
        cardsHtml += renderEventCardHtmlRecursive(ev, subEventsMap, currentUserId, isFullRight, isViewer, 1, contextParentIdSet);
    });

    // 甘特圖保持純粹，僅渲染符合過濾條件的事件
    const ganttHtml = (typeof renderEventGanttChart === 'function')
        ? renderEventGanttChart(directlyMatchedEvents)
        : '';

    const filterPanelHtml = renderCombinedEventFilterPanel(baseEvents);

    let deletedBtnHtml = '';
    if (isFullRight && deletedCount > 0) {
        deletedBtnHtml = `
            <button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 12px; cursor: pointer;" onclick="toggleDeletedEventsVisibility()">
                ${showDeletedEvents ? 'Hide Deleted Events' : `Show Deleted Events (${deletedCount})`}
            </button>
        `;
    }

    let depthLimitBtnHtml = '';
    if (isFullRight) {
        depthLimitBtnHtml = isCurrentProjectDepthUnlimited
            ? `<button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 12px; border-color: #f59e0b; color: #b45309; background: #fffbeb;" onclick="toggleDepthLimitSetting()" title="Click to lock depth limit back to 3 levels">🔓 Depth: Unlimited</button>`
            : `<button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="toggleDepthLimitSetting()" title="Click to unlock sub-event depth limit">🔒 Depth: Max 3 Levels</button>`;
    }

    if (container) {
        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                <div>
                    <span style="font-size:14px; font-weight:700; color:#334155;">
                        ${myHandleOnly ? 'My Assigned Events' : 'Total Defined Events'}: ${directlyMatchedEvents.length} 
                        ${(isFullRight && !showDeletedEvents && deletedCount > 0) ? `<span style="font-size:12px; color:#94a3b8; font-weight:normal;">(${deletedCount} deleted hidden)</span>` : ''}
                    </span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    ${depthLimitBtnHtml}
                    ${isFullRight ? `<button type="button" class="btn-submit" style="background:#0284c7;" onclick="openAddEventModal()">+ Add New Event</button>` : ''}
                    ${deletedBtnHtml}
                </div>
            </div>

            ${filterPanelHtml}
            ${ganttHtml}

            <div class="phase-list-container">
                ${cardsHtml || '<div class="empty-placeholder">No events recorded for this selection.</div>'}
            </div>
        `;
    }
}

/**
 * 遞迴渲染 Event 卡片 (支援 contextParent 輕量化模式，隔離 opacity 避免污染子任務)
 */
function renderEventCardHtmlRecursive(ev, subEventsMap, currentUserId, isFullRight, isViewer, currentDepth, contextParentIdSet) {
    const isContextParent = contextParentIdSet && contextParentIdSet.has(ev.pk_t03);
    const isSub = (currentDepth > 1);
    const phaseTagName = `P${ev.ph_sequence}. ${escapeHtml(ev.ph_name)}${isSub ? ` · Sub L${currentDepth}` : ''}`;
    const subs = subEventsMap.get(ev.pk_t03) || [];
    const hasSubEvents = subs.length > 0;

    // 上下文容器預設自動展開，以穿透展示內部命中的子事件
    const isExpanded = isContextParent ? true : (expandedSubEventMap.get(ev.pk_t03) === true);

    let subEventsContainerHtml = '';
    if (hasSubEvents) {
        let subCardsInnerHtml = '';
        subs.forEach(sub => {
            subCardsInnerHtml += renderEventCardHtmlRecursive(sub, subEventsMap, currentUserId, isFullRight, isViewer, currentDepth + 1, contextParentIdSet);
        });

        subEventsContainerHtml = `
            <div id="subEventZone_${ev.pk_t03}" 
                 style="display: ${isExpanded ? 'block' : 'none'}; margin-top: ${isContextParent ? '6px' : '14px'}; padding: ${isContextParent ? '8px' : '12px'}; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 6px;">
                ${!isContextParent ? `
                    <div style="font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 8px;">
                        ↳ Nested Sub-Events (${subs.length}):
                    </div>
                ` : ''}
                ${subCardsInnerHtml}
            </div>
        `;
    }

    // ★ 模式 1：上下文父卡片（Ghost Parent）
    // 注意：外層容器不可設 opacity: 0.65，改為僅在 phase-card-header 套用淡化，避免子任務顏色變淡
    if (isContextParent) {
        return `
            <div class="phase-card context-parent-card" 
                 id="eventCard_${ev.pk_t03}"
                 style="background: #f8fafc; border: 1px dashed #cbd5e1; margin-bottom: 8px; padding: 8px 12px; border-radius: 6px;">
                
                <div class="phase-card-header" style="opacity: 0.65; border-bottom: none; padding-bottom: 0;">
                    <div class="phase-card-title-zone" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span class="phase-seq-tag" style="background:#e2e8f0; color:#475569;">${phaseTagName}</span>
                        <span class="phase-card-title" style="color:#64748b; font-weight: 600;">${escapeHtml(ev.ev_title)}</span>
                        <span class="badge" style="background:#f1f5f9; color:#94a3b8; font-size:10px; border:1px solid #e2e8f0;">Context Parent</span>
                    </div>
                </div>

                ${subEventsContainerHtml}
            </div>
        `;
    }

    // ★ 模式 2：正常完整卡片渲染
    const rawFolder = (ev.ev_folder_link || '').trim();
    const pathInfo = normalizePath(rawFolder);
    let folderHtml = '';

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

    const isDeleted = isEventDeleted(ev);

    const phases = (cachedEventRefs && cachedEventRefs.phases) ? cachedEventRefs.phases : [];
    const targetPhase = phases.find(p => p.pk_t02 === ev.fk_t02);
    const isPhaseFrozen = targetPhase ? Boolean(targetPhase.ph_frozen) : Boolean(ev.ph_frozen);
    const isEventFrozen = Boolean(ev.ev_frozen);
    const isEffectiveFrozen = (isPhaseFrozen || isEventFrozen);

    const isCreator = (ev.creator_id && Number(ev.creator_id) === Number(currentUserId));
    const isOwner = (ev.owner_id && Number(ev.owner_id) === Number(currentUserId));
    const canManageThis = (!isViewer && (isFullRight || isCreator || isOwner));

    const canAddSubByDepth = isCurrentProjectDepthUnlimited || (currentDepth < 3);
    const canAddSubEvent = (!isViewer && !isEffectiveFrozen && !isDeleted && canManageThis && canAddSubByDepth);
    const canAddMission = (!isViewer && !isEffectiveFrozen && !isDeleted && canManageThis);

    const ownerBadge = ev.owner_name 
        ? `<strong>${escapeHtml(ev.owner_name)}</strong> ${ev.owner_rank ? `(${escapeHtml(ev.owner_rank)})` : ''}`
        : '<span style="color:#94a3b8;">Unassigned</span>';

    let statusClass = 'badge-active';
    if (ev.ev_status === 'Cancelled') statusClass = 'badge-frozen';
    else if (ev.ev_status === 'Scheduled') statusClass = 'badge-info';

    let cardStyleExtra = '';
    if (isEffectiveFrozen) {
        cardStyleExtra = 'background: #fff5f5; border-left: 4px solid #ef4444; border: 1px solid #fca5a5;';
    } else if (isSub) {
        cardStyleExtra = 'margin-bottom: 8px; border-left: 4px solid var(--primary); background: #ffffff;';
    }
    if (isDeleted) {
        cardStyleExtra += ' opacity: 0.65; border: 1px dashed #cbd5e1; background: #f8fafc;';
    }

    const hasStart = Boolean(ev.ev_start_date);
    const hasEnd = Boolean(ev.ev_end_date);
    let timelineDisplay = '<span style="color:#94a3b8;">-</span>';
    if (hasStart && hasEnd) {
        timelineDisplay = `${formatDateTime(ev.ev_start_date)} ~ ${formatDateTime(ev.ev_end_date)}`;
    } else if (hasStart) {
        timelineDisplay = `${formatDateTime(ev.ev_start_date)} ~ -`;
    } else if (hasEnd) {
        timelineDisplay = `- ~ ${formatDateTime(ev.ev_end_date)}`;
    }

    const hasDesc = (ev.ev_description && String(ev.ev_description).trim() !== '');
    const hasRemark = (ev.ev_remark && String(ev.ev_remark).trim() !== '');
    const hasFolder = Boolean(rawFolder);

    return `
        <div class="phase-card ${isEffectiveFrozen ? 'phase-card-frozen' : ''} ${isDeleted ? 'phase-card-deleted' : ''}" 
             id="eventCard_${ev.pk_t03}"
             style="${cardStyleExtra}">
            
            <div class="phase-card-header">
                <div class="phase-card-title-zone" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span class="phase-seq-tag">${phaseTagName}</span>
                    <span class="phase-card-title">${escapeHtml(ev.ev_title)}</span>

                    ${canAddSubEvent ? `
                        <button type="button" class="btn-secondary" style="padding:1px 7px; font-size:11px;" 
                                onclick="openAddSubEventModal(${ev.pk_t03}, ${ev.fk_t02}, '${escapeHtml(ev.ev_title)}')">
                            + Sub Event
                        </button>
                    ` : ''}

                    ${hasSubEvents ? `
                        <button type="button" class="btn-secondary" id="btnToggleSub_${ev.pk_t03}" 
                                style="padding:2px 8px; font-size:11px; font-weight:700; color:#1d4ed8; border:1px solid #93c5fd; background:#eff6ff;" 
                                onclick="toggleSubEventsSection(${ev.pk_t03})">
                            ${isExpanded ? `▼ Sub Events (${subs.length})` : `▶ Sub Events (${subs.length})`}
                        </button>
                    ` : ''}
                </div>

                <div style="display:flex; align-items:center; gap:6px;">
                    ${isDeleted ? '<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">🗑 Deleted</span>' : ''}
                    ${isPhaseFrozen ? '<span class="badge badge-frozen" style="background:#fee2e2; color:#b91c1c; border-color:#fca5a5;">🔒 Frozen (Phase)</span>' : (isEventFrozen ? '<span class="badge badge-frozen">🔒 Frozen</span>' : '')}
                    <span class="badge ${statusClass}">${escapeHtml(ev.ev_status || '-')}</span>
                    <span class="badge badge-info" style="font-weight:normal;">${escapeHtml(ev.ev_type || 'Event')}</span>

                    ${canAddMission ? `
                        <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:11px;" 
                                onclick="handleEventAddMission(${ev.pk_t03}, '${escapeHtml(ev.ev_title)}')">
                            + Mission
                        </button>
                    ` : ''}

                    <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:11px;" 
                            onclick="handleEventViewMissions(${ev.pk_t03})">
                        View Missions
                    </button>

                    ${(!isViewer && !isPhaseFrozen && canManageThis) ? (isEventFrozen ? `
                        <button type="button" class="btn-secondary" style="padding: 2px 10px; font-size: 11px; color:#2563eb; border-color:#93c5fd; background:#eff6ff; cursor: pointer;" onclick="openEditEventModal(${ev.pk_t03})">
                            🔓 Unfreeze
                        </button>
                    ` : `
                        <button type="button" class="btn-submit" style="background: #0284c7; padding: 2px 10px; font-size: 11px; border-radius: 4px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="openEditEventModal(${ev.pk_t03})">
                            ✎ Edit
                        </button>
                    `) : ''}
                </div>
            </div>

            <div class="phase-schedule-grid" style="margin-top: 10px;">
                <div class="schedule-box">
                    <span class="schedule-lbl">Owner:</span>
                    <span class="schedule-val">${ownerBadge}</span>
                </div>

                <div class="schedule-box">
                    <span class="schedule-lbl">Timeline:</span>
                    <span class="schedule-val">${timelineDisplay}</span>
                </div>

                ${hasDesc ? `
                    <div class="schedule-box full-width">
                        <span class="schedule-lbl">Description:</span>
                        <span class="schedule-val" style="white-space: pre-wrap; line-height: 1.45;">${escapeHtml(ev.ev_description)}</span>
                    </div>
                ` : ''}

                ${hasRemark ? `
                    <div class="schedule-box full-width">
                        <span class="schedule-lbl">Remarks:</span>
                        <span class="schedule-val" style="white-space: pre-wrap; line-height: 1.45;">${escapeHtml(ev.ev_remark)}</span>
                    </div>
                ` : ''}

                ${hasFolder ? `
                    <div class="schedule-box full-width">
                        <span class="schedule-lbl">Folder:</span>
                        <span class="schedule-val">${folderHtml}</span>
                    </div>
                ` : ''}
            </div>

            ${subEventsContainerHtml}
        </div>
    `;
}


function toggleSubEventsSection(parentEventId) {
    const isCurrentlyExpanded = expandedSubEventMap.get(parentEventId) === true;
    expandedSubEventMap.set(parentEventId, !isCurrentlyExpanded);

    const zone = document.getElementById(`subEventZone_${parentEventId}`);
    const btn = document.getElementById(`btnToggleSub_${parentEventId}`);
    if (zone) {
        zone.style.display = !isCurrentlyExpanded ? 'block' : 'none';
    }
    if (btn) {
        const countMatch = btn.textContent.match(/\(\d+\)/);
        const countText = countMatch ? countMatch[0] : '';
        btn.textContent = !isCurrentlyExpanded ? `▼ Sub Events ${countText}` : `▶ Sub Events ${countText}`;
    }
}

// ==========================================================================
// 頂部整合過濾面板：Phase / Owner / Type / Status 四合一統整
// ==========================================================================
function renderCombinedEventFilterPanel(eventPool) {
    const phases = (cachedEventRefs && cachedEventRefs.phases) ? cachedEventRefs.phases : [];

    const ownerMap = new Map();
    let hasUnassigned = false;
    eventPool.forEach(ev => {
        if (ev.owner_id || ev.owner_name) {
            const key = ev.owner_id ? String(ev.owner_id) : String(ev.owner_name);
            const label = ev.owner_name ? (ev.owner_rank ? `${ev.owner_name} (${ev.owner_rank})` : ev.owner_name) : `Staff #${ev.owner_id}`;
            ownerMap.set(key, label);
        } else {
            hasUnassigned = true;
        }
    });
    const uniqueOwners = Array.from(ownerMap.entries()).map(([k, v]) => ({ id: k, name: v }));
    if (hasUnassigned) {
        uniqueOwners.push({ id: 'UNASSIGNED', name: 'Unassigned' });
    }

    const typeSet = new Set();
    eventPool.forEach(ev => {
        if (ev.ev_type && String(ev.ev_type).trim() !== '') {
            typeSet.add(String(ev.ev_type).trim());
        }
    });
    const uniqueTypes = Array.from(typeSet);

    const statusSet = new Set();
    eventPool.forEach(ev => {
        if (ev.ev_status && String(ev.ev_status).trim() !== '') {
            statusSet.add(String(ev.ev_status).trim());
        }
    });
    const uniqueStatuses = Array.from(statusSet);

    const activeStyle = 'background: var(--primary); color: #fff; font-weight: 700; border-color: var(--primary);';

    // 1. Phase 列
    const isPhaseAll = (selectedPhaseFilterIds.length === 0);
    let phaseChipsHtml = `
        <button type="button" class="btn-secondary" 
                style="padding: 3px 10px; font-size: 12px; border-radius: 14px; cursor: pointer; ${isPhaseAll ? activeStyle : ''}"
                onclick="handlePhaseFilterSelect(null)">All Phases</button>
    `;
    phases.forEach(ph => {
        const isSel = selectedPhaseFilterIds.includes(Number(ph.pk_t02));
        const isDel = (ph.ph_ignore_delete === true);
        phaseChipsHtml += `
            <button type="button" class="btn-secondary" 
                    style="padding: 3px 10px; font-size: 12px; border-radius: 14px; cursor: pointer; ${isSel ? activeStyle : ''} ${isDel ? 'border: 1px dashed #ef4444; color: #b91c1c;' : ''}"
                    onclick="handlePhaseFilterSelect(${ph.pk_t02}, event)">
                P${ph.ph_sequence}. ${escapeHtml(ph.ph_name)} ${isDel ? '<span style="font-size:10px; opacity:0.85;">[Deleted]</span>' : ''}
            </button>
        `;
    });

    // 2. Owner 列
    const isOwnerAll = (selectedOwnerFilterIds.length === 0);
    let ownerChipsHtml = `
        <button type="button" class="btn-secondary" 
                style="padding: 3px 10px; font-size: 12px; border-radius: 14px; cursor: pointer; ${isOwnerAll ? activeStyle : ''}"
                onclick="handleOwnerFilterSelect(null)">All</button>
    `;
    uniqueOwners.forEach(o => {
        const isSel = selectedOwnerFilterIds.includes(o.id);
        ownerChipsHtml += `
            <button type="button" class="btn-secondary" 
                    style="padding: 3px 10px; font-size: 12px; border-radius: 14px; cursor: pointer; ${isSel ? activeStyle : ''}"
                    onclick="handleOwnerFilterSelect('${escapeHtml(o.id)}', event)">
                ${escapeHtml(o.name)}
            </button>
        `;
    });

    // 3. Type 列
    const isTypeAll = (selectedTypeFilterNames.length === 0);
    let typeChipsHtml = `
        <button type="button" class="btn-secondary" 
                style="padding: 3px 10px; font-size: 12px; border-radius: 14px; cursor: pointer; ${isTypeAll ? activeStyle : ''}"
                onclick="handleTypeFilterSelect(null)">All</button>
    `;
    uniqueTypes.forEach(t => {
        const isSel = selectedTypeFilterNames.includes(t);
        typeChipsHtml += `
            <button type="button" class="btn-secondary" 
                    style="padding: 3px 10px; font-size: 12px; border-radius: 14px; cursor: pointer; ${isSel ? activeStyle : ''}"
                    onclick="handleTypeFilterSelect('${escapeHtml(t)}', event)">
                ${escapeHtml(t)}
            </button>
        `;
    });

    // 4. Status 列
    const isStatusAll = (selectedStatusFilterNames.length === 0);
    let statusChipsHtml = `
        <button type="button" class="btn-secondary" 
                style="padding: 3px 10px; font-size: 12px; border-radius: 14px; cursor: pointer; ${isStatusAll ? activeStyle : ''}"
                onclick="handleStatusFilterSelect(null)">All</button>
    `;
    uniqueStatuses.forEach(s => {
        const isSel = selectedStatusFilterNames.includes(s);
        statusChipsHtml += `
            <button type="button" class="btn-secondary" 
                    style="padding: 3px 10px; font-size: 12px; border-radius: 14px; cursor: pointer; ${isSel ? activeStyle : ''}"
                    onclick="handleStatusFilterSelect('${escapeHtml(s)}', event)">
                ${escapeHtml(s)}
            </button>
        `;
    });

    return `
        <div style="margin-bottom: 16px; padding: 12px 14px; background: #ffffff; border: 1px solid var(--border-light); border-radius: 6px; display: flex; flex-direction: column; gap: 8px;">
            <!-- Row 1: Filter by Phase -->
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 12px; font-weight: 700; color: #64748b; min-width: 105px;">Filter by Phase:</span>
                ${phaseChipsHtml}
                <span style="font-size: 11px; color: var(--text-muted); margin-left: auto;">(Click to single select, Ctrl+Click to multi-select)</span>
            </div>

            <!-- Row 2: Filter by Owner -->
            ${uniqueOwners.length > 0 ? `
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-top: 1px dashed #f1f5f9; padding-top: 6px;">
                <span style="font-size: 12px; font-weight: 700; color: #64748b; min-width: 105px;">Filter by Owner:</span>
                ${ownerChipsHtml}
            </div>` : ''}

            <!-- Row 3: Filter by Type -->
            ${uniqueTypes.length > 0 ? `
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-top: 1px dashed #f1f5f9; padding-top: 6px;">
                <span style="font-size: 12px; font-weight: 700; color: #64748b; min-width: 105px;">Filter by Type:</span>
                ${typeChipsHtml}
            </div>` : ''}

            <!-- Row 4: Filter by Status -->
            ${uniqueStatuses.length > 0 ? `
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-top: 1px dashed #f1f5f9; padding-top: 6px;">
                <span style="font-size: 12px; font-weight: 700; color: #64748b; min-width: 105px;">Filter by Status:</span>
                ${statusChipsHtml}
            </div>` : ''}
        </div>
    `;
}

function handlePhaseFilterSelect(pkT02, event) {
    if (pkT02 === null) {
        selectedPhaseFilterIds = [];
    } else {
        const targetId = Number(pkT02);
        if (event && (event.ctrlKey || event.metaKey)) {
            const idx = selectedPhaseFilterIds.indexOf(targetId);
            if (idx >= 0) selectedPhaseFilterIds.splice(idx, 1);
            else selectedPhaseFilterIds.push(targetId);
        } else {
            if (selectedPhaseFilterIds.length === 1 && selectedPhaseFilterIds[0] === targetId) {
                selectedPhaseFilterIds = [];
            } else {
                selectedPhaseFilterIds = [targetId];
            }
        }
    }
    renderEventsView(isMyHandleViewMode);
}

function handleOwnerFilterSelect(ownerKey, event) {
    if (ownerKey === null) {
        selectedOwnerFilterIds = [];
    } else {
        const key = String(ownerKey);
        if (event && (event.ctrlKey || event.metaKey)) {
            const idx = selectedOwnerFilterIds.indexOf(key);
            if (idx >= 0) selectedOwnerFilterIds.splice(idx, 1);
            else selectedOwnerFilterIds.push(key);
        } else {
            if (selectedOwnerFilterIds.length === 1 && selectedOwnerFilterIds[0] === key) {
                selectedOwnerFilterIds = [];
            } else {
                selectedOwnerFilterIds = [key];
            }
        }
    }
    renderEventsView(isMyHandleViewMode);
}

function handleTypeFilterSelect(typeStr, event) {
    if (typeStr === null) {
        selectedTypeFilterNames = [];
    } else {
        const key = String(typeStr);
        if (event && (event.ctrlKey || event.metaKey)) {
            const idx = selectedTypeFilterNames.indexOf(key);
            if (idx >= 0) selectedTypeFilterNames.splice(idx, 1);
            else selectedTypeFilterNames.push(key);
        } else {
            if (selectedTypeFilterNames.length === 1 && selectedTypeFilterNames[0] === key) {
                selectedTypeFilterNames = [];
            } else {
                selectedTypeFilterNames = [key];
            }
        }
    }
    renderEventsView(isMyHandleViewMode);
}

function handleStatusFilterSelect(statusStr, event) {
    if (statusStr === null) {
        selectedStatusFilterNames = [];
    } else {
        const key = String(statusStr);
        if (event && (event.ctrlKey || event.metaKey)) {
            const idx = selectedStatusFilterNames.indexOf(key);
            if (idx >= 0) selectedStatusFilterNames.splice(idx, 1);
            else selectedStatusFilterNames.push(key);
        } else {
            if (selectedStatusFilterNames.length === 1 && selectedStatusFilterNames[0] === key) {
                selectedStatusFilterNames = [];
            } else {
                selectedStatusFilterNames = [key];
            }
        }
    }
    renderEventsView(isMyHandleViewMode);
}

window.openAddEventModalForPhase = function(pjId, pkT02) {
    if (pjId !== currentProjectId) {
        onCurrentProjectChanged(pjId, 'event-detail');
    }
    openAddEventModal(pkT02);
};

function handleEventAddMission(pkT03, eventTitle) {
    if (typeof window.openAddMissionModalForEvent === 'function') {
        window.openAddMissionModalForEvent(currentProjectId, pkT03);
    } else {
        alert(`[Mission Module Pending]\nProject ID: ${currentProjectId}\nTarget Event: #${pkT03}\nEvent: ${eventTitle}`);
    }
}

function handleEventViewMissions(pkT03) {
    if (!currentProjectId || !pkT03) return;

    document.querySelectorAll('.top-nav-btn').forEach(btn => btn.classList.remove('active'));
    const topNavMission = document.getElementById('topNavMission');
    if (topNavMission) topNavMission.classList.add('active');

    if (typeof expandOnlyAccordion === 'function') {
        expandOnlyAccordion('accGroupMission');
    }

    window.location.hash = `#pj=${currentProjectId}&view=mission-detail&ev=${pkT03}`;
}

function renderNewEventModal() {
    targetPhaseLockedId = null;
    targetParentLockedId = null;
    ensureEventModalExists();

    const headingEl = document.getElementById('viewHeading');
    const roleEl = document.getElementById('viewRole');
    const container = document.getElementById('viewContent');

    if (headingEl) headingEl.textContent = 'Create New Event';
    if (roleEl) roleEl.textContent = `Role: ${currentProjectRight || 'MEMBER'}`;
    if (container) {
        container.innerHTML = `
            <div class="empty-placeholder" style="padding: 40px; text-align: center;">
                <h3 style="color: #334155; margin-bottom: 8px;">Create New Event</h3>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 16px;">
                    The event creation dialog is active. If closed, click below to reopen.
                </p>
                <button type="button" class="btn-submit" onclick="openAddEventModal()">+ Open Create Dialog</button>
            </div>
        `;
    }

    openAddEventModal();
}