# Stage 1 複盤回顧、跨階段推進規範與後期代碼清理藍圖
**文件版本**：`1.0.0 (Stage 1 Stabilized)`  
**適用範圍**：ProjectBook Enterprise Workspace (Stages 1–8)  
**參照規範**：`master_implementation_plan.md`、`spec_login_module.md`、`vision_and_architecture_core.md`

---

## 目錄
1. [Stage 1 錯誤全盤複盤與防呆鐵律（避免後續重複踩坑）](#一-stage-1-錯誤全盤複盤與防呆鐵律避免後續重複踩坑)
2. [Stages 2–8 必須嚴格跟進與對齊之架構規範](#二-stages-28-必須嚴格跟進與對齊之架構規範)
3. [Stages 1–8 完成後的過渡相容代碼清理清單 (Refactoring Checklist)](#三-stages-18-完成後的過渡相容代碼清理清單-refactoring-checklist)

---

## 一、 Stage 1 錯誤全盤複盤與防呆鐵律（避免後續重複踩坑）

在 Stage 1（登入鑑權、資料庫底層連線、加鹽雜湊升級與管理後台整合）過程中，遭遇並修復了以下 8 類核心缺陷，後續階段開發時必須嚴格遵循對應的解決準則：

### 1. H2 資料庫大小寫敏感度與雙引號宣告陷阱
* **故障現象**：後端拋出 `org.h2.jdbc.JdbcSQLException: Table "T05_STAFF" not found [42102-196]`。
* **根本原因**：H2 資料庫 DDL 建表時表名與欄位名皆包裹了雙引號（如 `"T05_Staff"`、`"ST_Email"`）。若 Java 後端 SQL 寫成裸名 `FROM T05_Staff`，H2 1.4.196 會強制將其轉為全大寫 `T05_STAFF` 進行檢索，導致大小寫失配。
* **後續防呆鐵律**：
  * **所有後端 SQL 語句（SELECT、INSERT、UPDATE、DELETE、DDL）必須 100% 使用轉義雙引號 `\"...\"` 包裹所有表名與 CamelCase 欄位名稱**。
  * 表名標準：`\"T00_Ref\"`, `\"T01_Projects\"`, `\"T02_Phase\"`, `\"T03_Events\"`, `\"T04_Missions\"`, `\"T05_Staff\"`, `\"T06_ProjectRoles\"`, `\"T07_JoinMissions\"`, `\"T08_MultiComment\"`, `\"T09_MessageRead\"`, `\"T99_AuditLog\"`。

---

### 2. 資料庫中繼資訊查詢條件陷阱 (`INFORMATION_SCHEMA.TABLES`)
* **故障現象**：控制台下拉選單連線正常，但始終顯示 `(資料庫內無可用資料表)`（回傳空陣列 `[]`）。
* **根本原因**：SQL 條件誤加了 `AND TABLE_TYPE = 'TABLE'`。在 H2 與標準 SQL 中，實體資料表的類型名稱為 **`'BASE TABLE'`**，且 Schema 比對若未忽略大小寫可能失配。
* **後續防呆鐵律**：
  * 查詢使用者資料表時，統一寫作：  
    ```sql
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE UPPER(TABLE_SCHEMA) = 'PUBLIC' ORDER BY TABLE_NAME ASC;
    ```
  * 嚴禁對未確認枚舉值的中繼表欄位進行未驗證的硬條件過濾。

---

### 3. 後台動態 SQL 處理器 HTTP 500 內部伺服器崩潰
* **故障現象**：前端發送 `/api/query` 請求時收到 `500 (Internal Server Error)`，後台資料完全無法讀取。
* **根本原因**：
  1. `DBAdminHandler` 在執行審計寫入 `T99_AuditLog` 時未加轉義引號，觸發表名找不到例外。
  2. 動態 `ResultSet` 序列化為 JSON 時缺乏 `NULL` 值容錯。
  3. `SQLException` 未被安全捕獲，直接向上拋出導致 HTTP 容器噴出 500。
* **後續防呆鐵律**：
  * 所有 Handler 必須在內部妥善捕獲業務與 SQL 例外，回傳 HTTP 400/403/404 與結構化錯誤 JSON（`{"success":false,"status":"FAILED","message":"..."}`），**嚴禁讓伺服器未捕獲例外拋出 500**。

---

### 4. 前後台 Session 儲存金鑰（Storage Key）斷層
* **故障現象**：在 `index.html` 登入管理員後進入 `portal.html`，點擊 `⚙ Admin Console` 進入後台時，被 `DB_TableControl.js` 或 `StaffPasswordSetup.js` 誤判為未登入並強制踢回登入頁。
* **根本原因**：`login.js` 寫入的是 `pb_token` 與 `pb_user`，但舊版後台腳本分別檢查 `adminToken`、`admin_user_right` 與 `admin_user_id`，前後台金鑰定義脫節。
* **後續防呆鐵律**：
  * 全系統唯一會話權杖主金鑰統一為 **`pb_token`**。
  * 全系統唯一使用者身分主金鑰統一為 **`pb_user`**。
  * 登入後必須同步寫入 `localStorage` 與 `sessionStorage`，消除跨分頁狀態遺失風險。

---

### 5. 表單原生 GET 提交導致密碼在 URL 列明碼洩漏
* **故障現象**：登入時按下 Enter 鍵，網址列瞬間出現 `http://.../index.html?email=...&password=...`。
* **根本原因**：`<form>` 預設行為為 GET 提交，且輸入框帶有 `name="password"` 屬性。當 JavaScript 事件未即時完全攔截時，瀏覽器原生行為會將具備 `name` 的欄位拼入 Query String。
* **後續防呆鐵律**：
  * 所有涉及敏感認證的表單一律強制宣告：`<form onsubmit="return false;" novalidate>`。
  * **物理級防禦**：所有 `<input>` 嚴禁配置 `name` 屬性，前端 JavaScript 100% 透過 `id` 讀取資料。
  * 頁面載入時強制執行 `cleanResidualUrlParams()`（透過 `window.history.replaceState` 抹除網址列任何殘留敏感參數）。

---

### 6. 專案執行路徑硬編碼（磁碟機代號寫死）
* **故障現象**：將專案從辦公室搬至家中（由 `C:` 碟移至 `D:` 或 `O:` 碟）時，資料庫連線靜默建立空白庫，或 `StaticHandler` 無法讀取前端檔案回傳 404。
* **根本原因**：`DB.java` 與 `StaticHandler.java` 內硬編碼了 `"C:/pm-server/..."` 絕對路徑。
* **後續防呆鐵律**：
  * 全系統後端（資料庫連線、靜態資產目錄、備份檔案）**嚴禁寫死任何盤符或絕對路徑**。
  * 統一使用 `System.getProperty("user.dir")` 進行動態工作目錄解析。

---

### 7. 前後端介面契約大小寫與屬性不匹配
* **故障現象**：使用者在 `portal.html` 執行「變更密碼 (Change Password)」時，永遠提示失敗。
* **根本原因**：
  1. 欄位命名：前端傳送 `old_password` / `new_password`，後端解析 `oldPassword` / `newPassword`。
  2. 狀態協議：前端判斷 `res.status === 'SUCCESS'`，後端僅回傳 `{"success": true}`（遺漏 `status` 屬性）。
* **後續防呆鐵律**：
  * 後端 Handler 在解析 JSON 時必須雙向相容駝峰與底線命名。
  * 後端 API 回應格式全系統標準化：
    * 成功：`{"success": true, "status": "SUCCESS", "message": "...", ...}`
    * 失敗：`{"success": false, "status": "FAILED", "message": "...", ...}`

---

### 8. 公共核心方法重構打破向下相容性（7 個編譯錯誤）
* **故障現象**：修改 `Security.java` 鑑權方法後，既有 `ProjectHandler`、`EventHandler`、`PhaseHandler` 等無法編譯（`incompatible types: String cannot be converted to HttpExchange`）。
* **根本原因**：重構公共方法時直接變更了參數型別，未考慮全系統既有呼叫點。
* **後續防呆鐵律**：
  * 修改基礎設施類別（`Security`、`DB`、`JsonUtil`）時，若有現存呼叫者，**必須透過方法多載（Method Overloading）保留既有呼叫介面**，杜絕大規模編譯中斷。

---

## 二、 Stages 2–8 必須嚴格跟進與對齊之架構規範

| 階段別 | 核心模組與 Zone 歸屬 | 必須繼承與嚴格跟進之規範項目 |
| :--- | :--- | :--- |
| **Stage 2** | 通用視圖路由器 `PortalRouter`、外框容器基建 (Zone 1, 3, 9, 10, 11) | 1. 建立 `portal-router.js`，負責接管整頁渲染，取代目前 `portal.html` 的靜態散裝結構。<br>2. 實作深層連結（Deep Linking）路由狀態機：支援 `#pj=<id>&view=<action>&ev=<id>&ms=<id>` URL Hash 雙向監聽。<br>3. `⚙ Admin Console` 進入按鈕必須依據 `user.stRight === 'ADMIN'` 動態生成與銷毀，嚴禁僅依賴靜態 CSS `display: none`。<br>4. 整合全域 Route Guard，驗證 `pb_token` 與 `pb_user`。 |
| **Stage 3** | 專案全域設定、字典治理與審計黑盒子 (Zone 8) | 1. 字典管理（`T00_Ref`）必須同時支援專案全域與使用者個人自訂項。<br>2. 嚴格貫徹 `ProjectRemarkLedger` 寫入 `T01_Projects.PJ_Remark` 之「**Append-Only、只讀黑盒子、不可竄改**」原則。<br>3. 專案軟刪除（`PJ_ignore_delete`）必須強制輸入刪除原因，並自動為 `PJ_Code` 加上時間戳後綴防止唯一性索引衝突。 |
| **Stage 4** | 專案主控台與時間線雙軌甘特圖 (Zone 1 & 2) | 1. 修正 `MemberRelatedHandler.java` 內所有 `FK_T05_PK_T01_Custom` 欄位為標準大寫雙引號 `\"FK_T05_PK_T01_CUSTOM\"`。<br>2. 實作名冊時空旅行（Time-Travel）演算法：依據 `pr_start_date` 與 `pr_end_date` 精確計算基準日有效成員。<br>3. 拖曳排序（HTML5 Drag & Drop）必須具備同表同群組之邊界隔離防禦。 |
| **Stage 5** | 階段推進與階層凍結傳遞 (Zone 4 & 5) | 1. **階層凍結傳遞（Cascading Freeze）**：Phase 凍結時，後端必須強制封鎖其下所有子 Event 與 Mission 的新增與編輯操作。<br>2. 實作狀態變更 4 擇 1 互斥狀態機（Keep, Freeze/Unfreeze, Soft Delete/Restore），狀態改變時審計原因必填。 |
| **Stage 6** | 事件治理與雙軌甘特圖擴充 (Zone 2 & 6) | 1. **深度層級限制防線**：`EV_DepthLevel` 超過 3 層時，後端強制檢查專案是否已於 `T00_Ref` 解鎖深度限制。<br>2. 批次建立事件（Batch Mode）必須在單一資料庫交易中完成，支援自訂前綴/後綴流水序號。 |
| **Stage 7** | 任務指派與雙模工作流 (Zone 2 & 7) | 1. 重構 `portal-function-mission.js`，完整對接 `T04_Missions` 與 `T07_JoinMissions`。<br>2. 實作 PIC（負責人）與 Collaborator（協同人）雙重視角切換。 |
| **Stage 8** | 即時訊息抽屜與個人快捷模組 (Zone 9 & 11) | 1. 訊息串接：`T08_MultiComment` 實作多層引用（Quote）與連登式底端排序。<br>2. 未讀計數通知：透過 `T09_MessageRead` 實現已讀標記與頂部鈴鐺徽章實時同步。<br>3. 重構 `portal-function-shortcut.js`，支援將任意深層 Hash 連結收藏至個人的 `T00_Ref` 捷徑選單。 |

---

## 三、 Stages 1–8 完成後的過渡相容代碼清理清單 (Refactoring Checklist)

待系統所有核心功能與業務模組全部建置完成、且進入穩定運行期（Stable Release）時，必須安排一次專項重構，徹底清除以下為相容過渡而存在的臨時程式碼：

```
[ ] 1. 儲存金鑰冗餘鏡像清理 (Storage Key Consolidation)
    - 移除 localStorage / sessionStorage 中的次級鏡像金鑰：
      * "token" (全域收斂為 "pb_token")
      * "currentUser" (全域收斂為 "pb_user")
    - 移除後台專屬金鑰 (DB_TableControl.js 與 StaffPasswordSetup.js 全面改為讀取 pb_token 與 pb_user)：
      * "adminToken"
      * "admin_user_id"
      * "admin_user_name"
      * "admin_user_email"
      * "admin_user_right"

[ ] 2. 前端 User 上下文物件雙向屬性清理 (Attribute Normalization)
    - 目前為相容 Snake_case 與 CamelCase，物件內同時冗餘存放了兩份屬性：
      * 清除 user.pk_t05，全系統統一呼叫 user.pkT05
      * 清除 user.st_right，全系統統一呼叫 user.stRight
      * 清除 user.fk_t05_pk_t01_custom，全系統統一呼叫 user.fkT05PkT01Custom
    - 清理 portal.js 及各子模組中所有的雙向容錯判斷（如 user.pk_t05 || user.pkT05）。

[ ] 3. 後端 Security 鑑權多載廢除 (Method Overload Retirement)
    - 當 Stages 2–8 將既有 Handler (ProjectHandler, EventHandler, PhaseHandler 等)
      全數重構為傳入 HttpExchange 進行驗證後：
      * 廢除 Security.authenticate(String authHeader) 方法。
      * 全系統後端統一呼叫 Security.authenticate(HttpExchange exchange)。

[ ] 4. 除錯面板與臨時 Alert 彈窗降級 (Diagnostic Mode Downgrade)
    - 將 index.html 與 admin_login.html 內嵌的視覺化 "Auth Diagnostic Log" 面板降級為
      僅在 URL 帶有 ?debug=true 時動態渲染，平時完全從 DOM 中移除。
    - 移除 portal.js 中各處為排查跳轉而加入的 diagnostic alert() 視窗。
    - 清除前端各模組中的 console.log 與後端非必要的 System.out.println() 追蹤日誌。
```