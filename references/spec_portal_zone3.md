# Specification: Portal Workspace - Zone 3 (Utility, Notifications & User Zone)

## 1. 模組定位與安全原則
本規格書定義 `portal.html` 頂部右側 **Zone 3** 的控制元件及其與整體工作區的聯動架構。
- **定位**：後台治理入口（Admin Console）、個人通知中樞（Notifications 鈴鐺）與使用者身分操作區（User Profile & Session）。
- **零信任前端渲染防禦 (Zero-Trust Frontend Guardrail)**：
  - 管理權限嚴格比對資料庫 `T05_User` 中的 **`ST_Right`** 欄位。
  - 當 `ST_Right != 'ADMIN'` 時，**前端嚴格禁止渲染該按鈕節點（Do Not Render DOM Node）**，嚴禁使用 `display: none` 等 CSS 隱藏方式，杜絕客戶端篡改與探測。後端同步以 Session 進行 403 阻擋。

---

## 2. 核心元件互動規範

### 2.1 管理者入口 (Admin Console)
- **渲染條件**：僅當目前使用者之 `ST_Right == 'ADMIN'` 時，動態將按鈕注入 Zone 3。
- **權限隔離**：非 ADMIN 身分的使用者，其 HTML 結構中完全不存在該元素。

---

### 2.2 通知鈴鐺中樞 (`🔔 Notifications` 與 T09 聯動)

#### 1. 訊息來源與資料表架構
- 訊息統一由 **`T09`** 進行管理與讀取，包含兩大類型：
  - **系統自動通知**：任務指派、排程異動、Phase 凍結/解凍等生命週期事件。
  - **跨層級定向提問與留言**：同仁在 Project、Feature/Phase、Event 或 Mission 中針對特定使用者發起的留言與提問。

#### 2. 頂部圖標與計數徽章
- Zone 3 常駐通知鈴鐺圖標 `🔔`。
- 顯示未讀訊息數量徽章（統計 `T09` 中未讀記錄數，如 `🔔 3`）。

#### 3. 點擊鈴鐺觸發 Zone 9 渲染 (Zone 9 Message List View)
- 當使用者**單擊（Click）**通知鈴鐺時，**區域 9（Zone 9）**即刻渲染為通知清單工作台：
  - **分類視圖**：清晰區分「未讀訊息（Unread）」與「已讀訊息（Read）」。
  - **排序鐵律**：清單嚴格依據訊息的 **`Last Update Time`（最後更新時間）降冪（Descending）排序**，最新動態始終置頂。
  - **摘要展示**：每筆項目顯示精簡文字預覽、關聯層級代碼與發送者。

#### 4. Zone 9 雙擊聯動 Zone 10 詳情與回覆 (Zone 10 Message Detail & Reply Box)
- 當使用者在 Zone 9 的某筆訊息上進行 **雙擊（Double-Click）** 時：
  - 系統將該筆 `T09` 記錄標記為**已讀（Mark as Read）**，頂部鈴鐺徽章相應更新。
  - **區域 10（Zone 10）**立即渲染該訊息的完整內容：
    - 展示完整內文、發送來源上下文（Project / Event / Mission 標籤）。
    - 底部提供**即時回應輸入框（Quick Reply Input Box）**，讓同仁直接在 Zone 10 撰寫回覆並送出。

#### 5. Zone 10 彈性擴展至 Zone 11 (Zone 11 Expanded Reply Canvas)
- **全屏／大面積輸入擴展機制**：
  - 若使用者需要輸入長篇回覆、黏貼排版文字或詳細排程備忘，認為 Zone 10 的空間不足時，可點擊 Zone 10 的 **「擴展至主工作區（Expand to Zone 11）」** 按鈕。
  - 點擊後，中央主工作區（**Zone 11**）切換為全寬度的富文字／大範圍輸入工作台，並完整同步已輸入的暫存草稿。
  - 使用者在 Zone 11 完成輸入並送出後，同步更新該討論串並自動重新聚焦回原本的上下文。

---

### 2.3 使用者資訊與帳號操作選單 (User Profile & Account Actions)
- **元素呈現**：Zone 3 最右側顯示當前登入者名稱（綁定 `currentUser.T05_Name`）。
- **互動機制**：點擊使用者名稱展開下拉選單（Dropdown Menu），聚焦於現有已實作之雙核心功能，不堆疊冗餘選項：
  1. **修改密碼 (Change Password)**：
     - 觸發既有之修改密碼模態框（Modal），執行原密碼驗證與新密碼更新流程。
  2. **登出 (Logout)**：
     - 觸發既有之安全登出流程，清除客戶端 Session / Token 憑證，並導向回登入頁面。

---

## 3. 審計與偏好隔離規範 (Auditing Boundary)
- 檢視通知、更新 `T09` 已讀狀態、修改密碼或登出，均屬於使用者個人帳號與工作台操作，**一律不寫入 `ProjectRemarkLedger`**。
- 回應留言一律不寫入ProjectRemarkLedger, 除非用戶想寫入
