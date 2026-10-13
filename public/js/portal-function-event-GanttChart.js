// ==========================================================================
// ProjectBook - Event Gantt Chart Submodule
// File: /public/js/portal-function-event-GanttChart.js
// Standard: Dual Column Split, Phase Cascade Freeze & Unified Gantt Styling
// ==========================================================================

let showEventGanttTodayLine = true;
let showEventGanttPhaseLine = true;
let eventGanttScaleMode = 'ADAPTIVE';
let eventGanttScaleUnit = 'MONTH';
let eventGanttToYear = null;
let cachedEventsForGantt = [];

// Fixed Step: Daily / Hourly 專屬日期區間狀態
let eventGanttFixedStartDate = null;
let eventGanttFixedEndDate = null;

function safeStr(val, defaultVal) {
    var def = defaultVal !== undefined ? defaultVal : '-';
    return (val !== null && val !== undefined && String(val).trim() !== '') ? val : def;
}

function getSafeEventDate(dStr) {
    if (typeof parsePureDate === 'function') {
        return parsePureDate(dStr);
    }
    if (!dStr) return null;
    var d = new Date(String(dStr).substring(0, 10).replace(/-/g, '/') + ' 00:00:00');
    return isNaN(d.getTime()) ? null : d;
}

function getSafeEventDateStr(dStr) {
    if (typeof formatDate === 'function') {
        return formatDate(dStr);
    }
    return dStr ? String(dStr).substring(0, 10) : '-';
}

function getSafeEventDateTimeStr(dtStr) {
    if (typeof formatDateTime === 'function') {
        return formatDateTime(dtStr);
    }
    return dtStr ? String(dtStr).substring(0, 16) : '-';
}

function toggleEventGanttTodayLine(checkbox) {
    showEventGanttTodayLine = checkbox.checked;
    refreshEventGanttChart();
}

function toggleEventGanttPhaseLine(checkbox) {
    showEventGanttPhaseLine = checkbox.checked;
    refreshEventGanttChart();
}

function refreshEventGanttChart() {
    const ganttContainer = document.getElementById('eventGanttWrapperZone');
    if (ganttContainer) {
        ganttContainer.innerHTML = renderEventGanttChartInner(cachedEventsForGantt);
        syncEventGanttRowHeights();
    }
}

function renderEventGanttChart(events) {
    cachedEventsForGantt = events ? events : [];
    setTimeout(syncEventGanttRowHeights, 0);
    return `
        <div class="pb-gantt-card phase-gantt-card" id="eventGanttWrapperZone">
            ${renderEventGanttChartInner(cachedEventsForGantt)}
        </div>
    `;
}

function renderEventGanttChartInner(events) {
    if (!events || events.length === 0) {
        return `
            <div class="pb-gantt-header phase-gantt-header"><span class="pb-gantt-title phase-gantt-title">Event Schedule Timeline</span></div>
            <div style="font-size: 13px; color: #a0aec0; padding: 12px 0;">No events registered for timeline calculation.</div>
        `;
    }

    cachedEventsForGantt = events;

    let minTime = Infinity;
    let maxTime = -Infinity;
    let hasValidDate = false;
    let minStartYearFound = null;
    let maxEndYearFound = null;

    events.forEach(ev => {
        [ev.ev_start_date, ev.ev_end_date].forEach(d => {
            const pureDate = getSafeEventDate(d);
            if (pureDate) {
                hasValidDate = true;
                const t = pureDate.getTime();
                if (t < minTime) minTime = t;
                if (t > maxTime) maxTime = t;

                const y = pureDate.getFullYear();
                if (minStartYearFound === null || y < minStartYearFound) minStartYearFound = y;
                if (maxEndYearFound === null || y > maxEndYearFound) maxEndYearFound = y;
            }
        });
    });

    const phases = (cachedEventRefs && cachedEventRefs.phases) ? cachedEventRefs.phases : [];
    if (showEventGanttPhaseLine && phases.length > 0) {
        phases.forEach(ph => {
            [ph.ph_target_start, ph.ph_target_end, ph.ph_actual_start, ph.ph_actual_end].forEach(d => {
                const pureDate = getSafeEventDate(d);
                if (pureDate) {
                    hasValidDate = true;
                    const t = pureDate.getTime();
                    if (t < minTime) minTime = t;
                    if (t > maxTime) maxTime = t;

                    const y = pureDate.getFullYear();
                    if (minStartYearFound === null || y < minStartYearFound) minStartYearFound = y;
                    if (maxEndYearFound === null || y > maxEndYearFound) maxEndYearFound = y;
                }
            });
        });
    }

    if (!hasValidDate || minTime >= maxTime) {
        return `
            <div class="pb-gantt-header phase-gantt-header"><span class="pb-gantt-title phase-gantt-title">Event Schedule Timeline</span></div>
            <div style="font-size: 13px; color: #a0aec0; padding: 12px 0;">No valid start or end dates specified to render timeline.</div>
        `;
    }

    const todayDate = getSafeEventDate(new Date().toISOString().substring(0, 10));
    const todayTime = todayDate ? todayDate.getTime() : Date.now();
    const currentYear = new Date().getFullYear();

    const smartDefaultToYear = maxEndYearFound ? Math.min(maxEndYearFound, currentYear + 3) : currentYear + 3;
    if (eventGanttToYear === null) {
        eventGanttToYear = smartDefaultToYear;
    }

    // 初始化 Daily / Hourly 專屬預設日期區間
    const defaultStartStr = new Date(Math.min(minTime, todayTime)).toISOString().substring(0, 10);
    if (!eventGanttFixedStartDate) eventGanttFixedStartDate = defaultStartStr;
    if (!eventGanttFixedEndDate) {
        const dObj = new Date(eventGanttFixedStartDate.replace(/-/g, '/'));
        const daysToAdd = (eventGanttScaleUnit === 'HOURLY') ? 3 : 14;
        dObj.setDate(dObj.getDate() + daysToAdd);
        eventGanttFixedEndDate = dObj.toISOString().substring(0, 10);
    }

    let viewStart, viewEnd, viewDuration;
    let timeMarks = [];
    let trackInnerWidthStyle = 'width: 100%;';
    let trackContainerStyle = 'overflow-x: hidden;';

    const isScrollable = (eventGanttScaleMode === 'SCROLLABLE');
    const isDayOrHourScale = (eventGanttScaleUnit === 'HOURLY' || eventGanttScaleUnit === 'DAILY');

    if (eventGanttScaleMode === 'ADAPTIVE') {
        let effectiveMin = minTime;
        let effectiveMax = maxTime;

        if (showEventGanttTodayLine) {
            effectiveMin = Math.min(minTime, todayTime);
            effectiveMax = Math.max(maxTime, todayTime);
        }

        const totalDuration = effectiveMax - effectiveMin;
        const padTime = Math.max(totalDuration * 0.04, 86400000 * 3);

        viewStart = effectiveMin - padTime;
        viewEnd = effectiveMax + padTime;
        viewDuration = viewEnd - viewStart;

        [0, 0.25, 0.5, 0.75, 1.0].forEach(ratio => {
            const pct = ratio * 100;
            const markDate = new Date(viewStart + viewDuration * ratio);
            const y = markDate.getFullYear();
            const m = String(markDate.getMonth() + 1).padStart(2, '0');
            const d = String(markDate.getDate()).padStart(2, '0');
            timeMarks.push({ pct: pct, label: `${y}-${m}-${d}` });
        });
        trackInnerWidthStyle = 'width: 100%; min-width: 100%;';
        trackContainerStyle = 'overflow-x: hidden;';
    } else {
        if (isDayOrHourScale) {
            const sDate = new Date(eventGanttFixedStartDate.replace(/-/g, '/') + ' 00:00:00');
            const eDate = new Date(eventGanttFixedEndDate.replace(/-/g, '/') + ' 23:59:59');
            viewStart = isNaN(sDate.getTime()) ? minTime : sDate.getTime();
            viewEnd = isNaN(eDate.getTime()) ? (viewStart + 86400000 * 7) : eDate.getTime();
            if (viewEnd <= viewStart) viewEnd = viewStart + 86400000 * 7;
        } else {
            const earliestBound = Math.min(minTime, todayTime);
            const leadBuffer = 14 * 24 * 3600 * 1000;
            viewStart = earliestBound - leadBuffer;
            viewEnd = new Date(eventGanttToYear, 11, 31, 23, 59, 59).getTime();
            if (viewEnd <= viewStart) viewEnd = viewStart + (90 * 24 * 3600 * 1000);
        }

        viewDuration = viewEnd - viewStart;
        const fixedMarksData = generateEventFixedMarks(viewStart, viewEnd, eventGanttScaleUnit);
        timeMarks = fixedMarksData.marks;
        const trackWidthPx = Math.max(fixedMarksData.totalWidth, 1000);

        trackInnerWidthStyle = `width: ${trackWidthPx}px; min-width: ${trackWidthPx}px;`;
        trackContainerStyle = 'overflow-x: auto; overflow-y: hidden;';
    }

    let markersHtml = '';
    let gridLinesHtml = '';
    timeMarks.forEach(mk => {
        markersHtml += `<span class="gantt-time-mark" style="left: ${mk.pct.toFixed(2)}%; position: absolute; transform: translateX(-50%); font-size: 11px; color: #64748b; font-family: monospace; white-space: nowrap;">${mk.label}</span>`;
        gridLinesHtml += `<div class="gantt-grid-line" style="left: ${mk.pct.toFixed(2)}%; position: absolute; top: 0; bottom: 0; border-left: 1px dashed #e2e8f0; pointer-events: none;"></div>`;
    });

    const todayPct = (showEventGanttTodayLine && todayTime >= viewStart && todayTime <= viewEnd)
        ? ((todayTime - viewStart) / viewDuration) * 100
        : null;

    const calcPos = (dStr) => {
        const pureDate = getSafeEventDate(dStr);
        if (!pureDate) return null;
        return ((pureDate.getTime() - viewStart) / viewDuration) * 100;
    };

    const eventsByPhase = new Map();
    events.forEach(ev => {
        const pId = ev.fk_t02;
        if (!eventsByPhase.has(pId)) eventsByPhase.set(pId, []);
        eventsByPhase.get(pId).push(ev);
    });

    eventsByPhase.forEach((evList) => {
        evList.sort((a, b) => {
            const da = a.ev_start_date ? new Date(a.ev_start_date.replace(' ', 'T')).getTime() : Infinity;
            const db = b.ev_start_date ? new Date(b.ev_start_date.replace(' ', 'T')).getTime() : Infinity;
            return da - db;
        });
    });

    let leftColumnRowsHtml = '';
    let rightTrackRowsHtml = '';
    let globalRowIndex = 0;

    const canViewPhase = (typeof currentProjectRight !== 'undefined' && currentProjectRight !== 'EVENT ONLY');

    eventsByPhase.forEach((evList, pId) => {
        const targetPhase = phases.find(p => p.pk_t02 === pId);
        const pName = targetPhase ? `P${targetPhase.ph_sequence}. ${targetPhase.ph_name}` : `Phase #${pId}`;
        const isPhaseFrozen = targetPhase ? Boolean(targetPhase.ph_frozen) : false;
        const isPhaseDel = targetPhase ? Boolean(targetPhase.ph_ignore_delete) : false;

        // 1. 繪製 Phase Baseline 列
        if (showEventGanttPhaseLine && targetPhase) {
            const ptStartRaw = calcPos(targetPhase.ph_target_start);
            const ptEndRaw = calcPos(targetPhase.ph_target_end);
            const paStartRaw = calcPos(targetPhase.ph_actual_start);
            const paEndRaw = calcPos(targetPhase.ph_actual_end);

            let phTargetBarHtml = '';
            if (ptStartRaw !== null && ptEndRaw !== null && ptEndRaw >= ptStartRaw) {
                const left = Math.max(ptStartRaw, 0);
                const right = Math.min(ptEndRaw, 100);
                const width = Math.max(right - left, 1.5);
                if (right >= 0 && left <= 100) {
                    phTargetBarHtml = `<div class="gantt-bar target" style="left: ${left.toFixed(2)}%; width: ${width.toFixed(2)}%; top: 4px; position: absolute; height: 11px; border-radius: 2px; background: #38bdf8; border: 1px solid #0284c7; z-index: 2;" title="Phase Target: ${getSafeEventDateStr(targetPhase.ph_target_start)} ~ ${getSafeEventDateStr(targetPhase.ph_target_end)}"></div>`;
                }
            }

            let phActualBarHtml = '';
            if (paStartRaw !== null && paEndRaw !== null && paEndRaw >= paStartRaw) {
                const left = Math.max(paStartRaw, 0);
                const right = Math.min(paEndRaw, 100);
                const width = Math.max(right - left, 1.5);
                if (right >= 0 && left <= 100) {
                    phActualBarHtml = `<div class="gantt-bar actual" style="left: ${left.toFixed(2)}%; width: ${width.toFixed(2)}%; top: 18px; position: absolute; height: 11px; border-radius: 2px; background: #1d4ed8; border: 1px solid #1e40af; z-index: 2;" title="Phase Actual: ${getSafeEventDateStr(targetPhase.ph_actual_start)} ~ ${getSafeEventDateStr(targetPhase.ph_actual_end)}"></div>`;
                }
            }

            let rowTodayLineHtml = '';
            if (todayPct !== null) {
                rowTodayLineHtml = `<div class="pb-gantt-today-line" style="left: ${todayPct.toFixed(2)}%;"></div>`;
            }

            const viewPhaseBtnHtml = canViewPhase ? `
                <button type="button" class="btn-link" style="margin-left: 8px; font-size: 11px; color: #0284c7; text-decoration: underline; background: none; border: none; cursor: pointer; padding: 0;" 
                        onclick="switchView('project-phase')" title="Jump to Project Phase Management">[View]</button>
            ` : '';

            // ★ 統一採用 .is-frozen (精確 1px 細紅框，無粗邊)
            const phaseRowClass = `pb-gantt-left-row event-gantt-left-row ${isPhaseFrozen ? 'is-frozen' : ''} ${isPhaseDel ? 'is-deleted' : ''}`;
            const phaseRightClass = `pb-gantt-right-row event-gantt-right-row ${isPhaseFrozen ? 'is-frozen' : ''} ${isPhaseDel ? 'is-deleted' : ''}`;

            leftColumnRowsHtml += `
                <div class="${phaseRowClass}" style="min-height: 40px; padding: 4px 8px; display: flex; align-items: center; ${!isPhaseFrozen ? 'background: #f8fafc; border-color: #e2e8f0;' : ''}">
                    <div style="font-size: 12px; font-weight: 700; line-height: 1.35; word-break: break-word; color: ${isPhaseFrozen ? '#b91c1c' : '#1e3a8a'}; width: 100%;">
                        📁 ${escapeHtml(pName)}
                        ${isPhaseFrozen ? '<span style="color:#ef4444; font-size:10px; font-weight:700; margin-left: 4px;">[Frozen]</span>' : ''}
                        ${isPhaseDel ? '<span style="color:#94a3b8; font-size:10px; margin-left: 4px;">[Deleted]</span>' : ''}
                        ${viewPhaseBtnHtml}
                    </div>
                </div>
            `;

            rightTrackRowsHtml += `
                <div class="${phaseRightClass}" style="min-height: 40px; position: relative; ${!isPhaseFrozen ? 'background: #f8fafc; border-color: #e2e8f0;' : ''}">
                    <div style="height: 100%; width: 100%; position: relative; overflow: visible;">
                        ${gridLinesHtml}
                        ${rowTodayLineHtml}
                        ${phTargetBarHtml}
                        ${phActualBarHtml}
                    </div>
                </div>
            `;

            globalRowIndex++;
        }

        // 2. 繪製 Event 列
        evList.forEach(ev => {
            const tStartRaw = calcPos(ev.ev_start_date);
            const tEndRaw = calcPos(ev.ev_end_date);
            const isDel = isEventDeleted(ev);
            const isEventFrozen = Boolean(ev.ev_frozen);
            const isEffectiveFrozen = (isPhaseFrozen || isEventFrozen);
            const pIdVal = getParentId(ev);
            const isSub = (pIdVal !== null);

            const depth = ev.depth_level ? Number(ev.depth_level) : (isSub ? 2 : 1);
            const indentPx = isSub ? Math.min((depth - 1) * 14 + 10, 42) : 6;
            const prefixTag = isSub ? `↳ [Sub L${depth}] ` : '↳ ';

            let eventBarHtml = '';
            if (tStartRaw !== null && tEndRaw !== null && tEndRaw >= tStartRaw) {
                const left = Math.max(tStartRaw, 0);
                const right = Math.min(tEndRaw, 100);
                const width = Math.max(right - left, 1.5);
                if (right >= 0 && left <= 100) {
                    let barBg = '#22c55e';
                    let barBorder = '#16a34a';
                    let barOpacity = '1';

                    if (isDel) {
                        barBg = 'repeating-linear-gradient(45deg, #f87171, #f87171 8px, #ef4444 8px, #ef4444 16px)';
                        barBorder = '#dc2626';
                        barOpacity = '0.65';
                    }

                    eventBarHtml = `
                        <div class="gantt-bar event" 
                             style="left: ${left.toFixed(2)}%; width: ${width.toFixed(2)}%; top: 11px; position: absolute; height: 16px; border-radius: 3px; background: ${barBg}; border: 1px solid ${barBorder}; opacity: ${barOpacity}; z-index: 2; cursor: pointer;"
                             title="${escapeHtml(ev.ev_title)}\nTimeline: ${getSafeEventDateTimeStr(ev.ev_start_date)} ~ ${getSafeEventDateTimeStr(ev.ev_end_date)}\nStatus: ${safeStr(ev.ev_status)}${isEffectiveFrozen ? ' [Frozen]' : ''}">
                        </div>
                    `;
                }
            }

            const emptyNotice = (!eventBarHtml) 
                ? '<span class="gantt-bar-empty" style="position: absolute; left: 10px; top: 11px; font-size: 11px; color: #94a3b8; font-style: italic;">[No Date Specified]</span>' 
                : '';

            let rowTodayLineHtml = '';
            if (todayPct !== null) {
                rowTodayLineHtml = `<div class="pb-gantt-today-line" style="left: ${todayPct.toFixed(2)}%;"></div>`;
            }

            // ★ 修正：統一掛載 .is-frozen，徹底消除 4px 粗邊，右側軌道左邊框徹底回歸正常
            const eventRowClass = `pb-gantt-left-row event-gantt-left-row ${isEffectiveFrozen ? 'is-frozen' : ''} ${isDel ? 'is-deleted' : ''}`;
            const eventRightClass = `pb-gantt-right-row event-gantt-right-row ${isEffectiveFrozen ? 'is-frozen' : ''} ${isDel ? 'is-deleted' : ''}`;

            let frozenTagHtml = '';
            if (isPhaseFrozen) {
                frozenTagHtml = '<span style="color:#ef4444; font-size:10px; margin-left: 4px;">[Phase Frozen]</span>';
            } else if (isEventFrozen) {
                frozenTagHtml = '<span style="color:#ef4444; font-size:10px; margin-left: 4px;">[Frozen]</span>';
            }

            leftColumnRowsHtml += `
                <div class="${eventRowClass}" style="padding: 5px 8px 5px ${indentPx}px; display: flex; align-items: center;">
                    <div style="font-size: 12px; line-height: 1.35; word-break: break-word; cursor: pointer; text-decoration: underline; color: #1e293b; width: 100%;"
                         onclick="scrollToEventCard(${ev.pk_t03})"
                         title="Click to jump to Event card: ${escapeHtml(ev.ev_title)}">
                        <span style="color: #64748b; font-weight: 600;">${prefixTag}</span>${escapeHtml(ev.ev_title)}
                        ${frozenTagHtml}
                        ${isDel ? '<span style="color:#ef4444; font-size:10px; margin-left: 4px;">[Deleted]</span>' : ''}
                    </div>
                </div>
            `;

            rightTrackRowsHtml += `
                <div class="${eventRightClass}" style="position: relative;">
                    <div style="height: 100%; width: 100%; position: relative; overflow: visible;">
                        ${gridLinesHtml}
                        ${rowTodayLineHtml}
                        ${emptyNotice}
                        ${eventBarHtml}
                    </div>
                </div>
            `;

            globalRowIndex++;
        });
    });

    let yearOptions = '';
    const minSelectYear = minStartYearFound ? Math.min(minStartYearFound, currentYear - 1) : currentYear - 1;
    const maxSelectYear = Math.max(maxEndYearFound ? maxEndYearFound : currentYear + 5, currentYear + 5);
    for (let y = minSelectYear; y <= maxSelectYear; y++) {
        yearOptions += `<option value="${y}" ${y === eventGanttToYear ? 'selected' : ''}>${y}</option>`;
    }

    const todayDateStr = new Date().toISOString().substring(0, 10);
    const headerTodayBadge = (todayPct !== null)
        ? `<div class="pb-gantt-today-badge" style="left: ${todayPct.toFixed(2)}%;">Today (${todayDateStr})</div>`
        : '';

    return `
        <div class="pb-gantt-header phase-gantt-header">
            <span class="pb-gantt-title phase-gantt-title">Event Schedule Timeline</span>
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155;">
                    <span>View Mode:</span>
                    <select id="selEventGanttMode" style="padding: 2px 6px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" onchange="handleEventGanttModeChange(this.value)">
                        <option value="ADAPTIVE" ${eventGanttScaleMode === 'ADAPTIVE' ? 'selected' : ''}>Adaptive Width</option>
                        <option value="SCROLLABLE" ${eventGanttScaleMode === 'SCROLLABLE' ? 'selected' : ''}>Fixed Step</option>
                    </select>
                </div>

                <div id="wrapEventGanttUnit" style="display: ${isScrollable ? 'flex' : 'none'}; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155;">
                    <span>Scale:</span>
                    <select id="selEventGanttUnit" style="padding: 2px 6px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" onchange="handleEventGanttUnitChange(this.value)">
                        <option value="HOURLY" ${eventGanttScaleUnit === 'HOURLY' ? 'selected' : ''}>Hourly (每小時)</option>
                        <option value="DAILY" ${eventGanttScaleUnit === 'DAILY' ? 'selected' : ''}>Daily (每日)</option>
                        <option value="WEEK" ${eventGanttScaleUnit === 'WEEK' ? 'selected' : ''}>Weekly (每星期)</option>
                        <option value="MONTH" ${eventGanttScaleUnit === 'MONTH' ? 'selected' : ''}>Monthly (每月)</option>
                        <option value="YEAR" ${eventGanttScaleUnit === 'YEAR' ? 'selected' : ''}>Yearly (每年)</option>
                    </select>
                </div>

                <!-- 1. Horizon 年份選單：僅在 Fixed Step 且 Scale 為 Weekly / Monthly / Yearly 時顯示 -->
                <div id="wrapEventGanttHorizon" style="display: ${isScrollable && !isDayOrHourScale ? 'flex' : 'none'}; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155; background: #f8fafc; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <span>Horizon: Until End of</span>
                    <select id="selEventGanttHorizon" style="padding: 2px 4px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" onchange="handleEventGanttHorizonChange(this.value)">
                        ${yearOptions}
                    </select>
                </div>

                <!-- 2. From / To 日期區間：僅在 Fixed Step 且 Scale 為 Hourly / Daily 時顯示 -->
                <div id="wrapEventGanttDateRange" style="display: ${isScrollable && isDayOrHourScale ? 'flex' : 'none'}; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #334155; background: #f8fafc; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <span>From:</span>
                    <input type="date" id="selEventGanttStartDate" value="${eventGanttFixedStartDate}" style="padding: 2px 4px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" onchange="handleEventGanttDateRangeChange('start', this.value)">
                    <span>To:</span>
                    <input type="date" id="selEventGanttEndDate" value="${eventGanttFixedEndDate}" style="padding: 2px 4px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" onchange="handleEventGanttDateRangeChange('end', this.value)">
                </div>

                <label style="display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #b91c1c; cursor: pointer;">
                    <input type="checkbox" id="chkEventGanttToday" ${showEventGanttTodayLine ? 'checked' : ''} onchange="toggleEventGanttTodayLine(this)">
                    <span>🔴 Today Line</span>
                </label>
                <label style="display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155; cursor: pointer;">
                    <input type="checkbox" id="chkEventGanttPhase" ${showEventGanttPhaseLine ? 'checked' : ''} onchange="toggleEventGanttPhaseLine(this)">
                    <span>Show Phase Baseline</span>
                </label>

                <div style="display: flex; align-items: center; gap: 10px; font-size: 11px; color: #64748b;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="display: inline-block; width: 12px; height: 7px; border-radius: 2px; background: #38bdf8; border: 1px solid #0284c7;"></span>
                        <span>Phase Target</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="display: inline-block; width: 12px; height: 7px; border-radius: 2px; background: #1d4ed8; border: 1px solid #1e40af;"></span>
                        <span>Phase Actual</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="display: inline-block; width: 12px; height: 7px; border-radius: 2px; background: #22c55e; border: 1px solid #16a34a;"></span>
                        <span>Event</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="display: inline-block; width: 10px; height: 10px; background: #fff5f5; border: 1px solid #fca5a5; border-radius: 2px;"></span>
                        <span>Frozen/Deleted</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="pb-gantt-split-wrap">
            <div class="pb-gantt-left-col">
                <div class="pb-gantt-col-header">Phase / Event Hierarchy</div>
                <div style="padding: 6px 0;">
                    ${leftColumnRowsHtml}
                </div>
            </div>

            <div style="flex: 1; min-width: 0; ${trackContainerStyle}">
                <div style="${trackInnerWidthStyle}">
                    <div style="height: 24px; position: relative; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">
                        ${markersHtml}
                        ${headerTodayBadge}
                    </div>
                    <div style="padding: 6px 0;">
                        ${rightTrackRowsHtml}
                    </div>
                </div>
            </div>
        </div>

        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E" style="display:none;" onerror="syncEventGanttRowHeights()">
    `;
}

function syncEventGanttRowHeights() {
    setTimeout(function() {
        const leftRows = document.querySelectorAll('.event-gantt-left-row');
        const rightRows = document.querySelectorAll('.event-gantt-right-row');
        if (!leftRows || !rightRows || leftRows.length !== rightRows.length) return;

        for (let i = 0; i < leftRows.length; i++) {
            leftRows[i].style.height = 'auto';
            rightRows[i].style.height = 'auto';

            const leftH = leftRows[i].offsetHeight;
            const rightH = rightRows[i].offsetHeight;
            const maxH = Math.max(leftH, rightH, 38);

            leftRows[i].style.height = maxH + 'px';
            rightRows[i].style.height = maxH + 'px';

            const eventBar = rightRows[i].querySelector('.gantt-bar.event');
            const targetBar = rightRows[i].querySelector('.gantt-bar.target');
            const actualBar = rightRows[i].querySelector('.gantt-bar.actual');
            const emptyNotice = rightRows[i].querySelector('.gantt-bar-empty');

            if (eventBar) {
                eventBar.style.top = Math.max(Math.round((maxH - 16) / 2), 4) + 'px';
            } else if (targetBar && actualBar) {
                const topStart = Math.max(Math.round((maxH - 26) / 2), 3);
                targetBar.style.top = topStart + 'px';
                actualBar.style.top = (topStart + 14) + 'px';
            }

            if (emptyNotice) {
                emptyNotice.style.top = Math.max(Math.round((maxH - 16) / 2), 6) + 'px';
            }
        }
    }, 0);
}

function handleEventGanttModeChange(mode) {
    eventGanttScaleMode = mode;
    refreshEventGanttChart();
}

function handleEventGanttUnitChange(unit) {
    eventGanttScaleUnit = unit;
    refreshEventGanttChart();
}

function handleEventGanttHorizonChange(year) {
    eventGanttToYear = parseInt(year, 10);
    refreshEventGanttChart();
}

function handleEventGanttDateRangeChange(type, val) {
    if (type === 'start') eventGanttFixedStartDate = val;
    else eventGanttFixedEndDate = val;
    refreshEventGanttChart();
}

function generateEventFixedMarks(viewStart, viewEnd, unit) {
    const marks = [];
    const totalDuration = viewEnd - viewStart;

    let pixelPerStep = 90;
    if (unit === 'HOURLY') pixelPerStep = 35;
    else if (unit === 'DAILY') pixelPerStep = 45;
    else if (unit === 'WEEK') pixelPerStep = 65;
    else if (unit === 'MONTH') pixelPerStep = 85;
    else if (unit === 'YEAR') pixelPerStep = 130;

    const cur = new Date(viewStart);

    if (unit === 'HOURLY') cur.setMinutes(0, 0, 0);
    else if (unit === 'DAILY') cur.setHours(0, 0, 0, 0);
    else if (unit === 'WEEK') {
        cur.setDate(cur.getDate() - cur.getDay() + 1);
        cur.setHours(0, 0, 0, 0);
    } else if (unit === 'MONTH') {
        cur.setDate(1);
        cur.setHours(0, 0, 0, 0);
    } else {
        cur.setMonth(0, 1);
        cur.setHours(0, 0, 0, 0);
    }

    let stepCount = 0;
    const maxStepsAllowed = 1500;

    while (cur.getTime() <= viewEnd && stepCount < maxStepsAllowed) {
        const t = cur.getTime();
        if (t >= viewStart) {
            const pct = ((t - viewStart) / totalDuration) * 100;
            let label = '';

            if (unit === 'HOURLY') {
                const hh = String(cur.getHours()).padStart(2, '0');
                label = `${hh}:00`;
            } else if (unit === 'DAILY') {
                const mm = String(cur.getMonth() + 1).padStart(2, '0');
                const dd = String(cur.getDate()).padStart(2, '0');
                label = `${mm}-${dd}`;
            } else if (unit === 'WEEK') {
                label = (cur.getMonth() + 1) + '/' + cur.getDate();
            } else if (unit === 'MONTH') {
                label = cur.getFullYear() + '-' + ('0' + (cur.getMonth() + 1)).slice(-2);
            } else {
                label = String(cur.getFullYear());
            }

            marks.push({ pct: pct, label: label });
            stepCount++;
        }

        if (unit === 'HOURLY') cur.setHours(cur.getHours() + 1);
        else if (unit === 'DAILY') cur.setDate(cur.getDate() + 1);
        else if (unit === 'WEEK') cur.setDate(cur.getDate() + 7);
        else if (unit === 'MONTH') cur.setMonth(cur.getMonth() + 1);
        else cur.setFullYear(cur.getFullYear() + 1);
    }

    const totalWidth = Math.max(stepCount * pixelPerStep, 1000);
    return { marks: marks, totalWidth: totalWidth };
}

function scrollToEventCard(pkT03) {
    if (typeof window.ensureEventCardVisible === 'function') {
        window.ensureEventCardVisible(pkT03);
    }

    setTimeout(() => {
        const card = document.getElementById(`eventCard_${pkT03}`);
        if (!card) {
            alert('Event card is currently filtered out or not loaded.');
            return;
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const originalBorder = card.style.border;
        const originalBoxShadow = card.style.boxShadow;
        card.style.transition = 'all 0.3s ease';
        card.style.border = '2px solid #f59e0b';
        card.style.boxShadow = '0 0 16px rgba(245, 158, 11, 0.45)';
        setTimeout(() => {
            card.style.border = originalBorder;
            card.style.boxShadow = originalBoxShadow;
        }, 2000);
    }, 50);
}