# Specification: Portal Workspace - Zone 2 (My Event)

## 1. 模組定位與設計哲學
本規格書定義 `portal.html` 頂部中央 Zone 2 的 **`📅 My Event`** 模組。
- **定位**：作為使用者個人的跨專案里程碑與事件排程中樞。
- **核心鐵律 (Lazy Load Mandate)**：進入本模組時**預設不載入任何 Event**，保持乾淨格點；必須待使用者配置完篩選條件並**主動點擊 `Search`** 後，才執行非同步查詢與渲染，避免沉重請求。
- **個人資料夾連動**：篩選器直接讀取 `T00_Ref` 中設定的 `My Project Folder` 分類作為過濾維度。

---

## 2. 現有狀態 (As-Is State)
- 目前已撰寫之程式碼邏輯與預期設計脫節，現有綁定之邏輯作廢，全面以 To-Be 規範重構。
- 專案內部事件視圖目前已有統一規範路由：
  - `.../portal.html#pj=XXX&view=event-detail`：用於顯示該專案（`PJ_Code = XXX`）內部的**所有事件清單總覽**。

---

## 3. 期望狀態 (To-Be State)

### 3.1 頂部控制與篩選工具列 (Calendar Control & Filter Bar)
位於區域 11 最上方，整合「視圖切換器」、「日期導航器」與「多維度篩選器」：

1. **三態視圖切換器 (View Segmented Switcher)**：
   - 提供三個膠囊按鈕：**`Month`（月曆視圖 - 預設）**、**`Week`（週曆視圖）**、**`Day`（單日視圖）**。
   - **基準日期同步**：切換視圖時保持當前選定之基準日期，不遺失時間上下文。
2. **日期跨度導航器 (Temporal Navigator)**：
   - 提供 `< Prev`、`Next >` 與 `Today`（快速回歸今日）按鈕。
   - 導航步長隨視圖自動調整（按月、按週、按日跳轉）。
3. **多維度篩選器 (Multi-Dimensional Filters)**：
   - **My Project Folder 關聯篩選**：連動 `T00_Ref` 中的個人專案資料夾（`All`, `Prepare`, `Working`, `Archive`, 自訂資料夾）。
   - **身分權限維度**：
     - `Handled by Me (Owner)`：我作為主要負責人。
     - `Created by Me (Creator)`：由我發起建立。
     - `Involved (Mission Member)`：我作為參與成員（下屬 Mission 關聯）。
     - `Handover View`：選擇特定前任同仁，檢索該同仁負責或發起的事件（支援工作交接）。
   - **關鍵字搜尋**：輸入文字模糊比對 Event 名稱與代碼。
4. **搜尋觸發按鈕 (`Search` Button)**：
   - 點擊後發起後端檢索並動態渲染事件資料。未點擊前，網格保持空白無事件狀態。

---

### 3.2 三種可視化網格表現形式 (Visualization Layouts)

#### 1. 月曆檢視 (Month View - 預設狀態)
- **版面**：7 欄式標準週曆排版（週日至週六），預設當前月份。
- **樣式**：當日高亮（藍底）、非本月日期淡色呈現。
- **單日多事件折疊**：單日事件超出上限（如 > 3 個）時自動折疊為 `+N more...`，點擊可展開該日完整浮層。

#### 2. 一週檢視 (Week View)
- **版面**：橫向排列 7 個垂直欄位（週日至週六），具備充裕縱向高度。
- **排版形式**：
  - 各天垂直堆疊當日截止或執行的 Event 卡片。
  - 橫跨多天的 Event 以連續橫條（Timeline Bars）貫穿相應的天數欄位。

#### 3. 單日檢視 (Day View)
- **版面**：單一全寬垂直視圖，聚焦於特定的一天。
- **呈現內容**：
  - 以高細節時間軸／清單展示該日所有的 Event。
  - 展開該 Event 的關鍵屬性：所屬 `PJ_Code`、所屬 `Phase`、起訖時間標籤、負責人與核心目標。

---

### 3.3 互動與路由跳轉規範 (Interaction & Hash Routing Contract)

本系統對於 URL Hash 的路由定義具備嚴格的階層語意區隔：

1. **單擊預覽抽屜 (Single Click Drawer)**：
   - 在任何視圖（Month / Week / Day）單擊事件卡片，從右側滑出預覽抽屜，快速查閱該事件基本資料、說明與下屬 Mission 概要。
2. **專案全事件總覽路由 (Existing Project-Level Scope)**：
   - **格式**：`.../portal.html#pj=XXX&view=event-detail`
   - **語意**：切換至該專案工作台，並在中央視圖載入該專案旗下的**所有 Event 清單總覽**。
3. **單一事件與任務互動專用路由 (Target Single-Event & Mission Interactive Scope)**：
   - **格式**：`.../portal.html#pj=XXX&event=YYY`（其中 `XXX` 為 `PK_T01`，`YYY` 為`PK_T03`
   - **語意與行為**：
     - 在月曆視圖中**雙擊**事件卡片，或點擊預覽抽屜內的 `Open Event & Missions` 按鈕觸發。
     - 系統自動同步全域專案上下文至 `PJ_Code = XXX`（聯動區域 4 下拉選單）。
     - **專屬介面**：中央主工作區切換為**「單一 Event 深度工作台」**，專門處理該 Event 詳情及其與底層 **Mission（任務指派、勾選狀態、成員協作）** 的全套雙向互動。
