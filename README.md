# 禪定積分賽 | Meditation Competition Dashboard

即時視覺化儀表板，用於追蹤團隊禪修競賽進度。專為佛學社禪修競賽設計。

## 功能特色

- 🏆 **團隊排行榜** - 動態積分視覺化與排名
- 📊 **成員統計** - 個人進度追蹤
- ✨ **最近活動** - 禪修記錄即時更新
- 📝 **禪定登記** - 成員登記禪修時間表單
- 🔄 **管理後台** - 管理團隊、成員與活動
- 🌓 **深色/淺色模式** - 可自訂主題

---

## 🚀 完整部署指南（新手友善）

### 準備工作：建立必要帳號

在開始之前，你需要建立以下三個免費帳號：

| 平台 | 用途 | 註冊連結 |
|------|------|----------|
| **GitHub** | 程式碼託管 | [github.com/signup](https://github.com/signup) |
| **Vercel** | 網站部署 | [vercel.com/signup](https://vercel.com/signup)（建議用 GitHub 帳號登入） |
| **Upstash** | 資料庫 | [console.upstash.com](https://console.upstash.com/)（建議用 GitHub 帳號登入） |

> 💡 **提示**：三個平台都可以用 GitHub 帳號登入，這樣比較方便管理。

---

### 第一步：Fork 專案到你的 GitHub

1. 確認你已登入 GitHub
2. 前往本專案頁面
3. 點擊右上角的 **Fork** 按鈕
4. 在彈出視窗中，點擊 **Create fork**
5. 等待幾秒鐘，專案會複製到你的帳號下

> ✅ 成功後，你會看到網址變成 `github.com/你的帳號/專案名稱`

---

### 第二步：設定 Upstash 資料庫

1. 前往 [Upstash Console](https://console.upstash.com/)
2. 點擊 **Create Database**
3. 設定：
   - **Name**：隨意取名，例如 `meditation-db`
   - **Type**：選 **Regional**
   - **Region**：選 **Asia Pacific (Taiwan)** 或最近的地區
4. 點擊 **Create**
5. 建立完成後，在 **REST API** 區塊找到：
   - `UPSTASH_REDIS_REST_URL` - 複製這個網址
   - `UPSTASH_REDIS_REST_TOKEN` - 點擊眼睛圖示顯示後複製

> ⚠️ **重要**：請把這兩個值暫時存到記事本，等下會用到。

---

### 第三步：部署到 Vercel

1. 前往 [Vercel](https://vercel.com/) 並登入
2. 點擊 **Add New** → **Project**
3. 在 **Import Git Repository** 找到你剛剛 fork 的專案，點擊 **Import**
4. 在 **Environment Variables** 區塊，新增以下三個變數：

   | Name | Value |
   |------|-------|
   | `UPSTASH_REDIS_REST_URL` | 貼上剛才複製的 URL |
   | `UPSTASH_REDIS_REST_TOKEN` | 貼上剛才複製的 Token |
   | `ADMIN_PASSWORD` | 設定你的管理密碼（自己決定） |

5. 點擊 **Deploy**
6. 等待約 1-2 分鐘部署完成

> ✅ 部署成功後，你會看到一個預覽畫面和網址，例如 `你的專案.vercel.app`

---

### 第四步：初始設定

1. 打開你的網站，前往 `/admin.html`（例如：`你的專案.vercel.app/admin.html`）
2. 輸入剛才設定的 `ADMIN_PASSWORD` 登入
3. **建立團隊**：
   - 點擊「管理團隊」分頁
   - 點擊「新增團隊」
   - 填寫團隊名稱、簡稱、選擇顏色
   - 重複以上步驟建立所有團隊
4. **新增成員**：
   - 點擊「活動管理」分頁
   - 選擇類型「禪定」
   - 選擇團隊、輸入成員名稱、設定日期與分鐘數
   - 點擊新增

> 🎉 **完成！** 現在成員可以透過 `/register.html` 登記禪定了！

---

## 📱 日常使用

### 成員使用

1. 打開網站首頁 `/register.html`
2. 選擇自己的名字（或輸入新名字）
3. 選擇禪定日期
4. 輸入禪定分鐘數
5. 點擊提交

### 管理員使用

前往 `/admin.html` 可以：
- 查看所有活動記錄
- 新增/編輯/刪除成員
- 管理團隊
- 從 Google Sheets 匯入資料（如有需要）

---

## 🔧 管理後台功能

| 分頁 | 說明 |
|------|------|
| **資料同步** | 從 Google Sheets 匯入（合併或覆蓋） |
| **活動管理** | 新增/編輯禪定、共修、會館課記錄 |
| **成員列表** | 檢視所有成員、調整團隊、刪除 |
| **管理團隊** | 建立/編輯/刪除團隊及自訂顏色 |

### 同步模式說明

- **合併 Merge**：新增 Sheets 資料，保留現有手動輸入資料
- **覆蓋 Overwrite**：清除所有手動資料，重新從 Sheets 匯入

---

## 📊 積分系統

| 活動類型 | 積分計算 |
|----------|----------|
| 禪定 | 每分鐘 1 分 |
| 共修 | 依 Sheets 設定每場次積分 |
| 會館課 | 每次出席 50 分 |

---

## 📥 Google Sheets 匯入（選擇性）

如果你有現有的 Google Sheets 資料要匯入：

### 準備工作

確保你的 Sheet 包含以下工作表（分頁名稱需完全一致）：
- `禪定登記` - 禪定資料
- `共修登記` - 共修資料
- `會館課登記` - 會館課資料

### 設定 Sheet ID

1. 打開你的 Google Sheet
2. 複製網址中的 ID（在 `/d/` 和 `/edit` 之間的那串字）
   - 例如：`https://docs.google.com/spreadsheets/d/這裡是ID/edit`
3. 編輯專案中的 `api/admin/sync.js`
4. 找到 `SHEET_ID` 並替換成你的 ID

### 執行匯入

1. 前往管理後台 → 資料同步
2. 選擇同步模式：
   - **合併**：保留現有資料，新增 Sheets 資料
   - **覆蓋**：清空所有資料，重新匯入
3. 點擊對應的同步按鈕

---

## ❓ 常見問題

### Q: 忘記管理密碼怎麼辦？
A: 前往 Vercel 專案設定 → Environment Variables → 修改 `ADMIN_PASSWORD`，然後重新部署。

### Q: 如何修改網站網址？
A: 在 Vercel 專案設定 → Domains 可以設定自訂網域。

### Q: 資料會遺失嗎？
A: 資料儲存在 Upstash Redis 雲端資料庫，只要帳號還在就不會遺失。

### Q: 可以多人同時使用嗎？
A: 可以，系統支援多人同時登記禪定。

---

## 🔒 安全提醒

- 請勿將 `ADMIN_PASSWORD` 分享給不信任的人
- Upstash Token 請妥善保管
- 建議定期從管理後台備份資料

---

## 📄 授權條款

MIT License - 可自由使用、修改、分享
