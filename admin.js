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
// Bulk Activity (Add Records Tab)
// ========================================
let membersByTeam = {}; // Cache for member data

async function loadAddRecordsTab() {
    const container = $('teamCheckboxes');

    try {
        // Load members grouped by team
        const data = await apiCall('/members');

        // Group members by team
        membersByTeam = {};
        const teams = ['晨絜家中隊', '明緯家中隊', '敬涵家中隊', '宗翰家中隊'];
        teams.forEach(team => membersByTeam[team] = []);

        data.members.forEach(member => {
            if (membersByTeam[member.team]) {
                membersByTeam[member.team].push(member.name);
            }
        });

        // Render team checkboxes
        container.innerHTML = teams.map(team => {
            const members = membersByTeam[team] || [];
            const shortName = getTeamShortName(team);
            return `
                <div class="team-group">
                    <div class="team-group-header">
                        <span class="team-badge ${team}">${shortName}</span>
                        <button type="button" class="select-all-btn" onclick="toggleTeam('${team}')">全選</button>
                    </div>
                    <div class="member-checkboxes">
                        ${members.map(name => `
                            <div class="member-checkbox">
                                <input type="checkbox" id="member_${name}" data-team="${team}" data-name="${name}">
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

    // Refresh buttons
    $('refreshActivities').addEventListener('click', loadActivities);
    $('refreshMembers').addEventListener('click', loadMembers);

    // Activity filters
    $('searchInput').addEventListener('input', renderActivities);
    $('filterType').addEventListener('change', renderActivities);
    $('filterTeam').addEventListener('change', renderActivities);

    // Bulk activity form
    $('bulkType').addEventListener('change', updatePointsVisibility);
    $('submitActivities').addEventListener('click', submitActivities);

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    $('bulkDate').value = today;
});
