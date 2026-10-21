// ==========================================================================
// ProjectBook Collaboration Portal - Zone 8 Settings Master Module
// File: /public/js/portal-zone8-setting.js
// Scope: Folder Management, Manage Shortcuts, Workspace Preferences
// Standard: Native Lifecycle Engine (PortalRouter.registerMainView)
// ==========================================================================

(function (window) {
    'use strict';

    // ----------------------------------------------------------------------
    // 1. Module Registrations to Universal View Router
    // ----------------------------------------------------------------------
    if (window.PortalRouter && typeof window.PortalRouter.registerMainView === 'function') {
        window.PortalRouter.registerMainView('setting-folder', {
            mount: mountFolderManagementView,
            unmount: unmountSettingView
        });

        window.PortalRouter.registerMainView('setting-shortcut', {
            mount: mountShortcutManagementView,
            unmount: unmountSettingView
        });

        window.PortalRouter.registerMainView('setting-preferences', {
            mount: mountPreferencesManagementView,
            unmount: unmountSettingView
        });
    }

    function unmountSettingView(container) {
        if (container) {
            container.innerHTML = '';
            container.scrollTop = 0;
        }
    }

    // ======================================================================
    // 2. Workbench A: Folder Management & Project Organization
    // ======================================================================
    let cachedFolderData = { folders: [], mappings: [] };
    let currentSelectedFolder = null; // null 表示 "All Uncategorized Projects"
    let selectedTransferProjects = new Set();

    const RESERVED_FOLDERS = ['PREPARE', 'WORKING', 'ARCHIVE'];

    async function mountFolderManagementView(container, params, routeSeq) {
        container.innerHTML = `
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-head">
                    <h2>📁 Folder Management & Project Organization</h2>
                </div>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
                    Configure personal project categorization folders. Enable folders to display as filtered categories in the Zone 4 project selector.
                </p>

                <!-- Top Action Toolbar -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                    <div style="font-size: 13px; font-weight: 700; color: #1e293b;">
                        Configured Categories (<span id="folderCountBadge">0</span>)
                    </div>
                    <div>
                        <button type="button" class="btn-submit" onclick="PortalZone8.openCreateFolderModal()">+ New Custom Folder</button>
                    </div>
                </div>

                <!-- Folder Cards Grid -->
                <div class="folder-board-grid" id="folderCardsGrid">
                    <div class="empty-placeholder">Loading folder definitions...</div>
                </div>

                <!-- Project-to-Folder Mapping & Transfer Workbench -->
                <div class="card-head" style="margin-top: 24px; padding-top: 14px;">
                    <h3>📂 Project Assignment & Transfer Workbench</h3>
                </div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
                    Select projects on the left to move, copy, or remove from personal organizational folders.
                </p>

                <div class="folder-transfer-box">
                    <!-- Left: Dynamic Project List Column -->
                    <div class="folder-transfer-col">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <h4 style="margin: 0;" id="transferHeaderTitle">
                                Folder List in 
                            </h4>
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <button type="button" id="btnFilterUncategorized" class="btn-submit" style="padding: 3px 8px; font-size: 11px;" onclick="PortalZone8.selectUncategorizedView()">
                                    All Uncategorized Projects
                                </button>
                                <span id="transferPjCount" style="font-size: 11px; color: var(--text-muted);">0 Projects</span>
                            </div>
                        </div>
                        <div class="folder-transfer-list" id="transferProjectList">
                            <div class="empty-placeholder">Loading project list...</div>
                        </div>
                    </div>

                    <!-- Right: Target Folder & Action Column -->
                    <div class="folder-transfer-col">
                        <h4>
                            <span>Target Categorization Folder</span>
                            <span style="font-size: 11px; color: #0284c7; font-weight: normal;">Assign Action</span>
                        </h4>
                        <div class="form-field">
                            <label for="selTransferTargetFolder">Select Destination Folder:</label>
                            <select id="selTransferTargetFolder" class="form-input"></select>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                            <button type="button" class="btn-submit" onclick="PortalZone8.executeProjectAssignment('MOVE')">
                                ➔ Move Selected Projects to Folder
                            </button>
                            <button type="button" class="btn-secondary" onclick="PortalZone8.executeProjectAssignment('COPY')">
                                📋 Also Tag into Selected Folder (Copy)
                            </button>
                            <button type="button" id="btnRemoveCurrentFolder" class="btn-secondary" style="color: #b45309; border-color: #fcd34d;" onclick="PortalZone8.executeProjectAssignment('REMOVE_CURRENT')" disabled>
                                ⊖ Remove Selected from current Folders
                            </button>
                            <button type="button" class="btn-secondary" style="color: #b91c1c; border-color: #fca5a5;" onclick="PortalZone8.executeProjectAssignment('REMOVE')">
                                🗑 Remove Selected from All Folders
                            </button>
                        </div>
                        <div style="margin-top: 12px; font-size: 11px; color: var(--text-muted); line-height: 1.45; background: #f8fafc; padding: 8px 10px; border-radius: 4px; border: 1px dashed #cbd5e1;">
                            ℹ️ <strong>Assignment Notice:</strong> Moving or tagging projects only alters personal sorting in your account. The shared project registry remains unaffected.
                        </div>
                    </div>
                </div>
            </div>
        `;

        currentSelectedFolder = null;
        await reloadFolderData(routeSeq);
    }

    async function reloadFolderData(routeSeq) {
        const res = await api('/api/setting/folder/list');
        if (routeSeq && !window.PortalRouter.isRouteCurrent(routeSeq)) return;

        if (!res || res.status !== 'SUCCESS') {
            const grid = document.getElementById('folderCardsGrid');
            if (grid) grid.innerHTML = '<div class="empty-placeholder">Failed to load folder data.</div>';
            return;
        }

        cachedFolderData = {
            folders: res.folders || [],
            mappings: res.mappings || []
        };

        const countBadge = document.getElementById('folderCountBadge');
        if (countBadge) countBadge.textContent = cachedFolderData.folders.length;

        renderFolderCards(cachedFolderData.folders, cachedFolderData.mappings);
        populateTransferWorkspace();
    }

    function renderFolderCards(folders, mappings) {
        const grid = document.getElementById('folderCardsGrid');
        if (!grid) return;

        if (folders.length === 0) {
            grid.innerHTML = '<div class="empty-placeholder">No folders registered. Click "+ New Custom Folder" to create.</div>';
            return;
        }

        grid.innerHTML = folders.map(f => {
            const assignedCount = mappings.filter(m => m.folderName === f.folderName).length;
            const isEnabled = (f.status === 'Enable');
            const isSystem = Boolean(f.isSystem);
            const isSelected = (currentSelectedFolder === f.folderName);

            return `
                <div class="folder-card ${isSystem ? 'is-system' : 'is-custom'} ${isSelected ? 'selected-folder-card' : ''}" 
                     id="folderCard_${f.pkT00}" 
                     onclick="PortalZone8.selectFolderCard('${escapeHtml(f.folderName)}', event)"
                     style="cursor: pointer;">
                    <div class="folder-card-top">
                        <div class="folder-title-wrap">
                            <span style="font-size: 16px;">${isSystem ? '🏛️' : '📁'}</span>
                            <span class="folder-title" id="folderTitleText_${f.pkT00}">${escapeHtml(f.folderName)}</span>
                        </div>
                        <span class="badge ${isEnabled ? 'badge-active' : 'badge-frozen'}">
                            ${isEnabled ? 'Active' : 'Disabled'}
                        </span>
                    </div>

                    <div style="font-size: 12px; color: #475569; display: flex; align-items: center; justify-content: space-between;">
                        <span>Assigned Projects:</span>
                        <strong style="color: #1e293b;">${assignedCount}</strong>
                    </div>

                    <div class="folder-card-meta">
                        ${!isSystem ? `
                            <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;" onclick="event.stopPropagation();">
                                <input type="checkbox" ${f.zone4Visible ? 'checked' : ''} onchange="PortalZone8.toggleFolderZone4Visibility(${f.pkT00}, this.checked, '${escapeHtml(f.folderName)}')">
                                <span>Show in Zone 4</span>
                            </label>
                            <div style="display: flex; gap: 6px; align-items: center;" onclick="event.stopPropagation();">
                                <button type="button" class="btn-link" style="color: #0284c7;" onclick="PortalZone8.openRenameFolderModal(${f.pkT00}, '${escapeHtml(f.folderName)}')">Rename</button>
                                <button type="button" class="btn-link" style="color: #b91c1c;" onclick="PortalZone8.deleteFolderCategory(${f.pkT00}, '${escapeHtml(f.folderName)}')">Delete</button>
                            </div>
                        ` : `
                            <span style="font-size: 11px; color: #94a3b8; font-style: italic;">System Default</span>
                            <span style="font-size: 10px; color: #64748b;">Locked</span>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    function selectFolderCard(folderName, event) {
        if (event) event.stopPropagation();
        currentSelectedFolder = folderName;
        selectedTransferProjects.clear();

        renderFolderCards(cachedFolderData.folders, cachedFolderData.mappings);
        populateTransferWorkspace();
    }

    function selectUncategorizedView() {
        currentSelectedFolder = null;
        selectedTransferProjects.clear();

        renderFolderCards(cachedFolderData.folders, cachedFolderData.mappings);
        populateTransferWorkspace();
    }

    function populateTransferWorkspace() {
        const listEl = document.getElementById('transferProjectList');
        const selEl = document.getElementById('selTransferTargetFolder');
        const countEl = document.getElementById('transferPjCount');
        const headerTitleEl = document.getElementById('transferHeaderTitle');
        const btnUncat = document.getElementById('btnFilterUncategorized');
        const btnRemoveCur = document.getElementById('btnRemoveCurrentFolder');
        if (!listEl || !selEl) return;

        // 1. 同步目標資料夾下拉選單
        selEl.innerHTML = '<option value="">-- Choose Target Folder --</option>';
        cachedFolderData.folders.forEach(f => {
            if (f.status === 'Enable') {
                const opt = document.createElement('option');
                opt.value = f.folderName;
                opt.textContent = `${f.folderName} ${f.isSystem ? '(System)' : ''}`;
                selEl.appendChild(opt);
            }
        });

        // 2. 判斷當前標題與過濾情境
        const allProjects = (typeof userProjects !== 'undefined' && Array.isArray(userProjects)) ? userProjects : [];
        const mappings = cachedFolderData.mappings || [];

        let filteredProjects = [];
        if (currentSelectedFolder) {
            // 檢視特定 Folder
            if (headerTitleEl) headerTitleEl.innerHTML = `Folder List in <span style="color: #0284c7;">${escapeHtml(currentSelectedFolder)}</span> Folder`;
            if (btnUncat) {
                btnUncat.className = 'btn-secondary';
                btnUncat.style.opacity = '0.7';
            }
            if (btnRemoveCur) btnRemoveCur.disabled = false;

            const mappedPjIds = new Set(
                mappings.filter(m => m.folderName === currentSelectedFolder).map(m => Number(m.pjId))
            );
            filteredProjects = allProjects.filter(p => mappedPjIds.has(Number(p.pk_t01)));
        } else {
            // 檢視 All Uncategorized Projects
            if (headerTitleEl) headerTitleEl.textContent = 'Folder List in';
            if (btnUncat) {
                btnUncat.className = 'btn-submit';
                btnUncat.style.opacity = '1';
            }
            if (btnRemoveCur) btnRemoveCur.disabled = true;

            const anyMappedPjIds = new Set(mappings.map(m => Number(m.pjId)));
            filteredProjects = allProjects.filter(p => !anyMappedPjIds.has(Number(p.pk_t01)));
        }

        if (countEl) countEl.textContent = `${filteredProjects.length} Projects`;

        if (filteredProjects.length === 0) {
            listEl.innerHTML = `<div class="empty-placeholder">No projects found in this view.</div>`;
            return;
        }

        listEl.innerHTML = filteredProjects.map(p => {
            const mappedFolders = mappings.filter(m => Number(m.pjId) === Number(p.pk_t01)).map(m => m.folderName);
            const tagStr = mappedFolders.length > 0
                ? mappedFolders.map(fn => `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px;">${escapeHtml(fn)}</span>`).join(' ')
                : '<span style="color:#94a3b8; font-size:10px; font-style:italic;">Unassigned</span>';

            const isChecked = selectedTransferProjects.has(p.pk_t01);

            return `
                <div class="folder-pj-item ${isChecked ? 'selected' : ''}" id="transferPjRow_${p.pk_t01}" onclick="PortalZone8.toggleTransferProjectSelection(${p.pk_t01})">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-weight: 600; color: #1e293b;">[${escapeHtml(p.pj_code)}] ${escapeHtml(p.pj_name)}</span>
                        <div style="display: flex; gap: 4px; align-items: center; margin-top: 2px;">
                            ${tagStr}
                        </div>
                    </div>
                    <input type="checkbox" id="chkTransferPj_${p.pk_t01}" ${isChecked ? 'checked' : ''} style="pointer-events: none;">
                </div>
            `;
        }).join('');
    }

    function toggleTransferProjectSelection(pjId) {
        const row = document.getElementById(`transferPjRow_${pjId}`);
        const chk = document.getElementById(`chkTransferPj_${pjId}`);
        if (!row || !chk) return;

        if (selectedTransferProjects.has(pjId)) {
            selectedTransferProjects.delete(pjId);
            row.classList.remove('selected');
            chk.checked = false;
        } else {
            selectedTransferProjects.add(pjId);
            row.classList.add('selected');
            chk.checked = true;
        }
    }

    async function executeProjectAssignment(mode) {
        if (selectedTransferProjects.size === 0) {
            alert('Please select at least one project from the left column.');
            return;
        }

        let targetFolder = null;
        if (mode === 'REMOVE_CURRENT') {
            if (!currentSelectedFolder) {
                alert('Please select a specific folder first before removing projects from it.');
                return;
            }
            targetFolder = currentSelectedFolder;
        } else if (mode === 'MOVE' || mode === 'COPY') {
            targetFolder = document.getElementById('selTransferTargetFolder').value;
            if (!targetFolder) {
                alert('Please select a destination folder.');
                document.getElementById('selTransferTargetFolder').focus();
                return;
            }
        }

        const confirmMsg = mode === 'REMOVE_CURRENT'
            ? `Are you sure you want to remove ${selectedTransferProjects.size} project(s) from "${targetFolder}"?`
            : `Are you sure you want to perform [${mode}] on ${selectedTransferProjects.size} project(s)?`;

        if (!confirm(confirmMsg)) return;

        for (const pjId of selectedTransferProjects) {
            await api('/api/setting/folder/assign', {
                method: 'POST',
                body: JSON.stringify({
                    pjId: pjId,
                    targetFolder: targetFolder,
                    mode: mode
                })
            });
        }

        alert('Project assignment synchronized successfully.');
        selectedTransferProjects.clear();
        await reloadFolderData();

        if (typeof window.syncZone4WithFolderSettings === 'function') {
            window.syncZone4WithFolderSettings();
        }
    }

    async function toggleFolderZone4Visibility(pkT00, isVisible, folderName) {
        await api('/api/setting/folder/save', {
            method: 'POST',
            body: JSON.stringify({
                pkT00: pkT00,
                folderName: folderName,
                zone4Visible: isVisible,
                enable: true
            })
        });

        if (typeof window.syncZone4WithFolderSettings === 'function') {
            window.syncZone4WithFolderSettings();
        }
    }

    async function openCreateFolderModal() {
        const val = prompt('Please enter custom folder name:');
        if (!val || !val.trim()) return;

        const folderName = val.trim();
        if (RESERVED_FOLDERS.includes(folderName.toUpperCase())) {
            alert(`Cannot create folder with reserved system name "${folderName}".`);
            return;
        }

        const exists = cachedFolderData.folders.some(f => f.folderName.toUpperCase() === folderName.toUpperCase());
        if (exists) {
            alert(`A folder named "${folderName}" already exists.`);
            return;
        }

        const res = await api('/api/setting/folder/save', {
            method: 'POST',
            body: JSON.stringify({
                folderName: folderName,
                zone4Visible: true,
                enable: true
            })
        });

        if (res && res.status === 'SUCCESS') {
            await reloadFolderData();
            if (typeof window.syncZone4WithFolderSettings === 'function') {
                window.syncZone4WithFolderSettings();
            }
        } else {
            alert('Failed to create folder: ' + (res ? res.message : 'Server error'));
        }
    }

    async function openRenameFolderModal(pkT00, currentName) {
        const val = prompt(`Enter new name for folder "${currentName}":`, currentName);
        if (!val || !val.trim() || val.trim() === currentName) return;

        const newName = val.trim();
        if (RESERVED_FOLDERS.includes(newName.toUpperCase())) {
            alert(`Cannot rename folder to reserved system name "${newName}".`);
            return;
        }

        const exists = cachedFolderData.folders.some(f => f.pkT00 !== pkT00 && f.folderName.toUpperCase() === newName.toUpperCase());
        if (exists) {
            alert(`A folder named "${newName}" already exists.`);
            return;
        }

        const res = await api('/api/setting/folder/rename', {
            method: 'POST',
            body: JSON.stringify({
                pkT00: pkT00,
                newFolderName: newName
            })
        });

        if (res && res.status === 'SUCCESS') {
            if (currentSelectedFolder === currentName) {
                currentSelectedFolder = newName;
            }
            await reloadFolderData();
            if (typeof window.syncZone4WithFolderSettings === 'function') {
                window.syncZone4WithFolderSettings();
            }
        } else {
            alert('Failed to rename folder: ' + (res ? res.message : 'Server error'));
        }
    }

    async function deleteFolderCategory(pkT00, folderName) {
        const confirmed = confirm(`Are you sure you want to delete custom folder "${folderName}"?\n(Assigned project mappings will be cleaned simultaneously)`);
        if (!confirmed) return;

        const res = await api('/api/setting/folder/delete', {
            method: 'POST',
            body: JSON.stringify({ pkT00: pkT00 })
        });

        if (res && res.status === 'SUCCESS') {
            if (currentSelectedFolder === folderName) {
                currentSelectedFolder = null;
            }
            await reloadFolderData();
            if (typeof window.syncZone4WithFolderSettings === 'function') {
                window.syncZone4WithFolderSettings();
            }
        } else {
            alert('Failed to delete folder: ' + (res ? res.message : 'Server error'));
        }
    }

    // ======================================================================
    // 3. Workbench B: Manage Shortcuts (HTML5 Drag & Drop + External URL)
    // ======================================================================
    let cachedShortcutList = [];
    let dragSrcIndex = null;

    async function mountShortcutManagementView(container, params, routeSeq) {
        container.innerHTML = `
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-head">
                    <h2>⚙ Manage Shortcuts</h2>
                </div>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
                    Configure personal quick-jump navigation shortcuts. External links (http://, https://) and internal views (#...) are supported. Drag rows by handle (⋮⋮) to reorder.
                </p>

                <!-- Top Action Toolbar -->
                <div style="background: #f8fafc; border: 1px solid var(--border-light); padding: 14px 16px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 10px;">
                        + Register New Shortcut
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 2fr auto; gap: 10px; align-items: flex-end;">
                        <div class="form-field" style="margin-bottom: 0;">
                            <label for="newShortcutTitle">Shortcut Title * (Max 100 chars)</label>
                            <input type="text" id="newShortcutTitle" placeholder="e.g. Google Search or Event Hub" maxlength="100" class="form-input">
                        </div>
                        <div class="form-field" style="margin-bottom: 0;">
                            <label for="newShortcutHash">Destination URL / Route * (Max 200 chars)</label>
                            <input type="text" id="newShortcutHash" placeholder="e.g. #pj=1&view=project-detail or https://www.google.com" maxlength="200" class="form-input">
                        </div>
                        <div>
                            <button type="button" class="btn-submit" onclick="PortalZone8.submitNewShortcut()">Add Shortcut</button>
                        </div>
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
                        Tip: Enter an external URL starting with <code>http://</code> or <code>https://</code> to open in a new tab.
                    </div>
                </div>

                <div class="card-head" style="margin-top: 10px; padding-top: 8px;">
                    <h3>⭐ Pinned Shortcuts Table</h3>
                    <button type="button" class="btn-secondary" style="font-size: 11px;" onclick="PortalZone8.pinCurrentViewAsShortcut()">
                        ★ Pin Current Workspace View
                    </button>
                </div>

                <div style="overflow-x: auto;" id="shortcutTableWrapper">
                    <div class="empty-placeholder">Loading pinned shortcuts...</div>
                </div>
            </div>
        `;

        await reloadShortcutData(routeSeq);
    }

    async function reloadShortcutData(routeSeq) {
        const res = await api('/api/setting/shortcut/list');
        if (routeSeq && !window.PortalRouter.isRouteCurrent(routeSeq)) return;

        if (!res || res.status !== 'SUCCESS') {
            const wrap = document.getElementById('shortcutTableWrapper');
            if (wrap) wrap.innerHTML = '<div class="empty-placeholder">Failed to load shortcuts.</div>';
            return;
        }

        cachedShortcutList = res.shortcuts || [];
        renderShortcutTable(cachedShortcutList);
        renderTopShortcutMenu(cachedShortcutList);
    }

    function isExternalUrl(target) {
        if (!target) return false;
        const lower = target.trim().toLowerCase();
        return lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('//');
    }

    function renderShortcutTable(shortcuts) {
        const wrap = document.getElementById('shortcutTableWrapper');
        if (!wrap) return;

        if (shortcuts.length === 0) {
            wrap.innerHTML = '<div class="empty-placeholder">No shortcuts pinned yet. Register one above or click "Pin Current Workspace View".</div>';
            return;
        }

        wrap.innerHTML = `
            <table class="pref-table" id="shortcutSortTable">
                <thead>
                    <tr>
                        <th style="width: 5%;">#</th>
                        <th style="width: 25%;">Shortcut Title</th>
                        <th style="width: 15%;">Scope Type</th>
                        <th style="width: 35%;">Destination Target</th>
                        <th style="width: 20%; text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${shortcuts.map((sc, idx) => {
                        const isExt = isExternalUrl(sc.hashParam);

                        return `
                            <tr draggable="true" 
                                data-index="${idx}" 
                                ondragstart="PortalZone8.handleDragStart(event, ${idx})" 
                                ondragover="PortalZone8.handleDragOver(event)" 
                                ondrop="PortalZone8.handleDrop(event, ${idx})"
                                ondragend="PortalZone8.handleDragEnd(event)"
                                style="cursor: move;">
                                <td style="font-family: monospace; color: #64748b; font-weight: bold;">
                                    <span style="cursor: grab; margin-right: 4px; color: #94a3b8;">⋮⋮</span>${idx + 1}
                                </td>
                                <td><strong style="color: #1e293b;">${escapeHtml(sc.title)}</strong></td>
                                <td>
                                    ${isExt 
                                        ? '<span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">🌐 External</span>' 
                                        : '<span class="badge badge-info">📌 Internal</span>'}
                                </td>
                                <td>
                                    <code style="font-size: 11px; color: ${isExt ? '#b45309' : '#0284c7'}; word-break: break-all;">
                                        ${escapeHtml(sc.hashParam)}
                                    </code>
                                </td>
                                <td style="text-align: right;">
                                    <button type="button" class="btn-submit" style="padding: 2px 8px; font-size: 11px;" onclick="PortalZone8.navigateShortcut('${escapeHtml(sc.hashParam)}')">
                                        ${isExt ? 'Open ↗' : 'Jump'}
                                    </button>
                                    <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 11px; color: #b91c1c;" onclick="PortalZone8.deleteShortcutItem(${sc.pkT00})">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    function navigateShortcut(target) {
        if (!target) return;
        if (isExternalUrl(target)) {
            window.open(target, '_blank', 'noopener,noreferrer');
        } else {
            window.location.hash = target.startsWith('#') ? target : ('#' + target);
        }
    }

    function handleDragStart(e, idx) {
        dragSrcIndex = idx;
        e.dataTransfer.effectAllowed = 'move';
        if (e.target) e.target.classList.add('dragging');
    }

    function handleDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    async function handleDrop(e, targetIdx) {
        if (e.stopPropagation) e.stopPropagation();
        if (dragSrcIndex === null || dragSrcIndex === targetIdx) return;

        const movedItem = cachedShortcutList.splice(dragSrcIndex, 1)[0];
        cachedShortcutList.splice(targetIdx, 0, movedItem);

        const ids = cachedShortcutList.map(s => s.pkT00);
        await api('/api/setting/shortcut/reorder', {
            method: 'POST',
            body: JSON.stringify({ ids: ids })
        });

        renderShortcutTable(cachedShortcutList);
        renderTopShortcutMenu(cachedShortcutList);
    }

    function handleDragEnd(e) {
        if (e.target) e.target.classList.remove('dragging');
        document.querySelectorAll('#shortcutSortTable tr').forEach(r => r.classList.remove('dragging'));
        dragSrcIndex = null;
    }

    async function submitNewShortcut() {
        const titleEl = document.getElementById('newShortcutTitle');
        const hashEl = document.getElementById('newShortcutHash');
        if (!titleEl || !hashEl) return;

        const title = titleEl.value.trim();
        let target = hashEl.value.trim();

        if (!title || !target) {
            alert('Please enter both Shortcut Title and Destination URL/Route.');
            return;
        }

        if (target.length > 200) {
            alert('Destination URL exceeds maximum allowed limit of 200 characters.');
            return;
        }

        if (!isExternalUrl(target) && !target.startsWith('#')) {
            target = '#' + target;
        }

        const res = await api('/api/setting/shortcut/save', {
            method: 'POST',
            body: JSON.stringify({
                title: title,
                hashParam: target
            })
        });

        if (res && res.status === 'SUCCESS') {
            titleEl.value = '';
            hashEl.value = '';
            await reloadShortcutData();
        } else {
            alert('Failed to register shortcut: ' + (res ? res.message : 'Server error'));
        }
    }

    async function deleteShortcutItem(pkT00) {
        const confirmed = confirm('Are you sure you want to remove this pinned shortcut?');
        if (!confirmed) return;

        const res = await api('/api/setting/shortcut/delete', {
            method: 'POST',
            body: JSON.stringify({ pkT00: pkT00 })
        });

        if (res && res.status === 'SUCCESS') {
            await reloadShortcutData();
        } else {
            alert('Failed to remove shortcut: ' + (res ? res.message : 'Server error'));
        }
    }

    async function pinCurrentViewAsShortcut() {
        const currHash = window.location.hash || '#view=system-overview';
        const defaultTitle = document.getElementById('viewHeading')
            ? document.getElementById('viewHeading').textContent.trim()
            : 'Workspace Shortcut';

        const title = prompt('Enter title for current workspace view:', defaultTitle);
        if (!title || !title.trim()) return;

        const res = await api('/api/setting/shortcut/save', {
            method: 'POST',
            body: JSON.stringify({
                title: title.trim(),
                hashParam: currHash
            })
        });

        if (res && res.status === 'SUCCESS') {
            alert(`Shortcut "${title.trim()}" pinned successfully.`);
            await reloadShortcutData();
        } else {
            alert('Failed to pin shortcut: ' + (res ? res.message : 'Server error'));
        }
    }

    function renderTopShortcutMenu(shortcuts) {
        const container = document.getElementById('topShortcutListContainer');
        if (!container) return;

        if (!shortcuts || shortcuts.length === 0) {
            container.innerHTML = `
                <div style="padding: 10px 14px; font-size: 12px; color: #94a3b8; font-style: italic;">
                    No pinned shortcuts
                </div>
            `;
            return;
        }

        container.innerHTML = shortcuts.map(sc => {
            const isExt = isExternalUrl(sc.hashParam);
            return `
                <div class="menu-item" onclick="PortalZone8.navigateShortcut('${escapeHtml(sc.hashParam)}')" title="${escapeHtml(sc.title)} (${escapeHtml(sc.hashParam)})">
                    <span style="color: ${isExt ? '#b45309' : '#f59e0b'}; margin-right: 4px;">${isExt ? '🌐' : '★'}</span>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">
                        ${escapeHtml(sc.title)}
                    </span>
                </div>
            `;
        }).join('');
    }

    // ======================================================================
    // 4. Workbench C: Workspace Preferences & T00_Ref Governance
    // ======================================================================
    let cachedPrefData = {
        dictionaryRecords: [],
        projectRelatedRecords: [],
        systemUiRecords: []
    };

    async function mountPreferencesManagementView(container, params, routeSeq) {
        container.innerHTML = `
            <div class="card" style="margin-bottom: 20px;">
                <div class="card-head">
                    <h2>🖥️ Workspace Preferences & T00_Ref Governance</h2>
                </div>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
                    Governance console for data dictionary definitions, project configurations (FULL ownership required), and user interface settings.
                </p>

                <!-- Section A: Data Dictionary -->
                <div class="card-head" style="margin-top: 10px; padding-bottom: 6px;">
                    <h3>📚 Data Dictionary Overrides (Table A)</h3>
                </div>
                <div style="overflow-x: auto; margin-bottom: 28px;" id="prefDictTableWrapper">
                    <div class="empty-placeholder">Loading dictionary entries...</div>
                </div>

                <!-- Section B: System-Project Related Settings -->
                <div class="card-head" style="margin-top: 10px; padding-bottom: 6px;">
                    <h3>🏢 System-Project Related Configurations (Table B - Grouped by Project)</h3>
                </div>
                <div style="overflow-x: auto; margin-bottom: 28px;" id="prefPjTableWrapper">
                    <div class="empty-placeholder">Loading project-linked configurations...</div>
                </div>

                <!-- Section C: System-UI Settings -->
                <div class="card-head" style="margin-top: 10px; padding-bottom: 6px;">
                    <h3>🎨 Interface & System Settings (Table C - Grouped by Category A + Ref_Text)</h3>
                </div>
                <div style="overflow-x: auto; margin-bottom: 20px;" id="prefUiTableWrapper">
                    <div class="empty-placeholder">Loading system interface settings...</div>
                </div>
            </div>
        `;

        await reloadPrefRecords(routeSeq);
    }

    async function reloadPrefRecords(routeSeq) {
        const res = await api('/api/setting/preferences/list');
        if (routeSeq && !window.PortalRouter.isRouteCurrent(routeSeq)) return;

        if (!res || res.status !== 'SUCCESS') {
            document.getElementById('prefDictTableWrapper').innerHTML = '<div class="empty-placeholder">Failed to load preferences.</div>';
            return;
        }

        cachedPrefData = {
            dictionaryRecords: res.dictionaryRecords || [],
            projectRelatedRecords: res.projectRelatedRecords || [],
            systemUiRecords: res.systemUiRecords || []
        };

        renderDictionaryTable(cachedPrefData.dictionaryRecords);
        renderProjectRelatedTable(cachedPrefData.projectRelatedRecords);
        renderSystemUiTable(cachedPrefData.systemUiRecords);
    }

    // 可讀化自然語言轉換 (T02_PH_Status -> Phase Status)
    function formatCategoryHumanReadable(rawCategoryA) {
        if (!rawCategoryA) return 'Unknown';
        const str = rawCategoryA.trim();

        const tablePrefixMap = {
            'T01': 'Project',
            'T02': 'Phase',
            'T03': 'Event',
            'T04': 'Mission',
            'T05': 'Staff',
            'T06': 'Project Role',
            'T07': 'Join Mission',
            'T08': 'Discussion'
        };

        const parts = str.split('_');
        if (parts.length >= 2 && tablePrefixMap[parts[0]]) {
            const tableWord = tablePrefixMap[parts[0]];
            const fieldSuffix = parts[parts.length - 1];
            return `${tableWord} ${fieldSuffix}`;
        }

        return str;
    }

    function renderDictionaryTable(records) {
        const wrap = document.getElementById('prefDictTableWrapper');
        if (!wrap) return;

        if (records.length === 0) {
            wrap.innerHTML = '<div class="empty-placeholder">No personal dictionary overrides found.</div>';
            return;
        }

        wrap.innerHTML = `
            <table class="pref-table">
                <thead>
                    <tr>
                        <th style="width: 20%;">Category</th>
                        <th style="width: 18%;">Sub Category</th>
                        <th style="width: 26%;">Option Text (Ref_Text)</th>
                        <th style="width: 12%;">Status</th>
                        <th style="width: 10%;">Sort</th>
                        <th style="width: 14%; text-align: right;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map(r => `
                        <tr id="dictRow_${r.pkT00}">
                            <td><strong style="color: #1e293b;">${escapeHtml(formatCategoryHumanReadable(r.categoryA))}</strong></td>
                            <td><input type="text" id="dictSub_${r.pkT00}" value="${escapeHtml(r.categoryB || '')}" class="form-input" style="padding: 2px 6px; font-size: 12px; width: 90%;"></td>
                            <td><input type="text" id="dictText_${r.pkT00}" value="${escapeHtml(r.refText || '')}" maxlength="255" class="form-input" style="padding: 2px 6px; font-size: 12px; width: 95%;"></td>
                            <td>
                                <select id="dictStatus_${r.pkT00}" class="form-input" style="padding: 2px 4px; font-size: 12px;">
                                    <option value="Enable" ${r.categoryC === 'Enable' ? 'selected' : ''}>Enable</option>
                                    <option value="Disable" ${r.categoryC === 'Disable' ? 'selected' : ''}>Disable</option>
                                </select>
                            </td>
                            <td><input type="number" id="dictSort_${r.pkT00}" value="${r.sortValue !== null ? r.sortValue : 999}" class="form-input" style="padding: 2px 4px; font-size: 12px; width: 60px;"></td>
                            <td style="text-align: right;">
                                <button type="button" class="btn-submit" style="padding: 2px 8px; font-size: 11px;" onclick="PortalZone8.saveDictionaryRow(${r.pkT00})">Save</button>
                                <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 11px; color: #b91c1c;" onclick="PortalZone8.deletePreferenceEntry(${r.pkT00})">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async function saveDictionaryRow(pkT00) {
        const subCat = document.getElementById(`dictSub_${pkT00}`).value.trim();
        const textVal = document.getElementById(`dictText_${pkT00}`).value.trim();
        const statusVal = document.getElementById(`dictStatus_${pkT00}`).value;
        const sortVal = document.getElementById(`dictSort_${pkT00}`).value.trim();

        if (!textVal) {
            alert('Option Text (Ref_Text) cannot be empty.');
            return;
        }

        const res = await api('/api/setting/preferences/save', {
            method: 'POST',
            body: JSON.stringify({
                pkT00: pkT00,
                categoryB: subCat || null,
                categoryC: statusVal,
                sortValue: sortVal !== '' ? Number(sortVal) : 999,
                refText: textVal
            })
        });

        if (res && res.status === 'SUCCESS') {
            alert('Dictionary entry saved successfully.');
            await reloadPrefRecords();
        } else {
            alert('Failed to save dictionary entry: ' + (res ? res.message : 'Server error'));
        }
    }

    function renderProjectRelatedTable(records) {
        const wrap = document.getElementById('prefPjTableWrapper');
        if (!wrap) return;

        if (records.length === 0) {
            wrap.innerHTML = '<div class="empty-placeholder">No project-linked configurations found (or you do not possess FULL rights on configured projects).</div>';
            return;
        }

        // Group by Project ID (Ref_Text)
        const groups = {};
        records.forEach(r => {
            const pjId = r.refText || 'Unspecified';
            if (!groups[pjId]) groups[pjId] = [];
            groups[pjId].push(r);
        });

        const allProjects = (typeof userProjects !== 'undefined' && Array.isArray(userProjects)) ? userProjects : [];

        wrap.innerHTML = Object.keys(groups).map(pjId => {
            const pjObj = allProjects.find(p => String(p.pk_t01) === String(pjId));
            const pjTitle = pjObj ? `[${pjObj.pj_code}] ${pjObj.pj_name} (ID: ${pjId})` : `Project ID: ${pjId}`;

            return `
                <div style="background: #f8fafc; border: 1px solid var(--border-light); border-radius: 6px; padding: 10px 14px; margin-bottom: 14px;">
                    <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 8px;">
                        🏢 ${escapeHtml(pjTitle)}
                    </div>
                    <table class="pref-table" style="margin-top: 0; background: #ffffff;">
                        <thead>
                            <tr>
                                <th style="width: 35%;">Setting Name</th>
                                <th style="width: 40%;">Setting Value</th>
                                <th style="width: 13%;">Status</th>
                                <th style="width: 12%; text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groups[pjId].map(r => {
                                const name = extractJsonValue(r.categoryB, 'SettingName') || 'N/A';
                                const val = extractJsonValue(r.categoryB, 'SettingValue') || 'N/A';

                                return `
                                    <tr>
                                        <td><strong>${escapeHtml(name)}</strong></td>
                                        <td><code style="font-size: 11px; color: #0284c7;">${escapeHtml(val)}</code></td>
                                        <td>
                                            <select id="pjStatus_${r.pkT00}" class="form-input" style="padding: 2px 4px; font-size: 12px;" onchange="PortalZone8.updateSingleStatus(${r.pkT00}, this.value)">
                                                <option value="Enable" ${r.categoryC === 'Enable' ? 'selected' : ''}>Enable</option>
                                                <option value="Disable" ${r.categoryC === 'Disable' ? 'selected' : ''}>Disable</option>
                                            </select>
                                        </td>
                                        <td style="text-align: right;">
                                            <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 11px; color: #b91c1c;" onclick="PortalZone8.deletePreferenceEntry(${r.pkT00})">Delete</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
    }

    function renderSystemUiTable(records) {
        const wrap = document.getElementById('prefUiTableWrapper');
        if (!wrap) return;

        if (records.length === 0) {
            wrap.innerHTML = '<div class="empty-placeholder">No interface system configurations found.</div>';
            return;
        }

        // Group by Category A + Ref_Text
        const groups = {};
        records.forEach(r => {
            const groupKey = `${r.categoryA} | Target: ${r.refText || 'GLOBAL'}`;
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(r);
        });

        wrap.innerHTML = Object.keys(groups).map(groupKey => `
            <div style="background: #f8fafc; border: 1px solid var(--border-light); border-radius: 6px; padding: 10px 14px; margin-bottom: 14px;">
                <div style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 8px; font-family: monospace;">
                    🎨 ${escapeHtml(groupKey)}
                </div>
                <table class="pref-table" style="margin-top: 0; background: #ffffff;">
                    <thead>
                        <tr>
                            <th style="width: 35%;">Setting Name</th>
                            <th style="width: 40%;">Setting Value</th>
                            <th style="width: 13%;">Status</th>
                            <th style="width: 12%; text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${groups[groupKey].map(r => {
                            const name = extractJsonValue(r.categoryB, 'SettingName') || 'N/A';
                            const val = extractJsonValue(r.categoryB, 'SettingValue') || 'N/A';

                            return `
                                <tr>
                                    <td><strong>${escapeHtml(name)}</strong></td>
                                    <td><code style="font-size: 11px; color: #0284c7;">${escapeHtml(val)}</code></td>
                                    <td>
                                        <select id="uiStatus_${r.pkT00}" class="form-input" style="padding: 2px 4px; font-size: 12px;" onchange="PortalZone8.updateSingleStatus(${r.pkT00}, this.value)">
                                            <option value="Enable" ${r.categoryC === 'Enable' ? 'selected' : ''}>Enable</option>
                                            <option value="Disable" ${r.categoryC === 'Disable' ? 'selected' : ''}>Disable</option>
                                        </select>
                                    </td>
                                    <td style="text-align: right;">
                                        <button type="button" class="btn-secondary" style="padding: 2px 8px; font-size: 11px; color: #b91c1c;" onclick="PortalZone8.deletePreferenceEntry(${r.pkT00})">Delete</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `).join('');
    }

    async function updateSingleStatus(pkT00, newStatus) {
        const res = await api('/api/setting/preferences/save', {
            method: 'POST',
            body: JSON.stringify({
                pkT00: pkT00,
                categoryC: newStatus
            })
        });

        if (!res || res.status !== 'SUCCESS') {
            alert('Failed to update status: ' + (res ? res.message : 'Server error'));
            await reloadPrefRecords();
        }
    }

    async function deletePreferenceEntry(pkT00) {
        const confirmed = confirm(`Are you sure you want to permanently delete configuration entry #${pkT00}?`);
        if (!confirmed) return;

        const res = await api('/api/setting/preferences/delete', {
            method: 'POST',
            body: JSON.stringify({ pkT00: pkT00 })
        });

        if (res && res.status === 'SUCCESS') {
            await reloadPrefRecords();
        } else {
            alert('Failed to delete configuration entry: ' + (res ? res.message : 'Server error'));
        }
    }

    function extractJsonValue(json, key) {
        if (!json) return null;
        const pattern = `"${key}":"`;
        const start = json.indexOf(pattern);
        if (start !== -1) {
            const valStart = start + pattern.length;
            const end = json.indexOf('"', valStart);
            if (end !== -1) return json.substring(valStart, end);
        }
        return null;
    }

    // ======================================================================
    // 5. Public Namespace Exports
    // ======================================================================
    window.PortalZone8 = {
        // Folder Methods
        selectFolderCard,
        selectUncategorizedView,
        toggleFolderZone4Visibility,
        toggleTransferProjectSelection,
        executeProjectAssignment,
        openCreateFolderModal,
        openRenameFolderModal,
        deleteFolderCategory,
        // Shortcut Methods
        submitNewShortcut,
        deleteShortcutItem,
        pinCurrentViewAsShortcut,
        navigateShortcut,
        handleDragStart,
        handleDragOver,
        handleDrop,
        handleDragEnd,
        renderTopShortcutMenu,
        // Preferences Methods
        saveDictionaryRow,
        updateSingleStatus,
        deletePreferenceEntry
    };

})(window);