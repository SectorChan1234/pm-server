# Specification: Portal Workspace - Zone 6 (Left Navigation: My Event)

## 1. 模組定位與設計原則
本規格書定義 `portal.html` 左側導航欄中的 **Zone 6（My Event 事件排程與處置模組）** 之現行實作規格與行為。
- **定位**：位於左側邊欄 Zone 5（My Project）正下方、Zone 7（My Mission）上方。
- **業務職能**：專注於專案工作流程中的核心承載骨幹 —— **Event（事件/里程碑，`PK_T03`）** 的排程排定、事件詳情維護與個人負責事件的快速追蹤。
- **上下文關聯**：依附於全域選定之專案（`PK_T01`）及其所屬 Phase（`PK_T02`）階層架構。

---

## 2. 介面結構與子功能項目 (As-Is Implementation)

依據 `portal.html`、`portal-function-event.js`、`portal-function-event-GanttChart.js`、`portal-function-event-Modal.js` 實作，Zone 6 包含手風琴標題 `📅 My Event` 及以下三大子項目：

### 2.1 `+ New Event`（新增事件）
- **觸發機制**：點擊觸發事件建立模態框（Event Modal）。
- **權限防禦**：依據當前使用者在該專案的角色權限（如 `FULL` 或 `GENERAL`），若為 `VIEWER` 則不具備建立權限。
- **欄位與關聯流程**：
  - 選擇所屬 Phase（階段）。
  - 輸入事件代碼、事件名稱、起訖日期、重要度/優先級、負責人（Handle User）。
  - 送出後向後端 `/api/event/create` 發送請求。
  - 成功後即時刷新事件甘特圖與事件清單。

### 2.2 `Event Detail`（事件詳情與事件甘特圖）
- **觸發機制**：點擊後在中央主工作區（**Zone 11**）渲染當前專案的全域事件管理工作台與 Split-Rail 事件甘特圖。
- **URL Hash 路由**：`#pj=PK_T01&view=event-detail`（若鎖定特定事件則為 `#pj=PK_T01&event=PK_T03`）。
- **核心內容與功能**：
  - **Split-Rail 原生事件甘特圖 (Split-Rail Event Gantt Chart)**：
    - 精確展示各 Event 的時程軌道、持續天數與前置依賴。
    - 支援依 Phase 分組展開/收合。
  - **事件清單與狀態治理**：
    - 列表展示所有 Event 之代碼、名稱、所屬 Phase、起訖時間、執行狀態（Active / Completed / Frozen）與負責同仁。
    - 點擊事件可於抽屜或彈窗檢視更深層的任務關聯（下轄 Mission 清單）與備忘說明。
    - 支援事件編輯、重排時程與生命週期狀態切換。

### 2.3 `My Handle Event`（我負責的事件篩選視圖）
- **觸發機制**：點擊後在中央主工作區（**Zone 11**）渲染專門以**當前登入使用者作為主要負責人（Handle User = Current User）**的專案事件工作台。
- **URL Hash 路由**：`#pj=PK_T01&view=my-handle-event`。
- **核心內容與功能**：
  - 自動以當前使用者代碼（`currentUser.PK_T05`）對當前專案的 Event 進行過濾篩選。
  - 集中呈現同仁自身需要推動、追蹤或驗收的所有事件里程碑。
  - 整合專屬甘特檢視與倒數/逾期預警提示，提升專案執行聚焦度。

---

## 3. 審計與偏好隔離規範 (Auditing Boundary)
- **檢視與導航**：在 Zone 6 切換子項目、篩選我負責的事件、縮放甘特圖時程，均為個人檢視行為，**一律不寫入 `ProjectRemarkLedger`**。
- **事件屬性與生命週期異動**：建立 Event、修改事件起訖日期、指派/轉移負責人、變更事件狀態等核心業務操作，依系統安全與審計規則向後端寫入軌跡（`T99_AuditLog` / 系統審計台帳）。
