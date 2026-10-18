# Specification: Portal Workspace - Zone 4 (Project Selection & Context Hub)

## 1. 模組定位與設計哲學
本規格書定義 `portal.html` 左側導航欄頂部的 **Zone 4（專案選擇與操作中樞）** 的資料範疇、狀態聯動與下游驅動機制。
- **定位**：進入單一專案工作視圖（Project Workspace）的全域切入源頭與上下文控制器。
- **資料收斂防禦 (Data Scope Guardrail)**：
  - 專案選單嚴格僅載入當前使用者核心關注的專案清單，杜絕龐大歷史專案充斥選單造成的操作雜訊。
  - **精確允許範圍**：
    1. 使用者放置於 **`Working Folder`** 內的專案。
    2. 使用者放置於 **`Prepare Folder`** 內的專案。
    3. **尚未被使用者歸類至任何資料夾** 的專案（Unassigned / Uncategorized Projects）。
  - **明確排除**：已歸檔至 `Archive Folder` 或使用者自訂非工作資料夾的專案預設不在此選單列出（使用者若需存取，需透過頂部 Zone 2 的 `📁 My Project` 資料夾總覽進行調用）。

---

## 2. 核心元件與聯動規範

### 2.1 專案下拉選單 (Project Selection Pane)
- **選單範圍**：動態比對當前使用者於 `T00_Ref` 儲存的專案資料夾映射關係，僅渲染符合上述三類（Working、Prepare、未分類）之專案。
- **直接操作觸發 (Direct User Selection)**：
  - 當使用者主動在 Zone 4 改變下拉選單的選取值時，系統**直接將中央主工作區切換進入該專案的 `Project Detail`（專案詳情概覽）畫面**。
  - 同步更新 URL Hash 為：`.../portal.html#pj=PK_T01`（或帶有專案詳情之標準路由）。

### 2.2 全域被動同步接收端 (Global Sync Receiver)
- **非 Zone 4 操作驅動**：
  - 當使用者在頂部 **Zone 2** 進行跨專案操作（例如在 `📁 My Project`、`📅 My Event` 或 `✅ My Mission` 點擊特定項目深度跳轉）。
  - 使用者在 **Zone 3 / Zone 9 / Zone 10** 透過通知留言點擊跳轉。
  - 使用者直接在**瀏覽器網址列手動輸入或黏貼**包含專案 Hash 的網址（如 `#pj=PK_T01...`）。
- **同步行為**：
  - Zone 4 監聽 URL Hash 變更事件（`hashchange`）與全域路由事件，**自動同步將下拉選單的值更新為當前路由對應的專案**，保持整套工作台上下文一致。

---

## 3. 下游區域階層驅動體系 (Downstream Cascading Engine)
Zone 4 作為左側導航欄的上下文根節點，其目前選定的專案實體（`PK_T01`）直接驅動並重載左側導航欄下方的全部三個核心區域：Zone 5, 6, 7。

---

## 4. 審計與偏好隔離規範 (Auditing Boundary)
- 在 Zone 4 切換專案選取、更新 Hash 路由及同步下拉選單數值，均屬於客戶端檢視導覽行為，**一律不寫入 `ProjectRemarkLedger`**。
