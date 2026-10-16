# ProjectBook: System Purpose, Vision & Architectural Principles

## 1. 系統願景 (Vision Statement)
ProjectBook 定位為一套「輕量級、高自主、具備長期自持力（Self-Contained）」的微型企業與公務專案治理中樞。
系統以純原生 Java（JDK 原生 HTTP Server + JDBC）、嵌入式 H2 資料庫、Vanilla JavaScript 與 Raw CSS 構建，杜絕重型第三方框架依賴與供應商鎖定，以「一鍵構建與啟動（1.build.bat / 2.run.bat）」實現極低運維成本與長達 5~10 年的系統自持力。

---

## 2. 系統核心目的 (Core Purpose & Business Drivers)

### 2.1 多階層專案全生命週期治理 (Multi-Tier Hierarchy Governance)
- 垂直打通 **Project (專案) -> Phase (階段) -> Event (里程碑/事件) -> Mission (執行任務)** 四層精密結構。
- 透過雙軌拆分甘特圖（Split-Rail Gantt Chart）與層級狀態繼承（Cascade Freeze），即時呈現目標時程（Target）與實際執行（Actual）偏差，全面掌控專案進度。

### 2.2 跨任期業務交接與歷史資產傳承 (Seamless Handover & Institutional Memory)
- 專門解決前任同仁離職或調職、後任同仁接手專案時的資訊斷層問題。
- 接任同仁登入後，可完整調閱前任同仁「以往處理過」以及「正在進行中」的所有專案全貌、歷史階段、會議交付物、決策背景與備忘紀錄，使組織數位資產與公務記憶永續傳承。

### 2.3 嚴密且透明的軌跡存證與台帳體系 (Tamper-Evident Ledger & Traceability)
1. **異動前主動預告機制 (Pre-Action Ledger Notice)**：
   - 凡任何系統操作行為（Action）即將向 `ProjectRemarkLedger` 寫入審計存證紀錄時，系統**必須主動預先通知使用者**，嚴禁靜默寫入。
2. **使用者自主備忘存證 (User-Initiated Ledger Entry)**：
   - 使用者可依公務管理需要，主動將重要決策、外部溝通或關鍵動作寫入 `ProjectRemarkLedger` 作為存證。
3. **個人偏好與全局資料嚴格隔離 (T00_Ref Scope Rule)**：
   - `T00_Ref` 字典表凡滿足 `FK_T00_PK_T05 IS NOT NULL` 的記錄，**一律嚴格定義為「僅影響該使用者自身介面效果」的個人偏好設定**。
   - 此類個人介面偏好變更，嚴禁寫入全域或專案級的 `ProjectRemarkLedger`，避免污染公務審計台帳。

### 2.4 零信任權限與承辦商隔離 (Zero-Trust Access Control)
- 全域同仁（Global Staff, `CUSTOM = 0`）依專案角色表 `T06_ProjectRoles` 的 `PR_Right` 動態授予權限。
- 外部承辦商（Contractor, `CUSTOM = PK_T01 > 0`）嚴格實體隔離在單一專案內，保障公務機密安全。

---

## 3. 架構價值觀與代碼治理準則 (Architectural Principles)

### 3.1 極簡維護與自解釋代碼 (Self-Documenting & Low Maintenance Overhead)
為確保後續 1~3 年的極簡維護，每一個 Function / Class 必須具備高度可讀性與清楚的規格說明：
1. **職責與邊界說明**：清楚說明該函式/類別的核心功能與目的。
2. **輸入契約 (Input Contract)**：精確宣告接收什麼參數與型態。
3. **輸出型態 (Output Contract)**：明確定義可能回傳的資料結構或錯誤型別。
4. **全鏈路呼叫拓撲 (Call Graph & Dependency)**：
   - 標明該 Function 會被哪些 Function (B, C, D) 呼叫。
   - 標明該 Function 有機會呼叫哪些下游 Function。

### 3.2 跨語言全域命名一致性律 (Universal Naming Uniformity)
- 嚴格杜絕不同檔案間語意相同的變數命名漂移現象。
- 無論分佈於 `.java`、`.js`、`.html` 或 `.css`，相同實體在整個專案中必須使用唯一標準名稱。
  - **違規範例**：一處叫 `pj_code`，另一處叫 `project_code`。
  - **強制標準**：全系統一律統一採用與資料庫 Schema 嚴格對齊的標準命名（例如統一為 `PJ_Code` 或 `pj_code`），嚴禁自行發明同義別名。

### 3.3 零框架原則 (Zero-Framework Mandate)
- 堅持 JDK 原生 HTTP Server、JDBC、原生 JavaScript DOM 與 Raw CSS。杜絕第三方框架因版本棄用或依賴漏洞所產生的升級技術債。

### 3.4 事務原子性與雙語隔離 (Transactions & Bilingual Strict Isolation)
- 多表寫入一律納入事務原子性（`setAutoCommit(false)` + `rollback`）。
- 使用者介面（UI）一律強制使用 English；系統架構、註解說明與研討研判一律使用繁體中文。
