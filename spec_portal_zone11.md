# Specification: Portal Workspace - Zone 11 (Main Workspace Canvas) & Universal View Router Engine

## 1. 模組定位與設計哲學
本規格書定義 `portal.html` 中央主工作區 **Zone 11（Main Workspace Canvas）** 的整體容器特性、版面彈性、生命週期防禦及視圖渲染規範。
- **定位**：全域主要業務畫面（專案概覽、甘特圖、任務工作台、個人偏好等）的主宿主畫布（Primary Host Canvas）。
- **非結構化頂部哲學 (No Enforced Universal Header)**：
  - Zone 11 內部**不強加一致的通用頂部結構（如強制麵包屑列或全域固定抬頭）**。
  - 各業務視圖（如甘特圖、表格清單、設定列表）依自身業務需求自主掌控其頂部佈局，具備最高度的設計自由度。

---

## 2. 版面彈性與右側 (Zone 9 & 10) 聯動機制

### 2.1 常態 100% Fluid 佔滿
- 當 Zone 9 與 Zone 10 隱藏時，Zone 11 自動佔滿右側全部剩餘寬度（`flex: 1 1 auto`，寬度 100% Fluid）。

### 2.2 彈性壓縮 (Flex Shrink)
- 當使用者點擊 Zone 3 鈴鐺呼喚 Zone 9 與 Zone 10 展開時，Zone 11 採取**彈性壓縮**機制，平滑讓出右側空間，內部元素自適應重排，不產生全域破版或遮擋。

### 2.3 視覺擴展機制 (Expand Effect via Ratio Shift)
- 在 Zone 10 點擊「Expand to Zone 11」本質為**視覺效果（Ratio Transition）**：
  - 系統不進行 DOM 節點搬移或跨容器重新掛載，而是透過動態調整 **Zone 11 與 Zone 9/10 的寬度佔比（Ratio Shift）**（例如將右側大幅擴展至 70%~80%，Zone 11 壓縮至 20%~30%）。
  - 點擊還原則平滑恢復原比例，維持草稿與狀態無損。

---

## 3. 全域通用視圖分發與生命週期架構 (Universal Dynamic Host Slot Engine)

Zone 11（主畫布）、Zone 9（右側輔助主容器）與 Zone 10（右側次級操作容器）全部統一為**「通用隨選宿主插槽（Universal Dynamic Host Slot）」**，共享完全一致的生命週期合約與路由器治理模式。

### 3.1 標準視圖生命週期合約 (Standard View Lifecycle Contract)
凡是掛載至 Zone 11、Zone 9 或 Zone 10 的業務視圖模組，必須嚴格實現以下標準介面：

```javascript
const StandardViewInterface = {
  // 1. 掛載與渲染 (注入 routeSeq 防範非同步覆寫競爭)
  mount: async function(container, params, routeSeq) {
    // 渲染 DOM 內容
    // 初始化內部定時器、事件監聽器與非同步請求 (帶有 AbortController 及 routeSeq 檢查)
  },

  // 2. 強制銷毀與清理 (Strict Teardown)
  unmount: function(container) {
    // 強制清除所有定時器 (clearInterval / clearTimeout)
    // 移除所有掛載在 window / document 的全域事件監聽器
    // 中止所有進行中的非同步 Fetch 請求 (abortController.abort())
    // 清空 container 節點與釋放內部參照
  }
};

## 4. View Router 路由解析與多槽位分發引擎規範

### 4.1 URL Hash 結構與命名空間解耦 (Hash Schema)
URL Hash 劃分為主工作區與側邊欄兩大解耦命名空間：
1. **主視圖參數 (Zone 11 Slot)**：
   - 專案根：`#pj=PK_T01`（預設為該專案的 Project Detail）
   - 專案特定視圖：`#pj=PK_T01&view=project-phase` / `member-list` / `event-detail` / `mission-workspace`
   - 單一深度實體：`#pj=PK_T01&event=PK_T03`（事件深層工作台）或 `#pj=PK_T01&ms=PK_T04`（任務深度工作台）
   - 跨專案視圖 (Zone 2)：`#view=my-project` / `my-event` / `my-mission`
   - 個人偏好設定 (Zone 8)：`#view=setting-folder` / `setting-shortcut` / `setting-preferences`
   - 首頁：空 Hash 或無參數（導向 System Overview）
2. **側邊輔助參數 (Zone 9 & Zone 10 Slots)**：
   - 以前綴 `side` 區隔：`&side=notifications`（Zone 9 列表）、`&side=notifications&msgId=108`（Zone 10 聚焦詳情與回覆）。
   - 關閉側邊時自 Hash 移除 `side` 相關參數，Zone 11 視圖與資料完全無損保留。

### 4.2 分發管線流程 (Dispatch Pipeline)
當 `hashchange` 觸發時，全域路由器執行標準五階段流程：
1. **Hash 解析**：將 Hash 字串轉為標準鍵值物件（`URLSearchParams`）。
2. **Zone 11 差異比對 (Diffing Check)**：
   - 比對主視圖核心參數是否發生實質變更。
   - 若主參數無變化（僅 `side` 參數變動），則**保留 Zone 11，不重複執行 unmount/mount**。
   - 若主參數變更，強制對舊視圖執行 `unmount(container)`，執行 `container.innerHTML = ''` 與 `scrollTop = 0`，再調用新模組之 `mount()`。
3. **Zone 9 & 10 側邊調度**：
   - 若無 `side` 參數：對現存側邊視圖調用 `unmount()`，釋放資源後隱藏容器，將寬度 100% 歸還 Zone 11。
   - 若存在 `side` 參數：觸發 Flex 壓縮並掛載對應模組。
4. **全域被動同步 (Passive State Sync)**：
   - 若 Hash 包含 `pj=PK_T01`，自動同步 Zone 4 專案下拉選單的選取值。
   - 同步更新左側手風琴（Zone 5~8）當前作用中項目（Active Highlighting）。
5. **防併發競爭防禦 (Race Condition Protection)**：
   - 路由器內部維護 `routeSequence` 遞增序號。非同步請求回傳時比對序號，若序號過期則直接捨棄，防範舊資料覆寫新畫面。

---

## 5. 容器滾動與審計隔離規範

### 5.1 獨立滾動容器 (Independent Scroll Container)
- Zone 11 具備獨立的 `overflow-y: auto; overflow-x: hidden;`。
- 切換新視圖時，強制重置滾動位置（`container.scrollTop = 0`）。

### 5.2 審計與偏好隔離規範 (Auditing Boundary)
- 路由解析、視圖分發、掛載、銷毀、側邊欄展開與縮放比例切換，純屬客戶端暫態與個人操作，**一律不寫入 `ProjectRemarkLedger`**。
