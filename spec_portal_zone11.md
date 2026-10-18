# Specification: Portal Workspace - Zone 11 (Main Workspace Canvas) & Dynamic View Router Architecture

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

## 3. 全域通用視圖分發與生命週期架構 (Universal View Router & Host Engine)

為了保持系統無框架（Vanilla JS）原生架構的極致純粹性與穩定性，**Zone 11（主畫布）、Zone 9（右側輔助主容器）與 Zone 10（右側次級操作容器）全部統一為「通用隨選宿主插槽（Universal Dynamic Host Slot）」**，共享完全一致的生命週期合約與路由器治理模式。

### 3.1 標準視圖生命週期合約 (Standard View Lifecycle Contract)
凡是掛載至 Zone 11、Zone 9 或 Zone 10 的業務視圖模組，必須嚴格實現以下標準介面：

```javascript
const StandardViewInterface = {
  // 1. 掛載與渲染
  mount: async function(container, params) {
    // 渲染 DOM 內容
    // 初始化內部定時器、事件監聽器與非同步請求 (AbortController)
  },

  // 2. 強制銷毀與清理 (Strict Teardown)
  unmount: function(container) {
    // 強制清除所有定時器 (clearInterval / clearTimeout)
    // 移除所有掛載在 window / document 的全域事件監聽器
    // 中止所有進行中的非同步 Fetch 請求 (abortController.abort())
    // 清空 container 節點與釋放內部參照
  }
};
