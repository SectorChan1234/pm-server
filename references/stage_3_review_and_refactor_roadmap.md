# Stage 3 複盤回顧、Stages 1–3 錯誤防呆總表、跨階段跟進事項與過渡相容代碼清理藍圖
**文件版本**：`1.0.0 (Stage 3 Stabilized & System Folder Refactored)`[cite: 10]  
**適用範圍**：ProjectBook Enterprise Workspace (Stages 1–8)[cite: 10]  
**參照規範**：`references/stage_1_review_and_refactor_roadmap.md`、`references/stage_2_review_and_refactor_roadmap.md`、`references/spec_t00_ref_architecture.md`、`references/master_implementation_plan.md`[cite: 10]

---

## 目錄
1. [Stage 3 實作達成與核心架構升級總結](#一-stage-3-實作達成與核心架構升級總結)
2. [Stages 1–3 歷史錯誤全盤複盤與防呆鐵律（嚴禁於 Stages 4–8 重蹈覆轍）](#二-stages-13-歷史錯誤全盤複盤與防呆鐵律嚴禁於-stages-48-重蹈覆轍)
3. [Stages 4–8 必須跟進與銜接之關鍵事項 (Cross-Stage Follow-Up Items)](#三-stages-48-必須跟進與銜接之關鍵事項-cross-stage-follow-up-items)
4. [Stages 1–8 過渡期相容程式碼移除清單與清理時機 (Transitional Code Deprecation Roadmap)](#四-stages-18-過渡期相容程式碼移除清單與清理時機-transitional-code-deprecation-roadmap)

---

## 一、 Stage 3 實作達成與核心架構升級總結

在 Stage 3（Zone 8 `⚙️ My Setting` 個人偏好中樞與 `T00_Ref` 雙軌治理架構）中，已完成以下核心基建並通過實機驗證[cite: 10]：
1. **後端 `SettingRefHandler.java` 原生架構對齊與加固**：
   - 徹底移除外部套件依賴，100% 對齊專案原生 `common.DB` 與 `common.Security.authenticate(HttpExchange)`（強型別 `UserSession`），並全面相容 Java 8 (JDK 1.8) 編譯環境[cite: 10]。
2. **系統資料夾 (`SYSTEM_FOLDER`) 屬性化識別與全域單一性**：
   - 廢除舊版按名稱硬編碼與自動為個人插入重複系統資料夾的邏輯；改由 `Ref_CategoryB` 內含 `"FolderType":"SYSTEM_FOLDER"`（或 `FK_T00_PK_T05 IS NULL`）判定為系統資料夾（標準清單：`Draft`、`Working`、`Archive`、`Trash`，原 `Prepare` 正式更名為 `Draft`）[cite: 10]。
   - 系統資料夾於 UI 與後端雙重鎖定（禁止使用者改名或刪除），且無論系統或自訂資料夾，於左側 `Current Project options` (Zone 4) 的顯示與否一律 100% 遵循 `Ref_Text` 設定（相容 `"VISIBLE"` 與 `{"zone4_visible":true/false}`）[cite: 10]。
3. **資料夾生命週期參照完整性 (Cascade Delete & Cascade Rename)**：
   - 刪除自訂資料夾時，於同一 Transaction 連帶物理刪除該資料夾下的專案指派記錄（`ASSIGNED_FOLDER`），徹底杜絕重建同名資料夾時幽靈資料復活[cite: 10]。
   - 自訂資料夾改名時，前置攔截系統資料夾名稱與既有資料夾重名，並於同一 Transaction 連帶更新所有指派記錄[cite: 10]。
4. **捷徑管理 (`Manage Shortcuts`) 原生拖曳與外網擴充**：
   - 支援 HTML5 Drag-and-Drop 拖曳排序並即時同步頂部選單；自動識別 `http://`、`https://` 外網連結並以新分頁安全開啟（`noopener,noreferrer`），前端強制限制 200 字元防溢位[cite: 10]。
5. **工作區偏好 (`Workspace Preferences`) 三表極簡化與 Dirty Flag 佈署**：
   - 標題精簡為 `Table A`、`Table B`、`Table C`；當 `Table B`（僅限具備專案 `FULL` 權限者可見）或 `Table C` 無記錄時，整塊區域自動隱藏[cite: 10]。
   - `Table A` 的 Category 轉譯統一以 `-` 連接（如 `Project Role-RoleType`、`Phase-Status`），並在儲存/刪除成功時立起全域髒標記 `window.isDictionaryDirty = true`[cite: 10]。

---

## 二、 Stages 1–3 歷史錯誤全盤複盤與防呆鐵律（嚴禁於 Stages 4–8 重蹈覆轍）

為確保 Stage 4 至 Stage 8 開發過程零編譯失敗、零 400/500 例外，以下彙整 Stages 1–3 發生過的所有錯誤類型與強制防呆基準[cite: 10]：

### A. 後端 Java 編譯與執行期錯誤防呆 (Backend Java & JDBC Guardrails)

| 編號 | 曾經發生的錯誤現象 | 根本原因分析 | Stages 4–8 強制防呆鐵律 |
| :--- | :--- | :--- | :--- |
| **E-01** | **外部套件幻覺導致編譯失敗**<br>`package database does not exist`<br>`package utils does not exist`[cite: 10] | 未核對專案既有 `src/common/` 結構，憑空引入 `DatabaseManager` 與 `JwtUtil`[cite: 10]。 | 後端僅允許使用專案原生基礎類別：`common.DB`、`common.Security`、`common.Security.UserSession`、`common.JsonUtil`、`common.ProjectRemarkLedger`[cite: 10]。 |
| **E-02** | **Java 9+ API 導致 JDK 1.8 編譯失敗**<br>`cannot find symbol: method readAllBytes()`[cite: 10] | 專案 `1.build.bat` 運行於 Java 8，不支援 Java 9 才引入的 `InputStream.readAllBytes()`[cite: 10]。 | **100% 遵守 Java 8 語法邊界**：嚴禁使用 `is.readAllBytes()`、`List.of()`、`Map.of()`、`var`；讀取 RequestBody 一律使用 `ByteArrayOutputStream` 緩衝迴圈[cite: 10]。 |
| **E-03** | **鑑權方法簽章與回傳型別錯誤**<br>`UserSession cannot be converted to Map`[cite: 10] | 誤以為 `Security.authenticate(exchange)` 回傳 `Map`，或誤呼叫不存在的 `validateToken`[cite: 10]。 | 鑑權一律寫作：<br>`UserSession session = Security.authenticate(exchange);`<br>並直接讀取 `session.pkT05` (`long`)、`session.stRight` (`String`)[cite: 10]。 |
| **E-04** | **變更公共核心方法簽章引發連鎖編譯錯誤**[cite: 10] | Stage 1 修改 `Security` 方法時直接改動既有參數型別，導致 7 個既有 Handler 編譯中斷[cite: 10]。 | 修改 `common/*` 內任何既有方法時，**必須使用 Method Overloading（方法多載）保留舊簽章**，絕不破壞現有 Handler 呼叫點[cite: 10]。 |
| **E-05** | **JSON 數值欄位解析失靈觸發 HTTP 400**<br>`POST /api/setting/folder/assign 400`[cite: 10] | 前端傳入數字 `{"pjId": 123}`，後端簡易 `indexOf("\"pjId\":\"")` 強制要求雙引號，導致提取為空[cite: 10]。 | 後端解析 JSON 必須統一使用正則雙態解析器 `extractJsonField(json, key)`，同時相容 `"key":"123"`（字串）與 `"key":123`（數字/布林）[cite: 10]。 |
| **E-06** | **SQL 佔位符與參數索引錯位觸發 HTTP 500**<br>`Parameter index out of range`[cite: 10] | `INSERT ... VALUES (?, ?, 'Enable', 999, ?, ?)` 只有 4 個 `?`，卻綁定了第 5 個參數 `ps.setLong(5, userId)`[cite: 10]。 | 撰寫 `PreparedStatement` 時，必須強制點算 SQL 字串中的 `?` 數量，確保與 `ps.setXXX(i, ...)` 的最大索引 `i` 100% 吻合[cite: 10]。 |
| **E-07** | **H2 大小寫敏感與未加雙引號拋出 42102**<br>`Table "T05_STAFF" not found`[cite: 10] | H2 預設將未加雙引號之識別字轉為全大寫，與建表 DDL 的雙引號駝峰名稱失配[cite: 10]。 | **所有 SQL 的表名與欄位名必須 100% 使用轉義雙引號包裹**（如 `\"T00_Ref\"`、`\"T01_Projects\"`、`\"FK_T05_PK_T01_CUSTOM\"`）[cite: 10]。 |
| **E-08** | **硬編碼磁碟路徑導致跨環境失效**[cite: 10] | 寫死 `C:/pm-server/...`，當工作站遷移至 `D:` 或 `O:` 碟時找不到檔案或建立空白 DB[cite: 10]。 | 檔案與資料庫路徑一律使用 `System.getProperty("user.dir")` 動態解析[cite: 10]。 |

### B. 資料邏輯、權限與前端互動防呆 (Data Integrity & Frontend UI Guardrails)

| 編號 | 曾經發生的錯誤現象 | 根本原因分析 | Stages 4–8 強制防呆鐵律 |
| :--- | :--- | :--- | :--- |
| **E-09** | **系統預設資料被重複插入個人帳戶**[cite: 10] | `ensureSystemFoldersExist` 為每個 `userId` 插入一套系統資料夾，與 `FK IS NULL` 的全域記錄重疊[cite: 10]。 | 全系統共用預設記錄統一存放於 `FK_T00_PK_T05 IS NULL`；查詢時使用 `(FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL)`，嚴禁複製到個人名下[cite: 10]。 |
| **E-10** | **刪除後重建同名實體導致「幽靈資料復活」**[cite: 10] | 刪除資料夾時僅刪除定義列，未同步刪除名下的 `ASSIGNED_FOLDER` 專案映射列[cite: 10]。 | 任何主從關聯資料的 Delete 或 Rename，必須在單一 DB Transaction 中執行 **Cascade Delete / Cascade Update**[cite: 10]。 |
| **E-11** | **前端過濾條件短路與排他性邏輯漏洞**[cite: 10] | `portal.js` 寫了 `f.isSystem || f.zone4Visible`，導致系統資料夾無法依設定隱藏；且將隱藏資料夾的專案誤推入未分類[cite: 10]。 | 1. 系統與自訂資料夾一律嚴格遵循 `Ref_Text` 可見性設定[cite: 10]。<br>2. 只要專案存在於任何資料夾映射中，即屬「已歸類」，絕不可落入 `Uncategorized Projects`[cite: 10]。 |
| **E-12** | **UI 畫面暴露內部架構代號**[cite: 10] | 卡片或標題出現 `Zone 8.1`、`Zone 4`、`EAV Mapping` 等開發術語[cite: 10]。 | 瀏覽器 UI 嚴禁出現內部 Zone 編號或資料表術語（如統一使用 `Show in Current Project options`、`Table A/B/C`）[cite: 10]。 |
| **E-13** | **程式碼區塊夾帶引用標籤導致語法崩潰**[cite: 10] | 輸出的 JS/CSS/Java 內混入 Markdown 引用標籤，引發 `SyntaxError: Unexpected token`[cite: 10]。 | 輸出任何程式碼檔案時，保持 100% 純淨語法，且嚴格遵守**「單次回覆僅交付一個檔案」**原則[cite: 10]。 |

---

## 三、 Stages 4–8 必須跟進與銜接之關鍵事項 (Cross-Stage Follow-Up Items)

在接下來推進 Stage 4 至 Stage 8 時，各階段必須主動落實以下銜接任務[cite: 10]：

### 1. 【全局跟進】接通 `window.isDictionaryDirty` 字典快取即時失效機制[cite: 10]
* **現況（Stage 3 已就緒）**：當使用者於 Zone 8 `Workspace Preferences (Table A)` 修改、啟用/停用或刪除任何字典項（如 `Phase-Status`、`Project-Status`、`Event-Type`、`Project Role-RoleType`）時，`portal-zone8-setting.js` 已自動立起全域旗標：
  ```javascript
  window.isDictionaryDirty = true;
  ```
* **Stages 4–7 必須實作之「看 Flag 與落 Flag」邏輯**：
  - **Stage 4 / Stage 5（Project、Member、Phase 模組）**：在 `portal-function-project*.js`、`portal-function-project-Member*.js`、`portal-function-phase*.js` 進入視圖（`mount`）或打開編輯 Modal 時，檢查 `if (window.isDictionaryDirty || !localRefCache)`，若為 `true` 則強制重新向後端拉取最新字典選項並渲染下拉選單，完成後將對應快取版本同步（或重置 `window.isDictionaryDirty = false`），徹底消除手動按 F5 Refresh 的問題[cite: 10]。
  - **Stage 5 / Stage 6 / Stage 7（Event 與 Mission 模組）**：`portal-function-event*.js` 中的事件字典快取（`invalidateEventRefsCache`）與任務狀態選單，同樣必須掛鉤檢查 `window.isDictionaryDirty`[cite: 10]。

### 2. 【Stage 4 專項跟進】頂部 Zone 2 `📁 My Project` 與最新 System Folder 準則對齊[cite: 10]
* **系統資料夾名稱與識別同步**：
  - 原規格書中的 `Prepare` 已正式更名為 **`Draft`**（系統預設資料夾為 `Draft`、`Working`、`Archive`、`Trash`）[cite: 10]。
  - 在開發 `public/js/portal-zone2-myproject.js` 時，**嚴禁硬編碼舊名稱 `Prepare`**，必須直接讀取 `/api/setting/folder/list` 回傳的資料夾清單，並以 `FolderType === "SYSTEM_FOLDER"`（或 `f.isSystem === true`）識別系統資料夾[cite: 10]。
* **API 與連帶完整性複用**：
  - Zone 2 `📁 My Project` 中的「點擊或拖曳至 `+ Custom folder` 新增資料夾」與「拖曳專案歸類」，必須直接呼叫 Stage 3 已完備的 `/api/setting/folder/save` 與 `/api/setting/folder/assign` 端點[cite: 10]。
  - 任何資料夾或指派異動成功後，必須呼叫 `window.syncZone4WithFolderSettings()`，確保左側 `Current Project options` 即時同步[cite: 10]。

### 3. 【Stage 5 專項跟進】Zone 5 & Zone 6 校準、Event 就地新增 Mission 與單一 Event 深度工作台[cite: 10]
* **修復遺留欄位大小寫**：檢查 `MemberRelatedHandler.java` 等既有 Handler，確保所有 `FK_T05_PK_T01_CUSTOM` 與駝峰欄位 100% 使用雙引號包裹[cite: 10]。
* **Mission 建立入口下沉**：於 `Event Detail` 及 `My Handle Event` 每筆 Event 操作區植入 `+ Mission` 按鈕，自動鎖定當前 `PK_T01` 與 `PK_T03`[cite: 10]。
* **拆分控制行數**：新增 `public/js/portal-function-event-DeepView.js` 處理 `#pj=PK_T01&event=PK_T03`，確保 `portal-function-event.js` 不突破 1,500 行預警線[cite: 10]。

### 4. 【Stage 6 專項跟進】Zone 7 與 Zone 2 `✅ My Mission` 雙模引擎及資料夾閘門[cite: 10]
* **專案鎖定閘門 (Project Selection Gatekeeper)**：Zone 2 `My Mission` 展開供勾選的專案分類清單，必須同步採用 Stage 3 的資料夾結構（`Draft`、`Working`、自訂資料夾等），並嚴格執行 **Max 5 Projects** 勾選上限[cite: 10]。
* **多層動態 Tab 排序持久化**：使用者在雙模引擎調整的 Dynamic Tabs 維度順序，透過 `SettingRefHandler`（`T00_Ref`）進行個人化存取，且嚴格遵守不寫入 `ProjectRemarkLedger` 的審計隔離鐵律[cite: 10]。

### 5. 【Stage 8 專項跟進】Zone 9 / Zone 10 通知中心與捷徑路由統一[cite: 10]
* 確認所有業務視圖均可透過頂部/面板快捷按鈕加入 `My Shortcut`，且全面統一使用 `/api/setting/shortcut/*` 端點[cite: 10]。

---

## 四、 Stages 1–8 過渡期相容程式碼移除清單與清理時機 (Transitional Code Deprecation Roadmap)

為保障漸進式重構期間系統隨時可編譯、舊模組不斷線，Stages 1–3 設置了多處「雙軌過渡相容代碼」[cite: 10]。以下明確定義每一項相容代碼的**清理時機**與**移除步驟**[cite: 10]：

### 時機 A：隨 Stages 4–7 業務模組重構「逐個拔除」（In-Stage Incremental Removal）[cite: 10]

| 編號 | 過渡期相容項目 | 所在檔案位置 | 觸發移除之確切時機與清理動作 |
| :--- | :--- | :--- | :--- |
| **D-01** | **`PortalRouter.registerLegacyView` 舊版視圖適配器與 `#zone11LegacyCard`**[cite: 10] | `public/js/portal-router.js`<br>`public/portal.html`[cite: 10] | **時機**：當 Stage 5（Project/Phase/Member/Event）與 Stage 6（Mission）將舊有依賴 `#viewHeading`、`#viewRole`、`#viewContent` 的 JS 全部改寫為 `PortalRouter.registerMainView(key, { mount, unmount })` 時[cite: 10]。<br>**動作**：刪除 `registerLegacyView` 函式與 `#zone11LegacyCard` 動態注入骨架[cite: 10]。 |
| **D-02** | **事件模組全域變數跨層穿透 (`selectedPhaseFilterIds`)**[cite: 10] | `public/js/portal-router.js`<br>`public/js/portal-function-event.js`[cite: 10] | **時機**：Stage 5 重構 Event 模組時[cite: 10]。<br>**動作**：由 Event 視圖的 `mount(container, params)` 直接讀取 `params.ph` 作為內部狀態，移除 `portal-router.js` 對全域 `selectedPhaseFilterIds` 的直接賦值[cite: 10]。 |
| **D-03** | **舊版獨立捷徑腳本與後端相容路由 (`/api/portal/shortcut`)**[cite: 10] | `public/js/portal-function-shortcut.js`<br>`src/AppServer.java`[cite: 10] | **時機**：Stage 3 已由 `portal-zone8-setting.js` 與 `/api/setting/shortcut/*` 全面接管；待確認全系統 HTML 無引用舊檔後即可移除[cite: 10]。<br>**動作**：移除 `AppServer.java` 中 `/api/portal/shortcut` 的舊 Context 映射（如有殘留），並淘汰舊版 `portal-function-shortcut.js` 靜態檔案[cite: 10]。 |
| **D-04** | **`Ref_Text` 可見性格式雙軌解析 (`VISIBLE` vs `{"zone4_visible":true}`)**[cite: 10] | `src/handlers/SettingRefHandler.java`[cite: 10] | **時機**：當資料庫 `T00_Ref` 內所有 `FOLDER` 記錄的 `Ref_Text` 格式統一標準化後（或維持輕量雙格式容錯作為長期防禦）[cite: 10]。 |

---

### 時機 B：完成所有 Stages 1–8 後之「最終發佈總清理」（Post-Stage 8 Release Cleanup）[cite: 10]

當 Stage 8 驗收完畢、全系統所有視圖與後端 Handler 均已遷移至新架構後，執行一次專項 **Release Cleanup**[cite: 10]：

- [ ] **1. 廢除前端全域舊版導航門面函式 (`public/js/portal.js`)**[cite: 10]
  - 移除 `window.registerView`、`window.switchView`、`window.handleMenuAction`、`window.PB_Views`、`window.resetToHome`[cite: 10]。
  - 全系統 100% 統一調用 `PortalRouter.navigate(...)` 與 `PortalRouter.switchView(...)`[cite: 10]。
- [ ] **2. 廢除無鍵值舊格式 URL Hash 容錯 (`public/js/portal-router.js`)**[cite: 10]
  - 移除 `parseHashString` 中針對 `#project-detail` 等不含 `=` 舊式 Hash 的相容分支，強制全系統採用標準 QueryString Hash（如 `#pj=1&view=project-detail`）[cite: 10]。
- [ ] **3. 收斂前端 Session 儲存金鑰與 User 雙向屬性鏡像 (`login.js`, `portal.js`, `admin/*.js`)**[cite: 10]
  - 移除 `localStorage` / `sessionStorage` 中的舊版次級鏡像：`token`、`currentUser`、`adminToken`、`admin_user_id`、`admin_user_name`、`admin_user_email`、`admin_user_right`，全系統唯一保留 **`pb_token`** 與 **`pb_user`**[cite: 10]。
  - 移除前端 `user` 物件內的底線屬性鏡像（`user.pk_t05`、`user.st_right`、`user.fk_t05_pk_t01_custom`），統一收斂為駝峰命名（`user.pkT05`、`user.stRight`、`user.fkT05PkT01Custom`）[cite: 10]。
- [ ] **4. 廢除後端 `Security.authenticate(String authHeader)` 舊版多載 (`src/common/Security.java`)**[cite: 10]
  - 待確認全數 Handler 皆已改用 `Security.authenticate(HttpExchange exchange)` 後，移除舊版接收 `String` 的過渡多載方法[cite: 10]。
- [ ] **5. 降級或移除視覺化除錯面板與 Diagnostic Alerts (`index.html`, `portal.js`)**[cite: 10]
  - 移除 `portal.js` 內為追蹤早期 Token 跳轉問題而配置的 `alert(diagnosticMsg)` 彈窗，改為標準靜默導向或輕量 Toast 提示[cite: 10]。
