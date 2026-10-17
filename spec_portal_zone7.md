# Specification: Portal Workspace - Zone 7 (Left Navigation: My Mission)

## 1. 模組定位與設計原則
本規格書定義 `portal.html` 左側導航欄中的 **Zone 7（My Mission 任務工作台）** 之實作規格與行為。
- **定位**：位於左側邊欄 Zone 6（`📅 My Event`）正下方、Zone 8（`⚙️ My Setting`）正上方。
- **單一專案上下文綁定 (Single Project Scoped)**：
  - 與頂部 Zone 2（跨專案、勾選 1~5 個專案）不同，**Zone 7 嚴格限定於「當前 Zone 4 所選定的單一專案（Single Project Context, `PK_T01`）」**。
  - 不需要亦不提供跨專案的資料夾勾選閘門（Project Gatekeeper），直接以 Zone 4 選定的專案資料集進行聚焦渲染。
- **建立行為下沉鐵律 (Event Context Bound Creation)**：
  - 鑑於單一專案下 Event 數量龐大，在冗長清單中挑選 Event 極易出錯，**Zone 7 徹底不設全域的 `+ New Mission` 選單**。
  - 新增 Mission 的操作必須在具備明確 Event 上下文的介面中就地發起（即在 `Event Detail` 或 `My Handle Event` 中針對特定 Event 節點新增）。

---

## 2. Zone 7 手風琴子選單與預設身分過濾

Zone 7 手風琴選單提供以下三個子項目，點擊任一項目均在中央主工作區（**Zone 11**）渲染對齊 Zone 2 雙模架構的單一專案任務視圖，僅在**初始預設身分篩選（Role Filter）**上存在語意聚焦：

### 2.1 `Mission Workspace`（專案任務全貌工作台）
- **觸發與路由**：點擊後在 Zone 11 渲染該專案的全域任務工作台，URL Hash 更新為 `#pj=PK_T01&view=mission-workspace`。
- **預設身分維度**：身分過濾維度預設為 **`All Roles`**（展示當前專案下的全部任務）。

### 2.2 `My Handle Mission`（我承辦的核心任務）
- **觸發與路由**：點擊後在 Zone 11 渲染任務工作台，URL Hash 更新為 `#pj=PK_T01&view=my-handle-mission`。
- **預設身分維度**：身分過濾維度自動聚焦為 **`Handled by Me`**（僅顯示當前使用者為第一責任人的 Mission）。

### 2.3 `My Joined Mission`（我協同的參與任務）
- **觸發與路由**：點擊後在 Zone 11 渲染任務工作台，URL Hash 更新為 `#pj=PK_T01&view=my-joined-mission`。
- **預設身分維度**：身分過濾維度自動聚焦為 **`Joined by Me`**（僅顯示當前使用者為協同參與者的 Mission）。

---

## 3. 中央區域 11 (Zone 11) 渲染架構：對齊 Zone 2 雙模規格

當點擊 Zone 7 的任一子項目時，Zone 11 渲染與 `spec_portal_zone2_mymission.md` 高度一致的專業任務工作台架構，但**免除專案維度 Tab**，全方位聚焦於單一專案內部維度：

### 3.1 核心展示雙模視圖切換器 (Dual Presentation Modes Switcher)
工作台頂部提供雙模切換開關，允許使用者即時切換視圖：

#### 模式一：高效待辦清單表格 (Table / Checklist View)
- **單一專案任務總表**：精準呈現當前專案下的所有任務。
- **關鍵欄位**：
  - 所屬 Phase 標籤
  - 所屬 Event 標籤
  - Mission 名稱與代碼（`PK_T04`）
  - 主要負責人（`PIC` / `Handle User`）
  - 協同成員頭像/標籤（`Joined Members`）
  - 到期日（`Target / Due Date`，逾期自動紅字高亮警示）
  - 狀態標籤（`Status`）
- **即時互動 (Quick Action)**：支援在清單列直接勾選或點擊切換任務完成狀態。

#### 模式二：多層動態 Tab 分頁視圖 (Multi-Tier Dynamic Tabs View)
- **維度自訂次序**：保留 Zone 2 的動態降維過濾哲學。由於已鎖定單一專案，Tab 階層由以下**三大正交通用維度**構成（使用者可自由調整 1 至 3 層先後次序）：
  1. **身分關聯維度 (Role / Ownership)**：`Handled by Me` / `Joined by Me` / `Assigned by Me` / `All Roles`。
  2. **任務狀態維度 (Status)**：`Pending` / `In Progress` / `Completed` / `Frozen`。
  3. **時間維度 / 到期跨度 (Time Horizon / Due Date Window)**：
     - `Overdue`（已逾期）
     - `Due Today`（今日到期）
     - `This Week`（本週內到期）
     - `Next Week`（下週到期）
     - `Later / Upcoming`（兩週以後）
     - `No Due Date`（未設定期限）
- **Phase & Event 標記**：
  - 任務卡片內以粗體標籤標示（例如 `[Phase 1 > Kickoff Review]`），並提供頂部下拉/標籤式二級過濾器。
- **底層任務卡片矩陣 (Mission Matrix)**：
  - 通過動態 Tab 篩選後，精準呈現符合條件的 Mission 卡片矩陣。
  - 卡片展示任務目標、驗收條件、進度條及最新留言摘要。

---

## 4. 路由跳轉契約 (Hash Routing Contract)
- **單一任務深度工作台 (Target Single-Mission Scope)**：
  - 無論在「清單模式」或「動態 Tab 模式」下點擊深入某一筆 Mission，網址 Hash 統一跳轉為：  
    `.../portal.html#pj=PK_T01&ms=PK_T04`
  - **Zone 11 行為**：
    - 切換並開啟「單一 Mission 深度工作台」，就地處理該任務的交付成果、執行備忘、協同成員清單（`T07_JoinMissions`）與狀態審核。

---

## 5. 審計與偏好隔離規範 (Auditing Boundary)
- **檢視與動態 Tab 排列**：在 Zone 7 切換子項目、在 Table/Tab 模式切換、調整 Tab 維度順序，均屬於個人檢視偏好，資料存於個人的 `T00_Ref`，**一律不寫入 `ProjectRemarkLedger`**。
- **任務異動審計**：更新任務狀態、修改交付日期、調整主辦人/協辦人，嚴格向後端提交並記錄於系統審計軌跡（`T99_AuditLog`）。
