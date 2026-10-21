// ==========================================================================
// ProjectBook Collaboration Portal - Universal View Router & Slot Engine
// File: /public/js/portal-router.js
//
// 職責與邊界：
// 1. 統一管理全系統三大視覺容器插槽：
//    - Zone 11 (#zone-11-canvas) : 主工作畫布 (預設 100% Fluid 寬度，獨立垂直滾動)
//    - Zone 9  (#zone-9-panel)   : 右側輔助列表欄 (預設 display: none，隨選展開)
//    - Zone 10 (#zone-10-panel)  : 右側次級操作/詳情欄 (預設 display: none，由 Zone 9 雙擊觸發)
// 2. 實作五階段 dispatch() 路由管線、Diffing 簽章比對與 routeSequence 競態防禦。
// 3. 提供 LegacyViewAdapter (registerLegacyView)，讓既有業務模組 0 修改無縫運行。
// 4. 實作 Zone 10「Expand to Zone 11」純 CSS 彈性比例切換，不搬移 DOM 節點。
// ==========================================================================

(function (window) {
    'use strict';

    // ----------------------------------------------------------------------
    // 1. 內部狀態機與視圖註冊表 (Internal State & View Registries)
    // ----------------------------------------------------------------------
    let routeSequence = 0;
    let isInitialized = false;
    let isDispatching = false;

    let currentParams = {
        pj: null,
        view: 'system-overview',
        ph: null,
        ev: null,
        event: null,
        ms: null,
        side: null,
        msgId: null
    };

    let lastMainSignature = null;
    let lastSideListSignature = null;
    let lastSideDetailSignature = null;

    let activeMainViewKey = null;
    let activeSideListKey = null;
    let activeSideDetailKey = null;
    let isSideRatioExpanded = false;

    const mainViewRegistry = new Map();
    const sideListViewRegistry = new Map();
    const sideDetailViewRegistry = new Map();

    // 外部狀態同步回呼 (由 portal.js 注入)
    let projectContextSyncHandler = null;
    let sidebarHighlightSyncHandler = null;

    // 向下相容全域視圖映射表
    window.PB_Views = window.PB_Views || {};

    // ----------------------------------------------------------------------
    // 2. DOM 插槽解析器 (Host Slot Resolvers)
    // ----------------------------------------------------------------------
    function getWorkspaceEl() {
        return document.querySelector('.workspace');
    }

    function getMainSlotEl() {
        return document.getElementById('zone-11-canvas') || document.querySelector('main');
    }

    function getSideListSlotEl() {
        return document.getElementById('zone-9-panel');
    }

    function getSideDetailSlotEl() {
        return document.getElementById('zone-10-panel');
    }

    // ----------------------------------------------------------------------
    // 3. 雜湊網址解析與序列化工具 (URL Hash Parser & Serializer)
    // ----------------------------------------------------------------------
    function parseHashString(rawHash) {
        const clean = String(rawHash || '').replace(/^#/, '').trim();
        const result = {
            pj: null,
            view: null,
            ph: null,
            ev: null,
            event: null,
            ms: null,
            side: null,
            msgId: null
        };

        if (!clean) {
            return result;
        }

        // 相容舊版純動作名稱 Hash (例如 #project-detail)
        if (!clean.includes('=')) {
            result.view = clean;
            return result;
        }

        const usp = new URLSearchParams(clean);
        if (usp.has('pj')) {
            const pjNum = parseInt(usp.get('pj'), 10);
            result.pj = (!isNaN(pjNum) && pjNum > 0) ? pjNum : null;
        }
        if (usp.has('view')) {
            const v = usp.get('view').trim();
            result.view = v || null;
        }
        if (usp.has('ph')) {
            result.ph = usp.get('ph').trim() || null;
        }
        if (usp.has('ev')) {
            result.ev = usp.get('ev').trim() || null;
        }
        if (usp.has('event')) {
            result.event = usp.get('event').trim() || null;
        }
        if (usp.has('ms')) {
            result.ms = usp.get('ms').trim() || null;
        }
        if (usp.has('side')) {
            result.side = usp.get('side').trim() || null;
        }
        if (usp.has('msgId')) {
            result.msgId = usp.get('msgId').trim() || null;
        }

        return result;
    }

    function buildHashString(paramsObj) {
        const parts = [];
        if (paramsObj.pj && Number(paramsObj.pj) > 0) {
            parts.push('pj=' + encodeURIComponent(String(paramsObj.pj)));
        }
        if (paramsObj.view) {
            // 若已指定 pj 且視圖為預設 project-detail，且無其他附屬過濾參數時可保持精簡或明確列出
            if (!(paramsObj.pj && paramsObj.view === 'project-detail' && !paramsObj.ph && !paramsObj.ev && !paramsObj.ms && !paramsObj.side)) {
                parts.push('view=' + encodeURIComponent(String(paramsObj.view)));
            }
        }
        if (paramsObj.ph) {
            parts.push('ph=' + encodeURIComponent(String(paramsObj.ph)));
        }
        if (paramsObj.ev) {
            parts.push('ev=' + encodeURIComponent(String(paramsObj.ev)));
        }
        if (paramsObj.event) {
            parts.push('event=' + encodeURIComponent(String(paramsObj.event)));
        }
        if (paramsObj.ms) {
            parts.push('ms=' + encodeURIComponent(String(paramsObj.ms)));
        }
        if (paramsObj.side) {
            parts.push('side=' + encodeURIComponent(String(paramsObj.side)));
        }
        if (paramsObj.msgId) {
            parts.push('msgId=' + encodeURIComponent(String(paramsObj.msgId)));
        }
        return parts.length > 0 ? ('#' + parts.join('&')) : '#view=system-overview';
    }

    function computeMainSignature(p) {
        const effectiveView = p.view || (p.pj ? 'project-detail' : 'system-overview');
        return [
            p.pj || '',
            effectiveView,
            p.ph || '',
            p.ev || '',
            p.event || '',
            p.ms || ''
        ].join('|');
    }

    function computeSideListSignature(p) {
        return [p.side || '', p.pj || ''].join('|');
    }

    function computeSideDetailSignature(p) {
        return [p.side || '', p.msgId || '', p.pj || '', p.ev || '', p.ms || ''].join('|');
    }

    // ----------------------------------------------------------------------
    // 4. 視圖註冊與舊版相容封裝器 (View Registration & LegacyViewAdapter)
    // ----------------------------------------------------------------------
    function registerMainView(viewKey, lifecycleObj) {
        if (!viewKey || !lifecycleObj || typeof lifecycleObj.mount !== 'function') return;
        mainViewRegistry.set(viewKey, {
            mount: lifecycleObj.mount,
            unmount: typeof lifecycleObj.unmount === 'function'
                ? lifecycleObj.unmount
                : function (container) {
                    if (container) container.innerHTML = '';
                }
        });
    }

    /**
     * [職責] 將既有直接操作 #viewHeading / #viewRole / #viewContent 的函式封裝為標準 Zone 11 視圖
     */
    function registerLegacyView(viewKey, legacyRenderFn) {
        if (!viewKey || typeof legacyRenderFn !== 'function') return;

        window.PB_Views[viewKey] = legacyRenderFn;

        registerMainView(viewKey, {
            mount: async function (container, params, seq) {
                if (!container) return;

                // 若容器內尚未鋪設標準卡片外框，動態注入以確保舊版模組 DOM 查詢 100% 命中
                if (!container.querySelector('#viewContent')) {
                    container.innerHTML = `
                        <div class="card" id="zone11LegacyCard">
                            <div class="card-head">
                                <h2 id="viewHeading">Project Overview</h2>
                                <span class="user-tag" id="viewRole">Role: -</span>
                            </div>
                            <div id="viewContent">
                                <div class="empty-placeholder">Loading view...</div>
                            </div>
                        </div>
                    `;
                }

                // 橋接深層連結參數：當從 Phase 點擊 View Events (#pj=X&view=event-detail&ph=Y) 時，自動同步篩選器
                if (viewKey === 'event-detail' && params && params.ph) {
                    try {
                        if (typeof selectedPhaseFilterIds !== 'undefined' && Array.isArray(selectedPhaseFilterIds)) {
                            const phIds = String(params.ph)
                                .split(',')
                                .map(s => parseInt(s.trim(), 10))
                                .filter(n => !isNaN(n) && n > 0);
                            selectedPhaseFilterIds = phIds;
                        }
                    } catch (err) {
                        console.warn('[PortalRouter] Phase filter sync skipped:', err);
                    }
                }

                await legacyRenderFn(params, seq);
            },
            unmount: function (container) {
                if (container) {
                    container.innerHTML = '';
                    container.scrollTop = 0;
                }
            }
        });
    }

    function registerSideListView(sideKey, lifecycleObj) {
        if (!sideKey || !lifecycleObj || typeof lifecycleObj.mount !== 'function') return;
        sideListViewRegistry.set(sideKey, {
            mount: lifecycleObj.mount,
            unmount: typeof lifecycleObj.unmount === 'function'
                ? lifecycleObj.unmount
                : function (container) {
                    if (container) container.innerHTML = '';
                }
        });
    }

    function registerSideDetailView(detailKey, lifecycleObj) {
        if (!detailKey || !lifecycleObj || typeof lifecycleObj.mount !== 'function') return;
        sideDetailViewRegistry.set(detailKey, {
            mount: lifecycleObj.mount,
            unmount: typeof lifecycleObj.unmount === 'function'
                ? lifecycleObj.unmount
                : function (container) {
                    if (container) container.innerHTML = '';
                }
        });
    }

    // ----------------------------------------------------------------------
    // 5. 核心五階段路由分發引擎 (5-Stage Dispatch Pipeline)
    // ----------------------------------------------------------------------
    async function dispatch(forceRemountMain) {
        if (isDispatching) return;
        isDispatching = true;

        try {
            // Stage A: 解析 Hash 並遞增競態序號
            const parsed = parseHashString(window.location.hash);
            if (!parsed.view) {
                parsed.view = parsed.pj ? 'project-detail' : 'system-overview';
            }

            const nextMainSig = computeMainSignature(parsed);
            const mainChanged = Boolean(forceRemountMain || nextMainSig !== lastMainSignature);

            if (mainChanged) {
                routeSequence++;
            }
            const currentSeq = routeSequence;
            currentParams = { ...parsed };

            // Stage B: 同步 Zone 4 專案上下文與左側手風琴選單高亮 (在 Mount 前執行，確保 currentProjectId 就緒)
            if (typeof projectContextSyncHandler === 'function') {
                const accessAllowed = await projectContextSyncHandler(currentParams.pj, currentParams.view);
                if (accessAllowed === false) {
                    isDispatching = false;
                    return;
                }
            }

            if (typeof sidebarHighlightSyncHandler === 'function') {
                sidebarHighlightSyncHandler(currentParams.view);
            }

            // Stage C: Zone 11 主畫布 Diffing 與掛載 (若僅開關右側 Zone 9/10，絕不重繪 Zone 11)
            const mainSlot = getMainSlotEl();
            if (mainSlot && mainChanged) {
                if (activeMainViewKey && mainViewRegistry.has(activeMainViewKey)) {
                    try {
                        mainViewRegistry.get(activeMainViewKey).unmount(mainSlot);
                    } catch (unmountErr) {
                        console.error('[PortalRouter] Unmount error on main view:', unmountErr);
                    }
                }

                mainSlot.scrollTop = 0;
                const targetViewKey = currentParams.view || 'system-overview';
                activeMainViewKey = targetViewKey;
                lastMainSignature = nextMainSig;

                const viewDescriptor = mainViewRegistry.get(targetViewKey);
                if (viewDescriptor) {
                    await viewDescriptor.mount(mainSlot, { ...currentParams }, currentSeq);
                } else if (typeof window.PB_Views[targetViewKey] === 'function') {
                    // 動態補註冊尚未包裝的視圖
                    registerLegacyView(targetViewKey, window.PB_Views[targetViewKey]);
                    await mainViewRegistry.get(targetViewKey).mount(mainSlot, { ...currentParams }, currentSeq);
                } else {
                    mainSlot.innerHTML = `
                        <div class="card">
                            <div class="card-head">
                                <h2 id="viewHeading">Module Notice</h2>
                                <span class="user-tag" id="viewRole">Role: ${escapeHtml(typeof currentProjectRight !== 'undefined' && currentProjectRight ? currentProjectRight : 'USER')}</span>
                            </div>
                            <div id="viewContent">
                                <div class="empty-placeholder">Module view [${escapeHtml(targetViewKey)}] is not registered.</div>
                            </div>
                        </div>
                    `;
                }
            }

            // Stage D: Zone 9 & Zone 10 右側雙欄隨選調度 (On-Demand Side Panels)
            await scheduleSidePanels(currentParams, currentSeq);

        } catch (err) {
            console.error('[PortalRouter] Dispatch pipeline exception:', err);
        } finally {
            isDispatching = false;
        }
    }

    /**
     * [職責] 調度 Zone 9 (#zone-9-panel) 與 Zone 10 (#zone-10-panel) 的掛載、卸載與寬度比例
     */
    async function scheduleSidePanels(params, seq) {
        const workspaceEl = getWorkspaceEl();
        const slot9 = getSideListSlotEl();
        const slot10 = getSideDetailSlotEl();
        if (!slot9 || !slot10) return;

        const sideKey = params.side;

        // 情況 1：未啟用任何右側欄 -> 強制卸載 Zone 10 與 Zone 9，100% 空間歸還 Zone 11
        if (!sideKey) {
            if (activeSideDetailKey && sideDetailViewRegistry.has(activeSideDetailKey)) {
                sideDetailViewRegistry.get(activeSideDetailKey).unmount(slot10);
            }
            if (activeSideListKey && sideListViewRegistry.has(activeSideListKey)) {
                sideListViewRegistry.get(activeSideListKey).unmount(slot9);
            }

            activeSideDetailKey = null;
            activeSideListKey = null;
            lastSideDetailSignature = null;
            lastSideListSignature = null;
            isSideRatioExpanded = false;

            slot10.innerHTML = '';
            slot10.style.display = 'none';
            slot9.innerHTML = '';
            slot9.style.display = 'none';

            if (workspaceEl) {
                workspaceEl.classList.remove('side-open', 'side-detail-open', 'side-expanded-ratio');
            }
            return;
        }

        // 情況 2：啟用 Zone 9 (例如 side=notifications)
        if (workspaceEl) {
            workspaceEl.classList.add('side-open');
        }
        slot9.style.display = 'flex';

        const nextSideListSig = computeSideListSignature(params);
        if (nextSideListSig !== lastSideListSignature || activeSideListKey !== sideKey) {
            if (activeSideListKey && sideListViewRegistry.has(activeSideListKey)) {
                sideListViewRegistry.get(activeSideListKey).unmount(slot9);
            }
            activeSideListKey = sideKey;
            lastSideListSignature = nextSideListSig;

            const sideListDesc = sideListViewRegistry.get(sideKey) || sideListViewRegistry.get('notifications');
            if (sideListDesc) {
                await sideListDesc.mount(slot9, { ...params }, seq);
            }
        }

        // 情況 3：檢驗是否同時啟用 Zone 10 (例如帶有 msgId)
        if (params.msgId) {
            if (workspaceEl) {
                workspaceEl.classList.add('side-detail-open');
            }
            slot10.style.display = 'flex';

            const nextDetailSig = computeSideDetailSignature(params);
            if (nextDetailSig !== lastSideDetailSignature || !activeSideDetailKey) {
                if (activeSideDetailKey && sideDetailViewRegistry.has(activeSideDetailKey)) {
                    sideDetailViewRegistry.get(activeSideDetailKey).unmount(slot10);
                }
                activeSideDetailKey = 'thread';
                lastSideDetailSignature = nextDetailSig;

                const detailDesc = sideDetailViewRegistry.get('thread');
                if (detailDesc) {
                    await detailDesc.mount(slot10, { ...params }, seq);
                }
            }
        } else {
            // 無 msgId 時收合 Zone 10，保留 Zone 9
            if (activeSideDetailKey && sideDetailViewRegistry.has(activeSideDetailKey)) {
                sideDetailViewRegistry.get(activeSideDetailKey).unmount(slot10);
            }
            activeSideDetailKey = null;
            lastSideDetailSignature = null;
            isSideRatioExpanded = false;
            slot10.innerHTML = '';
            slot10.style.display = 'none';

            if (workspaceEl) {
                workspaceEl.classList.remove('side-detail-open', 'side-expanded-ratio');
            }
        }
    }

    // ----------------------------------------------------------------------
    // 6. 導航與視圖控制 API (Navigation & Control APIs)
    // ----------------------------------------------------------------------
    function navigate(partialParams, options) {
        const opts = options || {};
        const base = opts.reset ? {
            pj: null,
            view: null,
            ph: null,
            ev: null,
            event: null,
            ms: null,
            side: currentParams.side,
            msgId: currentParams.msgId
        } : { ...currentParams };

        const merged = { ...base, ...partialParams };
        const targetHash = buildHashString(merged);

        if (opts.replace) {
            history.replaceState(null, '', window.location.pathname + targetHash);
            dispatch(Boolean(opts.forceRemountMain));
        } else if (window.location.hash === targetHash) {
            dispatch(Boolean(opts.forceRemountMain));
        } else {
            window.location.hash = targetHash;
        }
    }

    function switchView(viewName, extraParams) {
        if (!viewName) return;
        const nextParams = {
            pj: (typeof currentProjectId !== 'undefined' && currentProjectId) ? currentProjectId : currentParams.pj,
            view: viewName,
            ph: null,
            ev: null,
            event: null,
            ms: null,
            ...(extraParams || {})
        };
        navigate(nextParams, { replace: true, forceRemountMain: true });
    }

    function navigateToProject(pjId, targetView, extraParams) {
        const numericPj = pjId ? parseInt(pjId, 10) : null;
        if (!numericPj || isNaN(numericPj)) {
            navigate({
                pj: null,
                view: 'system-overview',
                ph: null,
                ev: null,
                event: null,
                ms: null
            }, { replace: true, forceRemountMain: true });
            return;
        }

        navigate({
            pj: numericPj,
            view: targetView || 'project-detail',
            ph: null,
            ev: null,
            event: null,
            ms: null,
            ...(extraParams || {})
        }, { replace: true, forceRemountMain: true });
    }

    function toggleSidePanel(sideKey) {
        const targetKey = sideKey || 'notifications';
        if (currentParams.side === targetKey) {
            closeSidePanels();
        } else {
            navigate({ side: targetKey }, { replace: true, forceRemountMain: false });
        }
    }

    function openSideDetail(msgIdOrContext) {
        const targetMsgId = String(msgIdOrContext || 'PROJECT_THREAD');
        navigate({
            side: currentParams.side || 'notifications',
            msgId: targetMsgId
        }, { replace: true, forceRemountMain: false });
    }

    function closeSideDetailPanel() {
        navigate({ msgId: null }, { replace: true, forceRemountMain: false });
    }

    function closeSidePanels() {
        navigate({ side: null, msgId: null }, { replace: true, forceRemountMain: false });
    }

    /**
     * [職責] 切換 Zone 10「Expand to Zone 11」彈性比例模式 (不搬移 DOM 節點)
     */
    function toggleSideRatioExpand(forceState) {
        const workspaceEl = getWorkspaceEl();
        if (!workspaceEl) return;

        isSideRatioExpanded = (typeof forceState === 'boolean') ? forceState : !isSideRatioExpanded;
        if (isSideRatioExpanded) {
            workspaceEl.classList.add('side-expanded-ratio');
        } else {
            workspaceEl.classList.remove('side-expanded-ratio');
        }

        const expandBtn = document.getElementById('btnZone10ExpandToggle');
        if (expandBtn) {
            expandBtn.textContent = isSideRatioExpanded ? '⤡ Restore Width' : '⤢ Expand to Zone 11';
            expandBtn.title = isSideRatioExpanded
                ? 'Restore standard side panel width'
                : 'Expand discussion panel across workspace';
        }
    }

    // ----------------------------------------------------------------------
    // 7. 內建預設 Zone 9 / Zone 10 視圖元件 (Stage 2 基建，對接 MessageHandler)
    // ----------------------------------------------------------------------
    function registerBuiltInSideViews() {
        // Zone 9: 通知與討論頻道索引列表 (支援雙擊開啟 Zone 10)
        registerSideListView('notifications', {
            mount: async function (container, params) {
                const activePjId = (typeof currentProjectId !== 'undefined' && currentProjectId) ? currentProjectId : params.pj;

                container.innerHTML = `
                    <div class="side-panel-header">
                        <div>
                            <h3 class="side-panel-title">🔔 Notifications & Channels</h3>
                            <span class="side-panel-sub">Double-click an item to inspect in Zone 10</span>
                        </div>
                        <button type="button" class="side-close-btn" onclick="PortalRouter.closeSidePanels()" title="Close Panel">✕</button>
                    </div>
                    <div class="side-panel-body" id="zone9ListContainer">
                        <div class="empty-placeholder" style="margin: 24px 0;">Loading channels...</div>
                    </div>
                `;

                const listBox = document.getElementById('zone9ListContainer');
                if (!listBox) return;

                let unreadCount = 0;
                if (typeof api === 'function') {
                    const unreadRes = await api('/api/portal/message/unread-count');
                    if (unreadRes && unreadRes.status === 'SUCCESS') {
                        unreadCount = unreadRes.unread_count || 0;
                    }
                }

                const itemsHtml = [];

                // 項目 1：當前專案討論頻道
                if (activePjId) {
                    itemsHtml.push(`
                        <div class="side-list-item ${params.msgId === 'PJ_' + activePjId ? 'active' : ''}"
                             ondblclick="PortalRouter.openSideDetail('PJ_${activePjId}')"
                             onclick="PortalRouter.openSideDetail('PJ_${activePjId}')">
                            <div class="side-item-top">
                                <span class="badge badge-info">Project Channel</span>
                                <span class="side-item-hint">Double-click ➔</span>
                            </div>
                            <div class="side-item-title">Project #${escapeHtml(String(activePjId))} Discussion Thread</div>
                            <div class="side-item-meta">Unread notifications: ${unreadCount}</div>
                        </div>
                    `);
                }

                // 項目 2：若網址有指定 Event 或 Mission，提供對應討論入口
                if (params.ev) {
                    itemsHtml.push(`
                        <div class="side-list-item ${params.msgId === 'EV_' + params.ev ? 'active' : ''}"
                             ondblclick="PortalRouter.openSideDetail('EV_${params.ev}')"
                             onclick="PortalRouter.openSideDetail('EV_${params.ev}')">
                            <div class="side-item-top">
                                <span class="badge badge-active">Event Channel</span>
                                <span class="side-item-hint">Double-click ➔</span>
                            </div>
                            <div class="side-item-title">Event #${escapeHtml(String(params.ev))} Discussion</div>
                        </div>
                    `);
                }

                if (params.ms) {
                    itemsHtml.push(`
                        <div class="side-list-item ${params.msgId === 'MS_' + params.ms ? 'active' : ''}"
                             ondblclick="PortalRouter.openSideDetail('MS_${params.ms}')"
                             onclick="PortalRouter.openSideDetail('MS_${params.ms}')">
                            <div class="side-item-top">
                                <span class="badge badge-active">Mission Channel</span>
                                <span class="side-item-hint">Double-click ➔</span>
                            </div>
                            <div class="side-item-title">Mission #${escapeHtml(String(params.ms))} Discussion</div>
                        </div>
                    `);
                }

                if (itemsHtml.length === 0) {
                    listBox.innerHTML = `
                        <div class="empty-placeholder" style="padding: 20px;">
                            No active project selected.<br>Select a project from Zone 4 to inspect project threads.
                        </div>
                    `;
                } else {
                    listBox.innerHTML = itemsHtml.join('');
                }
            },
            unmount: function (container) {
                if (container) container.innerHTML = '';
            }
        });

        // Zone 10: 討論串與訊息詳情面板 (支援 Expand to Zone 11 比例放大與引用回覆)
        registerSideDetailView('thread', {
            mount: async function (container, params) {
                const msgId = String(params.msgId || '');
                let scopeLabel = 'Project Level';
                let displayTitle = 'Discussion Thread';
                const queryObj = {};

                if (msgId.startsWith('MS_')) {
                    queryObj.ms = parseInt(msgId.replace('MS_', ''), 10);
                    scopeLabel = 'Mission Level';
                    displayTitle = `Mission #${queryObj.ms} Thread`;
                } else if (msgId.startsWith('EV_')) {
                    queryObj.ev = parseInt(msgId.replace('EV_', ''), 10);
                    scopeLabel = 'Event Level';
                    displayTitle = `Event #${queryObj.ev} Thread`;
                } else if (msgId.startsWith('PJ_')) {
                    queryObj.pj = parseInt(msgId.replace('PJ_', ''), 10);
                    scopeLabel = 'Project Level';
                    displayTitle = `Project #${queryObj.pj} Thread`;
                } else if (typeof currentProjectId !== 'undefined' && currentProjectId) {
                    queryObj.pj = currentProjectId;
                    scopeLabel = 'Project Level';
                    displayTitle = `Project #${currentProjectId} Thread`;
                }

                container.innerHTML = `
                    <div class="thread-header">
                        <div>
                            <h3 id="threadTitle">${escapeHtml(displayTitle)}</h3>
                            <div class="thread-scope-badge" id="threadScope">${escapeHtml(scopeLabel)}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <button type="button" class="btn-secondary" id="btnZone10ExpandToggle"
                                    style="padding: 3px 8px; font-size: 11px; font-weight: 600;"
                                    onclick="PortalRouter.toggleSideRatioExpand()"
                                    title="Expand discussion panel across workspace">
                                ${isSideRatioExpanded ? '⤡ Restore Width' : '⤢ Expand to Zone 11'}
                            </button>
                            <button type="button" class="btn-refresh-icon" onclick="refreshCurrentThread()" title="Refresh Thread">↻</button>
                            <button type="button" class="side-close-btn" onclick="PortalRouter.closeSideDetailPanel()" title="Close Detail Panel">✕</button>
                        </div>
                    </div>
                    <div class="thread-messages" id="threadMessages">
                        <div class="empty-placeholder">Loading messages...</div>
                    </div>
                    <div class="thread-compose">
                        <div class="quote-banner" id="quoteBanner" style="display: none;">
                            <span id="quoteLabel">Replying to...</span>
                            <button type="button" class="btn-link" onclick="cancelQuote()">Cancel</button>
                        </div>
                        <textarea id="commentText" placeholder="Write a comment (Ctrl + Enter to send)..." onkeydown="handleCommentKeyDown(event)"></textarea>
                        <div class="thread-compose-bar">
                            <span class="compose-hint">Ctrl + Enter to send</span>
                            <button type="button" class="btn-submit" onclick="submitComment()">Send</button>
                        </div>
                    </div>
                `;

                if (typeof renderThreadMessagesInZone10 === 'function' && (queryObj.pj || queryObj.ev || queryObj.ms)) {
                    await renderThreadMessagesInZone10(queryObj, displayTitle, scopeLabel);
                }
            },
            unmount: function (container) {
                if (container) container.innerHTML = '';
            }
        });
    }

    // ----------------------------------------------------------------------
    // 8. 路由器啟動與全域掛載 (Router Initialization & Public Facade)
    // ----------------------------------------------------------------------
    function init(options) {
        const opts = options || {};
        if (typeof opts.onSyncProject === 'function') {
            projectContextSyncHandler = opts.onSyncProject;
        }
        if (typeof opts.onSyncMenu === 'function') {
            sidebarHighlightSyncHandler = opts.onSyncMenu;
        }

        registerBuiltInSideViews();

        if (!isInitialized) {
            window.addEventListener('hashchange', function () {
                dispatch(false);
            });
            isInitialized = true;
        }

        return dispatch(true);
    }

    const PortalRouter = {
        init: init,
        dispatch: dispatch,
        navigate: navigate,
        switchView: switchView,
        navigateToProject: navigateToProject,
        toggleSidePanel: toggleSidePanel,
        openSideDetail: openSideDetail,
        closeSideDetailPanel: closeSideDetailPanel,
        closeSidePanels: closeSidePanels,
        toggleSideRatioExpand: toggleSideRatioExpand,
        registerMainView: registerMainView,
        registerLegacyView: registerLegacyView,
        registerSideListView: registerSideListView,
        registerSideDetailView: registerSideDetailView,
        getCurrentParams: function () {
            return { ...currentParams };
        },
        getRouteSequence: function () {
            return routeSequence;
        },
        isRouteCurrent: function (seq) {
            return seq === routeSequence;
        }
    };

    window.PortalRouter = PortalRouter;

    // 全域預掛載 registerView，確保任何載入順序下業務子模組皆可直接註冊
    window.registerView = function (actionKey, handlerFn) {
        PortalRouter.registerLegacyView(actionKey, handlerFn);
    };

})(window);