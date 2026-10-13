// ==========================================================================
// ProjectBook - Phase Gantt Chart Submodule
// File: /public/js/portal-function-phase-GanttChart.js
// Standard: Dual Column Split, Auto Word-Wrap & Unified Gantt Styling
// ==========================================================================

let showPhaseGanttTodayLine = true;
let phaseGanttScaleMode = 'ADAPTIVE'; // 'ADAPTIVE' | 'SCROLLABLE'
let phaseGanttScaleUnit = 'MONTH';    // 'WEEK' | 'MONTH' | 'YEAR'
let phaseGanttToYear = null;
let cachedPhasesForGantt = [];

function safeStr(val, defaultVal) {
    var def = defaultVal !== undefined ? defaultVal : '-';
    return (val !== null && val !== undefined && String(val).trim() !== '') ? val : def;
}

function getSafeDate(dStr) {
    if (typeof parsePureDate === 'function') {
        return parsePureDate(dStr);
    }
    if (!dStr) return null;
    var d = new Date(String(dStr).substring(0, 10).replace(/-/g, '/') + ' 00:00:00');
    return isNaN(d.getTime()) ? null : d;
}

function getSafeDateStr(dStr) {
    if (typeof formatDate === 'function') {
        return formatDate(dStr);
    }
    return dStr ? String(dStr).substring(0, 10) : '-';
}

function renderPhaseGanttChart(phases) {
    cachedPhasesForGantt = phases ? phases : [];
    setTimeout(syncPhaseGanttRowHeights, 0);
    return `
        <div class="pb-gantt-card phase-gantt-card" id="phaseGanttWrapperZone">
            ${renderPhaseGanttChartInner(cachedPhasesForGantt)}
        </div>
    `;
}

function refreshPhaseGanttChart() {
    const ganttContainer = document.getElementById('phaseGanttWrapperZone');
    if (ganttContainer) {
        ganttContainer.innerHTML = renderPhaseGanttChartInner(cachedPhasesForGantt);
        syncPhaseGanttRowHeights();
    }
}

function togglePhaseGanttTodayLine(checkbox) {
    showPhaseGanttTodayLine = checkbox.checked;
    refreshPhaseGanttChart();
}

function renderPhaseGanttChartInner(phases) {
    if (!phases || phases.length === 0) {
        return `
            <div class="pb-gantt-header phase-gantt-header">
                <span class="pb-gantt-title phase-gantt-title">Phase Schedule Baseline (Target vs Actual)</span>
            </div>
            <div style="font-size: 13px; color: #a0aec0; padding: 12px 0;">No phases registered for timeline calculation.</div>
        `;
    }

    cachedPhasesForGantt = phases;

    let minTime = Infinity;
    let maxTime = -Infinity;
    let hasValidDate = false;
    let minStartYearFound = null;
    let maxEndYearFound = null;

    phases.forEach(ph => {
        const dates = [ph.ph_target_start, ph.ph_target_end, ph.ph_actual_start, ph.ph_actual_end];
        dates.forEach(d => {
            const pureDate = getSafeDate(d);
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

    if (!hasValidDate || minTime >= maxTime) {
        return `
            <div class="pb-gantt-header phase-gantt-header">
                <span class="pb-gantt-title phase-gantt-title">Phase Schedule Baseline (Target vs Actual)</span>
            </div>
            <div style="font-size: 13px; color: #a0aec0; padding: 12px 0;">No valid target or actual dates specified to render timeline.</div>
        `;
    }

    const todayDate = getSafeDate(new Date().toISOString().substring(0, 10));
    const todayTime = todayDate ? todayDate.getTime() : Date.now();
    const currentYear = new Date().getFullYear();

    const smartDefaultToYear = maxEndYearFound ? Math.min(maxEndYearFound, currentYear + 3) : currentYear + 3;
    if (phaseGanttToYear === null) {
        phaseGanttToYear = smartDefaultToYear;
    }

    let viewStart, viewEnd, viewDuration;
    let timeMarks = [];
    let trackInnerWidthStyle = 'width: 100%;';
    let trackContainerStyle = 'overflow-x: hidden;';

    if (phaseGanttScaleMode === 'ADAPTIVE') {
        let effectiveMin = minTime;
        let effectiveMax = maxTime;

        if (showPhaseGanttTodayLine) {
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
        const earliestBound = Math.min(minTime, todayTime);
        const leadBuffer = 14 * 24 * 3600 * 1000;
        viewStart = earliestBound - leadBuffer;

        viewEnd = new Date(phaseGanttToYear, 11, 31, 23, 59, 59).getTime();
        if (viewEnd <= viewStart) viewEnd = viewStart + (90 * 24 * 3600 * 1000);
        viewDuration = viewEnd - viewStart;

        const fixedMarksData = generatePhaseFixedMarks(viewStart, viewEnd, phaseGanttScaleUnit);
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

    const todayPct = (showPhaseGanttTodayLine && todayTime >= viewStart && todayTime <= viewEnd)
        ? ((todayTime - viewStart) / viewDuration) * 100
        : null;

    const calcPos = (dStr) => {
        const pureDate = getSafeDate(dStr);
        if (!pureDate) return null;
        const t = pureDate.getTime();
        return ((t - viewStart) / viewDuration) * 100;
    };

    let leftColumnRowsHtml = '';
    let rightTrackRowsHtml = '';

    phases.forEach((ph, index) => {
        const isFrozen = Boolean(ph.ph_frozen);
        const isDeleted = (typeof isPhaseDeleted === 'function') ? isPhaseDeleted(ph) : Boolean(ph.ph_ignore_delete);

        const leftRowClass = `pb-gantt-left-row phase-gantt-left-row ${isFrozen ? 'is-frozen' : ''} ${isDeleted ? 'is-deleted' : ''}`;
        const rightRowClass = `pb-gantt-right-row phase-gantt-right-row ${isFrozen ? 'is-frozen' : ''} ${isDeleted ? 'is-deleted' : ''}`;

        const labelColor = isFrozen ? 'color: #b91c1c;' : 'color: #1e3a8a;';
        const normalBgStyle = !isFrozen ? 'background: #f8fafc; border-color: #e2e8f0;' : '';

        leftColumnRowsHtml += `
            <div class="${leftRowClass}" style="min-height: 48px; padding: 6px 10px; display: flex; align-items: center; ${normalBgStyle}">
                <div style="font-size: 12px; font-weight: 600; line-height: 1.4; word-break: break-word; ${labelColor}; cursor: pointer; text-decoration: underline; width: 100%;" 
                     onclick="scrollToPhaseCard(${ph.pk_t02})"
                     title="Click to jump to Phase card: P${ph.ph_sequence}. ${escapeHtml(ph.ph_name)}">
                    P${ph.ph_sequence}. ${escapeHtml(ph.ph_name)} 
                    ${isFrozen ? '<span style="color:#ef4444; font-size:10px; font-weight:700; margin-left: 4px;">[Frozen]</span>' : ''}
                    ${isDeleted ? '<span style="color:#94a3b8; font-size:10px; margin-left: 4px;">[Deleted]</span>' : ''}
                </div>
            </div>
        `;

        const tStartRaw = calcPos(ph.ph_target_start);
        const tEndRaw = calcPos(ph.ph_target_end);
        const aStartRaw = calcPos(ph.ph_actual_start);
        const aEndRaw = calcPos(ph.ph_actual_end);

        let targetBarHtml = '';
        if (tStartRaw !== null && tEndRaw !== null && tEndRaw >= tStartRaw) {
            const left = Math.max(tStartRaw, 0);
            const right = Math.min(tEndRaw, 100);
            const width = Math.max(right - left, 1.5);
            if (right >= 0 && left <= 100) {
                targetBarHtml = `
                    <div class="gantt-bar target" 
                         style="left: ${left.toFixed(2)}%; width: ${width.toFixed(2)}%; top: 6px; position: absolute; height: 14px; border-radius: 3px; background: #38bdf8; border: 1px solid #0284c7; z-index: 2;"
                         title="Target: ${getSafeDateStr(ph.ph_target_start)} ~ ${getSafeDateStr(ph.ph_target_end)}">
                    </div>
                `;
            }
        }

        let actualBarHtml = '';
        if (aStartRaw !== null && aEndRaw !== null && aEndRaw >= aStartRaw) {
            const left = Math.max(aStartRaw, 0);
            const right = Math.min(aEndRaw, 100);
            const width = Math.max(right - left, 1.5);
            if (right >= 0 && left <= 100) {
                actualBarHtml = `
                    <div class="gantt-bar actual" 
                         style="left: ${left.toFixed(2)}%; width: ${width.toFixed(2)}%; top: 24px; position: absolute; height: 14px; border-radius: 3px; background: #34d399; border: 1px solid #059669; z-index: 2;"
                         title="Actual: ${getSafeDateStr(ph.ph_actual_start)} ~ ${getSafeDateStr(ph.ph_actual_end)}">
                    </div>
                `;
            }
        }

        const emptyNotice = (!targetBarHtml && !actualBarHtml) 
            ? '<span class="gantt-bar-empty" style="position: absolute; left: 10px; top: 16px; font-size: 11px; color: #94a3b8; font-style: italic;">[No Timeline Specified]</span>' 
            : '';

        let rowTodayLineHtml = '';
        if (todayPct !== null) {
            rowTodayLineHtml = `<div class="pb-gantt-today-line" style="left: ${todayPct}%;"></div>`;
        }

        rightTrackRowsHtml += `
            <div class="${rightRowClass}" style="min-height: 48px; position: relative; ${normalBgStyle}">
                <div style="height: 100%; width: 100%; position: relative; overflow: visible;">
                    ${gridLinesHtml}
                    ${rowTodayLineHtml}
                    ${emptyNotice}
                    ${targetBarHtml}
                    ${actualBarHtml}
                </div>
            </div>
        `;
    });

    const isScrollable = (phaseGanttScaleMode === 'SCROLLABLE');

    let yearOptions = '';
    const minSelectYear = minStartYearFound ? Math.min(minStartYearFound, currentYear - 1) : currentYear - 1;
    const maxSelectYear = Math.max(maxEndYearFound ? maxEndYearFound : currentYear + 5, currentYear + 5);
    for (let y = minSelectYear; y <= maxSelectYear; y++) {
        yearOptions += `<option value="${y}" ${y === phaseGanttToYear ? 'selected' : ''}>${y}</option>`;
    }

    const todayDateStr = new Date().toISOString().substring(0, 10);
    const headerTodayBadge = (todayPct !== null)
        ? `<div class="pb-gantt-today-badge" style="left: ${todayPct}%;">Today (${todayDateStr})</div>`
        : '';

    return `
        <div class="pb-gantt-header phase-gantt-header">
            <span class="pb-gantt-title phase-gantt-title">Phase Schedule Baseline (Target vs Actual)</span>
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155;">
                    <span>View Mode:</span>
                    <select id="selPhaseGanttMode" style="padding: 2px 6px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" onchange="handlePhaseGanttModeChange(this.value)">
                        <option value="ADAPTIVE" ${phaseGanttScaleMode === 'ADAPTIVE' ? 'selected' : ''}>Adaptive Width</option>
                        <option value="SCROLLABLE" ${phaseGanttScaleMode === 'SCROLLABLE' ? 'selected' : ''}>Fixed Step</option>
                    </select>
                </div>

                <div id="wrapPhaseGanttUnit" style="display: ${isScrollable ? 'flex' : 'none'}; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155;">
                    <span>Scale:</span>
                    <select id="selPhaseGanttUnit" style="padding: 2px 6px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" onchange="handlePhaseGanttUnitChange(this.value)">
                        <option value="WEEK" ${phaseGanttScaleUnit === 'WEEK' ? 'selected' : ''}>Weekly (每星期)</option>
                        <option value="MONTH" ${phaseGanttScaleUnit === 'MONTH' ? 'selected' : ''}>Monthly (每月)</option>
                        <option value="YEAR" ${phaseGanttScaleUnit === 'YEAR' ? 'selected' : ''}>Yearly (每年)</option>
                    </select>
                </div>

                <div id="wrapPhaseGanttHorizon" style="display: ${isScrollable ? 'flex' : 'none'}; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155; background: #f8fafc; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <span>Horizon: Until End of</span>
                    <select id="selPhaseGanttHorizon" style="padding: 2px 4px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;" onchange="handlePhaseGanttHorizonChange(this.value)">
                        ${yearOptions}
                    </select>
                </div>

                <label style="display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #b91c1c; cursor: pointer;">
                    <input type="checkbox" id="chkPhaseGanttToday" ${showPhaseGanttTodayLine ? 'checked' : ''} onchange="togglePhaseGanttTodayLine(this)">
                    <span>🔴 Today Line</span>
                </label>

                <div style="display: flex; align-items: center; gap: 10px; font-size: 11px; color: #64748b;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="display: inline-block; width: 12px; height: 8px; border-radius: 2px; background: #38bdf8; border: 1px solid #0284c7;"></span>
                        <span>Target Timeline</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="display: inline-block; width: 12px; height: 8px; border-radius: 2px; background: #34d399; border: 1px solid #059669;"></span>
                        <span>Actual Timeline</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="display: inline-block; width: 10px; height: 10px; background: #fff5f5; border: 1px solid #fca5a5; border-radius: 2px;"></span>
                        <span>Frozen Row</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="pb-gantt-split-wrap">
            <div class="pb-gantt-left-col" style="width: 220px; min-width: 220px; max-width: 220px;">
                <div class="pb-gantt-col-header">Phase / Milestone</div>
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

        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E" style="display:none;" onerror="syncPhaseGanttRowHeights()">
    `;
}

function syncPhaseGanttRowHeights() {
    setTimeout(function() {
        const leftRows = document.querySelectorAll('.phase-gantt-left-row');
        const rightRows = document.querySelectorAll('.phase-gantt-right-row');
        if (!leftRows || !rightRows || leftRows.length !== rightRows.length) return;

        for (let i = 0; i < leftRows.length; i++) {
            leftRows[i].style.height = 'auto';
            rightRows[i].style.height = 'auto';

            const leftH = leftRows[i].offsetHeight;
            const rightH = rightRows[i].offsetHeight;
            const maxH = Math.max(leftH, rightH, 48);

            leftRows[i].style.height = maxH + 'px';
            rightRows[i].style.height = maxH + 'px';

            const targetBar = rightRows[i].querySelector('.gantt-bar.target');
            const actualBar = rightRows[i].querySelector('.gantt-bar.actual');
            const emptyNotice = rightRows[i].querySelector('.gantt-bar-empty');

            if (targetBar && actualBar) {
                const topStart = Math.max(Math.round((maxH - 34) / 2), 4);
                targetBar.style.top = topStart + 'px';
                actualBar.style.top = (topStart + 18) + 'px';
            } else if (targetBar) {
                targetBar.style.top = Math.max(Math.round((maxH - 14) / 2), 6) + 'px';
            } else if (actualBar) {
                actualBar.style.top = Math.max(Math.round((maxH - 14) / 2), 6) + 'px';
            }

            if (emptyNotice) {
                emptyNotice.style.top = Math.max(Math.round((maxH - 16) / 2), 8) + 'px';
            }
        }
    }, 0);
}

function handlePhaseGanttModeChange(mode) {
    phaseGanttScaleMode = mode;
    refreshPhaseGanttChart();
}

function handlePhaseGanttUnitChange(unit) {
    phaseGanttScaleUnit = unit;
    refreshPhaseGanttChart();
}

function handlePhaseGanttHorizonChange(year) {
    phaseGanttToYear = parseInt(year, 10);
    refreshPhaseGanttChart();
}

function generatePhaseFixedMarks(viewStart, viewEnd, unit) {
    const marks = [];
    const totalDuration = viewEnd - viewStart;

    let pixelPerStep = 90;
    if (unit === 'WEEK') pixelPerStep = 65;
    else if (unit === 'MONTH') pixelPerStep = 85;
    else if (unit === 'YEAR') pixelPerStep = 130;

    const cur = new Date(viewStart);
    if (unit === 'WEEK') cur.setDate(cur.getDate() - cur.getDay() + 1);
    else if (unit === 'MONTH') cur.setDate(1);
    else cur.setMonth(0, 1);

    let stepCount = 0;
    while (cur.getTime() <= viewEnd) {
        const t = cur.getTime();
        if (t >= viewStart) {
            const pct = ((t - viewStart) / totalDuration) * 100;
            let label = '';
            if (unit === 'WEEK') label = (cur.getMonth() + 1) + '/' + cur.getDate();
            else if (unit === 'MONTH') label = cur.getFullYear() + '-' + ('0' + (cur.getMonth() + 1)).slice(-2);
            else label = String(cur.getFullYear());
            marks.push({ pct: pct, label: label });
            stepCount++;
        }

        if (unit === 'WEEK') cur.setDate(cur.getDate() + 7);
        else if (unit === 'MONTH') cur.setMonth(cur.getMonth() + 1);
        else cur.setFullYear(cur.getFullYear() + 1);
    }

    const totalWidth = Math.max(stepCount * pixelPerStep, 1000);
    return { marks: marks, totalWidth: totalWidth };
}

function scrollToPhaseCard(pkT02) {
    const card = document.getElementById(`phaseCard_${pkT02}`);
    if (!card) {
        alert('Phase card is currently hidden or deleted.');
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
}