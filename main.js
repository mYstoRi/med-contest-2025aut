// ========================================
// Imports from Shared Modules
// ========================================
// import { CONFIG } from './config.js'; // REMOVED
import {
    cleanName,
    formatNumber,
    formatDate,
    initTheme,
    initSettings
} from './utils.js';

// Team data from API (loaded dynamically)
let teamsFromAPI = [];
let teamColorMap = {}; // { teamName: hexColor }

// Get team color (uses API data or fallback)
function getTeamColor(teamName) {
    return teamColorMap[teamName] || '#8b5cf6'; // Default purple
}

// ========================================
// Rendering Functions
// ========================================
function renderTeamBars(teamScores) {
    const container = document.getElementById('teamBars');
    if (!container) return;

    // Find max score for percentage calculation (minimum 2500 so bars don't reach top)
    const scores = Object.values(teamScores);
    const maxScore = Math.max(...scores, 1) * 1.2;

    // Sort teams by score (descending)
    const sortedTeams = Object.entries(teamScores)
        .sort((a, b) => b[1] - a[1]);

    container.innerHTML = sortedTeams.map(([teamName, score], idx) => {
        const color = getTeamColor(teamName);
        const percentage = Math.max((score / maxScore) * 100, 5); // Minimum 5% for visibility
        const teamUrl = `./team.html?team=${encodeURIComponent(teamName)}`;

        return `
      <div class="team-bar-container">
        <div class="team-bar-wrapper">
          <div class="particles" id="particles-${idx}"></div>
          <div class="team-bar" style="height: ${percentage}%; background: linear-gradient(to top, ${color}, ${adjustColor(color, 40)}); box-shadow: 0 0 30px ${color}40;">
            <span class="team-bar-score">${formatNumber(Math.round(score))}</span>
          </div>
        </div>
        <a href="${teamUrl}" class="team-name" style="color: ${color}; text-decoration: none; cursor: pointer;">
          ${teamName}
        </a>
      </div>
    `;
    }).join('');

    // Add particle effects
    setTimeout(() => {
        sortedTeams.forEach(([teamName], idx) => {
            addParticles(`particles-${idx}`);
        });
    }, 100);
}

// Adjust color brightness
function adjustColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function addParticles(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Add 5 particles per bar
    for (let i = 0; i < 5; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = `${Math.random() * 80 + 10}%`;
        particle.style.animationDelay = `${Math.random() * 3}s`;
        particle.style.animationDuration = `${2 + Math.random() * 2}s`;
        container.appendChild(particle);
    }
}

function renderStats(data) {
    // Total minutes
    const totalMinutesEl = document.getElementById('totalMinutes');
    if (totalMinutesEl) {
        totalMinutesEl.textContent = formatNumber(Math.round(data.totalMinutes));
    }

    // Total sessions
    const totalSessionsEl = document.getElementById('totalSessions');
    if (totalSessionsEl) {
        totalSessionsEl.textContent = formatNumber(data.totalSessions);
    }

    // Top meditator
    const topMeditatorEl = document.getElementById('topMeditator');
    if (topMeditatorEl) {
        const name = data.topMeditator.name || '--';
        // Truncate long names
        topMeditatorEl.textContent = name.length > 8 ? name.slice(0, 8) + '…' : name;
        topMeditatorEl.title = `${name} - ${formatNumber(Math.round(data.topMeditator.points))} 分`;
    }

    // Longest session
    const longestSessionEl = document.getElementById('longestSession');
    if (longestSessionEl) {
        longestSessionEl.textContent = `${data.longestSession.minutes} 分`;
        longestSessionEl.title = data.longestSession.name;
    }
}

function renderLeaderboard(teamScores) {
    const container = document.getElementById('leaderboard');
    if (!container) return;

    // Sort teams by score (descending)
    const sortedTeams = Object.entries(teamScores)
        .sort((a, b) => b[1] - a[1]);

    const topScore = sortedTeams[0]?.[1] || 0;

    const medals = ['🥇', '🥈', '🥉', ''];

    container.innerHTML = sortedTeams.map(([teamName, score], index) => {
        const color = getTeamColor(teamName);
        const rank = index + 1;
        const diff = topScore - score;
        const diffText = rank === 1 ? '領先中 Leading!' : `落後 ${formatNumber(Math.round(diff))} 分`;
        const teamUrl = `./team.html?team=${encodeURIComponent(teamName)}`;

        return `
      <a href="${teamUrl}" class="leaderboard-item" style="text-decoration: none; color: inherit;">
        <div class="rank rank-${rank}">
          ${medals[index] ? `<span class="rank-medal">${medals[index]}</span>` : rank}
        </div>
        <div class="team-info">
          <div class="team-info-name" style="color: ${color};">${teamName}</div>
          <div class="team-info-diff">${diffText}</div>
        </div>
        <div class="team-score" style="color: ${color};">${formatNumber(Math.round(score))}</div>
      </a>
    `;
    }).join('');
}

function renderActivityFeed(activities) {
    const container = document.getElementById('activityFeed');
    if (!container) return;

    if (activities.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">暫無活動記錄 No activities yet</p>';
        return;
    }

    container.innerHTML = activities.map(activity => {
        const color = getTeamColor(activity.team);
        // Dual streak badges
        const activityBadge = activity.activityStreak > 0 ? `<span class="activity-streak act" title="${activity.activityStreak} 天精進連續">🔥${activity.activityStreak}</span>` : '';
        const soloBadge = activity.soloStreak > 0 ? `<span class="activity-streak solo" title="${activity.soloStreak} 天獨修連續">🧘${activity.soloStreak}</span>` : '';
        const streakBadges = activityBadge + soloBadge;
        const memberUrl = `./member.html?name=${encodeURIComponent(activity.name)}&team=${encodeURIComponent(activity.team)}`;
        const nameDisplay = activity.name
            ? `<a href="${memberUrl}" class="activity-name-link">${activity.name}</a>`
            : '匿名';
        return `
      <div class="activity-item" style="border-left-color: ${color};">
        <div class="activity-icon">🧘</div>
        <div class="activity-content">
          <div class="activity-name">${nameDisplay}${streakBadges}</div>
          <div class="activity-details">${activity.minutes} 分鐘 · ${formatDate(activity.date)}</div>
        </div>
        <div class="activity-points" style="color: ${color};">+${Math.round(activity.points)}</div>
      </div>
    `;
    }).join('');
}

function updateLastUpdated() {
    const el = document.getElementById('lastUpdate');
    if (el) {
        el.textContent = new Date().toLocaleString('zh-TW');
    }
}

function showError(message) {
    const containers = ['teamBars', 'leaderboard', 'activityFeed'];
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = `
        <div class="error-message">
          <p>❌ ${message}</p>
          <p style="margin-top: 0.5rem; font-size: 0.9rem;">請確認 Google Sheets 已發布到網路<br>Please ensure the Google Sheet is published to the web</p>
        </div>
      `;
        }
    });
}

// ========================================
// Main App
// ========================================

// Calculate team scores from API data (meditation + practice + class)
function calculateTeamScores(apiData) {
    const teamScores = {};
    const teamMembers = {};
    let topMeditator = { name: '--', points: 0, team: '' };

    // Initialize teams from API (if available) or discover from data
    for (const team of teamsFromAPI) {
        teamScores[team.name] = 0;
        teamMembers[team.name] = [];
    }

    // Helper to accumulate member scores
    const memberTotals = {}; // { "team:name": { meditation, practice, class } }

    // Process meditation data
    if (apiData.meditation?.members) {
        for (const m of apiData.meditation.members) {
            const key = `${m.team}:${m.name}`;
            if (!memberTotals[key]) memberTotals[key] = { team: m.team, name: m.name, meditation: 0, practice: 0, class: 0 };
            memberTotals[key].meditation = m.total || 0;
        }
    }

    // Process practice data (total is in points)
    if (apiData.practice?.members) {
        for (const m of apiData.practice.members) {
            const key = `${m.team}:${m.name}`;
            if (!memberTotals[key]) memberTotals[key] = { team: m.team, name: m.name, meditation: 0, practice: 0, class: 0 };
            memberTotals[key].practice = m.total || 0;
        }
    }

    // Process class data (has points field)
    if (apiData.class?.members) {
        for (const m of apiData.class.members) {
            const key = `${m.team}:${m.name}`;
            if (!memberTotals[key]) memberTotals[key] = { team: m.team, name: m.name, meditation: 0, practice: 0, class: 0 };
            memberTotals[key].class = m.points || 0;
        }
    }

    // Aggregate into team scores and find top meditator
    for (const data of Object.values(memberTotals)) {
        const total = data.meditation + data.practice + data.class;
        if (teamScores[data.team] === undefined) teamScores[data.team] = 0;
        if (!teamMembers[data.team]) teamMembers[data.team] = [];
        teamScores[data.team] += total;
        teamMembers[data.team].push({ name: data.name, points: total });

        if (data.meditation > topMeditator.points) {
            topMeditator = { name: data.name, points: data.meditation, team: data.team };
        }
    }

    // Sort members by points
    for (const team of Object.keys(teamMembers)) {
        teamMembers[team].sort((a, b) => b.points - a.points);
    }

    return { teamScores, teamMembers, topMeditator };
}

// Process recent activity from API for activity feed
function processRecentActivity(recentActivity, apiData) {
    // Build member -> team mapping from meditation data
    const memberTeams = {};
    if (apiData.meditation?.members) {
        for (const m of apiData.meditation.members) {
            memberTeams[m.name] = m.team;
        }
    }

    // Calculate streaks from daily data
    const memberStreaks = calculateStreaksFromAPI(apiData);

    let totalMinutes = 0;
    let totalSessions = 0;
    let longestSession = { minutes: 0, name: '' };
    const activities = [];

    for (const item of recentActivity || []) {
        const name = cleanName(item.name || '');
        const team = memberTeams[name] || 'Unknown';
        const minutes = item.minutes || 0;
        const date = item.date || '';

        totalMinutes += minutes;
        totalSessions++;

        if (minutes > longestSession.minutes) {
            longestSession = { minutes, name };
        }

        const streaks = memberStreaks[name] || { solo: 0, activity: 0 };

        activities.push({
            name,
            team,
            minutes,
            date,
            points: minutes, // meditation points = minutes
            soloStreak: streaks.solo,
            activityStreak: streaks.activity
        });
    }

    return {
        activities: activities.slice(0, 20),
        totalMinutes,
        totalSessions,
        longestSession
    };
}

// Calculate streaks from API daily data
function calculateStreaksFromAPI(apiData) {
    const memberActivity = {}; // { name: { dateStr: { meditation, practice, class } } }

    const ensureMember = (name, date) => {
        if (!memberActivity[name]) memberActivity[name] = {};
        if (!memberActivity[name][date]) memberActivity[name][date] = { meditation: false, practice: false, class: false };
    };

    // Process meditation daily
    if (apiData.meditation?.members) {
        for (const m of apiData.meditation.members) {
            if (m.daily) {
                for (const date of Object.keys(m.daily)) {
                    if (m.daily[date] > 0) {
                        ensureMember(m.name, date);
                        memberActivity[m.name][date].meditation = true;
                    }
                }
            }
        }
    }

    // Process practice daily
    if (apiData.practice?.members) {
        for (const m of apiData.practice.members) {
            if (m.daily) {
                for (const date of Object.keys(m.daily)) {
                    if (m.daily[date] > 0) {
                        ensureMember(m.name, date);
                        memberActivity[m.name][date].practice = true;
                    }
                }
            }
        }
    }

    // Process class daily
    if (apiData.class?.members) {
        for (const m of apiData.class.members) {
            if (m.daily) {
                for (const date of Object.keys(m.daily)) {
                    if (m.daily[date] > 0) {
                        ensureMember(m.name, date);
                        memberActivity[m.name][date].class = true;
                    }
                }
            }
        }
    }

    // Calculate streaks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const calcStreak = (dateStrs) => {
        if (dateStrs.length === 0) return 0;

        const sortedDates = dateStrs
            .map(d => {
                const parts = d.split('/');
                const month = parseInt(parts[0]) || 1;
                const day = parseInt(parts[1]) || 1;
                const year = month < 6 ? 2026 : 2025;
                return { str: d, date: new Date(year, month - 1, day) };
            })
            .sort((a, b) => a.date - b.date);

        const lastDate = new Date(sortedDates[sortedDates.length - 1].date);
        lastDate.setHours(0, 0, 0, 0);

        if (lastDate < yesterday) return 0;

        let streak = 1;
        for (let i = sortedDates.length - 2; i >= 0; i--) {
            const curr = new Date(sortedDates[i + 1].date);
            const prev = new Date(sortedDates[i].date);
            curr.setHours(0, 0, 0, 0);
            prev.setHours(0, 0, 0, 0);
            const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);

            if (diffDays === 1) streak++;
            else break;
        }
        return streak;
    };

    const streaks = {};
    for (const [name, days] of Object.entries(memberActivity)) {
        const soloD = Object.keys(days).filter(d => days[d].meditation);
        const actD = Object.keys(days).filter(d => days[d].meditation || days[d].practice || days[d].class);
        streaks[name] = { solo: calcStreak(soloD), activity: calcStreak(actD) };
    }

    return streaks;
}

async function loadData() {
    try {
        console.log('Fetching data from API...');

        // Fetch teams and data in parallel
        const [teamsResponse, dataResponse] = await Promise.all([
            fetch('/api/admin/teams'),
            fetch('/api/data')
        ]);

        // Process teams (build color map)
        if (teamsResponse.ok) {
            const teamsData = await teamsResponse.json();
            teamsFromAPI = teamsData.teams || [];
            teamColorMap = {};
            for (const team of teamsFromAPI) {
                teamColorMap[team.name] = team.color;
            }
            console.log('Loaded teams:', teamsFromAPI.length);
        }

        if (!dataResponse.ok) {
            throw new Error(`API error: ${dataResponse.status}`);
        }
        const apiData = await dataResponse.json();

        console.log('API data received:', apiData.fromCache ? 'from cache' : 'fresh');

        // Calculate team scores from API data
        const { teamScores, teamMembers, topMeditator } = calculateTeamScores(apiData);

        // Process recent activity for activity feed and stats
        const activityData = processRecentActivity(apiData.recentActivity, apiData);

        // Combine data
        const data = {
            teamScores,
            topMeditator,
            teamMembers,
            totalMinutes: activityData.totalMinutes,
            totalSessions: activityData.totalSessions,
            longestSession: activityData.longestSession,
            recentActivities: activityData.activities,
        };

        console.log('Processed data:', data);

        renderTeamBars(data.teamScores);
        renderStats(data);
        renderLeaderboard(data.teamScores);
        renderActivityFeed(data.recentActivities);
        updateLastUpdated();

    } catch (error) {
        console.error('Failed to load data:', error);
        showError('無法載入資料 Failed to load data');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme first (sync, fast)
    initTheme();
    initSettings();

    // Initialize Rules Modal
    const rulesBtn = document.getElementById('rulesBtn');
    const closeRulesBtn = document.getElementById('closeRulesBtn');
    const rulesModal = document.getElementById('rulesModal');

    if (rulesBtn && rulesModal) {
        rulesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            rulesModal.classList.add('open');
        });

        if (closeRulesBtn) {
            closeRulesBtn.addEventListener('click', () => {
                rulesModal.classList.remove('open');
            });
        }

        rulesModal.addEventListener('click', (e) => {
            if (e.target === rulesModal) {
                rulesModal.classList.remove('open');
            }
        });
    }

    console.log('🧘 Meditation Dashboard initialized');

    // Check maintenance mode first
    try {
        const settingsResp = await fetch('/api/admin/settings');
        const settings = await settingsResp.json();

        // Show announcement if exists
        const announcementBoard = document.getElementById('announcementBoard');
        const announcementText = document.getElementById('announcementText');
        if (settings.announcement && announcementBoard && announcementText) {
            announcementText.textContent = settings.announcement;
            announcementBoard.classList.remove('hidden');
        } else if (announcementBoard) {
            announcementBoard.classList.add('hidden');
        }

        if (settings.maintenanceMode) {
            showMaintenanceMode(settings.maintenanceMessage);
            return; // Don't load data
        }
    } catch (error) {
        console.warn('Failed to check maintenance status:', error);
        // Continue anyway if check fails
    }

    // Load data (async, may take time)
    loadData();

    // Auto-refresh every 5 minutes
    const REFRESH_INTERVAL = 5 * 60 * 1000;
    setInterval(loadData, REFRESH_INTERVAL);
});

// Show maintenance mode overlay
function showMaintenanceMode(message) {
    const overlay = document.createElement('div');
    overlay.className = 'maintenance-overlay';
    overlay.innerHTML = `
        <div class="maintenance-content">
            <div class="maintenance-icon">🔧</div>
            <h1>維護中 Under Maintenance</h1>
            <p>${message || '網站維護中，請稍後再試。\nSite under maintenance, please try again later.'}</p>
        </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .maintenance-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        }
        .maintenance-content {
            text-align: center;
            color: white;
            padding: 3rem;
        }
        .maintenance-icon {
            font-size: 5rem;
            margin-bottom: 1rem;
            animation: pulse 2s infinite;
        }
        .maintenance-content h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
            background: linear-gradient(90deg, #8b5cf6, #22d3ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .maintenance-content p {
            font-size: 1.2rem;
            opacity: 0.8;
            white-space: pre-line;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    // Hide main content
    const mainContent = document.querySelector('.container') || document.querySelector('main');
    if (mainContent) mainContent.style.display = 'none';
}
