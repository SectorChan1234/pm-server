# Specification: Portal Workspace - Zone 2 (My Mission)

## 1. 模組定位與設計哲學
本規格書定義 `portal.html` 頂部中央 Zone 2 的 **`✅ My Mission`** 模組。
- **定位**：跨專案日常任務執行、交付追蹤與狀態更新中樞。
- **核心前置防禦 (Project Selection Gatekeeper)**：
  - 進入本模組的第一步，**強制要求使用者透過其個人的 `My Project Folder` 分類中勾選目標專案**。
  - **嚴格上限限制**：最多僅能勾選 **5 個專案**，杜絕巨量資料渲染造成的效能崩潰與視圖雜亂。

---

## 2. 期望狀態 (To-Be State)

### 2.1 啟動流程：專案鎖定閘門 (Project Scope Selection)
1. **資料夾分類過濾**：
   - 進入畫面時，首先展開使用者的 `My Project Folder`（連動 `T00_Ref`，如 `Prepare`、`Working`、`Archive`、自訂資料夾）。
2. **專案勾選清單 (Max 5 Cap)**：
   - 使用者瀏覽對應資料夾內的專案列表，透過 Checkbox 勾選想要檢視任務的專案。
   - **防禦機制**：系統強制限制最多勾選 5 個專案；若達到 5 個，其餘 Checkbox 即時反灰停用。
   - 勾選完成後點擊 `Confirm & View Missions` 載入任務資料庫。
3. **快捷切換通道**：
   - 進入任務介面後，工作台頂部保留 `Switch Projects (X/5)` 按鈕，方便隨時更換專案組合而無需重置所有偏好。

---

### 2.2 核心展示雙模視圖 (Dual Presentation Modes)

介面提供切換開關，允許使用者在以下兩種檢視間無縫切換：

#### 模式一：高效待辦清單表格 (Table / Checklist View - 必備)
- **簡潔條列**：列出所選 1~5 個專案下的所有任務。
- **關鍵欄位**：`PJ_Code`、所屬 Phase & Event 標籤、Mission 名稱、負責人（`PIC`）、到期日（Target Date）、狀態標籤。
- **即時勾選 (Checkbox Interaction)**：支援在清單上直接勾選變更任務狀態。

#### 模式二：多層動態 Tab 分頁視圖 (Multi-Tier Dynamic Tabs View)
前四層的層次先後順序由使用者自由指定排定，動態降維過濾，第 5 層為 Mission 實體：

- **四大正交通用維度（1 至 4 層由使用者自訂次序）**：
  1. **專案維度 (Project)**：已選取的 1~5 個專案。
  2. **身分關聯維度 (Role / Ownership)**：`Handled by Me` / `Joined by Me` / `Assigned by Me` / `Handover View`。
  3. **任務狀態維度 (Status)**：`Pending` / `In Progress` / `Completed` 等。
  4. **時間維度 / 到期跨度 (Time Horizon / Due Date Window)**：
     - `Overdue`（已逾期）
     - `Due Today`（今日到期）
     - `This Week`（本週內到期）
     - `Next Week`（下週到期）
     - `Later / Upcoming`（兩週以後）
     - `No Due Date`（未設定期限）
- **Phase & Event 歸屬標示**：
  - 不作為全域通用 Tab，改為於第 5 層 Mission 卡片內以粗體標籤標示（例如 `[Phase 1 > Kickoff Review]`），並支援在頂部次級篩選列依 Phase/Event 進行細部過濾。
- **第 5 層展示區 (Mission Matrix)**：
  - 在層層過濾後，精準呈現符合條件的 Mission 任務卡片矩陣。
  - 卡片具備任務詳情與操作入口。

---

### 2.3 路由跳轉規範 (Hash Routing Contract)
- **單一任務深度工作台專用路由 (Target Single-Mission Interactive Scope)**：
  - 在任何視圖點擊深入該 Mission，網址 Hash 統一跳轉為：  
    `.../portal.html#pj=XXX&ms=YYY`（其中 `XXX` 為 `PK_T01`，`YYY` 為對應之 `PK_T04`）
  - **系統聯動與介面行為**：
    - 系統自動將全域專案切換至該 `PJ_Code`（連動區域 4 下拉選單同步更新選取狀態）。
    - 中央主工作區（區域 11）切換並開啟**「單一 Mission 深度工作台」**，專門處理該 Mission 的執行細節、交付成果、協同成員（`T07_JoinMissions`）與狀態審核。
