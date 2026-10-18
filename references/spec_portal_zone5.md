# Specification: Portal Workspace - Zone 5 (Left Navigation: My Project)

## 1. 模組定位與設計原則
本規格書定義 `portal.html` 左側導航欄中的 **Zone 5（My Project 專案內部階層與管理模組）** 之現行實作規格與行為。
- **定位**：位於左側邊欄 Zone 4（CURRENT PROJECT 下拉選單）正下方，專注於「當前選中專案（Selected Project）」內部的生命週期、階層結構、甘特排程與成員治理。
- **前置約束**： Zone 5 內部的子項目操作均綁定全域當前選定之專案實體（`PK_T01` / `PJ_Code`）。若未選取專案，相關需專案上下文之視圖將提示選擇專案或保持唯讀引導。

---

## 2. 介面結構與子功能項目 (As-Is Implementation)

依據 `portal.html`、`portal-function-project.js`、`portal-function-phase.js` 及相關 Modal/Gantt 模組實作，Zone 5 包含手風琴標題 `📁 My Project` 及以下四大子項目：

### 2.1 `+ New Project`（新增專案）
- **觸發機制**：點擊觸發專案建立模態框（Project Modal）。
- **權限防禦**：依據使用者權限判定是否允許建立新專案。
- **欄位與流程**：
  - 輸入專案代碼、專案名稱、起訖日期、描述等核心屬性。
  - 送出後向後端 `/api/project/create`（或相應 Handler）發送請求。
  - 成功後自動更新專案列表，並可自動切換至新專案作為當前上下文。

### 2.2 `Project Detail`（專案詳細資料與核心甘特圖）
- **觸發機制**：點擊後在中央主工作區（**Zone 11**）渲染該專案的總體詳情與專案層級甘特視圖。
- **URL Hash 路由**：同步更新路由為 `#pj=PK_T01` 或 `#pj=PK_T01&view=project-detail`。
- **核心內容**：
  - **專案屬性卡片**：顯示專案代碼、名稱、狀態（Active / Frozen / Completed）、起訖日期及負責人。
  - **專案生命週期控制**：具備 FULL 權限者可執行專案屬性修改、專案凍結（Freeze）或解凍（Unfreeze）操作。
  - **專案層級甘特圖 (Project Gantt Chart)**：以時間軸直觀展示專案整體時程、關鍵節點與總進度跨度。

### 2.3 `Project Phase`（階段/功能模組管理與 Phase 甘特圖）
- **觸發機制**：點擊後在中央主工作區（**Zone 11**）渲染該專案所屬全部 Phase（階段 / Feature 模組）的清單與排程視圖。
- **URL Hash 路由**：`#pj=PK_T01&view=project-phase`。
- **核心內容與功能**：
  - **Phase 清單/表格**：列出該專案下的所有階段（`PK_T02`），顯示階段名稱、排序序號、起訖時間、凍結狀態等。
  - **Phase 操作**：
    - `+ Add Phase`：彈出 Phase Modal，建立新階段並綁定至當前專案。
    - `Edit Phase`：修改特定階段屬性。
    - `Phase Freeze/Unfreeze`：階層級凍結繼承（Phase 被凍結時，其所屬下層 Event/Mission 視圖同受約束）。
  - **Phase 甘特視圖 (Phase Gantt Chart)**：透過原生 Canvas/DOM 渲染 Split-Rail 或階段時程軌道，展示各 Phase 之間的先後承接關係。

### 2.4 `Member List`（專案成員與權限治理）
- **觸發機制**：點擊後在中央主工作區（**Zone 11**）渲染專案成員權限矩陣與成員甘特工作量圖。
- **URL Hash 路由**：`#pj=PK_T01&view=member-list`。
- **核心內容與功能**：
  - **成員清單與角色矩陣**：
    - 展示已加入本專案的成員清單（`T06_JoinProjects` 關聯）。
    - 顯示每位成員的專案角色權限：`FULL`（專案擁有者）、`GENERAL`（標準編輯者）、`VIEWER`（唯讀檢視）、`EVENT ONLY`（僅限特定子事件）。
  - **成員指派與異動**：具備管理權限者可新增成員、調整成員角色權限或自專案移除成員。
  - **成員甘特負載圖 (Member Gantt Chart)**：視覺化展示成員在當前專案各時間段所承擔的任務排程與負載情況。

---

## 3. 審計與偏好隔離規範 (Auditing Boundary)
- **檢視與導航**：在 Zone 5 切換子項目、檢視甘特圖或過濾成員，純屬客戶端檢視行為，**一律不寫入 `ProjectRemarkLedger`**。
- **專案與階層異動**：建立專案、修改專案屬性、凍結/解凍 Phase、調整成員權限等治理動作，依業務規則向後端提交並記錄審計軌跡（`T99_AuditLog` / 系統審計台帳）。
