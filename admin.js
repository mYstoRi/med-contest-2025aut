// ========================================
// Admin Dashboard JavaScript
// ========================================

const API_BASE = '/api/admin';

// ========================================
// State
// ========================================
let isAuthenticated = false;
let currentTab = 'activities';

// ========================================
// DOM Elements
// ========================================
const $ = (id) => document.getElementById(id);

// ========================================
// Toast Notifications
// ========================================
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================================
// API Helpers
// ========================================
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('admin_token');

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
            credentials: 'include',
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error(`API error (${endpoint}):`, error);
        throw error;
    }
}

// ========================================
// Authentication
// ========================================
async function checkAuth() {
    try {
        const data = await apiCall('/auth');
        return data.authenticated;
    } catch {
        return false;
    }
}

async function login(password) {
    const data = await apiCall('/auth', {
        method: 'POST',
        body: JSON.stringify({ password }),
    });

    if (data.token) {
        localStorage.setItem('admin_token', data.token);
    }

    return data.success;
}

async function logout() {
    try {
        await apiCall('/auth', { method: 'DELETE' });
    } catch (e) {
        console.error('Logout error:', e);
    }
    localStorage.removeItem('admin_token');
    showLoginScreen();
}

function showLoginScreen() {
    $('loginScreen').classList.remove('hidden');
    $('adminDashboard').classList.add('hidden');
    isAuthenticated = false;
}

function showDashboard() {
    $('loginScreen').classList.add('hidden');
    $('adminDashboard').classList.remove('hidden');
    isAuthenticated = true;

    // Load initial data
    loadActivities();
    populateTeamDropdowns();
}

// ========================================
// Activities
// ========================================
let allActivities = []; // Store for filtering

async function loadActivities() {
    const tbody = $('activitiesTable');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">載入中...</td></tr>';

    try {
        const data = await apiCall('/activities');
        allActivities = data.activities || [];
        renderActivities();
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444;">載入失敗: ${error.message}</td></tr>`;
    }
}

function renderActivities() {
    const tbody = $('activitiesTable');
    const searchTerm = ($('searchInput')?.value || '').toLowerCase();
    const filterType = $('filterType')?.value || '';
    const filterTeam = $('filterTeam')?.value || '';

    // Filter activities
    const filtered = allActivities.filter(activity => {
        const matchesSearch = !searchTerm || activity.member.toLowerCase().includes(searchTerm);
        const matchesType = !filterType || activity.type === filterType;
        const matchesTeam = !filterTeam || activity.team === filterTeam;
        return matchesSearch && matchesType && matchesTeam;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">暫無活動記錄</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(activity => `
        <tr>
            <td><span class="team-badge ${activity.team}">${getTeamShortName(activity.team)}</span></td>
            <td>${activity.member}</td>
            <td>${formatActivityDate(activity.date)}</td>
            <td><span class="type-tag ${activity.type}">${getTypeEmoji(activity.type)}</span> ${formatActivityValue(activity)}</td>
            <td>
                <button class="action-btn danger" onclick="deleteActivity('${activity.id}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function getTeamShortName(team) {
    const shortNames = {
        '晨絜家中隊': '晨絜',
        '明緯家中隊': '明緯',
        '敬涵家中隊': '敬涵',
        '宗翰家中隊': '宗翰'
    };
    return shortNames[team] || team;
}

function getTypeEmoji(type) {
    const emojis = { meditation: '🧘', practice: '🙏', class: '📚' };
    return emojis[type] || '';
}

function getTypeLabel(type) {
    const labels = {
        meditation: '🧘 禪定',
        practice: '🙏 共修',
        class: '📚 會館課',
    };
    return labels[type] || type;
}

function formatActivityValue(activity) {
    switch (activity.type) {
        case 'meditation':
            return activity.value + ' 分鐘';
        case 'practice':
            return activity.value + ' 分';
        case 'class':
            return '—'; // dash for class attendance
        default:
            return activity.value;
    }
}

// Format date to always include year (YYYY/MM/DD)
function formatActivityDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('/');

    if (parts.length === 3) {
        // Already has year: YYYY/MM/DD
        return dateStr;
    } else if (parts.length === 2) {
        // MM/DD format - add year
        const month = parseInt(parts[0], 10);
        const day = parts[1];
        const year = month < 6 ? 2026 : 2025;
        return `${year}/${month}/${day}`;
    }
    return dateStr;
}

async function addActivity(event) {
    event.preventDefault();

    const activity = {
        type: $('activityType').value,
        team: $('activityTeam').value,
        member: $('activityMember').value,
        date: $('activityDate').value,
        value: parseFloat($('activityValue').value) || 1,
    };

    try {
        await apiCall('/activities', {
            method: 'POST',
            body: JSON.stringify(activity),
        });

        showToast('活動已新增');
        $('addActivityForm').reset();
        loadActivities();
    } catch (error) {
        showToast(`新增失敗: ${error.message}`, 'error');
    }
}

async function deleteActivity(id) {
    if (!confirm('確定要刪除這筆活動記錄嗎？')) return;

    try {
        await apiCall(`/activities?id=${id}`, { method: 'DELETE' });
        showToast('活動已刪除');
        loadActivities();
    } catch (error) {
        showToast(`刪除失敗: ${error.message}`, 'error');
    }
}

// Make deleteActivity available globally for onclick
window.deleteActivity = deleteActivity;

// ========================================
// Members
// ========================================
async function loadMembers() {
    const tbody = $('membersTable');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">載入中...</td></tr>';

    try {
        const data = await apiCall('/members');

        if (data.members.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">暫無成員</td></tr>';
            return;
        }

        tbody.innerHTML = data.members.map(member => {
            const totalScore = (member.meditationTotal || 0) + (member.practiceTotal || 0) + (member.classTotal || 0);
            return `
            <tr>
                <td>${member.name}</td>
                <td><span class="team-badge ${member.team}">${getTeamShortName(member.team)}</span></td>
                <td>${totalScore} 分</td>
                <td>
                    <button class="action-btn danger" onclick="deleteMember('${member.id}')">🗑️</button>
                </td>
            </tr>
        `}).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #ef4444;">載入失敗: ${error.message}</td></tr>`;
    }
}

function formatDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

async function addMember(event) {
    event.preventDefault();

    const member = {
        name: $('memberName').value,
        team: $('memberTeam').value,
    };

    try {
        await apiCall('/members', {
            method: 'POST',
            body: JSON.stringify(member),
        });

        showToast('成員已新增');
        $('addMemberForm').reset();
        loadMembers();
    } catch (error) {
        showToast(`新增失敗: ${error.message}`, 'error');
    }
}

async function deleteMember(id) {
    if (!confirm('確定要刪除這位成員嗎？')) return;

    try {
        await apiCall(`/members?id=${id}`, { method: 'DELETE' });
        showToast('成員已刪除');
        loadMembers();
    } catch (error) {
        showToast(`刪除失敗: ${error.message}`, 'error');
    }
}

// Make deleteMember available globally for onclick
window.deleteMember = deleteMember;

// ========================================
// Cache
// ========================================
async function loadCacheStatus() {
    const statusEl = $('cacheStatus');

    try {
        const data = await apiCall('/invalidate');

        let indicatorClass = '';
        let statusText = '';

        if (!data.hasCachedData) {
            indicatorClass = 'empty';
            statusText = '❌ 無快取資料';
        } else if (data.cacheAge && parseInt(data.cacheAge) > 300) {
            indicatorClass = 'stale';
            statusText = `⚠️ 快取較舊 (${data.cacheAge})`;
        } else {
            indicatorClass = '';
            statusText = `✅ 快取正常 - 上次同步: ${data.lastSyncedAt || 'N/A'}`;
        }

        statusEl.innerHTML = `
            <div class="cache-indicator ${indicatorClass}"></div>
            <span>${statusText}</span>
        `;
    } catch (error) {
        statusEl.innerHTML = `
            <div class="cache-indicator empty"></div>
            <span>❌ 無法獲取快取狀態</span>
        `;
    }
}

// ========================================
// Helpers
// ========================================
function getTeamShortName(teamName) {
    const team = allTeams.find(t => t.name === teamName);
    return team ? team.shortName : teamName;
}

// ========================================
// Bulk Activity (Add Records Tab)
// ========================================
let membersByTeam = {}; // Cache for member data

async function loadAddRecordsTab() {
    const container = $('teamCheckboxes');
    container.innerHTML = '<p class="loading">載入成員中... Loading members...</p>';

    try {
        // Ensure we have teams loaded
        if (allTeams.length === 0) {
            const teamData = await apiCall('/teams');
            allTeams = teamData.teams || [];
        }

        // Load members
        const data = await apiCall('/members');

        // Group members by team
        membersByTeam = {};
        // Initialize with all teams
        allTeams.forEach(team => membersByTeam[team.name] = []);

        // Sort members into teams
        data.members.forEach(member => {
            // Only add if team exists in our known teams (or create entry if using fallback)
            if (!membersByTeam[member.team]) {
                membersByTeam[member.team] = [];
            }
            membersByTeam[member.team].push(member.name);
        });

        if (allTeams.length === 0) {
            container.innerHTML = '<p class="error-msg">找不到隊伍 No teams found</p>';
            return;
        }

        // Render team checkboxes
        container.innerHTML = allTeams.map(team => {
            const teamName = team.name;
            const members = membersByTeam[teamName] || [];

            if (members.length === 0) return ''; // Skip empty teams if desired, or show empty

            return `
                <div class="team-group">
                    <div class="team-group-header">
                        <span class="team-badge ${teamName}" style="background-color: ${team.color || '#ccc'}">${team.shortName}</span>
                        <button type="button" class="select-all-btn" onclick="toggleTeam('${teamName}')">全選</button>
                    </div>
                    <div class="member-checkboxes">
                        ${members.map(name => `
                            <div class="member-checkbox">
                                <input type="checkbox" id="member_${name}" data-team="${teamName}" data-name="${name}">
                                <label for="member_${name}">${name}</label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // Add change listeners to update count
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', updateSelectedCount);
        });

    } catch (error) {
        container.innerHTML = `<p style="color: #ef4444;">載入失敗: ${error.message}</p>`;
    }
}

function toggleTeam(teamName) {
    const checkboxes = document.querySelectorAll(`input[data-team="${teamName}"]`);
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateSelectedCount();
}

// Make toggleTeam available globally
window.toggleTeam = toggleTeam;

function updatePointsVisibility() {
    const type = $('bulkType').value;
    const pointsGroup = $('pointsGroup');
    if (type === 'class') {
        pointsGroup.style.display = 'none';
        $('bulkPoints').value = 50; // Fixed 50 for class
    } else {
        pointsGroup.style.display = 'block';
    }
}

function updateSelectedCount() {
    const checked = document.querySelectorAll('#teamCheckboxes input[type="checkbox"]:checked');
    $('selectedCount').textContent = `Selected: ${checked.length}`;
}

async function submitActivities() {
    const type = $('bulkType').value;
    const dateInput = $('bulkDate').value;
    const points = parseInt($('bulkPoints').value) || 50;

    // Get selected members
    const checkedBoxes = document.querySelectorAll('#teamCheckboxes input[type="checkbox"]:checked');
    const selectedMembers = Array.from(checkedBoxes).map(cb => ({
        name: cb.dataset.name,
        team: cb.dataset.team
    }));

    if (selectedMembers.length === 0) {
        showToast('請選擇至少一位參與者', 'error');
        return;
    }

    if (!dateInput) {
        showToast('請選擇日期', 'error');
        return;
    }

    // Convert YYYY-MM-DD to YYYY/MM/DD
    const date = dateInput.replace(/-/g, '/');

    // Create activities array
    const activities = selectedMembers.map(member => ({
        type,
        team: member.team,
        member: member.name,
        date,
        value: type === 'class' ? 1 : points
    }));

    try {
        $('submitActivities').disabled = true;
        $('submitActivities').textContent = '提交中...';

        // Submit all activities
        await apiCall('/activities', {
            method: 'POST',
            body: JSON.stringify({ activities })
        });

        showToast(`已新增 ${activities.length} 筆活動記錄`);

        // Clear selections
        document.querySelectorAll('#teamCheckboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateSelectedCount();

    } catch (error) {
        showToast(`新增失敗: ${error.message}`, 'error');
    } finally {
        $('submitActivities').disabled = false;
        $('submitActivities').textContent = '➕ Submit Activities';
    }
}

// ========================================
// Sync (Data Sync Tab)
// ========================================
async function loadSyncTab() {
    // Get last sync time from API
    try {
        const response = await fetch('/api/data');
        const data = await response.json();

        const lastSyncEl = $('lastSyncTime');
        if (data.syncedAt) {
            const syncDate = new Date(data.syncedAt);
            lastSyncEl.textContent = syncDate.toLocaleString('zh-TW');
        } else {
            lastSyncEl.textContent = '從未同步 Never synced';
        }

        // Also show if data is empty
        if (data.isEmpty) {
            $('syncResult').innerHTML = `
                <div style="padding: var(--spacing-md); background: rgba(245, 158, 11, 0.1); border-radius: var(--radius-sm); border: 1px solid rgba(245, 158, 11, 0.3);">
                    <p style="color: #f59e0b;">⚠️ 資料庫是空的。請執行同步以匯入資料。</p>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">Database is empty. Run a sync to import data.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load sync status:', error);
        $('lastSyncTime').textContent = '無法獲取 Could not fetch';
    }
}

async function performSync(mode) {
    const statusEl = $('syncStatus');
    const resultEl = $('syncResult');
    const mergeBtn = $('syncMergeBtn');
    const overwriteBtn = $('syncOverwriteBtn');

    // Disable buttons and show loading
    mergeBtn.disabled = true;
    overwriteBtn.disabled = true;
    statusEl.style.display = 'block';
    resultEl.innerHTML = '';

    try {
        const response = await apiCall('/sync', {
            method: 'POST',
            body: JSON.stringify({ mode }),
        });

        // Show success
        resultEl.innerHTML = `
            <div style="padding: var(--spacing-md); background: rgba(16, 185, 129, 0.1); border-radius: var(--radius-sm); border: 1px solid rgba(16, 185, 129, 0.3);">
                <p style="color: #10b981; font-weight: 600;">✅ 同步成功！ Sync successful!</p>
                <p style="color: var(--text-secondary); margin-top: 8px;">
                    模式 Mode: <strong>${mode === 'overwrite' ? '覆蓋 Overwrite' : '合併 Merge'}</strong><br>
                    禪定成員 Meditation members: ${response.stats?.meditation || 0}<br>
                    共修成員 Practice members: ${response.stats?.practice || 0}<br>
                    會館課成員 Class members: ${response.stats?.class || 0}
                </p>
            </div>
        `;

        // Update last sync time
        $('lastSyncTime').textContent = new Date().toLocaleString('zh-TW');

        showToast('同步成功 Sync completed!');

    } catch (error) {
        resultEl.innerHTML = `
            <div style="padding: var(--spacing-md); background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-sm); border: 1px solid rgba(239, 68, 68, 0.3);">
                <p style="color: #ef4444; font-weight: 600;">❌ 同步失敗 Sync failed</p>
                <p style="color: var(--text-secondary); margin-top: 8px;">${error.message}</p>
            </div>
        `;
        showToast(`同步失敗: ${error.message}`, 'error');
    } finally {
        statusEl.style.display = 'none';
        mergeBtn.disabled = false;
        overwriteBtn.disabled = false;
    }
}

// ========================================
// Teams
// ========================================
let allTeams = [];

async function loadTeamsTab() {
    const table = $('teamsTable');
    table.innerHTML = '<tr><td colspan="4" class="loading">載入中...</td></tr>';

    try {
        const data = await apiCall('/teams');
        allTeams = data.teams || [];

        if (allTeams.length === 0) {
            table.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">沒有隊伍 No teams</td></tr>';
            return;
        }

        table.innerHTML = allTeams.map(team => `
            <tr>
                <td>
                    <span style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; background: ${team.color}; vertical-align: middle;"></span>
                </td>
                <td>${team.name}</td>
                <td>${team.shortName}</td>
                <td>
                    <button class="action-btn small" onclick="editTeam('${team.id}')" title="編輯">✏️</button>
                    <button class="action-btn small danger" onclick="deleteTeam('${team.id}', '${team.name}')" title="刪除">🗑️</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        table.innerHTML = `<tr><td colspan="4" style="color: #ef4444;">載入失敗: ${error.message}</td></tr>`;
    }
}

async function addTeam(event) {
    event.preventDefault();

    const name = $('teamName').value.trim();
    const shortName = $('teamShortName').value.trim();
    const color = $('teamColor').value;

    try {
        await apiCall('/teams', {
            method: 'POST',
            body: JSON.stringify({ name, shortName, color }),
        });

        showToast('隊伍已新增 Team added');
        $('addTeamForm').reset();
        loadTeamsTab();
    } catch (error) {
        showToast('新增失敗: ' + error.message, 'error');
    }
}

async function deleteTeam(id, name) {
    if (!confirm(`確定要刪除「${name}」嗎？\nDelete "${name}"?`)) return;

    try {
        await apiCall(`/teams?id=${id}`, { method: 'DELETE' });
        showToast('隊伍已刪除 Team deleted');
        loadTeamsTab();
    } catch (error) {
        showToast('刪除失敗: ' + error.message, 'error');
    }
}

async function editTeam(id) {
    const team = allTeams.find(t => t.id === id);
    if (!team) return;

    const newName = prompt('隊伍名稱 Team name:', team.name);
    if (newName === null) return; // Cancelled

    const newShortName = prompt('簡稱 Short name:', team.shortName);
    if (newShortName === null) return; // Cancelled

    // Color picker - show available colors
    const colorOptions = [
        { hex: '#8b5cf6', name: '🟣 紫色' },
        { hex: '#10b981', name: '🟢 綠色' },
        { hex: '#f59e0b', name: '🟠 橙色' },
        { hex: '#ef4444', name: '🔴 紅色' },
        { hex: '#3b82f6', name: '🔵 藍色' },
        { hex: '#ec4899', name: '🩷 粉色' },
        { hex: '#06b6d4', name: '🩵 青色' },
        { hex: '#84cc16', name: '🟢 萊姆' },
    ];

    const currentColorIdx = colorOptions.findIndex(c => c.hex === team.color) + 1;
    const colorList = colorOptions.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const colorPrompt = `選擇顏色 Choose color (1-${colorOptions.length}):\n${colorList}\n\n目前 Current: ${currentColorIdx || team.color}`;
    const colorChoice = prompt(colorPrompt, currentColorIdx || '');

    let newColor = team.color;
    if (colorChoice !== null && colorChoice !== '') {
        const idx = parseInt(colorChoice) - 1;
        if (idx >= 0 && idx < colorOptions.length) {
            newColor = colorOptions[idx].hex;
        }
    }

    try {
        await apiCall(`/teams?id=${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: newName || undefined,
                shortName: newShortName || undefined,
                color: newColor
            }),
        });
        showToast('隊伍已更新 Team updated');
        loadTeamsTab();
    } catch (error) {
        showToast('更新失敗: ' + error.message, 'error');
    }
}

// Make team functions available globally
window.deleteTeam = deleteTeam;
window.editTeam = editTeam;

/**
 * Populate all team dropdown selects with teams from API
 */
async function populateTeamDropdowns() {
    try {
        const data = await apiCall('/teams');
        const teams = data.teams || [];
        allTeams = teams; // Update global cache

        // Populate filter dropdown
        const filterTeam = $('filterTeam');
        if (filterTeam) {
            // Keep the "All" option
            const firstOption = filterTeam.querySelector('option');
            filterTeam.innerHTML = '';
            filterTeam.appendChild(firstOption);

            for (const team of teams) {
                const option = document.createElement('option');
                option.value = team.name;
                option.textContent = team.name;
                filterTeam.appendChild(option);
            }
        }

        // Populate member form dropdown
        const memberTeam = $('memberTeam');
        if (memberTeam) {
            const firstOption = memberTeam.querySelector('option');
            memberTeam.innerHTML = '';
            memberTeam.appendChild(firstOption);

            for (const team of teams) {
                const option = document.createElement('option');
                option.value = team.name;
                option.textContent = team.name;
                memberTeam.appendChild(option);
            }
        }

        console.log('Populated team dropdowns with', teams.length, 'teams');
    } catch (error) {
        console.error('Failed to populate team dropdowns:', error);
    }
}

// ========================================
// Tab Navigation
// ========================================
function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `${tabName}Panel`);
    });

    // Load data for the tab
    if (tabName === 'activities') loadActivities();
    if (tabName === 'members') loadMembers();
    if (tabName === 'addRecords') loadAddRecordsTab();
    if (tabName === 'teams') loadTeamsTab();
    if (tabName === 'sync') loadSyncTab();
}

// ========================================
// Event Listeners
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Check if already authenticated
    const isAuthed = await checkAuth();
    if (isAuthed) {
        showDashboard();
    } else {
        showLoginScreen();
    }

    // Login form
    $('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('loginBtn');
        const errorEl = $('loginError');

        btn.disabled = true;
        btn.textContent = '登入中...';
        errorEl.classList.add('hidden');

        try {
            const password = $('passwordInput').value;
            await login(password);
            showDashboard();
        } catch (error) {
            errorEl.textContent = error.message || '登入失敗';
            errorEl.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = '登入 Login';
        }
    });

    // Logout
    $('logoutBtn').addEventListener('click', logout);

    // Tab navigation
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Forms
    $('addMemberForm').addEventListener('submit', addMember);
    $('addTeamForm').addEventListener('submit', addTeam);

    // Refresh buttons
    $('refreshActivities').addEventListener('click', loadActivities);
    $('refreshMembers').addEventListener('click', loadMembers);
    $('refreshTeams')?.addEventListener('click', loadTeamsTab);

    // Activity filters
    $('searchInput').addEventListener('input', renderActivities);
    $('filterType').addEventListener('change', renderActivities);
    $('filterTeam').addEventListener('change', renderActivities);

    // Bulk activity form
    $('bulkType').addEventListener('change', updatePointsVisibility);
    $('submitActivities').addEventListener('click', submitActivities);

    // Sync buttons
    $('syncMergeBtn')?.addEventListener('click', () => performSync('merge'));
    $('syncOverwriteBtn')?.addEventListener('click', () => {
        if (confirm('⚠️ 警告！這會覆蓋資料庫中的所有資料！\n\nWARNING: This will OVERWRITE all database data!\n\n確定要繼續嗎？ Are you sure?')) {
            performSync('overwrite');
        }
    });

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    $('bulkDate').value = today;
});
