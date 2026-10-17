# Specification: Portal Workspace - Zone 8 (My Setting)

## 1. 模組定位與設計哲學
本規格書定義 `portal.html` 左側導航欄最底部的 **Zone 8（個人設定與偏好中樞）**。
- **命名變更**：由原先的 `⭐ My Shortcut` 正式更名為 **`⚙️ My Setting`**。
- **版面定位**：固定配置於左側導航欄的**最左下方**（位於 Zone 4、Zone 5、Zone 6、Zone 7 之下）。
- **設計定位**：作為使用者個人化專案資料夾範圍、捷徑清單維護及 `T00_Ref` 自訂字典/參數管理的專屬入口。

---

## 2. 核心元件與聯動規範

### 2.1 元件展示
- **手風琴／區塊標題**：`⚙️ My Setting`（常駐於左側邊欄最底層）。
- **內部子項目架構**：展開後提供三個精確的功能入口：
  1. **`📁 Folder Management`**
  2. **`⭐ My Shortcut`**
  3. **`🖥️ Workspace & Display Preferences`**
  *(註：明確不納入 Notification Preferences)*

---

### 2.2 子項目互動與區域 11 (Zone 11) 渲染行為

#### 1. `📁 Folder Management`（專案資料夾管理）
點擊後，中央主工作區（**Zone 11**）渲染專案資料夾治理工作台，專注處理以下兩大核心功能：
- **功能 1（自訂 Folder 擴展至 Zone 4 Option）**：
  - 若使用者有建立自訂資料夾（Custom Folders），在此介面中可勾選／設定哪些自訂資料夾中的 Project 亦可同步作為 **Zone 4（左側專案下拉選單）** 的可選 Option（預設 Zone 4 僅包含 Working、Prepare 與未分類專案）。
- **功能 2（專案歸屬調整與搬移）**：
  - 支援將特定資料夾內的專案移除（Remove from Folder）。
  - 支援將專案複製（Copy）或轉移（Move/Transfer）至其他資料夾（含 Working、Prepare、Archive 及各自訂資料夾）。

#### 2. `⭐ My Shortcut`（捷徑與釘選清單）
- **左側欄陣列呈現**：
  - 在 `My Setting` 底下列出使用者已釘選的捷徑清單，點擊任一捷徑可快速導航回該實體或介面（例如未來系統各介面提供「Add to My Shortcut」按鈕所加入的頁面）。
- **`Shortcut Management` 入口**：
  - 在捷徑清單下方提供 **`Shortcut Management`** 按鈕。
  - **點擊行為**：點擊後，中央主工作區（**Zone 11**）渲染捷徑管理介面，集中處理：
    1. 捷徑項目的**上下排列順序（Ordering / Sorting）**。
    2. 手動**新增捷徑（Create / Add Shortcut）**。
    3. **移除捷徑（Remove / Delete Shortcut）**。

#### 3. `🖥️ Workspace & Display Preferences`（T00_Ref 自訂義功能與字典治理）
- **點擊行為**：點擊後，中央主工作區（**Zone 11**）以**表格清單（List / Table View）**形式渲染使用者於 `T00_Ref` 中儲存的全部自訂義功能、字典與參數設定。
- **治理操作**：
  - 支援針對各筆 `T00_Ref` 記錄進行**就地修訂（Edit / Update）**。
  - 支援進行**永久刪除（Permanent Delete）**，徹底清除過期或廢棄的個人自訂記錄。

---

## 3. 資料儲存與審計隔離規範 (Auditing Boundary)
- **T00_Ref 專屬儲存**：所有在 `Folder Management`、`My Shortcut` 以及 `Workspace & Display Preferences` 中產生的自訂與更新，均純粹存入使用者個人的 **`T00_Ref`** 資料表。
- **嚴格審計隔離**：上述所有個人偏好、資料夾映射與字典清理操作，**一律不寫入 `ProjectRemarkLedger`**，徹底杜絕個人偏好雜訊污染專案審計台帳。
