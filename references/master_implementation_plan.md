# Master Implementation & Refactoring Plan (穩健漸進式實作與重構總體計劃)

## 1. 核心工程哲學與穩健推進原則 (Core Engineering Principles)

為確保系統在實現全部 Zone 1 ~ Zone 11 預想功能的過程中保持高度穩定、易於除錯（Debug）且具備長期可維護性，本計劃嚴格遵循以下四大工程鐵律：

### 1.1 穩健漸進、零破壞性演進 (Incremental & Non-Breaking Rollout)
- **反對一次性大爆炸改寫 (No Big-Bang Rewrite)**：嚴禁同時大幅改動多個無關聯模組。將全系統功能拆解為 **8 個獨立可交付階段（Stages）**。
- **階段性可編譯與可回退 (Stage-Gate Verification)**：每完成一個 Stage（甚至 Stage 內的單一子步驟），系統都必須能順利通過 `1.build.bat` 編譯並由 `2.run.bat` 啟動運行。
- **雙軌橋接過渡 (Adapter Pattern Transition)**：在引入全新的 `PortalRouter`（Zone 11/9/10 動態插槽引擎）時，先以「相容封裝層（View Adapter）」包裹現有已穩定運作的 Zone 5（Project / Phase / Member）與 Zone 6（Event Gantt）程式碼，確保既有功能 100% 正常運作後，再逐步替換與擴充新模組。

### 1.2 單檔 2,000 行上限與預防性模組拆分準則 (The 2000-Line Guardrail)
- **硬性紅線 (Hard Cap)**：專案內任何單一檔案（`.java`、`.js`、`.css`、`.html`）嚴禁超過 **2,000 行**。
- **預警拆分線 (Soft Threshold - 1,500 Lines)**：當任何檔案代碼量達到或預估將逼近 **1,500 行** 時，強制啟動「按職責/功能垂直拆分（Functional Decomposition）」：
  - **前端 JS 拆分策略**：依「區域（Zone）+ 業務職責（Core / View / Modal / Gantt / DeepView）」拆分為獨立 `.js` 檔，透過明確的全域命名空間對象（如 `PortalRouter`, `MissionCore`, `Zone2ProjectView`）協作。
  - **前端 CSS 拆分策略**：`portal.css` 僅保留外框拓撲（Zone 1~11 容器與響應式比例）；各業務視圖的專屬樣式拆分為獨立的 `portal-*.css`。
  - **後端 Java Handler 拆分策略**：避免單一 Handler 承載過多跨模組查詢。當 `ProjectHandler.java`、`EventHandler.java` 或 `MissionHandler.java` 逼近預警線時，按「個人設定/字典（`SettingRefHandler`）」、「跨專案行事曆與交接檢索（`EventCalendarHandler`）」等維度拆分為獨立 Handler 或輔助 DAO 類別。

### 1.3 跨語言全域命名一致性與自解釋註解 (Naming Uniformity & Call-Graph Docs)
- **全域命名統一**：前端（HTML/JS/CSS）與後端（Java/SQL）對同一實體必須使用與資料庫 Schema 對齊的標準名稱（如主鍵統一使用 `PK_T01`, `PK_T02`, `PK_T03`, `PK_T04`, `PK_T05`，代碼統一使用 `PJ_Code`, `EV_Code` 等），徹底消除現有代碼中局部混用別名的現象。
- **全鏈路註解契約**：每個新增或重構的 Function / Method 頂部必須標註：
  1. **職責與邊界 (Purpose & Scope)**
  2. **輸入契約 (Input Contract)**
  3. **輸出契約 (Output Contract)**
  4. **呼叫拓撲 (Call Graph)**：標明 `Called By`（上游調用者）與 `Calls`（下游被調用者）。

### 1.4 審計隔離與異動預告鐵律 (Auditing & T00_Ref Isolation)
- **絕對隔離區**：凡涉及 `T00_Ref`（`FK_T00_PK_T05 IS NOT NULL` 個人偏好、資料夾歸類、捷徑、動態 Tab 排序）、`T09_MessageRead` 已讀狀態、以及前端路由切換與面板開合，**一律嚴禁寫入 `ProjectRemarkLedger`**。
- **主動預告與 Opt-In**：凡業務異動即將寫入 `ProjectRemarkLedger`，前端必須提前預告使用者；於留言回覆（`T08_MultiComment`）時，必須由使用者主動勾選 `[ ] Record to ProjectRemarkLedger`（預設不勾選）方可寫入台帳。

---

## 2. 目標檔案結構與拆分藍圖 (Target File Architecture & Splitting Blueprint)

為確保所有檔案均控制在 **500 ~ 1,200 行** 的最佳維護區間（遠低於 2,000 行上限），整體檔案拓撲規劃如下：

### 2.1 後端 Java (`src/`) 模組規劃
- `src/AppServer.java`：註冊路由映射（含新增之設定與跨專案查詢端點）。
- `src/common/`：
  - `DB.java`、`JsonUtil.java`、`ProjectRemarkLedger.java`
  - `Security.java`：**[升級]** 實作 Salted Hash 與 `MessageDigest.isEqual()` 常數時間比對。
- `src/handlers/`：
  - `AuthHandler.java`：**[重構]** 廢除固定網域拼接，實作 `FK_T05_PK_T01_CUSTOM` 全域同仁與外判人員（多筆強制驗證 `PJ_Code`）分支狀態機。
  - `SettingRefHandler.java`：**[新增拆分]** 專責處理 Zone 1（側欄折疊偏好）、Zone 2/4/8（`T00_Ref` 個人資料夾映射、捷徑管理、自訂字典 CRUD 與永久刪除），分擔 `ProjectHandler` 負荷並確保 100% 審計隔離。
  - `ProjectHandler.java`：**[修正與擴充]** 處理專案 CRUD、Zone 2 `My Project` 授權專案總表檢索與狀態過濾。
  - `PhaseHandler.java`：**[維持與精煉]** 處理 Phase CRUD 與階層凍結繼承。
  - `MemberRelatedHandler.java`：**[維持與精煉]** 處理成員權限矩陣（`FULL`, `GENERAL`, `VIEWER`, `EVENT ONLY`）與成員甘特負載數據。
  - `EventHandler.java`：**[修正與擴充]** 處理單一專案 Event CRUD、Split-Rail 甘特數據、以及 `PK_T03` 單一事件深度視圖數據。
  - `EventCalendarHandler.java`：**[視行數新增拆分]** 若 `EventHandler.java` 逼近 1,500 行，將 Zone 2 `My Event` 的跨專案 Month/Week/Day 檢索與 `Handover View`（前任交接檢索）獨立至此 Handler。
  - `MissionHandler.java`：**[重構與擴充]** 支援 Event 上下文就地新增 Mission、單一專案與跨專案（Max 5 Projects）任務檢索、狀態快速勾選更新、單一 Mission 深度工作台與 `T07_JoinMissions` 協同成員治理。
  - `MessageHandler.java`：**[擴充]** 支援 `T08_MultiComment` 跨階層留言、`T09_MessageRead` 依 `Last Update Time` 降冪清單、雙擊標記已讀、以及 Opt-In 寫入 `ProjectRemarkLedger`。
  - `AdminHandler.java`、`DBAdminHandler.java`、`StaticHandler.java`：**[加固]** 強化後端 `ST_Right == 'ADMIN'` 零信任攔截。

### 2.2 前端 JS (`public/js/`) 模組拆分規劃
1. **核心基礎與路由層**：
   - `common-function.js`：全域 API 封裝、標準命名轉換工具、Ledger 預告對話框組件。
   - `portal-router.js`：**[新增核心]** 實現 `PortalRouter`（管理 Zone 11 `main`、Zone 9 `sideList`、Zone 10 `sideDetail` 三大通用動態插槽，`mount/unmount` 生命週期、Hash Diffing 與 `routeSequence` 防競爭機制）。
   - `portal.js`：**[瘦身重構]** 專責頂部導航（Zone 1 側欄收合、Zone 2 切換、Zone 3 零信任 Admin 按鈕渲染與鈴鐺徽章）與左側欄（Zone 4 下拉選單同步、Zone 5~8 手風琴狀態）的初始化與事件綁定。
2. **Zone 2 跨專案總覽層（與單一專案代碼物理隔離）**：
   - `portal-zone2-myproject.js`：**[新增拆分]** 實作擬真 Windows 資料夾總覽（Root Overview 拖曳歸類、`+ Custom folder` 百字防重名驗證、Folder Drill-Down 壓縮檢視）。
   - `portal-zone2-myevent.js`：**[新增拆分]** 實作 Lazy-Load 跨專案三態行事曆（Month / Week / Day 視圖切換、多維度與 Handover 篩選、單擊預覽抽屜、雙擊跳轉 `#pj=PK_T01&event=PK_T03`）。
   - `portal-zone2-mymission.js`：**[新增拆分]** 實作跨專案任務鎖定閘門（Project Gatekeeper 最多勾選 5 個專案限制、`Switch Projects (X/5)`）並調用任務雙模核心。
3. **Zone 5 & Zone 6 單一專案既有核心層（相容升級）**：
   - `portal-function-project.js`、`portal-function-project-Modal.js`
   - `portal-function-project-Member.js`、`portal-function-project-Member-GanttChart.js`
   - `portal-function-phase.js`、`portal-function-phase-Modal.js`、`portal-function-phase-GanttChart.js`
   - `portal-function-event.js`、`portal-function-event-Modal.js`、`portal-function-event-GanttChart.js`
   - `portal-function-event-DeepView.js`：**[新增拆分]** 專責 `#pj=PK_T01&event=PK_T03` 單一事件深度工作台（整合 Event 詳情與下轄 Mission 就地建立/指派/勾選），防止 `portal-function-event.js` 膨脹超過 2,000 行。
4. **Zone 7 & 共用 Mission 雙模引擎層（重構拆分原 `portal-function-mission.js`）**：
   - `portal-mission-core.js`：**[新增拆分]** 共用雙模渲染引擎（模式一：Checklist Table 即時勾選；模式二：Multi-Tier Dynamic Tabs 動態降維分頁引擎與卡片矩陣）。
   - `portal-zone7-mission.js`：**[新增拆分]** 專責左側 Zone 7 三大子項目（`Mission Workspace`, `My Handle Mission`, `My Joined Mission`）的單一專案任務視圖掛載。
   - `portal-mission-deepview.js`：**[新增拆分]** 專責 `#pj=PK_T01&ms=PK_T04` 單一 Mission 深度工作台（交付細節、`T07_JoinMissions` 協同成員、留言與狀態審核）。
5. **Zone 8 個人設定中樞層（拆分取代原 `portal-function-shortcut.js`）**：
   - `portal-setting-folder.js`：**[新增拆分]** 專責 `Folder Management`（勾選自訂資料夾擴展至 Zone 4 Option、專案移除/複製/轉移）。
   - `portal-setting-shortcut.js`：**[重構]** 專責左側 `My Shortcut` 清單渲染與 Zone 11 `Shortcut Management`（排序、新增、移除）。
   - `portal-setting-preferences.js`：**[新增拆分]** 專責 `Workspace & Display Preferences`（列表檢視、就地修訂與永久刪除個人 `T00_Ref` 記錄）。
6. **Zone 9 & Zone 10 隨選通知與留言層**：
   - `portal-notification-center.js`：**[新增拆分]** 專責 Zone 9 通知清單（未讀/已讀、`Last Update Time` 降冪）與 Zone 10 訊息詳情、快速回覆、Opt-In Ledger 勾選及 Expand 比例縮放。

---

## 3. 分階段穩健實作路線圖 (8-Stage Step-by-Step Roadmap)

---

### Stage 1：登入與安全認證基座加固 (`spec_login_module.md`)
**【設計考量】**：登入模組（`index.html` + `login.js` + `AuthHandler.java`）與主工作台完全解耦，最適合作為第一階段獨立改造目標，風險最低且能立即建立安全基座。

1. **前端調整 (`public/index.html`, `public/js/login.js`, `public/css/login.css`)**：
   - 將 Email 輸入框 placeholder 改為 `e.g. user@domain.com`，移除任何自動補齊網域之邏輯。
   - 新增「動態 `Project Code (PJ_Code)` 次級驗證輸入區」（預設隱藏）：當後端回傳 `REQUIRE_PROJECT_CODE` 狀態碼時，於登入卡片內平滑展開 `PJ_Code` 輸入框並強制聚焦；若使用者留空提交，前端直接攔截並提示 `Project Code is required for contractor profile`。
2. **後端重構 (`src/handlers/AuthHandler.java`, `src/common/Security.java`)**：
   - 移除後端固定拼接 `@swd.gov.hk` 等網域字串的舊代碼，統一執行 `.trim().toLowerCase()`。
   - 實作 `T05_Staff` 身分分支狀態機：
     - 查詢 `ST_Email = ? AND ST_IsActive = TRUE`。
     - **分支 A（單筆且 `FK_T05_PK_T01_CUSTOM = 0`）**：全域同仁，直接驗證密碼。
     - **分支 B（單筆且 `FK_T05_PK_T01_CUSTOM > 0`）**：單一專案外判人員，直接驗證密碼並於 Session 綁定其限定專案 `PK_T01`。
     - **分支 C（命中 >= 2 筆記錄）**：全數為外判專案身分（`CUSTOM > 0`）。若請求未帶 `PJ_Code` 則回傳 `REQUIRE_PROJECT_CODE`；若有帶 `PJ_Code` 則反查 `T01_Projects` 取得 `PK_T01` 匹配對應記錄驗證密碼，留空或不匹配一律 `REJECT_LOGIN`。
   - 升級 `Security.java`：引入 Salted Hash 驗證與 `MessageDigest.isEqual()` 常數時間比對（同時相容既有資料庫密碼格式或提供平滑遷移機制，確保現有測試帳號不斷線）。
3. **【Stage 1 驗收與 Debug 檢查點】**：
   - [ ] 內部同仁（`CUSTOM = 0`）輸入完整 Email 可直接登入至 `portal.html`（且不預設載入任何專案）。
   - [ ] 多專案 Contractor 帳號登入時會觸發詢問 `PJ_Code`，留空或填錯拒絕登入，填對成功進入。
   - [ ] 管理後台 `admin_login.html` 保持獨立運作不受影響。

---

### Stage 2：通用視圖路由器 (`PortalRouter`) 與外框容器基建 (`spec_portal_zone11.md`, `spec_portal_zone1_zone2_myproject.md`, `spec_portal_zone4.md`)
**【設計考量】**：在不改動現有業務視圖內部邏輯的前提下，先把「外框容器（Zone 1~11）」與「交通警察（`PortalRouter`）」搭建起來，並用 Adapter 把現有 Zone 5、Zone 6 功能掛上去。

1. **HTML 與 CSS 外框改造 (`public/portal.html`, `public/css/portal.css`)**：
   - **Zone 1**：移除 `| Project Management Portal` 副標題文字；在 `ProjectBook` 標題旁加入「左側欄收合切換按鈕（Sidebar Collapse Toggle）」，點擊切換 `.sidebar-collapsed` 並透過 API 將狀態寫入個人 `T00_Ref`。
   - **Zone 3**：移除 HTML 中靜態寫死的 Admin 按鈕，改由 `portal.js` 根據 `currentUser.ST_Right === 'ADMIN'` 動態生成 DOM 節點（零信任防禦）。
   - **Zone 9、10、11 彈性容器**：設定主工作區為 Flex 佈局。Zone 9 與 Zone 10 預設 `display: none`（不佔空間，Zone 11 為 100% Fluid 且具備獨立 `overflow-y: auto`）；定義 `.side-open`（Zone 11 彈性壓縮）與 `.side-expanded-ratio`（Expand to Zone 11 時的寬度比例切換 CSS class）。
2. **建立全域路由器 (`public/js/portal-router.js`)**：
   - 實作 `PortalRouter` 單例，管理 `main`（Zone 11）、`sideList`（Zone 9）、`sideDetail`（Zone 10）三個插槽。
   - 實作五階段 `dispatch()` 管線：Hash 解析 -> Zone 11 主參數 Diffing 比對（若僅 `side` 參數變動則不卸載 Zone 11） -> 舊視圖強制 `unmount()`（清除 Timer、EventListener、AbortController、清空 DOM 與重置 `scrollTop = 0`） -> 新視圖 `mount(container, params, routeSeq)` -> 全域被動同步（同步 Zone 4 下拉選單選取值與左側手風琴 Active 狀態）。
3. **現有視圖相容封裝與 Zone 4 雙向連動 (`public/js/portal.js`)**：
   - 將現有的 `SystemOverviewView`、Zone 5（`ProjectDetail`, `ProjectPhase`, `MemberList`）與 Zone 6（`EventDetail`, `MyHandleEvent`）封裝為符合 `mount/unmount` 介面的 View Adapter 並註冊至 `PortalRouter`。
   - **Zone 4 連動**：主動切換 Zone 4 下拉選單時，更新 Hash 為 `#pj=PK_T01`（進入 `Project Detail`）；當外部 Hash 變更帶有 `pj=PK_T01` 時，Zone 4 被動同步更新選單值。
4. **【Stage 2 驗收與 Debug 檢查點】**：
   - [ ] 點擊 `ProjectBook` 返回首頁 System Overview；點擊側欄收合按鈕可流暢展開/折疊左側欄。
   - [ ] 在 Zone 4 選擇專案，以及點擊 Zone 5、Zone 6 現有子選單，網址 Hash 正確變更且畫面與甘特圖 100% 正常渲染。
   - [ ] 點擊瀏覽器「上一頁 / 下一頁」或手動修改網址 Hash，畫面與 Zone 4 下拉選單能精準同步。

---

### Stage 3：Zone 8 (`⚙️ My Setting`) 個人偏好與 `T00_Ref` 治理中樞 (`spec_portal_zone8.md`)
**【設計考量】**：Zone 2（跨專案資料夾）與 Zone 4（下拉選單範圍）皆高度依賴 `T00_Ref` 中的個人資料夾配置。因此優先完成 Zone 8 與 `SettingRefHandler.java`，為後續模組提供穩固的底層數據源。

1. **後端建立 `src/handlers/SettingRefHandler.java`（並在 `AppServer.java` 註冊 `/api/setting/*`）**：
   - 集中處理當前登入者（`FK_T00_PK_T05 = currentUser.PK_T05`）在 `T00_Ref` 的所有個人配置：
     - 讀取/更新個人專案資料夾清單（`Prepare`, `Working`, `Archive` 及自訂資料夾）與專案歸屬映射。
     - 讀取/更新「哪些自訂資料夾允許顯示於 Zone 4 下拉選單」之標記。
     - 讀取/更新個人捷徑清單（`My Shortcut`）與排序。
     - 列出使用者在 `T00_Ref` 的全部自訂字典/參數記錄，支援單筆修訂（Update）與**永久刪除（Permanent Delete）**。
   - **審計防線**：此 Handler 內絕不調用 `ProjectRemarkLedger`。
2. **左側欄 Zone 8 結構更新 (`public/portal.html`, `public/js/portal.js`)**：
   - 標題更名為 `⚙️ My Setting`，展開子項目：
     1. `📁 Folder Management`（路由 `#view=setting-folder`）
     2. `⭐ My Shortcut`（下方直接列出已釘選捷徑陣列，底部附帶 `Shortcut Management` 按鈕對應路由 `#view=setting-shortcut`）
     3. `🖥️ Workspace & Display Preferences`（路由 `#view=setting-preferences`）
3. **前端拆分實作三個設定視圖模組**：
   - `public/js/portal-setting-folder.js`：在 Zone 11 實作（功能 1）勾選哪些自訂 Folder 的專案可成為 Zone 4 的 Option；（功能 2）將專案從某資料夾移除、複製或轉移至其他資料夾。修改後即時觸發 Zone 4 下拉選單重載。
   - `public/js/portal-setting-shortcut.js`：實作左側捷徑點擊快速導航，以及在 Zone 11 進行捷徑上下排序、新增與移除。
   - `public/js/portal-setting-preferences.js`：在 Zone 11 以表格列出該使用者於 `T00_Ref` 的所有自訂義記錄，提供就地編輯與永久刪除（附確認防呆）。
4. **升級 Zone 4 下拉選單資料源**：
   - 串接 `SettingRefHandler` 資料，確保 Zone 4 嚴格僅列出：`Working`、`Prepare`、`未分類專案` 以及在 `Folder Management` 中被勾選允許的自訂資料夾專案（明確排除 `Archive` 與未勾選之自訂資料夾）。
5. **【Stage 3 驗收與 Debug 檢查點】**：
   - [ ] 在 `Folder Management` 轉移專案至 `Archive`，確認該專案立即從 Zone 4 下拉選單中消失；勾選某自訂資料夾允許顯示於 Zone 4，確認其下專案立即出現在 Zone 4 選單中。
   - [ ] 在 `Shortcut Management` 新增、排序、刪除捷徑，左側 `My Shortcut` 清單即時同步。
   - [ ] 在 `Workspace & Display Preferences` 修改與永久刪除 `T00_Ref` 測試記錄，確認資料庫生效且未寫入審計台帳。

---

### Stage 4：頂部 Zone 2 `📁 My Project` 擬真 Windows 資料夾總覽 (`spec_portal_zone1_zone2_myproject.md`)
**【設計考量】**：有了 Stage 3 的 `T00_Ref` 資料夾底層，即可無縫構建頂部 `📁 My Project` 的雙狀態檔案總管視圖。

1. **建立獨立前端模組 `public/js/portal-zone2-myproject.js` 與 `public/css/portal-zone2-myproject.css`**：
   - 註冊路由 `#view=my-project` 至 `PortalRouter`。
2. **實作「狀態一：根目錄總覽狀態 (Root Overview Mode)」**：
   - **區域 11 上半部**：渲染 Windows 風格資料夾卡片（固化項目：`Prepare`、`Working`、`Archive`、`+ Custom folder`，以及使用者已建立之自訂資料夾，顯示各夾內專案數量）。
   - **區域 11 下半部**：渲染獲授權專案總表，配備即時多維度篩選器（依關鍵字、`PJ_Status` 等過濾）。
   - **拖曳歸類與 `+ Custom folder` 建立流程**：
     - 支援將下半部表格專案列直接拖曳（HTML5 Drag & Drop）至上方任意資料夾完成歸類。
     - 點擊 `+ Custom folder` 或將專案拖放至 `+ Custom folder` 時，彈出輸入框並執行嚴格防呆：
       - 禁止與 `Prepare`、`Working`、`Archive`、`+ Custom folder` 及現有自訂資料夾重名（不分大小寫比對）。
       - 長度嚴格限制 **<= 100 字元**。
       - 取消或空白字串立即中止，不產生變更。
     - 驗證通過後寫入 `T00_Ref`（若為拖曳觸發則同步將該專案歸入新資料夾），並即時 Rerender 區域 11。
3. **實作「狀態二：資料夾內部瀏覽狀態 (Folder Drill-Down Mode)」**：
   - 點擊上半部任一資料夾時，上半部壓縮為導航列（僅保留 `Return` 按鈕與當前資料夾名稱），下半部表格向上延伸填滿空間，僅過濾顯示該資料夾內的專案（保留二次篩選器可用）。
   - 點擊 `Return` 立即還原回狀態一（Root Overview Mode）。
4. **專案跳轉聯動**：
   - 在狀態一或狀態二的表格中點擊專案代碼/名稱或 `Open Project`，更新 Hash 為 `#pj=PK_T01`，自動觸發 `PortalRouter` 切換至該專案詳情並同步 Zone 4 下拉選單。
5. **【Stage 4 驗收與 Debug 檢查點】**：
   - [ ] 測試點擊與拖曳專案至 `+ Custom folder`，驗證重名攔截、超過 100 字元攔截、取消防呆與成功建立後的即時渲染。
   - [ ] 測試點擊資料夾進入 Drill-Down 壓縮模式，以及點擊 `Return` 返回根目錄模式。
   - [ ] 點擊任一專案可正確跳轉 `#pj=PK_T01` 並連動 Zone 4。

---

### Stage 5：Zone 5 & Zone 6 細節校準、單一 Event 深度工作台與 Mission 就地建立下沉 (`spec_portal_zone5.md`, `spec_portal_zone6.md`, `spec_portal_zone7.md`)
**【設計考量】**：根據新規則，Zone 7 移除全域 `+ New Mission`，所有建立 Mission 的動作必須下沉至具備明確 Event 上下文的畫面（`Event Detail` 與 `My Handle Event`）。本階段先在 Zone 6 完成此下沉入口與「單一 Event 深度工作台」，為 Stage 6 的 Mission 重構鋪路。

1. **Zone 5 & Zone 6 現有編碼校準**：
   - 檢查 `portal-function-project*.js`、`portal-function-phase*.js`、`portal-function-event*.js`，確保主鍵參照全面統一為 `PK_T01` / `PK_T02` / `PK_T03`，並在寫入 `ProjectRemarkLedger` 的操作前補齊預告確認機制。
2. **實作 Mission 就地建立下沉 (Event Context Bound Creation)**：
   - 在 `Event Detail`（事件列表/甘特列操作區）與 `My Handle Event` 列表中，為每個 Event 節點加上 **`+ Mission`** 按鈕（依角色權限與未凍結狀態顯示）。
   - 點擊後彈出 Mission 建立模態框，自動帶入並鎖定當前 `PK_T01`（Project）與 `PK_T03`（Event），免除在龐大下拉選單中盲找 Event 的困擾。
3. **新增拆分 `public/js/portal-function-event-DeepView.js`（路由 `#pj=PK_T01&event=PK_T03`）**：
   - 為防止 `portal-function-event.js` 超過 2,000 行，將「單一 Event 深度工作台」獨立為新檔案。
   - 介面呈現該 Event 的完整核心屬性、時程、備忘，並在下半部直接嵌入該 Event 下轄的 **Mission 互動清單**（支援就地 `+ New Mission`、指派負責人、勾選切換狀態、查看協同成員）。
4. **【Stage 5 驗收與 Debug 檢查點】**：
   - [ ] 在 `Event Detail` 與 `My Handle Event` 中點擊特定 Event 的 `+ Mission`，確認建立視窗已自動鎖定該 Event 並可成功寫入資料庫。
   - [ ] 訪問 `#pj=PK_T01&event=PK_T03` 可正確載入單一 Event 深度工作台，並能就地管理其下屬 Missions。

---

### Stage 6：Mission 雙模引擎重構 —— 左側 Zone 7（單一專案）與頂部 Zone 2 `✅ My Mission`（跨專案）(`spec_portal_zone7.md`, `spec_portal_zone2_mymission.md`)
**【設計考量】**：Zone 7 與 Zone 2 `My Mission` 共享「表格清單 + 多層動態 Tab 分頁」雙模設計，唯一差異在於 Zone 2 多了「跨專案勾選閘門（最多 5 個專案）」與「Project 維度 Tab」。透過抽取共用核心並拆分為 4 個輕量 JS 檔案，既保證兩邊體驗高度一致，又將每個檔案嚴格控制在 600 行以內。

1. **後端 `src/handlers/MissionHandler.java` 擴充**：
   - 支援傳入單一 `PK_T01`（供 Zone 7 使用）或 `PK_T01` 陣列（最多 5 個，供 Zone 2 使用）查詢 Mission 清單（附帶所屬 Phase 名稱、Event 名稱、Handle User 及 `T07_JoinMissions` 協同成員清單）。
   - 新增單一任務深度檢索與更新端點（依 `PK_T04` 讀取詳情、更新狀態、維護 `T07_JoinMissions` 協辦人）。
2. **前端拆分為 4 個模組化 JS 檔案（外加 `public/css/portal-function-mission.css`）**：
   - **`public/js/portal-mission-core.js`（共用雙模渲染引擎）**：
     - **模式一（Table / Checklist View）**：渲染高效待辦表格（Phase/Event 標籤、Mission 名稱、PIC、協同成員、逾期紅字警示之 Target Date、狀態標籤），支援 Checkbox 直接勾選變更完成狀態。
     - **模式二（Multi-Tier Dynamic Tabs View）**：支援使用者自由排序維度階層（將自訂次序存入 `T00_Ref`）。包含 `Role`（Handled by Me / Joined by Me / Assigned by Me / Handover or All）、`Status`（Pending / In Progress / Completed / Frozen）、`Time Horizon`（Overdue / Due Today / This Week / Next Week / Later / No Due Date），以及跨專案模式下的 `Project` 維度；底層渲染 Mission 卡片矩陣。
   - **`public/js/portal-zone7-mission.js`（左側 Zone 7 單一專案任務工作台）**：
     - 將 `portal.html` 左側 Zone 7 選單重構為 3 項：**`Mission Workspace`**（預設 `All Roles`）、**`My Handle Mission`**（預設 `Handled by Me`）、**`My Joined Mission`**（預設 `Joined by Me`），徹底移除舊版全域 `+ New Mission` 與 `Assign Mission`。
     - 點擊時直接讀取當前 Zone 4 選定的單一 `PK_T01`，調用 `portal-mission-core.js` 渲染 Zone 11。
   - **`public/js/portal-zone2-mymission.js`（頂部 Zone 2 跨專案任務工作台）**：
     - 實作前置「**專案鎖定閘門 (Project Selection Gatekeeper)**」：依 `T00_Ref` 資料夾展開專案列表供 Checkbox 勾選；**強制上限 5 個專案**（勾滿 5 個時其餘 Checkbox 即時反灰 disable）。
     - 點擊 `Confirm & View Missions` 後載入雙模視圖（含 4 層動態 Tab），並於頂部提供 `Switch Projects (X/5)` 快捷重選按鈕。
   - **`public/js/portal-mission-deepview.js`（單一任務深度工作台）**：
     - 綁定路由 `#pj=PK_T01&ms=PK_T04`。無論從 Zone 2 或 Zone 7 點擊深入任一 Mission，統一跳轉至此路由（自動同步 Zone 4 下拉選單為 `PK_T01`），就地處理該任務的交付成果、協同成員（`T07_JoinMissions`）與狀態更新。
3. **【Stage 6 驗收與 Debug 檢查點】**：
   - [ ] 檢查左側 Zone 7 選單已精簡為 3 項，點擊後在 Zone 11 正確切換清單模式與 3 層動態 Tab 模式，且初始 Role 過濾準確。
   - [ ] 檢查頂部 Zone 2 `My Mission` 進入時先顯示資料夾專案勾選閘門，測試勾選第 6 個專案時被反灰阻擋；確認進入後具備 4 層動態 Tab。
   - [ ] 點擊任意 Mission 卡片/列可跳轉 `#pj=PK_T01&ms=PK_T04`，開啟單一任務深度工作台並連動 Zone 4。

---

### Stage 7：頂部 Zone 2 `📅 My Event` 跨專案三態行事曆工作台 (`spec_portal_zone2_myevent.md`)
**【設計考量】**：跨專案行事曆具備獨特的 Month / Week / Day 三態網格與 Lazy Load 要求，將其獨立於 Stage 7 實作，並直接復用 Stage 5 完成的 `#pj=PK_T01&event=PK_T03` 深度工作台作為跳轉終點。

1. **後端檢索擴充 (`src/handlers/EventCalendarHandler.java` 或 `EventHandler.java`)**：
   - 提供 `/api/event/calendar-search` 端點，接收篩選參數：資料夾範圍（連動 `T00_Ref`）、日期區間、身分維度（`Handled by Me`、`Created by Me`、`Involved (Mission Member)`、以及指定特定同仁 ID 的 `Handover View` 交接視圖）與關鍵字。
2. **前端建立 `public/js/portal-zone2-myevent.js` 與 `public/css/portal-zone2-myevent.css`**：
   - **Lazy Load 鐵律實作**：進入 `#view=my-event` 時，僅渲染頂部控制篩選列與空白月曆格點，**嚴禁自動發送 API 載入 Event**；畫面提示使用者設定篩選條件並點擊 `Search`。
   - **頂部控制列**：
     - 三態視圖膠囊切換器：`Month`（預設）、`Week`、`Day`，切換時嚴格保留當前基準日期（Base Date）。
     - 日期導航器：`< Prev`、`Today`、`Next >`（依 Month/Week/Day 自動調整步長）。
     - 多維度篩選器（Folder、Role 含 `Handover View` 人員下拉選單、關鍵字）與 `Search` 按鈕。
   - **三態網格渲染**：
     - `Month View`：7 欄標準月曆，今日高亮，單日超過 3 筆事件自動折疊為 `+N more...`（點擊展開當日浮層）。
     - `Week View`：7 欄垂直時間軸，跨日事件以連續橫條（Timeline Bars）呈現。
     - `Day View`：單日全寬高細節清單（顯示 `PJ_Code`、所屬 `Phase`、起訖時間、負責人與核心目標）。
   - **互動與路由跳轉契約**：
     - **單擊（Single Click）**：從右側滑出輕量預覽抽屜，顯示事件概要與下屬 Mission 統計，並提供 `Open Event & Missions` 按鈕。
     - **雙擊（Double Click）或點擊抽屜按鈕**：更新網址 Hash 為 `#pj=PK_T01&event=PK_T03`，同步 Zone 4 下拉選單並進入單一 Event 深度工作台。
3. **【Stage 7 驗收與 Debug 檢查點】**：
   - [ ] 進入 `📅 My Event` 時確認 Network 面板無自動查詢請求，格點保持乾淨；點擊 `Search` 後才載入資料。
   - [ ] 測試 `Month` / `Week` / `Day` 切換與前後日期翻頁，以及 `Handover View` 檢索前任同仁負責之事件。
   - [ ] 測試單擊滑出預覽抽屜、雙擊跳轉 `#pj=PK_T01&event=PK_T03` 並同步 Zone 4。

---

### Stage 8：Zone 3 通知鈴鐺與 Zone 9 / Zone 10 隨選通知與附註協作中樞 (`spec_portal_zone3.md`, `spec_portal_zone9_zone10.md`, `spec_portal_zone11.md`)
**【設計考量】**：最後一塊拼圖是將跨模組附註留言（`T08_MultiComment`）與個人通知追蹤（`T09_MessageRead`）掛載至 `PortalRouter` 的 Zone 9 與 Zone 10 動態插槽，實現全系統協作閉環。

1. **後端 `src/handlers/MessageHandler.java` 完善**：
   - 支援讀取當前使用者的 `T09_MessageRead` 通知清單（區分 Unread / Read，**強制依 `Last Update Time` 降冪排序**）與未讀總數統計。
   - 支援雙擊訊息時將 `T09` 記錄標記為已讀（`MR_MessageRead = TRUE`）。
   - 支援在 Zone 10（或各業務實體頁面）提交 `T08_MultiComment` 回覆與 `@Mention`（`MC_to_Someone`），並檢查請求中的 `recordToLedger` 參數：**僅當 `recordToLedger === true` 時，才在事務中同步寫入 `ProjectRemarkLedger`**。
2. **前端建立 `public/js/portal-notification-center.js` 與 `public/css/portal-notification-center.css`**：
   - **Zone 3 鈴鐺徽章**：定時或於路由切換時刷新未讀計數徽章（如 `🔔 3`）；單擊鈴鐺觸發 Hash 更新（附加 `&side=notifications`）。
   - **Zone 9 訊息清單工作台 (`sideList` Slot)**：
     - 當路由含 `side=notifications` 時，Zone 9 展開（Zone 11 自動 Flex 壓縮），渲染「未讀」與「已讀」分組清單，嚴格依 `Last Update Time` 降冪排列。
     - 點擊面板頂部 `✕` 關閉時，移除 Hash 中的 `side` 參數，執行 `unmount()` 清空 DOM 並將 100% 寬度歸還 Zone 11。
   - **Zone 10 訊息詳情與快速回覆 (`sideDetail` Slot)**：
     - 在 Zone 9 **雙擊**任一訊息時，API 標記已讀並更新鈴鐺數字，同時展開 Zone 10 渲染完整留言串、來源上下文標籤（點擊標籤可直接跳轉至對應 `#pj=...&event=...` 或 `&ms=...`）與底部回覆輸入框。
     - **審計隔離核選框**：回覆框旁提供 `[ ] Record to ProjectRemarkLedger`（**預設嚴格不勾選**）。
   - **「Expand to Zone 11」視覺比例擴展 (Ratio Shift)**：
     - 點擊 Zone 10 的擴展按鈕時，不重新掛載 DOM，直接切換外層容器 CSS class（調整 Zone 11 與 Zone 9/10 的 Flex 寬度佔比，使 Zone 10 獲得大面積書寫視野），已輸入草稿與勾選狀態完全無損；點擊還原即恢復原比例。
3. **【Stage 8 驗收與 Debug 檢查點】**：
   - [ ] 點擊 `🔔` 展開 Zone 9，確認 Zone 11 平滑彈性壓縮且未重新載入（Diffing 生效）。
   - [ ] 雙擊未讀訊息，確認未讀數減 1、Zone 10 展開顯示詳情與回覆框。
   - [ ] 測試點擊 `Expand to Zone 11` 比例縮放效果，草稿文字不丟失；測試不勾選與主動勾選 `Record to ProjectRemarkLedger` 送出回覆後，資料庫台帳的隔離準確性。
   - [ ] 點擊 `✕` 關閉 Zone 9/10，確認容器完全隱藏、DOM 節點已清理，且 Zone 11 恢復 100% 寬度。

---

## 4. 全域編碼行數監控與品質門檻總表 (Line-Count & Quality Gate Summary)

在每一個 Stage 開發與 Code Review 時，執行以下檢查表：

| 檢查維度 | 標準門檻 | 處置對策 |
| :--- | :--- | :--- |
| **單檔行數監控** | 預警線：**1,500 行** / 硬上限：**2,000 行** | 一旦單檔達到 1,500 行，立即依第 2 節藍圖拆分為獨立子檔案（如 `-DeepView.js`, `-Core.js`, `SettingRefHandler.java`）。 |
| **記憶體與事件清理** | 所有 Zone 11 / 9 / 10 視圖必須實作 `unmount()` | 切換路由時於 Console / DevTools 檢查 DOM 節點與 Event Listeners 是否確實歸零，無重複觸發 API。 |
| **命名一致性** | 100% 對齊 Schema（`PK_T01`~`PK_T09`, `PJ_Code` 等） | 消除舊代碼中自創的同義變數名，確保前後端 JSON Key 完全一致。 |
| **審計台帳純淨度** | 非公務異動 0 寫入 | 每次測試 `T00_Ref`、`T09` 已讀、路由導航與未勾選 Opt-In 之留言後，檢查 `ProjectRemarkLedger` 確保無新增記錄。 |
| **雙語規範** | UI 100% English / 註解與文檔 100% 繁體中文 | 檢查所有新增 Modal、按鈕、提示訊息均為英文，且每個 Function 具備繁體中文 Call-Graph 註解。 |
