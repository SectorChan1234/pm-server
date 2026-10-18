# Specification: Portal Workspace - Zone 9 & Zone 10 (Dynamic Host Containers)

## 1. 模組定位與設計哲學
本規格書定義 `portal.html` 的 **Zone 9（右側輔助主容器）** 與 **Zone 10（右側次級操作容器）** 的生命週期與掛載行為。
- **無常駐負擔 (Zero Permanent Footprint)**：Zone 9 與 Zone 10 平時**預設完全不顯示（Hidden / Unmounted）**，不佔用任何瀏覽器渲染空間與寬度。
- **隨選掛載 (On-Demand Mounting)**：它們作為系統的「動態插槽（Dynamic Host Slots）」，只有當其他模組（Module / Component）發起明確的呼叫時，才會依需求被動態渲染並顯示於右側。
- **釋放與收合 (Close & Release)**：當模組調用結束或使用者主動點擊關閉時，兩者即刻卸載並恢復隱藏狀態，將完整寬度歸還予中央工作區（Zone 11）。

---

## 2. 生命週期與容器管理機制

### 2.1 顯示與隱藏狀態切換
1. **預設狀態 (Default Closed)**：
   - 頁面初始化或日常檢視各專案、事件時，Zone 9 與 Zone 10 均處於關閉狀態（`display: none` 或不渲染於主視圖流程）。
2. **調用顯現 (Module Call Trigger)**：
   - 僅在外部具體事件觸發時展開，並注入對應功能介面。
3. **主動關閉 (Explicit Dismissal)**：
   - 面板頂部均具備關閉按鈕（`✕`），點擊後卸載內部內容，隱藏 Zone 9 與 Zone 10，視圖平滑收合。

---

## 3. 現階段首要調用場景：T09 通知中樞 (Notification Mode)

當頂部 **Zone 3 的通知鈴鐺 (`🔔`)** 被點擊時，系統首次動態喚醒 Zone 9 與 Zone 10：

### 3.1 Zone 9 動態渲染：訊息清單工作台
- **觸發條件**：使用者點擊 Zone 3 通知鈴鐺。
- **容器狀態**：Zone 9 動態展開並渲染。
- **資料排序與視圖**：
  - 清楚區分「未讀訊息（Unread）」與「已讀訊息（Read）」。
  - 嚴格依照訊息的 **`Last Update Time`（最後更新時間）降冪（Descending）排序**，最新動態置頂。
  - 項目展示精簡文字摘要、關聯範疇標籤（Project / Feature / Event / Mission）及發起人。
- **雙擊互動**：
  - 使用者雙擊任一訊息時，該訊息在 `T09` 標記為已讀，並觸發 **Zone 10** 展開。

### 3.2 Zone 10 動態渲染：訊息詳情與快速回覆
- **觸發條件**：在 Zone 9 雙擊特定訊息。
- **容器狀態**：Zone 10 動態展開並渲染。
- **功能內容**：
  - 展示該留言之完整內文與上下文層級標記。
  - 提供即時輸入框（Reply Input Box）與送出按鈕。
  - **審計隔離選取框**：提供 `[ ] Record to ProjectRemarkLedger` 核選方塊（**預設嚴格維持不勾選**，除非使用者主動 Opt-In 勾選）。
- **畫布擴展機制 (Expand to Zone 11)**：
  - 提供擴展按鈕，若輸入內容篇幅過大，可將輸入視窗動態轉移至中央主工作區（Zone 11）展開為全寬度輸入介面，草稿與勾選狀態完全同步。

---

## 4. 審計與偏好邊界 (Auditing Boundary)
- Zone 9 與 Zone 10 的顯示/隱藏動畫、滾動位置及已讀標記，均為客戶端暫態與個人狀態，**一律不寫入 `ProjectRemarkLedger`**。
- 只有使用者在 Zone 10（或擴展後的 Zone 11）主動勾選寫入審計台帳時，送出的回覆內容才會登錄進 `ProjectRemarkLedger`。
