// ==========================================
// Module: Mission Management (portal-function-mission.js)
// ==========================================

registerView('new-mission', renderNewMissionForm);
registerView('mission-detail', renderMissionDetailOverview);
registerView('assign-mission', renderAssignMissionView);
registerView('my-handle-mission', loadMyHandleMissions);
registerView('my-joined-mission', loadMyJoinedMissions);

function renderNewMissionForm() {
    document.getElementById('viewHeading').textContent = 'Create New Mission';
    document.getElementById('viewContent').innerHTML = `
        <div style="max-width:540px;">
            <div class="form-field" style="margin-bottom:12px;">
                <label>Mission Title *</label>
                <input type="text" id="msTitle" placeholder="e.g. Prepare System Integration Test Cases">
            </div>
            <div class="form-field" style="margin-bottom:12px;">
                <label>Person In Charge (PIC) *</label>
                <input type="text" id="msPic" placeholder="Enter officer name or email">
            </div>
            <div class="form-field" style="margin-bottom:16px;">
                <label>Target Due Date</label>
                <input type="date" id="msDueDate">
            </div>
            <button class="btn-submit" onclick="alert('Mission creation ready.')">Create Mission</button>
        </div>
    `;
}

function renderMissionDetailOverview() {
    document.getElementById('viewHeading').textContent = 'Mission Details';
    document.getElementById('viewContent').innerHTML = `
        <div class="empty-placeholder">Select a mission from "My Handle Mission" or "My Joined Mission" to inspect.</div>
    `;
}

function renderAssignMissionView() {
    document.getElementById('viewHeading').textContent = 'Assign Mission to Team';
    document.getElementById('viewContent').innerHTML = `
        <div class="mission-assign-wrap">
            <p style="color:var(--text-muted); margin-bottom:16px;">Dispatch tasks to team members (PIC or Joint Collaborators).</p>
            <div class="form-field" style="margin-bottom:12px;">
                <label>Select Project & Event *</label>
                <select id="assignProjectSelect">
                    <option value="">Current Project: [${currentProjectId}]</option>
                </select>
            </div>
            <div class="form-field" style="margin-bottom:12px;">
                <label>Mission Title *</label>
                <input type="text" placeholder="Title of dispatch task">
            </div>
            <div class="form-field" style="margin-bottom:16px;">
                <label>Assignee (PIC) *</label>
                <input type="text" placeholder="Search team member">
            </div>
            <button class="btn-submit" onclick="alert('Mission assigned successfully.')">Dispatch Mission</button>
        </div>
    `;
}

async function loadMyHandleMissions() {
    document.getElementById('viewHeading').textContent = 'My Handle Missions (PIC)';
    const container = document.getElementById('viewContent');
    container.innerHTML = '<div class="empty-placeholder">Loading missions under your charge...</div>';

    const res = await api('/api/portal/mission/my-handle-missions');
    if (!res || res.status !== 'SUCCESS' || !res.missions || res.missions.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No missions assigned as PIC.</div>';
        return;
    }

    container.innerHTML = '';
    res.missions.forEach(ms => {
        const item = document.createElement('div');
        item.className = 'item-card';
        item.innerHTML = `
            <div class="item-card-main">
                <span class="item-title">[${escapeHtml(ms.pj_code)}] ${escapeHtml(ms.ms_title)}</span>
                <div class="item-meta">
                    <span>Due: ${ms.start_datetime ? ms.start_datetime.substring(0, 10) : 'None'}</span>
                    <span>Status: ${escapeHtml(ms.ms_status || 'In Progress')}</span>
                </div>
            </div>
            <div>
                <span class="badge ${ms.is_frozen ? 'badge-frozen' : 'badge-active'}">
                    ${ms.is_frozen ? 'Frozen' : 'Active'}
                </span>
            </div>
        `;
        item.onclick = () => loadThread({ ms: ms.pk_t04 }, `Mission: ${ms.ms_title}`, 'Mission Level');
        container.appendChild(item);
    });
}

async function loadMyJoinedMissions() {
    document.getElementById('viewHeading').textContent = 'My Joined Missions (Collaborator)';
    const container = document.getElementById('viewContent');
    container.innerHTML = '<div class="empty-placeholder">Loading missions you joined...</div>';

    const res = await api('/api/portal/mission/my-joined-missions');
    if (!res || res.status !== 'SUCCESS' || !res.missions || res.missions.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No joined missions found.</div>';
        return;
    }

    container.innerHTML = '';
    res.missions.forEach(ms => {
        const item = document.createElement('div');
        item.className = 'item-card';
        item.innerHTML = `
            <div class="item-card-main">
                <span class="item-title">[${escapeHtml(ms.pj_code)}] ${escapeHtml(ms.ms_title)}</span>
                <div class="item-meta">
                    <span>Role: Collaborator</span>
                    <span>Status: ${escapeHtml(ms.ms_status || 'In Progress')}</span>
                </div>
            </div>
            <div>
                <span class="badge badge-info">Joined</span>
            </div>
        `;
        item.onclick = () => loadThread({ ms: ms.pk_t04 }, `Mission: ${ms.ms_title}`, 'Mission Level');
        container.appendChild(item);
    });
}