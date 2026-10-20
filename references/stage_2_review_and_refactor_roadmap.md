# Stage 2 複盤回顧、過渡相容代碼清理清單與 Stage 3 前置防呆鐵律
**文件版本**：`1.0.0 (Stage 2 Stabilized)`  
**適用範圍**：ProjectBook Enterprise Workspace (Stages 2–8)  
**參照規範**：`references/stage_1_review_and_refactor_roadmap.md`、`references/master_implementation_plan.md`、`references/spec_portal_zone1_zone2_myproject.md`、`references/spec_portal_zone3.md`、`references/spec_portal_zone9_zone10.md`、`references/spec_portal_zone11.md`

---

## 目錄
1. [Stage 2 實作達成與測試核驗總結](#一-stage-2-實作達成與測試核驗總結)
2. [Stage 2 引入之模組過渡相容代碼清理清單 (Refactoring Checklist)](#二-stage-2-引入之模組過渡相容代碼清理清單-refactoring-checklist)
3. [綜合 Stage 1 至 Stage 2 核心教訓：Stage 3 啟動前自我提醒與防呆鐵律](#三-綜合-stage-1-至-stage-2-核心教訓stage-3-啟動前自我提醒與防呆鐵律)

---

## 一、 Stage 2 實作達成與測試核驗總結

在 Stage 2（通用視圖路由器 `PortalRouter` 與外框容器基建）中，成功建立了前後端標準框架並完成以下驗證：
1. **後端 SettingRefHandler 基座**：
   - 建立 `/api/setting/sidebar-pref`，讀寫 `"T00_Ref"` 記憶 Zone 1 側欄收合狀態。
   - 貫徹「審計隔離」鐵律，物理級不引入 `ProjectRemarkLedger`，個人介面偏好 0 台帳污染。
2. **零信任 Admin Console 入口**：
   - 徹底移除靜態 HTML 中靠 CSS 隱藏的按鈕，改由 `portal.js` 在 `user.stRight === 'ADMIN'` 時動態建立插入 `#adminActionSlot`。
3. **Zone 11 / Zone 9 / Zone 10 三槽位容器獨立管轄**：
   - 預設常態提供 Zone 11 100% Fluid 寬度與獨立滾動。
   - Zone 9 與 Zone 10 預設 `display: none`，隨選展開。
   - 實作「⤢ Expand to Zone 11」純 CSS 彈性比例切換（`.side-expanded-ratio`），不搬移 DOM 節點即可放大檢視對話詳情。
4. **無閃爍 Diffing 路由分發管線**：
   - 點擊通知鈴鐺僅變更 `side` 參數時，Zone 11 簽章 `mainSig` 比對一致，完全不觸發 `unmount/mount` 重繪與後端 API 重打。
5. **LegacyViewAdapter 100% 向下相容**：
   - 既有 Stages 4~8 的專案、階段、事件、成員、任務模組在 Stage 2 無需修改任何程式碼即可直接運行。

---

## 二、 Stage 2 引入之模組過渡相容代碼清理清單 (Refactoring Checklist)

為確保 Stages 4–8 既有業務模組能無縫運行在 Stage 2 的全新外框與路由架構上，系統中設計了若干過渡相容代碼。這些代碼在後續階段模組重構完成後，**必須安排專項清理並徹底退役**：

### 1. 前端路由器舊版視圖適配器 (`LegacyViewAdapter`)
* **存在位置**：`public/js/portal-router.js` 中的 `registerLegacyView`。
* **相容背景**：現有業務 JS（`portal-function-project*.js`、`phase*.js`、`event*.js`、`mission.js`）皆硬編碼依賴 DOM 節點 `#viewHeading`、`#viewRole`、`#viewContent`。`registerLegacyView` 在每次掛載時會動態注入 `#zone11LegacyCard` 骨架供其抓取。
* **清理時機**：當 Stages 4（Project/Member）、Stage 5（Phase）、Stage 6（Event）、Stage 7（Mission）將各視圖重構成具備獨立 `mount(container, params, routeSeq)` 與 `unmount(container)` 生命週期的原生模組後。
* **清理動作**：
  - [ ] 廢除 `PortalRouter.registerLegacyView`。
  - [ ] 移除 `portal.html` 中預留的靜態 `#zone11LegacyCard` 骨架。
  - [ ] 全模組直接呼叫 `PortalRouter.registerMainView`。

### 2. 舊版非鍵值 URL Hash 容錯相容
* **存在位置**：`public/js/portal-router.js` 中的 `parseHashString`。
* **相容背景**：為相容舊版直接使用 `#project-detail`、`#project-phase` 等無 `=` 的 Hash 格式，額外加入了 `if (!clean.includes('='))` 分支。
* **清理時機**：全系統選單、按鈕及收藏捷徑全數遷移至標準鍵值對格式（如 `#pj=1&view=project-detail`）後。
* **清理動作**：
  - [ ] 移除 `parseHashString` 內的無鍵值 Hash 容錯邏輯，強制要求標準 QueryString Hash 格式。

### 3. 事件模組篩選狀態深層跨層穿透 (Global State Penetration)
* **存在位置**：`public/js/portal-router.js` 中 `registerLegacyView` 的 `event-detail` 分支。
* **相容背景**：當網址帶有 `&ph=1,2` 進入事件清單時，Router 直接穿透修改全域變數 `selectedPhaseFilterIds`。
* **清理時機**：Stage 6（Event 模組重構）時，將篩選狀態收斂為視圖實例內部的局部參數或響應式 State。
* **清理動作**：
  - [ ] 移除 `portal-router.js` 中對 `selectedPhaseFilterIds` 的硬編碼存取。

### 4. 全域舊版門面函式與相容映射表 (Legacy Facade & Fallbacks)
* **存在位置**：`public/js/portal.js` 與 `public/js/portal-router.js`。
* **相容代碼**：
  - `window.registerView(actionKey, handlerFn)`
  - `window.switchView(viewName)`
  - `window.handleMenuAction(actionKey)`
  - `window.PB_Views` 全域映射表
  - `window.resetToHome()`
* **清理時機**：Stages 4–8 所有業務檔案全面改為直接調用 `PortalRouter.navigate(...)` 與 `PortalRouter.registerMainView(...)` 後。
* **清理動作**：
  - [ ] 移除 `window.registerView` 與 `window.switchView` 全域門面函式。
  - [ ] 移除 `window.PB_Views` 命名空間。

### 5. 後端捷徑路由過渡相容別名
* **存在位置**：`src/AppServer.java` 與 `src/handlers/SettingRefHandler.java`。
* **相容代碼**：`server.createContext("/api/portal/shortcut", settingRefHandler);` 及內部對 `/api/portal/shortcut/list` 的路徑比對。
* **相容背景**：舊版 `portal-function-shortcut.js` 呼叫了 `/api/portal/shortcut/list`，Stage 2 先行以 `SettingRefHandler` 承接以防 404。
* **清理時機**：Stage 8（Shortcut 模組重構）全面統一路徑為 `/api/setting/shortcut/*` 後。
* **清理動作**：
  - [ ] 移除 `AppServer.java` 中的 `/api/portal/shortcut` Context 綁定。
  - [ ] 移除 `SettingRefHandler.java` 中的 `/api/portal/shortcut/list` 分支判斷。

### 6. 前端全域變數鏡像與雙向欄位容錯
* **存在位置**：`public/js/portal.js`。
* **相容代碼**：
  - 全域變數 `currentProjectId` 與 `currentProjectRight`（供舊版模組直接讀取）。
  - `user.pk_t05 || user.pkT05`、`user.st_right || user.stRight` 等雙向容錯。
  - `localStorage` 中的 `token`、`currentUser`、`adminToken` 鏡像。
* **清理時機**：系統全模組進入正式發佈階段（Release Cleanup）。
* **清理動作**：
  - [ ] 業務模組全面透過 `PortalRouter.getCurrentParams().pj` 獲取當前專案，停用全域變數讀取。
  - [ ] 依據 Stage 1 清理藍圖，徹底清除非標準命名與次級儲存金鑰。

---

## 三、 綜合 Stage 1 至 Stage 2 核心教訓：Stage 3 啟動前自我提醒與防呆鐵律

在正式進入 **Stage 3（專案全域設定、字典治理與審計黑盒子 Zone 8）** 前，綜合 Stage 1 與 Stage 2 的除錯實務，列出以下十項必備的架構鐵律，作為開發時的自我核對清單：

### 1. 【H2 雙引號絕對轉義鐵律】
* **教訓複盤**：Stage 1 曾因裸名拋出 `Table "T05_STAFF" not found [42102-196]`。
* **Stage 3 警戒**：Stage 3 將深度讀寫 `"T01_Projects"` 與 `"T00_Ref"`。SQL 中的表名與所有駝峰欄位名必須 **100% 加上轉義雙引號**：
  - 表名：`\"T01_Projects\"`, `\"T00_Ref\"`, `\"T05_Staff\"`, `\"T06_ProjectRoles\"`。
  - 欄位名：`\"PJ_Code\"`, `\"PJ_Name\"`, `\"PJ_Description\"`, `\"PJ_Status\"`, `\"PJ_Remark\"`, `\"PJ_ignore_delete\"`, `\"Ref_CategoryA\"`, `\"Ref_CategoryB\"`, `\"Ref_CategoryC\"`, `\"Ref_Text\"`, `\"Ref_SortValue\"`。
  - **嚴禁出現任何未帶轉義雙引號的欄位或表名**。

### 2. 【審計黑盒子不可竄改與隔離鐵律】
* **教訓複盤**：Stage 2 成功將個人介面偏好隔離至 `"T00_Ref"`，未污染專案審計台帳。
* **Stage 3 警戒**：Stage 3 將直接操作 `ProjectRemarkLedger` 與 `T01_Projects.PJ_Remark`。
  - **Append-Only 原則**：`PJ_Remark` 僅允許由 `ProjectRemarkLedger.append()` 追加寫入，**嚴禁提供任何直接 UPDATE / OVERWRITE `PJ_Remark` 的後端端點**。
  - **純文字黑盒子呈現**：前端以只讀高對比終端黑底框（Terminal Style）呈現，不提供編輯按鈕。
  - **精準分流**：僅有專案生命週期關鍵事件（專案建立、專案軟刪除、專案恢復、關鍵合約/狀態變更）才可調用 `ProjectRemarkLedger`。一般的字典查詢、個人設定檢視嚴禁調用。

### 3. 【零未捕獲例外與標準 API 契約】
* **教訓複盤**：Stage 1 後台動態 SQL 處理器曾因未捕獲 `SQLException` 噴出 HTTP 500。
* **Stage 3 警戒**：所有 Stage 3 後端 Handler（專案更新、軟刪除、字典維護）必須具備外層全域 `try-catch (SQLException)` 與 `try-catch (Exception)`。
  - 任何業務失敗一律回傳適當 HTTP 狀態碼（400/403/404）與結構化 JSON：
    `{"success": false, "status": "FAILED", "code": "...", "message": "..."}`。
  - 成功回應一律具備：
    `{"success": true, "status": "SUCCESS", ...}`。
  - **後端嚴禁拋出任何未處理的 HTTP 500**。

### 4. 【專案軟刪除代碼防衝突機制】
* **教訓複盤**：`"T01_Projects"` 的 `"PJ_Code"` 設有資料庫唯一性條件 `UNIQUE("PJ_Code")`。若專案被標記為軟刪除（`"PJ_ignore_delete" = TRUE`）後未修改代碼，日後建立同名代碼專案將觸發主鍵/唯一性衝突崩潰。
* **Stage 3 警戒**：
  - 執行軟刪除時，後端必須強制將原代碼附加時間戳後綴（如 `PJ_2026_01#D1729000000`），釋放原始代碼空間。
  - 軟刪除操作必須在同一資料庫交易（Transaction）內完成「記錄審計日誌」與「更新軟刪除標記及代碼變更」。

### 5. 【零信任權限核驗 (Zero-Trust Gatekeeper)】
* **教訓複盤**：不能僅靠前端隱藏按鈕防禦非授權存取。
* **Stage 3 警戒**：
  - 專案全域設定修改、專案軟刪除、黑盒子完整日誌檢視等操作，後端必須嚴格檢驗操作者在該專案的存取權限。
  - **僅有專案領導者（`PR_Right === 'FULL'`）或全域管理員（`ST_Right === 'ADMIN'`）允許執行專案核心設定修改**。非授權成員直接回傳 `403 FORBIDDEN`。

### 6. 【雙向參數相容解析 (CamelCase & Snake_case)】
* **教訓複盤**：Stage 1 變更密碼曾因前端傳 `old_password`、後端收 `oldPassword` 導致請求失效。
* **Stage 3 警戒**：後端接收前端 JSON 請求主體時，欄位提取必須同時相容駝峰與底線命名（如 `pj_code` / `pjCode`、`pj_name` / `pjName`、`audit_reason` / `auditReason`）。

### 7. 【資料庫連線路徑零硬編碼】
* **教訓複盤**：搬移專案到不同磁碟（C: / D: / O:）時，絕對路徑會導致連線失敗。
* **Stage 3 警戒**：所有資料庫操作一律經由 `common.DB.getConnection()` 獲取連線，依賴 `System.getProperty("user.dir")` 動態解析，嚴禁自寫絕對檔案路徑。

### 8. 【表單原生 GET 洩漏密碼與參數物理防禦】
* **教訓複盤**：Stage 1 表單按 Enter 觸發原生 GET 跳轉，導致參數出現在網址列。
* **Stage 3 警戒**：Stage 3 若有設定輸入表單或 Modal，一律宣告 `<form onsubmit="return false;" novalidate>`，且 `<input>` **0 `name` 屬性**，全數透過 `id` 讀取。

### 9. 【非同步資料載入與 Router 序號競態防禦】
* **教訓複盤**：快速切換專案或視圖時，先發出的非同步請求若較慢回傳，可能覆蓋最新視圖的內容。
* **Stage 3 警戒**：Zone 8 視圖在非同步發起請求前讀取 `const seq = PortalRouter.getRouteSequence()`，回傳後於渲染前檢驗 `if (!PortalRouter.isRouteCurrent(seq)) return;`，防止渲染過期資料。

### 10. 【代碼行數預警線嚴格控管】
* **架構規範**：單一檔案嚴格控制在 1,500 行預警線、2,000 行硬上限以內。
* **Stage 3 實踐**：Stage 3 涉及專案設定、字典維護與審計紀錄，應延續模組拆分策略（如主面板、Modal 處理與資料處理清晰分離），確保單檔結構輕量、高內聚。
