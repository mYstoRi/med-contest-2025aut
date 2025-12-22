// ========================================
// Meditation Registration Form
// ========================================
import { initTheme, initSettings } from './utils.js';

// ========================================
// Member Data Loading
// ========================================
async function loadMembers() {
    const select = document.getElementById('name');
    if (!select) return;

    try {
        // Fetch data and teams in parallel
        const [dataResponse, teamsResponse] = await Promise.all([
            fetch('/api/data'),
            fetch('/api/admin/teams'),
        ]);

        if (!dataResponse.ok) throw new Error('Failed to fetch data');

        const apiData = await dataResponse.json();
        const teamsData = teamsResponse.ok ? await teamsResponse.json() : { teams: [] };
        const teams = teamsData.teams || [];

        // Build member list grouped by team, with tier info
        const teamMembers = {}; // { teamName: { memberName: { name, isNavigator } } }

        // Get members from allMembers (comprehensive list)
        if (apiData.allMembers) {
            for (const m of apiData.allMembers) {
                if (!teamMembers[m.team]) {
                    teamMembers[m.team] = {};
                }
                if (!teamMembers[m.team][m.name]) {
                    teamMembers[m.team][m.name] = { name: m.name, isNavigator: false };
                }
            }
        } else if (apiData.meditation?.members) {
            // Fallback for older API
            for (const m of apiData.meditation.members) {
                if (!teamMembers[m.team]) {
                    teamMembers[m.team] = {};
                }
                if (!teamMembers[m.team][m.name]) {
                    teamMembers[m.team][m.name] = { name: m.name, isNavigator: false };
                }
            }
        }

        // Get navigator info from class data (has tier column)
        if (apiData.class?.members) {
            for (const m of apiData.class.members) {
                if (!teamMembers[m.team]) {
                    teamMembers[m.team] = {};
                }
                if (!teamMembers[m.team][m.name]) {
                    teamMembers[m.team][m.name] = { name: m.name, isNavigator: false };
                }
                // Mark as navigator if tier is '領航員'
                if (m.tier === '領航員') {
                    teamMembers[m.team][m.name].isNavigator = true;
                }
            }
        }

        // Sort teams by API order (or use whatever teams have members)
        const teamOrder = teams.map(t => t.name);
        const sortedTeams = teamOrder.filter(name => teamMembers[name]);

        // Add any teams not in API order (shouldn't happen, but fallback)
        for (const name of Object.keys(teamMembers)) {
            if (!sortedTeams.includes(name)) {
                sortedTeams.push(name);
            }
        }

        // Create optgroups for each team
        for (const teamName of sortedTeams) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = teamName;

            // Get all members for this team and sort: navigators first, then alphabetically
            const members = Object.values(teamMembers[teamName]).sort((a, b) => {
                // Navigators first
                if (a.isNavigator && !b.isNavigator) return -1;
                if (!a.isNavigator && b.isNavigator) return 1;
                // Then alphabetical
                return a.name.localeCompare(b.name, 'zh-TW');
            });

            for (const member of members) {
                const option = document.createElement('option');
                option.value = member.name;
                // Add star for navigator
                option.textContent = member.isNavigator ? `⭐ ${member.name}` : member.name;
                optgroup.appendChild(option);
            }

            select.appendChild(optgroup);
        }

        console.log('Loaded members for', sortedTeams.length, 'teams');

    } catch (error) {
        console.error('Failed to load members:', error);
        // Add a manual entry option as fallback
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '無法載入成員列表 Failed to load members';
        option.disabled = true;
        select.appendChild(option);
    }
}

// ========================================
// Form Validation
// ========================================
function validateForm(formData) {
    const errors = [];

    if (!formData.name) {
        errors.push('請選擇你的名字 Please select your name');
    }

    if (!formData.date) {
        errors.push('請選擇日期 Please select a date');
    } else {
        // Check if date is not in the future
        const selectedDate = new Date(formData.date);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (selectedDate > today) {
            errors.push('日期不能是未來的日期 Date cannot be in the future');
        }
    }

    if (!formData.duration || formData.duration < 1 || formData.duration > 480) {
        errors.push('禪定時間需要在 1-480 分鐘之間 Duration must be between 1-480 minutes');
    }

    if (!formData.timeOfDay) {
        errors.push('請選擇禪定時間 Please select time of day');
    }

    if (!formData.shareConsent) {
        errors.push('請選擇是否願意分享心得 Please select sharing preference');
    }

    return errors;
}

// ========================================
// Form Submission
// ========================================
async function handleSubmit(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = document.getElementById('submitBtn');
    const statusDiv = document.getElementById('formStatus');

    // Get form data
    const formData = {
        name: form.name.value,
        date: form.date.value,
        duration: parseInt(form.duration.value),
        timeOfDay: form.timeOfDay.value,
        thoughts: form.thoughts.value.trim(),
        shareConsent: form.querySelector('input[name="shareConsent"]:checked')?.value,
        timestamp: new Date().toISOString()
    };

    // Validate
    const errors = validateForm(formData);
    if (errors.length > 0) {
        showStatus(statusDiv, 'error', errors.join('<br>'));
        return;
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    submitBtn.innerHTML = '<span class="btn-icon">⏳</span> 送出中 Submitting...';
    statusDiv.classList.remove('show');

    try {
        // Submit to API
        const response = await fetch('/api/meditation/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Success! Show success animation
            showSuccessAnimation(formData);
        } else {
            throw new Error(result.error || 'Submission failed');
        }

    } catch (error) {
        console.error('Submission error:', error);
        showStatus(statusDiv, 'error', `送出失敗: ${error.message}<br>Failed to submit: ${error.message}`);

        // Reset button
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        submitBtn.innerHTML = '<span class="btn-icon">🙏</span> 送出記錄 Submit';
    }
}

function showStatus(element, type, message) {
    element.className = `form-status ${type} show`;
    element.innerHTML = message;
}

function showSuccessAnimation(formData) {
    const formSection = document.querySelector('.form-section');
    formSection.innerHTML = `
        <div class="meditation-form">
            <div class="success-animation">
                <div class="success-icon">🎉</div>
                <h2 class="success-message">記錄成功！ Successfully Logged!</h2>
                <p class="success-detail">
                    ${formData.name} - ${formData.duration} 分鐘禪定<br>
                    ${formData.date} (${formData.timeOfDay})
                </p>
                <a href="./index.html" class="submit-btn" style="text-decoration: none;">
                    <span class="btn-icon">📊</span>
                    查看積分榜 View Leaderboard
                </a>

            </div>
        </div>
    `;
}

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Apply theme
    initTheme();
    initSettings();

    // Check maintenance mode first
    try {
        const settingsResp = await fetch('/api/admin/settings');
        const settings = await settingsResp.json();
        if (settings.maintenanceMode) {
            showMaintenanceMode(settings.maintenanceMessage);
            return; // Don't initialize form
        }
    } catch (error) {
        console.warn('Failed to check maintenance status:', error);
    }

    // Load members for dropdown
    await loadMembers();

    // Set default date to today
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        dateInput.max = `${yyyy}-${mm}-${dd}`; // Can't select future dates
    }

    // Handle form submission
    const form = document.getElementById('meditationForm');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }

    console.log('Meditation registration form initialized');
});

// Show maintenance mode overlay
function showMaintenanceMode(message) {
    const overlay = document.createElement('div');
    overlay.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); display: flex; align-items: center; justify-content: center; z-index: 9999;">
            <div style="text-align: center; color: white; padding: 3rem;">
                <div style="font-size: 5rem; margin-bottom: 1rem;">🔧</div>
                <h1 style="font-size: 2rem; margin-bottom: 1rem; background: linear-gradient(90deg, #8b5cf6, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">維護中 Under Maintenance</h1>
                <p style="font-size: 1.2rem; opacity: 0.8; white-space: pre-line;">${message || '網站維護中，請稍後再試。'}</p>
                <a href="./" style="display: inline-block; margin-top: 2rem; color: #22d3ee; text-decoration: none;">← 返回首頁 Back Home</a>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}
