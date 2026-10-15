# Specification: Login & Authentication Module (index.html)

## 1. 模組定位與邊界
`index.html`（搭配 `public/js/login.js`、`public/css/login.css` 與後端 `AuthHandler.java`）為系統唯一標準入口門戶。
與系統管理後台（`admin/admin_login.html`）保持實體代碼與路由層級的嚴格隔離。

---

## 2. 現有功能清單 (As-Is State)
1. **單頁居中卡片佈局**：
   - 包含系統識別（ProjectBook）、Email/帳號輸入框（具備 `autofocus`）、密碼輸入框（遮罩 `type="password"`）與提交按鈕。
   - 密碼框支援鍵盤 `Enter` 快捷鍵直接提交。
2. **已登入狀態預檢 (Auto-Redirect)**：
   - 載入時檢查 Session，若已具備有效身分則自動重導向至 `portal.html`。
3. **前端基礎防禦**：
   - 提交前攔截預設事件，執行非空校驗與 `.trim()` 去除首尾空白。
   - 以原生 `fetch` 發送 JSON POST 至 `/api/auth/login`。
4. **登入後系統行為**：
   - 驗證成功後導向至主門戶 `portal.html`。
   - **核心鐵律**：`portal.html` 本身不預設自動載入任何特定專案，由使用者於操作介面依權限主動選取專案。

---

## 3. 人員身分架構與業務約束 (Identity Rules & Invariants)

### 3.1 人員類型劃分
`T05_Staff` 資料表透過 `FK_T05_PK_T01_CUSTOM` 區分兩類身分：
1. **內部全域同仁 (Global Staff, `FK_T05_PK_T01_CUSTOM = 0`)**：
   - 部門常規人員與核心成員。
   - 其跨專案權限由 `T06_ProjectRoles` 的 `PR_Right` 動態授予，不在登入時鎖定單一專案。
2. **專案外判人員 (Contractor / Vendor, `FK_T05_PK_T01_CUSTOM = PK_T01 > 0`)**：
   - 一次性或限定特定專案的外部承辦身分。
   - 原則上專案合約結束後，管理員應將其 `ST_IsActive` 標記為 `FALSE`。
   - 若特定 Contractor 同時承接不同專案（低機率情境），則會存在多筆 `FK_T05_PK_T01_CUSTOM = PK_T01` 的隔離記錄。

### 3.2 唯一性防禦規則 (Business Integrity Rules)
1. **全域身分排他律**：
   - 凡本身已具備 `FK_T05_PK_T01_CUSTOM = 0` 的人員，系統嚴格禁止以相同 Email 登記任何 `FK_T05_PK_T01_CUSTOM > 0` 的專案隔離身分。
   - **推論結果**：若查詢命中 `FK_T05_PK_T01_CUSTOM = 0`，該 Email 保證在系統中僅有這一筆全域身分，直接執行密碼比對即可完成驗證，絕不詢問 Project Code。
2. **Contractor 多專案檢查規則**：
   - 若該 Email 命中多筆記錄，則**必然全部屬於 Contractor 專案身分**（`FK_T05_PK_T01_CUSTOM > 0`）。
   - 此時系統強制要求使用者提供 `Project Code (PJ_Code)`。
   - **留空拒絕原則**：若使用者留空或取消輸入，直接拒絕登入（`REJECT_LOGIN`），絕不放行。

---

## 4. 預期功能與修復規範 (To-Be State)

### 4.1 登入驗證狀態機 (Authentication Flow)
1. **Step 1: 帳號檢索**
   - 接收使用者輸入的完整 `ST_Email`（執行 `.trim().toLowerCase()`）。
   - 查詢資料庫：`SELECT * FROM "T05_Staff" WHERE "ST_Email" = ? AND "ST_IsActive" = TRUE`。
   - 若查無資料，回傳 `Invalid credentials`。
2. **Step 2: 身分路由分支**
   - **情況 A（單筆記錄 且 `FK_T05_PK_T01_CUSTOM = 0`）**：
     - 直接比對密碼。密碼正確即登入成功，進入 `portal.html`。
   - **情況 B（單筆記錄 且 `FK_T05_PK_T01_CUSTOM > 0`）**：
     - Contractor 僅有一筆專案身分，直接比對密碼，驗證成功後建立該專案特定 Session。
   - **情況 C（命中 2 筆或以上記錄）**：
     - 依規則全部為 Contractor 專案身分（`CUSTOM > 0`）。
     - 後端要求前端提示輸入 `Project Code (PJ_Code)`。
     - 使用者輸入若為**空值**：直接終止並提示 `Project Code is required for contractor profile`。
     - 使用者提供 `PJ_Code`：反查 `T01_Projects` 取得 `PK_T01`，配對對應的 `T05_Staff` 記錄後驗證密碼。若 `PJ_Code` 不匹配則拒絕登入。

### 4.2 廢除固定網域拼接 (Full Email Mandate)
- 前端輸入框 placeholder 標註 `e.g. user@domain.com`。
- 後端完全移除自動拼接特定網域（如 `@swd.gov.hk`）的邏輯，避免雙重網域錯誤，並完全相容非預設網域的外判人員。

### 4.3 密碼安全性升級 (Salted Hash & Constant-Time Comparison)
- 淘汰現有無 Salt 靜態雜湊。
- 改採安全加鹽雜湊機制（Salted Hash），並在 Java 層使用 `MessageDigest.isEqual()` 執行常數時間比對，防禦計時攻擊（Timing Attack）。