// ==========================================================================
// ProjectBook - Project Member Roster Gantt Chart Module
// File: /public/js/portal-function-project-Member-GanttChart.js
// Standard: Dual Column Split, Auto Word-Wrap & Unified Gantt Styling
// ==========================================================================

(function(window) {
    'use strict';

    let ganttShowToday = true;
    let ganttShowDeleted = false;
    let ganttScaleMode = 'ADAPTIVE'; // 'ADAPTIVE' | 'SCROLLABLE'
    let ganttScaleUnit = 'MONTH';    // 'WEEK' | 'MONTH' | 'YEAR'

    let ganttFromYear = null;
    let ganttToYear = null;
    let cachedMemberListForGantt = [];

    function safeStr(val, defaultVal) {
        var def = defaultVal !== undefined ? defaultVal : '-';
        return (val !== null && val !== undefined && String(val).trim() !== '') ? val : def;
    }

    function calculateSmartYearWindow(memberList, currentYear) {
        let maxMemberEndYear = null;
        let minMemberStartYear = null;

        memberList.forEach(m => {
            if (m.pr_start_date) {
                const sy = parseInt(m.pr_start_date.substring(0, 4), 10);
                if (!isNaN(sy)) {
                    if (minMemberStartYear === null || sy < minMemberStartYear) minMemberStartYear = sy;
                }
            }
            if (m.pr_end_date) {
                const ey = parseInt(m.pr_end_date.substring(0, 4), 10);
                if (!isNaN(ey)) {
                    if (maxMemberEndYear === null || ey > maxMemberEndYear) maxMemberEndYear = ey;
                }
            }
        });

        const defaultFrom = currentYear;
        let defaultTo = currentYear + 3;

        if (maxMemberEndYear !== null) {
            defaultTo = Math.min(maxMemberEndYear, currentYear + 3);
            if (defaultTo < defaultFrom) defaultTo = defaultFrom;
        }

        const minYear = minMemberStartYear !== null ? Math.min(minMemberStartYear, currentYear - 1) : currentYear - 1;
        const maxYear = Math.max(maxMemberEndYear ? maxMemberEndYear : currentYear + 5, currentYear + 5);

        return {
            minYear: minYear,
            maxYear: maxYear,
            defaultFrom: defaultFrom,
            defaultTo: defaultTo
        };
    }

    function refreshMemberGanttChart(containerId) {
        renderMemberGanttChart(containerId, cachedMemberListForGantt);
    }

    function renderMemberGanttChart(containerId, memberList) {
        const container = document.getElementById(containerId);
        if (!container) return;

        cachedMemberListForGantt = memberList ? memberList : [];

        if (!memberList || memberList.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 13px;">No member schedule records available for timeline rendering.</div>';
            return;
        }

        const nowMs = Date.now();
        const nowYear = new Date().getFullYear();
        const yearCalc = calculateSmartYearWindow(memberList, nowYear);

        if (ganttFromYear === null) ganttFromYear = yearCalc.defaultFrom;
        if (ganttToYear === null) ganttToYear = yearCalc.defaultTo;
        if (ganttToYear < ganttFromYear) ganttToYear = ganttFromYear;

        const filteredList = memberList.filter(m => {
            if (!ganttShowDeleted && m.pr_ignore_delete) return false;
            return true;
        });

        if (filteredList.length === 0) {
            container.innerHTML = `
                <div class="pb-gantt-card" style="padding: 16px; margin-bottom: 20px;">
                    ${renderControlsHtml(memberList.length, 0, yearCalc)}
                    <div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 13px;">
                        No active members to display in the blueprint. (Check "Show Soft-Deleted" to inspect historical members).
                    </div>
                </div>
            `;
            bindControlEvents(containerId, memberList);
            return;
        }

        let actualMinMs = nowMs;
        let actualMaxMs = nowMs;
        let hasStart = false;
        let hasEnd = false;

        filteredList.forEach(m => {
            if (m.pr_start_date) {
                const s = new Date(m.pr_start_date.substring(0, 10).replace(/-/g, '/') + ' 00:00:00').getTime();
                if (!isNaN(s)) {
                    if (!hasStart || s < actualMinMs) actualMinMs = s;
                    hasStart = true;
                }
            }
            if (m.pr_end_date) {
                const e = new Date(m.pr_end_date.substring(0, 10).replace(/-/g, '/') + ' 23:59:59').getTime();
                if (!isNaN(e)) {
                    if (!hasEnd || e > actualMaxMs) actualMaxMs = e;
                    hasEnd = true;
                }
            }
        });

        let viewStart, viewEnd, viewDuration;
        let timeMarks = [];
        let trackInnerWidthStyle = 'width: 100%;';
        let trackContainerStyle = 'overflow-x: hidden;';

        if (ganttScaleMode === 'ADAPTIVE') {
            let effMin = Math.min(actualMinMs, nowMs);
            let effMax = Math.max(actualMaxMs, nowMs);
            const span = effMax - effMin;
            const pad = Math.max(span * 0.04, 86400000 * 3);

            viewStart = effMin - pad;
            viewEnd = effMax + pad;
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
            const earliestBound = Math.min(actualMinMs, nowMs);
            const leadBuffer = 14 * 24 * 3600 * 1000;
            viewStart = earliestBound - leadBuffer;

            viewEnd = new Date(ganttToYear, 11, 31, 23, 59, 59).getTime();
            if (viewEnd <= viewStart) viewEnd = viewStart + (90 * 24 * 3600 * 1000);
            viewDuration = viewEnd - viewStart;

            const fixedMarksData = generateFixedScaleMarks(viewStart, viewEnd, ganttScaleUnit);
            timeMarks = fixedMarksData.marks;
            const trackWidthPx = Math.max(fixedMarksData.totalWidth, 1000);

            trackInnerWidthStyle = `width: ${trackWidthPx}px; min-width: ${trackWidthPx}px;`;
            trackContainerStyle = 'overflow-x: auto; overflow-y: hidden;';
        }

        let timeMarksHtml = '';
        let gridLinesHtml = '';
        timeMarks.forEach(mk => {
            timeMarksHtml += `
                <div style="position: absolute; left: ${mk.pct.toFixed(2)}%; top: 0; transform: translateX(-50%); font-size: 11px; color: #64748b; font-family: monospace; white-space: nowrap;">
                    ${mk.label}
                </div>
            `;
            gridLinesHtml += `
                <div style="position: absolute; left: ${mk.pct.toFixed(2)}%; top: 0; bottom: 0; border-left: 1px dashed #e2e8f0; pointer-events: none;"></div>
            `;
        });

        const isTodayVisible = Boolean(ganttShowToday && nowMs >= viewStart && nowMs <= viewEnd);
        let headerTodayBadgeHtml = '';
        let rowTodayLineHtml = '';

        if (isTodayVisible) {
            const todayPct = ((nowMs - viewStart) / viewDuration) * 100;
            const todayDateStr = new Date().toISOString().substring(0, 10);

            headerTodayBadgeHtml = `
                <div class="pb-gantt-today-badge" style="left: ${todayPct.toFixed(2)}%;">
                    Today (${todayDateStr})
                </div>
            `;

            rowTodayLineHtml = `
                <div class="pb-gantt-today-line" style="left: ${todayPct.toFixed(2)}%;"></div>
            `;
        }

        const deptOfficers = filteredList.filter(m => !m.is_contractor);
        const contractors = filteredList.filter(m => m.is_contractor);

        let leftColumnRowsHtml = '';
        let rightTrackRowsHtml = '';

        if (deptOfficers.length > 0) {
            leftColumnRowsHtml += `
                <div class="member-gantt-left-row" style="background: #f1f5f9; padding: 4px 10px; font-size: 12px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; height: 28px; box-sizing: border-box; display: flex; align-items: center;">
                    🏛️ Departmental Officers (${deptOfficers.length})
                </div>
            `;
            rightTrackRowsHtml += `
                <div class="member-gantt-right-row" style="background: #f1f5f9; padding: 4px 10px; border-bottom: 1px solid #e2e8f0; height: 28px; box-sizing: border-box; position: relative;">
                    ${gridLinesHtml}
                    ${rowTodayLineHtml}
                </div>
            `;

            deptOfficers.forEach(m => {
                const rowPack = buildMemberRowSplit(m, viewStart, viewDuration, nowMs, gridLinesHtml, rowTodayLineHtml);
                leftColumnRowsHtml += rowPack.leftHtml;
                rightTrackRowsHtml += rowPack.rightHtml;
            });
        }

        if (contractors.length > 0) {
            leftColumnRowsHtml += `
                <div class="member-gantt-left-row" style="background: #f1f5f9; padding: 4px 10px; font-size: 12px; font-weight: 700; color: #0369a1; border-bottom: 1px solid #e2e8f0; height: 28px; box-sizing: border-box; display: flex; align-items: center; margin-top: ${deptOfficers.length > 0 ? '8px' : '0'};">
                    🏢 Project Contractors & Partners (${contractors.length})
                </div>
            `;
            rightTrackRowsHtml += `
                <div class="member-gantt-right-row" style="background: #f1f5f9; padding: 4px 10px; border-bottom: 1px solid #e2e8f0; height: 28px; box-sizing: border-box; position: relative; margin-top: ${deptOfficers.length > 0 ? '8px' : '0'};">
                    ${gridLinesHtml}
                    ${rowTodayLineHtml}
                </div>
            `;

            contractors.forEach(c => {
                const rowPack = buildMemberRowSplit(c, viewStart, viewDuration, nowMs, gridLinesHtml, rowTodayLineHtml);
                leftColumnRowsHtml += rowPack.leftHtml;
                rightTrackRowsHtml += rowPack.rightHtml;
            });
        }

        container.innerHTML = `
            <div class="pb-gantt-card" style="margin-bottom: 20px;">
                ${renderControlsHtml(memberList.length, filteredList.length, yearCalc)}

                <div class="pb-gantt-split-wrap">
                    <div class="pb-gantt-left-col">
                        <div class="pb-gantt-col-header">Member / Partner</div>
                        <div style="padding: 6px 0;">
                            ${leftColumnRowsHtml}
                        </div>
                    </div>

                    <div style="flex: 1; min-width: 0; ${trackContainerStyle}">
                        <div style="${trackInnerWidthStyle}">
                            <div style="height: 24px; position: relative; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">
                                ${timeMarksHtml}
                                ${headerTodayBadgeHtml}
                            </div>
                            <div style="padding: 6px 0;">
                                ${rightTrackRowsHtml}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E" style="display:none;" onerror="window.syncMemberGanttRowHeights && window.syncMemberGanttRowHeights()">
        `;

        bindControlEvents(containerId, memberList);
        syncMemberGanttRowHeights();
    }

    function buildMemberRowSplit(m, viewStart, viewDuration, nowMs, gridLinesHtml, rowTodayLineHtml) {
        const isDel = Boolean(m.pr_ignore_delete);
        const isContractor = Boolean(m.is_contractor);

        let realStartMs = viewStart;
        if (m.pr_start_date) {
            const parsed = new Date(m.pr_start_date.substring(0, 10).replace(/-/g, '/') + ' 00:00:00').getTime();
            if (!isNaN(parsed)) realStartMs = parsed;
        }

        let isPermanent = true;
        let isExpired = false;
        let realEndMs = Infinity;
        if (m.pr_end_date) {
            const parsed = new Date(m.pr_end_date.substring(0, 10).replace(/-/g, '/') + ' 23:59:59').getTime();
            if (!isNaN(parsed)) {
                realEndMs = parsed;
                isPermanent = false;
                if (realEndMs < nowMs) isExpired = true;
            }
        }

        const viewEndMs = viewStart + viewDuration;
        const isCompletelyOutOfWindow = (realEndMs < viewStart) || (realStartMs > viewEndMs);

        let leftPct = ((realStartMs - viewStart) / viewDuration) * 100;
        let rightPct = isPermanent ? 100 : (((realEndMs - viewStart) / viewDuration) * 100);

        let renderLeft = leftPct < 0 ? 0 : leftPct;
        let renderRight = rightPct > 100 ? 100 : rightPct;
        let widthPct = renderRight - renderLeft;
        if (widthPct < 1.5 && !isCompletelyOutOfWindow) widthPct = 1.5;

        let barBg = isContractor ? '#d97706' : '#0284c7';
        let barBorder = isContractor ? '#b45309' : '#0369a1';
        let barOpacity = '1';

        let badgeText = isPermanent ? 'Ongoing' : (isExpired ? 'Expired' : 'Active');
        if (rightPct > 100 && !isPermanent) {
            badgeText = '→ ' + m.pr_end_date.substring(0, 4);
        } else if (leftPct < 0 && realStartMs > 0) {
            badgeText = m.pr_start_date.substring(0, 4) + ' ←';
        }

        if (isDel) {
            barBg = 'repeating-linear-gradient(45deg, #f87171, #f87171 8px, #ef4444 8px, #ef4444 16px)';
            barBorder = '#dc2626';
            barOpacity = '0.65';
            badgeText = 'Deleted';
        }

        const dateRangeLabel = (m.pr_start_date ? m.pr_start_date.substring(0, 10) : 'Start') + 
                               ' ~ ' + 
                               (m.pr_end_date ? m.pr_end_date.substring(0, 10) : 'Permanent');

        const titleText = `${m.st_name} (${isContractor ? (m.st_company ? m.st_company : 'Vendor') : (m.st_rank ? m.st_rank : 'Gov')})\n` +
                          `Role: ${m.pr_roletype} [${m.pr_right}]\n` +
                          `Schedule: ${dateRangeLabel}\n` +
                          `Status: ${isPermanent ? 'Permanent' : (isExpired ? 'Expired' : 'Active')}`;

        const leftRowClass = `pb-gantt-left-row member-gantt-left-row ${isDel ? 'is-deleted' : ''}`;
        const rightRowClass = `pb-gantt-right-row member-gantt-right-row ${isDel ? 'is-deleted' : ''}`;

        const leftHtml = `
            <div class="${leftRowClass}" style="min-height: 42px; padding: 6px 10px; display: flex; align-items: center; justify-content: space-between;">
                <div style="font-size: 12px; line-height: 1.4; word-break: break-word; white-space: normal; padding-right: 6px;">
                    <strong style="color: #1e293b;">${escapeHtml(m.st_name)}</strong>
                    <span style="color: #64748b; font-size: 11px; margin-left: 4px;">(${escapeHtml(safeStr(isContractor ? m.st_company : m.st_rank))})</span>
                    ${isDel ? '<span style="color: #ef4444; font-size: 10px; font-weight: bold; margin-left: 4px;">[Deleted]</span>' : ''}
                </div>
                <span style="font-size: 10px; background: #e2e8f0; color: #475569; padding: 1px 4px; border-radius: 3px; white-space: nowrap; flex-shrink: 0;">
                    ${escapeHtml(m.pr_right)}
                </span>
            </div>
        `;

        const rightHtml = `
            <div class="${rightRowClass}" style="min-height: 42px; position: relative;">
                <div style="height: 100%; width: 100%; position: relative; overflow: visible;">
                    ${gridLinesHtml}
                    ${rowTodayLineHtml}
                    ${!isCompletelyOutOfWindow ? `
                        <div class="gantt-member-bar" style="position: absolute; left: ${renderLeft.toFixed(2)}%; width: ${widthPct.toFixed(2)}\%; top: 7px; height: 24px; border-radius: 4px; background:${barBg}; border: 1px solid ${barBorder}; opacity:${barOpacity}; cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 0 8px; box-sizing: border-box; z-index: 2;"
                             title="${escapeHtml(titleText)}">
                            <span style="color: #ffffff; font-size: 11px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${escapeHtml(m.pr_roletype)}
                            </span>
                            <span style="color: #ffffff; font-size: 10px; opacity: 0.95; margin-left: 4px; white-space: nowrap; font-family: monospace;">
                                ${badgeText}
                            </span>
                        </div>
                    ` : `
                        <div style="position: absolute; left: 8px; top: 10px; font-size: 11px; color: #cbd5e1; font-style: italic;">
                            (Active outside timeline)
                        </div>
                    `}
                </div>
            </div>
        `;

        return { leftHtml: leftHtml, rightHtml: rightHtml };
    }

    function syncMemberGanttRowHeights() {
        setTimeout(function() {
            const leftRows = document.querySelectorAll('.member-gantt-left-row');
            const rightRows = document.querySelectorAll('.member-gantt-right-row');
            if (!leftRows || !rightRows || leftRows.length !== rightRows.length) return;

            for (let i = 0; i < leftRows.length; i++) {
                leftRows[i].style.height = 'auto';
                rightRows[i].style.height = 'auto';

                const leftH = leftRows[i].offsetHeight;
                const rightH = rightRows[i].offsetHeight;
                const maxH = Math.max(leftH, rightH, 38);

                leftRows[i].style.height = maxH + 'px';
                rightRows[i].style.height = maxH + 'px';

                const bar = rightRows[i].querySelector('.gantt-member-bar');
                if (bar) {
                    bar.style.top = Math.max(Math.round((maxH - 24) / 2), 4) + 'px';
                }
            }
        }, 0);
    }

    function renderControlsHtml(totalCount, visibleCount, yearCalc) {
        let yearOptionsTo = '';
        for (let y = yearCalc.minYear; y <= yearCalc.maxYear; y++) {
            yearOptionsTo += `<option value="${y}" ${y === ganttToYear ? 'selected' : ''}>${y}</option>`;
        }

        const isScrollable = (ganttScaleMode === 'SCROLLABLE');

        return `
            <div class="pb-gantt-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="pb-gantt-title">📊 Member Schedule Blueprint (Roster Gantt)</span>
                    <span style="font-size: 12px; color: #64748b;">(Showing ${visibleCount} of ${totalCount})</span>
                </div>

                <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155;">
                        <span>View Mode:</span>
                        <select id="ganttScaleModeSelect" style="padding: 3px 6px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;">
                            <option value="ADAPTIVE" ${ganttScaleMode === 'ADAPTIVE' ? 'selected' : ''}>Adaptive Width</option>
                            <option value="SCROLLABLE" ${ganttScaleMode === 'SCROLLABLE' ? 'selected' : ''}>Fixed Step</option>
                        </select>
                    </div>

                    <div id="ganttUnitWrap" style="display: ${isScrollable ? 'flex' : 'none'}; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155;">
                        <span>Scale:</span>
                        <select id="ganttScaleUnitSelect" style="padding: 3px 6px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;">
                            <option value="WEEK" ${ganttScaleUnit === 'WEEK' ? 'selected' : ''}>Weekly (每星期)</option>
                            <option value="MONTH" ${ganttScaleUnit === 'MONTH' ? 'selected' : ''}>Monthly (每月)</option>
                            <option value="YEAR" ${ganttScaleUnit === 'YEAR' ? 'selected' : ''}>Yearly (每年)</option>
                        </select>
                    </div>

                    <div id="ganttWindowWrap" style="display: ${isScrollable ? 'flex' : 'none'}; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #334155; background: #f8fafc; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                        <span>Timeline Horizon: Until End of</span>
                        <select id="ganttToYearSelect" style="padding: 2px 4px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff;">
                            ${yearOptionsTo}
                        </select>
                    </div>

                    <div style="display: flex; align-items: center; gap: 12px; font-size: 12px; font-weight: 600;">
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; color: #b91c1c;">
                            <input type="checkbox" id="ganttToggleToday" ${ganttShowToday ? 'checked' : ''}>
                            <span>🔴 Today Line</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; color: #475569;">
                            <input type="checkbox" id="ganttToggleDeleted" ${ganttShowDeleted ? 'checked' : ''}>
                            <span>👻 Soft-Deleted</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    function bindControlEvents(containerId, memberList) {
        const selMode = document.getElementById('ganttScaleModeSelect');
        if (selMode) {
            selMode.onchange = function() {
                ganttScaleMode = this.value;
                const isScroll = (ganttScaleMode === 'SCROLLABLE');
                const unitWrap = document.getElementById('ganttUnitWrap');
                if (unitWrap) unitWrap.style.display = isScroll ? 'flex' : 'none';
                const winWrap = document.getElementById('ganttWindowWrap');
                if (winWrap) winWrap.style.display = isScroll ? 'flex' : 'none';
                renderMemberGanttChart(containerId, memberList);
            };
        }

        const selUnit = document.getElementById('ganttScaleUnitSelect');
        if (selUnit) {
            selUnit.onchange = function() {
                ganttScaleUnit = this.value;
                renderMemberGanttChart(containerId, memberList);
            };
        }

        const selTo = document.getElementById('ganttToYearSelect');
        if (selTo) {
            selTo.onchange = function() {
                ganttToYear = parseInt(this.value, 10);
                renderMemberGanttChart(containerId, memberList);
            };
        }

        const chkToday = document.getElementById('ganttToggleToday');
        if (chkToday) {
            chkToday.onchange = function() {
                ganttShowToday = this.checked;
                renderMemberGanttChart(containerId, memberList);
            };
        }

        const chkDeleted = document.getElementById('ganttToggleDeleted');
        if (chkDeleted) {
            chkDeleted.onchange = function() {
                ganttShowDeleted = this.checked;
                renderMemberGanttChart(containerId, memberList);
            };
        }
    }

    function generateFixedScaleMarks(viewStart, viewEnd, unit) {
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

    window.renderMemberGanttChart = renderMemberGanttChart;
    window.syncMemberGanttRowHeights = syncMemberGanttRowHeights;

})(window);