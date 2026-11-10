# ProjectBook 重構與覆盤路線圖 (Stage 4 Review and Refactor Roadmap)

## 一、 Stages 1–4 歷史錯誤與踩坑全景覆盤 (Comprehensive Error Registry E-01 ~ E-16)

本節彙整 ProjectBook 系統自 Stage 1 至 Stage 4 重構與開發過程中遭遇之所有典型架構錯誤、平台環境陷阱、安全漏洞與瀏覽器相容性缺陷，建立全域防呆標準，嚴禁在 Stage 5 至 Stage 8 再次發生。

### Stage 1：登入、身分鑑權與安全基座 (Authentication & Core Security)
* **[E-01] 密碼未加鹽雜湊與無感升級相容漏洞 (Plain SHA-256 vs Salted SHA-256)**
  * **現象與陷阱**：歷史版本採用純 SHA-256 雜湊儲存，容易受到彩虹表（Rainbow Table）攻擊；重構過程中曾一度保留無感相容升級邏輯，導致格式不一致。
  * **防呆規範**：全系統 100% 強制使用 16-byte (128-bit) 隨機鹽值之 Salted SHA-256，密碼格式嚴格鎖定為 `saltHex(32字元):hashHex(64字元)`。透過 `MessageDigest.isEqual` 執行常數時間比對（Constant-Time Comparison）防禦計時攻擊（Timing Attack）。
* **[E-02] 內部同仁與外判人員身分重疊及全域排他律缺失 (Internal vs Contractor Mutual Exclusivity)**
  * **現象與陷阱**：早期資料庫未阻斷同一 Email 同時註冊為內部同仁（`CUSTOM=0`）與特定專案外判人員（`CUSTOM>0`），造成登入時身分狀態機歧異。
  * **防呆規範**：嚴格實作「全域身分絕對排他律」——內部同仁 Email 在全系統必須全域唯一；同一 Email 若已為內部人員，絕對禁止新增為外判人員；同一專案之外判人員亦嚴禁 Email 重複。
* **[E-03] 原生表單提交與網址列敏感憑證洩漏 (?password=...)**
  * **現象與陷阱**：`<form>` 表單若未徹底阻斷原生提交，按 Enter 或點擊按鈕時瀏覽器會發起原生 GET 請求，將密碼作為 Query String 拼入網址列與歷史記錄中。
  * **防呆規範**：所有認證表單強制設定 `onsubmit="return false;"`，移除敏感輸入項之 `name` 屬性，改用純 JavaScript 監聽 Enter 與 Click 事件發送非同步 POST 請求。
* **[E-04] H2 資料庫大小寫敏感度與轉義引號缺失 (Table "T05_STAFF" not found [42102-196])**
  * **現象與陷阱**：H2 Database 1.4.196 不支援 `CASE_INSENSITIVE_IDENTIFIERS`，若 SQL 未加引號，H2 預設將識別字強制轉為全大寫，導致與 CamelCase 定義之 DDL 無法匹配而崩潰。
  * **防呆規範**：後端所有 Java 程式碼中的 SQL 語句，100% 強制使用轉義雙引號包裹表名與欄位名（如 `\"T05_Staff\"`, `\"ST_Email\"`, `\"T01_Projects\"`），嚴禁撰寫裸名。

---

### Stage 2：通用視圖路由器與三插槽架構 (Universal View Router & Layout Infrastructure)
* **[E-05] 視圖切換全畫布重繪閃爍 (Flicker & Lack of View Diffing)**
  * **現象與陷阱**：點擊通知或右側討論面板時，若全頁重刷或重繪主畫布，會導致使用者正在編輯或滾動的 Zone 11 內容瞬間重置。
  * **防呆規範**：實作 `PortalRouter` 簽章比對機制（`computeMainSignature`）。當路由切換僅涉及右側面板（Zone 9 / Zone 10）時，Zone 11 主工作畫布執行 Diffing 判定，絕對禁止重複觸發 `mount()` 與 DOM 重建。
* **[E-06] 路由切換競態條件與非同步覆蓋 (Race Condition & routeSequence Guard)**
  * **現象與陷阱**：使用者快速連續切換不同視圖或專案時，若先發出的非同步 API 較晚返回，會覆蓋當前正確的視圖內容。
  * **防呆規範**：在 `PortalRouter` 內部實作全域遞增的 `routeSequence`。任何非同步視圖載入完成時，必須檢驗 `window.PortalRouter.isRouteCurrent(routeSeq)`，若序號不合立即丟棄渲染。
* **[E-07] 側邊欄樣式污染與重繪佈局抖動 (Layout Shift & CSS Scope)**
  * **現象與陷阱**：收合側邊欄或展開側面板時，若使用粗暴的元素 display 切換，會造成主畫布寬度劇烈跳動。
  * **防呆規範**：所有面板展開與收合採用外層 `.workspace` 容器 class 切換配合 CSS Transitions，並統一利用 `box-sizing: border-box` 與固定彈性寬度保證平滑過渡。
* **[E-08] Zone 10 放大時搬移 DOM 節點造成狀態遺失 (DOM Node Moving vs CSS Ratio Shift)**
  * **現象與陷阱**：歷史架構為了實現「放大至主畫面」，將討論區 DOM 節點從側欄拔除並插入主畫布，導致輸入框焦點、未送出草稿及捲動位置完全遺失。
  * **防呆規範**：實作純 CSS 彈性比例切換（`.workspace.side-expanded-ratio`）。Zone 10 放大時 DOM 節點完全不動，僅透過 CSS 調整寬度比例（Zone 11 收縮至 25%，Zone 10 擴展至 75%），保留 100% 原始狀態。

---

### Stage 3：個人設定中樞與 T00_Ref 治理 (Zone 8 Settings & T00_Ref Architecture)
* **[E-09] 系統資料夾硬編碼與舊名殘留 (Prepare vs Draft, Dynamic FolderType)**
  * **現象與陷阱**：程式碼硬編碼舊名稱 `Prepare`，且使用固定字串比對資料夾，導致資料夾更名為 `Draft` 後邏輯斷裂。
  * **防呆規範**：全面遵循 `references/spec_t00_ref_architecture.md` v1.2.0，廢棄靜態硬編碼字串集合，一律依據 `Ref_CategoryB` 內含 `"FolderType":"SYSTEM_FOLDER"` 或 `FK_T00_PK_T05 IS NULL` 動態識別系統資料夾（Draft, Working, Archive, Trash）。
* **[E-10] 字典資料表 (T00_Ref) 欄位溢位與長度超標 (255 Characters Boundary)**
  * **現象與陷阱**：H2 資料庫中 `T00_Ref` 各欄位（`Ref_CategoryA` ~ `Ref_CategoryC`, `Ref_Text`）容量上限為 VARCHAR(255)，若 JSON 標籤或長路徑超標會觸發 SQL 資料截斷崩潰。
  * **防呆規範**：在後端寫入前實施 `validateRefFieldLength()` 防呆，前端輸入框亦嚴格限制 `maxlength`。
* **[E-11] 字典資料變更後前台快取未失效 (Lack of Cache Invalidation)**
  * **現象與陷阱**：在設定中樞新增自訂狀態或類型後，返回業務模組下拉選單依然是舊資料，必須使用者手動按 F5 刷新。
  * **防呆規範**：建立全域髒旗標機制 `window.isDictionaryDirty`。設定中樞異動時立起旗標，業務模組載入字典時優先檢查，若為 dirty 則強制重新拉取最新字典並復位旗標。
* **[E-12] 左側 Zone 4 專案選項與資料夾可見性脫鉤 (Zone 4 Visibility Desync)**
  * **現象與陷阱**：在 Folder Management 勾選或取消「Show in Current Project options」後，左側下拉選單未即時更新或未遵循 `Ref_Text` 可見性設定。
  * **防呆規範**：無論系統或自訂資料夾，左側選單一律嚴格遵循 `zone4Visible === true`（即 `Ref_Text` 為 `VISIBLE`）進行呈現，異動後連動觸發 `window.syncZone4WithFolderSettings()`。
* **[E-13] 跨專案資料夾與審計台帳污染 (Folder Assignment Ledger Pollution)**
  * **現象與陷阱**：個人化資料夾歸類（Folder Assignment）屬於使用者個人工作區偏好，若誤寫入專案黑盒子台帳（`T01_Projects.PJ_Remark`），會造成所有專案成員收到無效審計雜訊。
  * **防呆規範**：個人設定（資料夾、捷徑、偏好）100% 嚴格隔離於 `T00_Ref`，絕對禁止呼叫 `ProjectRemarkLedger.append()`。

---

### Stage 4：擬真 Windows 資料夾專案總覽 (Zone 2 My Project Explorer)
* **[E-14] 瀏覽器憑證自動填入與啟發式欄位誤判 (Chromium Autofill Heuristics in Search/URL inputs)**
  * **現象與陷阱**：在 Chromium 核心（Chrome / Edge）下，首個或孤立的 `<input type="text">` 或 `type="search"` 常被密碼管理引擎依啟發式加權誤判為「使用者帳號 / Email」，進而暴力將登入帳號（如 `sector_ck_chan@swd.gov.hk`）自動灌入搜尋框，導致專案清單被無故過濾為 0 筆。
  * **踩坑過程**：
    1. 僅加 `autocomplete="off"` 會被 Chromium 刻意忽略。
    2. 使用 `readonly` 延遲解鎖時，一旦移除 `readonly`，Chromium 在聚焦時會再次彈出帳號浮動建議。
    3. 自創非標準 Token（如 `autocomplete="new-user-url"`）會在使用者點擊欄位時被瀏覽器或密碼外掛（1Password / Bitwarden）強制覆寫竄改回 `autocomplete="off"`。
  * **防呆規範**：
    1. **標準語意化打標**：對於網址/跳轉輸入框，採用 W3C 規範之官方合法 Token `autocomplete="url"` 配合 `type="url"` 與 `data-form-type="other"`。
    2. **DOM 節點隔離**：若需徹底免疫任何密碼外掛掃描，改用非 input 容器 `contenteditable="plaintext-only"` 的自訂輸入容器，從底層避開密碼管理器掃描。
    3. **瀏覽器核心差異**：Firefox（Gecko 內核）完全遵循嚴格規範，不包含非預期填入；所有調整須以標準 W3C 規範為準，避免使用無效的黑魔法屬性。
* **[E-15] 資料夾名稱長度與特殊字元未做邊界防禦 (Folder Name Length & Collision Defense)**
  * **現象與陷阱**：建立自訂資料夾時若未做長度與字元限制，超長字串會破壞 Windows 卡片網格版面，或因重名造成資料庫關聯覆蓋。
  * **防呆規範**：`+ Custom folder` 必須在前端與後端雙重實施嚴格防呆：
    1. 限制長度 $\le$ 100 字元。
    2. 取消或空白輸入立即安全中止。
    3. 不分大小寫比對，嚴格禁止與系統保留字（`Draft`, `Working`, `Archive`, `Trash`, `+ Custom folder`）及既有資料夾同名。
* **[E-16] HTML5 拖曳歸類模式歧異 (Move vs Copy Default Behavior)**
  * **現象與陷阱**：拖曳專案至資料夾時若模式未明確定義，容易造成標籤多重疊加或原本分類遺失。
  * **防呆規範**：確立 HTML5 拖曳預設行為為 **`MOVE`**（符合 Windows 檔案總管直覺，覆蓋原有資料夾歸類）。同時在資料夾內部瀏覽狀態（Drill-Down Mode）提供明確的 `⊖ Untag`（`REMOVE_CURRENT`）按鈕，允許使用者將專案安全移出特定資料夾。

---

## 二、 跨階段必須跟進之核心事項 (Cross-Stage Follow-up Requirements F-01 ~ F-06)

以下事項為後續 Stage 5 至 Stage 8 推進時的強制銜接清單：

* **[F-01] 全面接通 `window.isDictionaryDirty` 快取失效機制（Stage 5 首要任務）**
  * **目標模組**：`portal-function-project.js`（`getMemberRefData`）、`portal-function-project-Member.js`（`getMemberRefData`）、`portal-function-phase.js`（`loadPhaseRefs`）、`portal-function-event.js`（`loadEventInitRefs`）。
  * **執行準則**：各業務模組在讀取字典前，必須先判斷 `window.isDictionaryDirty === true`。若為 true，立即清空記憶體快取（設為 null），發送 API 重新取得最新字典後，將旗標復位為 `false`，消滅手動按 F5 的需求。
* **[F-02] 專案詳細資訊（Project Detail）與黑盒子審計台帳（ProjectRemarkLedger）治理（Stage 5）**
  * **業務邊界**：`T01_Projects.PJ_Remark` 是具備法律效力之 Append-Only 不可竄改審計台帳，前端必須以只讀黑盒子終端機樣式呈現。
  * **權限隔離**：只有具備專案 `FULL` 角色或全域 `ADMIN` 才能檢視該黑盒子區塊；一般成員（GENERAL / VIEWER / EVENT ONLY）完全不可見，防止機密審計外洩。
* **[F-03] VIEWER 角色最高否決權貫徹（Stage 5 至 Stage 8 全模組）**
  * **業務邊界**：在 Phase、Event、Mission、Member 模組中，`PR_Right === 'VIEWER'` 具備最高否決權。
  * **前後端雙防線**：前端直接隱藏或禁用所有新增、編輯、刪除、凍結、指派按鈕；後端各 Handler 必須在第一道防線校驗 `VIEWER` 並直接回應 `403 FORBIDDEN`。
* **[F-04] 階層狀態級聯繼承（Cascading State Inheritance）**
  * **業務邊界**：`Project -> Phase -> Event -> Mission` 具備狀態繼承鏈。
  * **連動機制**：當 Phase 被凍結（`PH_Frozen = TRUE`）或軟刪除時，其下所有 Event 與 Mission 必須自動進入凍結唯讀狀態，前端甘特圖給予醒目紅框標記，後端阻斷任何更新。
* **[F-05] 2,000 行檔案拆分紅線與單一職責規範**
  * **架構邊界**：任何單一 JavaScript、CSS 或 Java 檔案長度嚴禁超過 2,000 行。
  * **拆分規範**：若模組過大，必須依職責拆分為主模組、GanttChart 子模組、Modal 子模組（如已落實之 `portal-function-event.js`, `portal-function-event-GanttChart.js`, `portal-function-event-Modal.js`）。
* **[F-06] 瀏覽器自動填入通用防呆標準化**
  * **規範**：後續所有模組新增或編輯彈窗中的文字輸入框（Title, Code, Name, Search, Remark 等），一律嚴格給予正確的語義屬性（如 `type="text"` 配合特定 name、或 `type="search"` / `type="url"` 配合標準 `autocomplete`），徹底杜絕瀏覽器將使用者 Email 誤填入非帳號欄位。

---

## 三、 過渡期相容程式碼與清理時機矩陣 (Transitional Compatibility Decommissioning Matrix D-01 ~ D-06)

在系統逐步推進至最終完成階段，以下過渡相容程式碼需在指定時機安全移除：

| 代碼標記 | 檔案位置 | 說明與現狀 | 預計移除/清理時機 |
| :--- | :--- | :--- | :--- |
| **D-01** | `handlers/SettingRefHandler.java` | 殘留之 `RESERVED_SYSTEM_FOLDERS = ("PREPARE", "WORKING", "ARCHIVE")` 常數。目前已改為全動態判斷，該常數無外部調用。 | **Stage 5 開發前夕或 Stage 8 統一收尾時移除**，消除舊 Prepare 殘留。 |
| **D-02** | `public/js/portal-function-shortcut.js` | 舊版捷徑管理代碼。捷徑功能已 100% 移轉至 `portal-zone8-setting.js` 與 `/api/setting/shortcut/*`。 | **Stage 5 期間直接廢棄並自專案結構刪除**。 |
| **D-03** | `public/js/portal-router.js` | `LegacyViewAdapter` 與 `window.PB_Views` 鏡像。為了相容舊版直接操作 DOM 的視圖所設。 | **Stage 8 全模組 100% 升級為原生 `PortalRouter` 生命週期後清理**。 |
| **D-04** | `public/js/login.js` & `portal.js` | 登入後寫入之鏡像憑證金鑰（`token`, `currentUser`, `admin_user_*`）。目前主鍵已統一為 `pb_token` 與 `pb_user`。 | **Stage 8 進行全域會話清理時移除次級鏡像**。 |
| **D-05** | `public/js/portal.js` | 全域掛載之 `window.syncZone4WithFolderSettings`。目前用於讓 Zone 8 / Zone 2 跨檔案通知 Zone 4 重新拉取專案。 | **Stage 8 導入輕量級全域 EventBus 事件機制後取代**。 |
| **D-06** | `AppServer.java` & `SettingRefHandler.java` | 重複掛載之 `/api/portal/shortcut` 次級路由。目前前端已全數對齊 `/api/setting/shortcut/*`。 | **Stage 8 統一精簡 AppServer 路由端點時移除**。 |

---

## 四、 階段交付總體檢查表 (Stage 4 Completion Sign-off)

- [x] **樣式隔離**：`public/css/portal-zone2-myproject.css` 獨立交付，不污染全域 `portal.css`。
- [x] **控制器交付**：`public/js/portal-zone2-myproject.js` 實現雙狀態檔案總管（Root Overview 與 Folder Drill-Down）。
- [x] **動態識別**：嚴格遵循 `spec_t00_ref_architecture.md` v1.2.0，廢棄硬編碼 `Prepare`，動態識別 Draft/Working/Archive/Trash。
- [x] **防呆強化**：`+ Custom folder` 支援 $\le$ 100 字元長度限制與不分大小寫重名防禦。
- [x] **拖曳歸類**：HTML5 Drag-and-Drop 預設以 `MOVE` 模式歸類專案，並支援快速移出資料夾。
- [x] **殼層對接**：`portal.js` 頂部 `switchMainTab('project')` 成功對接 `#view=my-project`，`portal.html` 完成引入。
- [x] **瀏覽器行為鑑識**：查明並排除 Chromium 核心暴力 Autofill 誤填搜尋框現象，確立 W3C 標準語義防護規範。
