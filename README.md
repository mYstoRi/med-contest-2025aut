# 禪定積分賽 | Meditation Competition Dashboard

A real-time visualization dashboard for tracking meditation competition progress across teams. Built for Buddhist club meditation competitions.

## Features

- 🏆 **Team Leaderboard** - Animated score visualization with rankings
- 📊 **Member Stats** - Individual progress tracking per team member
- ✨ **Recent Activity Feed** - Live updates of meditation sessions
- 📝 **Meditation Registration** - Form for members to log their sessions
- 🔄 **Admin Panel** - Manage members and activities
- 🌓 **Dark/Light Mode** - User-configurable theme

## Quick Start

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR-USERNAME/med-contest.git
cd med-contest
npm install
```

### 2. Deploy to Vercel

1. Push to GitHub
2. Import to [Vercel](https://vercel.com)
3. Add environment variables (see below)
4. Deploy!

### 3. Set Up Upstash Redis

The app uses Upstash Redis for data persistence:

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database (free tier works fine)
3. Copy the REST API credentials

### 4. Configure Environment Variables

In Vercel dashboard → Settings → Environment Variables, add:

| Variable | Description |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token |
| `ADMIN_PASSWORD` | Password for admin panel |

### 5. Add Your Teams

Edit `config.js` to set up your teams:

```javascript
TEAMS: [
    { name: 'Team A', shortName: 'A', color: 'team-1' },
    { name: 'Team B', shortName: 'B', color: 'team-2' },
    // Add your teams...
],
```

### 6. Start Using!

1. Members submit meditation via `/register.html`
2. Scores appear automatically on the dashboard
3. Admin can manage members at `/admin.html`

## Local Development

```bash
# Create .env.local with your environment variables
echo "UPSTASH_REDIS_REST_URL=your_url" >> .env.local
echo "UPSTASH_REDIS_REST_TOKEN=your_token" >> .env.local
echo "ADMIN_PASSWORD=your_password" >> .env.local

# Start development server
npm run dev
```

## Customization

### Team Configuration

Edit `config.js` to customize teams:

```javascript
TEAMS: [
    { name: '晨絜家中隊', shortName: '晨絜', color: 'team-1' },
    { name: '明緯家中隊', shortName: '明緯', color: 'team-2' },
    // Add or modify teams...
],
```

### Point System

- **Meditation**: 1 point per minute logged via the form
- **Practice**: Points configurable per session in admin panel
- **Class**: Fixed points per attendance (default: 50, configurable in `config.js`)

## Architecture

```
├── index.html          # Main dashboard
├── member.html         # Member detail view
├── team.html           # Team detail view
├── register.html       # Meditation registration form
├── admin.html          # Admin dashboard
├── api/
│   ├── data.js         # GET /api/data - Fetch all data
│   ├── meditation/
│   │   └── submit.js   # POST - Submit meditation records
│   ├── admin/
│   │   ├── members.js  # CRUD - Member management
│   │   └── activities.js # CRUD - Activity management
│   └── _lib/
│       ├── kv.js       # Upstash Redis wrapper
│       └── auth.js     # Admin authentication
```

## How It Works

1. **Members register meditation** via `/register.html` form
2. **Data is saved to database** (Upstash Redis)
3. **Dashboard reads from database** and displays scores
4. **Admin can manage** members and activities at `/admin.html`

No external spreadsheets or forms needed!

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS with Vite
- **Backend**: Vercel Serverless Functions
- **Database**: Upstash Redis (via @vercel/kv)
- **Deployment**: Vercel

## Advanced: Google Sheets Import (Optional)

If migrating from an existing Google Sheets setup, you can import data:

1. Set up your Sheet with the correct format
2. Update `SHEET_ID` in `api/admin/sync.js`
3. Use Admin Panel → 資料同步 to import

## License

MIT
