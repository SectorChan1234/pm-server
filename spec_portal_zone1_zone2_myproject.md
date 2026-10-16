# Specification: Portal Workspace - Zone 1 & Zone 2 (My Project)

## 1. 模組定位與版面概述
本規格書定義主工作台 `portal.html` 的頂部控制區域，聚焦於：
- **區域 1（Top-Left Branding Zone）**：系統識別與側邊欄展開/收合控制。
- **區域 2（Top Center Module Switcher - My Project）**：專案分類、檢索與個人化資料夾治理工作台（擬真 Windows Folder Explorer 架構）。

---

## 2. 區域 1：系統識別與側欄控制區 (Top-Left Zone)

### 2.1 現有狀態 (As-Is State)
1. **元素組成**：
   - 品牌名稱：`ProjectBook`（粗體標題）。
   - 副標題文字：`| Project Management Portal`。
2. **目前互動與功能**：
   - 點擊 `ProjectBook` 標題觸發 `resetToOverview()`。
   - 該動作重置專案上下文（清空當前選取專案，還原下拉選單至未選擇狀態），並將中央主工作區（區域 11）切換回初始系統導覽引導頁（System Overview / Guide）。

### 2.2 期望狀態 (To-Be State)
1. **介面調整 (UI Simplification)**：
   - **移除文字**：徹底移除副標題文字 `Project Management Portal` 及其前置分隔線 `|`，釋放頂部橫向空間。
   - **新增控制項**：在 `ProjectBook` 旁新增「快捷收合左側欄按鈕（Sidebar Collapse Toggle Button）」。
2. **行為與互動規範 (Behavior & Interaction Contract)**：
   - **標題點擊 (Reset Action)**：
     - 維持點擊 `ProjectBook` 觸發 `resetToOverview()`，確保使用者能一鍵返回初始全局總覽頁。
   - **側欄切換 (Toggle Sidebar)**：
     - 點擊按鈕切換左側導航欄（區域 4、5、6、7、8）的展開與折疊狀態（切換 CSS class，如 `.sidebar-collapsed`）。
     - 側欄收合後，中央主工作區（區域 11）向左延展填滿空間，為雙軌甘特圖（Split-Rail Gantt Chart）等核心組件提供最大橫向可視化寬度。
   - **個人偏好與審計隔離 (T00_Ref Isolation)**：
     - 側欄展開/收合狀態記錄於 `T00_Ref`（關聯 `FK_T00_PK_T05`）。
     - 嚴格界定為使用者個人介面偏好，**一律不寫入 `ProjectRemarkLedger`**。

---

## 3. 區域 2：快捷工作模組切換區 —— `📁 My Project`

### 3.1 現有狀態 (As-Is State)
- 目前已撰寫之程式碼邏輯與預期設計脫節，現有綁定之邏輯作廢，全面以 To-Be 規範重構。

### 3.2 期望狀態 (To-Be State) —— 擬真 Windows 資料夾專案總覽 (Project Explorer)
當使用者點擊頂部中央的 **`📁 My Project`** 按鈕時，中央主工作區（**區域 11**）切換為全螢幕的「專案分類與檢索環境（模擬 Windows Folder 架構）」，並具備兩大運作狀態：

#### 狀態一：根目錄總覽狀態 (Root Overview Mode)

1. **區域 11 上半部：個人專案資料夾區 (Personal Project Folders)**
   - 呈現模擬 Windows 檔案總管的資料夾圖標與卡片佈局。
   - **預設項目（固化資料夾不可重新命名）**：
     1. `Prepare`
     2. `Working`
     3. `Archive`
     4. **`+ Custom folder`**（動態擴充入口）
   - **已建立之自訂資料夾**：使用者過去透過自訂新增的資料夾亦在此處平鋪呈現。

2. **`+ Custom folder` 的觸發與建立流程 (Creation & Validation Flow)**：
   - **觸發途徑**：
     - **途徑 A（主動點擊）**：使用者直接點擊 `+ Custom folder`。
     - **途徑 B（拖曳即新增）**：使用者將下半部表格中的專案卡片/列，直接拖放至 `+ Custom folder` 上。
   - **輸入驗證與防呆規範**：
     - 系統彈出對話框提示輸入 `New Folder Name`。
     - **防重名機制**：禁止輸入預設的 4 個保留名稱（`Prepare`、`Working`、`Archive`、`+ Custom folder`）以及當前已存在的自訂資料夾名稱。
     - **長度限制**：字數嚴格限制在 **100 個字元（characters）** 內。
     - **取消或空值防禦**：若使用者點擊取消或輸入空白字串，則中止操作，不產生新資料夾（若為拖曳觸發，該專案不進行任何歸類變更）。
   - **完成處理 (Rerender)**：
     - 建立成功後，將自訂資料夾設定寫入 `T00_Ref`。
     - **即時重新渲染（Rerender）區域 11**，使新資料夾即刻出現；若為拖曳建立，該專案亦同步歸入新資料夾中。

3. **區域 11 下半部：獲授權專案總表與篩選器 (Authorized Projects Table & Filters)**
   - **資料來源**：以表格（Table）形式列出當前登入者獲授權存取的所有專案。
   - **篩選工具**：提供多維度即時過濾器（例如專案名稱、`PJ_Status` 等條件進行即時篩選）。
   - **拖曳互動**：表格中的每一筆專案皆具備原生拖曳能力，可由使用者拖曳至上方任意資料夾（包含預設資料夾、已建自訂資料夾、或 `+ Custom folder`）。

4. **資料歸屬與審計隔離規範 (T00_Ref Isolation)**：
   - 所有資料夾結構與專案歸類均記錄於 **`T00_Ref`**。
   - **核心鐵律**：嚴格界定為該使用者個人介面自訂效果，**一律不寫入 `ProjectRemarkLedger`**。

---

#### 狀態二：資料夾內部瀏覽狀態 (Folder Drill-Down Mode)

當使用者**點擊**上半部的任意資料夾（如 `Prepare`、`Working`、`Archive` 或使用者自訂資料夾）時：

1. **區域 11 上半部：自適應壓縮導航列 (Compressed Navigation Header)**
   - 資料夾卡片區自動壓縮收合，隱藏其他資料夾圖標。
   - **控制項**：介面僅保留 **`Return`** 按鈕及當前所在資料夾名稱標籤。
   - **返回行為**：點擊 `Return` 時，立即還原為「狀態一：根目錄總覽狀態」（上半部重新展開所有資料夾，下半部重置回全專案列表）。
2. **區域 11 下半部：向上延伸與聚焦過濾 (Expanded Table View)**
   - 下半部表格順勢向上延伸填滿主要可視空間，提供最大縱向瀏覽視野。
   - **資料過濾機制**：僅顯示存放在該資料夾內、且同時符合當前篩選條件（Filters）的專案記錄。
   - 篩選工具列依然保持可用，可在此資料夾範圍內進行二次即時檢索。
   - **專案視圖跳轉入口 (Project View Navigation / Hash Routing)**：
   - 表格中提供直接進入該專案視圖的操作途徑（例如點擊 `PJ_Code` / `PJ_Name` 超連結或專屬 `Open Project` 動作按鈕）。
   - **跳轉路由標準**：透過 URL Hash 更新為 `.../portal.html#pj=XXX`（其中 `XXX` 為對應之 `PJ_Code`），連帶驅動區域 4 下拉選單同步選中該專案，並觸發全局專案視圖加載。
