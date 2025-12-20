# 禪定積分賽 | Meditation Competition Dashboard

即時視覺化儀表板，用於追蹤團隊禪修競賽進度。專為佛學社禪修競賽設計。

## 功能特色

- 🏆 **團隊排行榜** - 動態積分視覺化與排名
- 📊 **成員統計** - 個人進度追蹤
- ✨ **最近活動** - 禪修記錄即時更新
- 📝 **禪定登記** - 成員登記禪修時間表單
- 🔄 **管理後台** - 管理團隊、成員與活動
- 🌓 **深色/淺色模式** - 可自訂主題

## 快速開始

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR-USERNAME/med-contest.git
cd med-contest
npm install
```

### 2. 部署到 Vercel

1. Push 到 GitHub
2. 匯入至 [Vercel](https://vercel.com)
3. 新增環境變數（見下方說明）
4. 部署完成！

### 3. 設定 Upstash Redis

本應用使用 Upstash Redis 進行資料儲存：

1. 前往 [Upstash Console](https://console.upstash.com/)
2. 建立新的 Redis 資料庫（免費方案即可）
3. 複製 REST API 憑證

### 4. 設定環境變數

在 Vercel dashboard → Settings → Environment Variables 新增：

| 變數名稱 | 說明 |
|----------|------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token |
| `ADMIN_PASSWORD` | 管理後台密碼 |

### 5. 初始設定

1. 前往 `/admin.html` 並登入
2. **建立團隊**：管理團隊 → 新增團隊（名稱、簡稱、顏色）
3. **新增成員**：活動管理 → 新增成員至團隊
4. *（選擇性）* 從 Google Sheets 匯入資料（見下方說明）

### 6. 開始使用！

1. 成員透過 `/register.html` 登記禪定
2. 積分自動顯示在儀表板
3. 管理員在 `/admin.html` 管理資料

## 本地開發

```bash
# 建立 .env.local 並設定環境變數
echo "UPSTASH_REDIS_REST_URL=your_url" >> .env.local
echo "UPSTASH_REDIS_REST_TOKEN=your_token" >> .env.local
echo "ADMIN_PASSWORD=your_password" >> .env.local

# 啟動開發伺服器
npm run dev
```

## 管理後台功能

| 分頁 | 說明 |
|------|------|
| **資料同步** | 從 Google Sheets 匯入（合併或覆蓋） |
| **活動管理** | 新增/編輯禪定、共修、會館課記錄 |
| **成員列表** | 檢視所有成員、調整團隊、刪除 |
| **管理團隊** | 建立/編輯/刪除團隊及自訂顏色 |

### 同步模式

- **合併 Merge**：新增 Sheets 資料，保留現有手動輸入資料
- **覆蓋 Overwrite**：清除所有手動資料，重新從 Sheets 匯入

## 積分系統

| 活動類型 | 積分 |
|----------|------|
| 禪定 | 每分鐘 1 分 |
| 共修 | 依 Sheets 設定每場次積分 |
| 會館課 | 每次出席 50 分 |

## 系統架構

```
├── index.html          # 主儀表板
├── member.html         # 成員詳細頁
├── team.html           # 團隊詳細頁
├── register.html       # 禪定登記表單
├── admin.html          # 管理後台
├── api/
│   ├── data.js         # GET /api/data - 取得所有資料（僅從資料庫）
│   ├── meditation/
│   │   └── submit.js   # POST - 提交禪定記錄
│   ├── admin/
│   │   ├── teams.js    # CRUD - 團隊管理
│   │   ├── members.js  # CRUD - 成員管理
│   │   ├── activities.js # CRUD - 活動管理
│   │   └── sync.js     # POST - 從 Google Sheets 匯入
│   └── _lib/
│       ├── kv.js       # Upstash Redis 封裝
│       └── auth.js     # 管理員驗證
```

## 運作原理

1. **成員登記禪定** 透過 `/register.html` 表單
2. **資料儲存至資料庫** (Upstash Redis)
3. **儀表板從資料庫讀取** 並顯示積分
4. **管理員可管理** 團隊、成員、活動於 `/admin.html`

初始設定完成後，無需使用外部試算表或表單！

## 技術架構

- **前端**：Vanilla HTML/CSS/JS + Vite
- **後端**：Vercel Serverless Functions
- **資料庫**：Upstash Redis（透過 @upstash/redis）
- **部署**：Vercel

## Google Sheets 匯入（選擇性）

若從現有 Google Sheets 設定遷移：

1. 準備包含以下工作表的 Sheet：
   - `禪定登記` - 禪定資料
   - `共修登記` - 共修資料
   - `會館課登記` - 會館課資料
2. 更新 `api/admin/sync.js` 中的 `SHEET_ID` 為你的 Sheet ID
3. 前往管理後台 → 資料同步
4. 選擇 **合併 Merge**（保留現有）或 **覆蓋 Overwrite**（全新開始）
5. 點擊同步按鈕

## 授權條款

MIT
