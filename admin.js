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
    loadCacheStatus();
}

// ========================================
// Activities
// ========================================
async function loadActivities() {
    const tbody = $('activitiesTable');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">載入中...</td></tr>';

    try {
        const data = await apiCall('/activities');

        if (data.activities.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">暫無活動記錄</td></tr>';
            return;
        }

        tbody.innerHTML = data.activities.map(activity => `
            <tr>
                <td><span class="status-badge ${activity.type}">${getTypeLabel(activity.type)}</span></td>
                <td>${activity.team}</td>
                <td>${activity.member}</td>
                <td>${activity.date}</td>
                <td>${formatActivityValue(activity)}</td>
                <td>
                    <button class="action-btn danger" onclick="deleteActivity('${activity.id}')">🗑️</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #ef4444;">載入失敗: ${error.message}</td></tr>`;
    }
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
            const totalScore = (member.meditationTotal || 0) + (member.practiceTotal || 0);
            return `
            <tr>
                <td>${member.name}</td>
                <td>${member.team}</td>
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

async function invalidateCache() {
    try {
        await apiCall('/invalidate', { method: 'POST' });
        showToast('快取已清除');
        loadCacheStatus();
    } catch (error) {
        showToast(`清除失敗: ${error.message}`, 'error');
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
    if (tabName === 'cache') loadCacheStatus();
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
    $('addActivityForm').addEventListener('submit', addActivity);
    $('addMemberForm').addEventListener('submit', addMember);

    // Refresh buttons
    $('refreshActivities').addEventListener('click', loadActivities);
    $('refreshMembers').addEventListener('click', loadMembers);
    $('invalidateCache').addEventListener('click', invalidateCache);
});
