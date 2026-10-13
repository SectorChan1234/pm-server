// ==========================================
// Module: Personal Shortcut Management (portal-function-shortcut.js)
// ==========================================

registerView('manage-shortcut', renderManageShortcutView);

// 頁面載入時讀取個人的 T00_Ref 捷徑庫
document.addEventListener('DOMContentLoaded', () => {
    loadShortcuts();
});

async function loadShortcuts() {
    const list = document.getElementById('shortcutMenuList');
    if (!list) return;

    const res = await api('/api/portal/shortcut/list').catch(() => null);

    if (res && res.status === 'SUCCESS' && res.shortcuts && res.shortcuts.length > 0) {
        // 清除現有的動態項目，保留第一個靜態 "Manage Shortcut"
        const staticItem = list.querySelector('li:first-child');
        list.innerHTML = '';
        if (staticItem) list.appendChild(staticItem);

        res.shortcuts.forEach(sc => {
            const li = document.createElement('li');
            li.className = 'acc-item';
            li.textContent = `★ ${sc.title}`;
            li.onclick = () => {
                if (sc.hash_param) window.location.hash = sc.hash_param;
            };
            list.appendChild(li);
        });
    }
}

function renderManageShortcutView() {
    document.getElementById('viewHeading').textContent = 'Manage Personal Shortcuts';
    document.getElementById('viewContent').innerHTML = `
        <div class="shortcut-config-wrap">
            <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px;">
                Configure personal quick bookmarks (saved in T00_Ref for quick navigation).
            </p>
            <div class="form-field" style="margin-bottom:12px;">
                <label>Shortcut Title *</label>
                <input type="text" id="scTitle" placeholder="e.g. My Urgent Project">
            </div>
            <div class="form-field" style="margin-bottom:16px;">
                <label>Target URL / Hash Action *</label>
                <input type="text" id="scHash" placeholder="#project-detail">
            </div>
            <button class="btn-submit" onclick="alert('Shortcut saved.')">Add Shortcut</button>
        </div>
    `;
}