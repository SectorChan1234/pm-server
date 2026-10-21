---
name: enterprise-project-engine
description: Enterprise project scheduling and zero-trust event governance engine expert for native Java HTTP server, H2 database, and vanilla JavaScript and CSS architectures. Use when building, modifying, or reviewing multi-tier hierarchies (Project, Phase, Event, Mission, Sub-Event), role permissions (FULL, GENERAL, VIEWER, EVENT ONLY), audit logs (T99_AuditLog, ProjectRemarkLedger), cascading state inheritance (frozen or soft delete), or pixel-perfect split-rail Gantt chart engines.
---
# Enterprise Project Engine

Expert skill for the ProjectBook system architecture, specifications, zero-framework stack, and enterprise governance engine.

## 規劃審查與防幻覺流程基準 (Planning Review & Anti-Hallucination Protocol)

當使用者指示 **「請不要生成任何code, 先規劃好給我審查你打算的更新流程」** 或提出流程規劃審查要求時，必須嚴格遵守以下流程基準，嚴禁擅自展開程式碼生成或進行未經證實的推測：

1. **參考文件主動核對 (Document Verification First)**：
   - 必須明確列出本次規劃「預計參考的所有規格文件、Schema 與架構章節清單」（例如 `references/spec_portal_zone8.md`、`H2_Database_Schema_20261020.sql`）。
   - 向使用者逐項核對文件真實內容與業務邊界，不得模糊帶過。
2. **嚴禁概念漂移與權限張冠李戴 (Strict Boundary Enforcement)**：
   - 嚴格依照該特定模組的專屬規格書定義核心哲學與權限等級。
   - 嚴禁把其他模組的限制（例如 Zone 5 專案管理之 `PR_Right === 'FULL'` 限制）隨意套用到個人化或跨專案模組（例如 Zone 8 個人設定與 `T00_Ref` 治理）。
3. **零代碼與確認後推進 (Zero Code Until Approved)**：
   - 在使用者完全確認參考文件、資料結構設計與更新流程前，**絕對不輸出任何程式碼**，避免造成無謂的無效輸出。

## 檔案輸出與 Bug 修復交付鐵律 (File Delivery & Bugfix Discipline)

任何時候交付、修復或更新專案代碼（包含修復 Bug、微調樣式、新增功能）：

1. **逐檔交付（單次回覆僅生成一個檔案）**：
   - 嚴禁在單次回覆中一口氣拋出多個檔案的完整代碼，必須按執行步驟**「逐個逐個檔案獨立輸出」**。
   - 每完成一個檔案的輸出與確認後，再推進生成下一個檔案，確保變更粒度清晰、降低篇幅截斷與語法錯誤風險。
2. **嚴格禁止代碼內夾帶 Markdown 標註**：
   - 生成的 JavaScript、CSS、HTML、Java 檔案中，絕對不可殘留或混入 `` 等文字標註，杜絕導致瀏覽器解析拋出 `SyntaxError: Unexpected token`。
3. **Markdown 格式完整性與代碼塊防斷裂鐵律 (Markdown Code Block Integrity)**：
   - 在對話或文件中撰寫 Markdown 時，必須嚴格檢查並正確閉合所有程式碼區塊（如開頭有 ```` ```javascript ```` 結尾必須有完整的 ```` ``` ```` 閉合）。
   - **嚴防巢狀代碼塊衝突斷裂**：若輸出內容本身包含代碼區塊（例如展示包含 ```` ```javascript ```` 的 `.md` 檔案或交接文件時），外層嚴禁使用相同長度的三個反引號包裹；必須優先採用標準 Markdown 排版直接呈現，或外層使用 4 個反引號（```` ```` ````），徹底杜絕內層反引號提前閉合外層導致內容斷開、排版破裂。

## UI 與系統偏好設定儲存決策原則 (UI/System Preference Storage Location Protocol)

任何涉及使用者 UI 偏好、版面外觀狀態（例如左側導航欄展開/收合、雙軌甘特圖展開比例、各列表篩選記憶、折疊面板狀態等）或系統設定：

1. **嚴禁擅自將高頻 UI 狀態寫入資料庫**：
   - 頻繁變動的 UI 操作若直接存入資料庫（如 `T00_Ref`），會對資料庫造成不必要的 I/O 負擔與連線消耗。
2. **決策前必須主動請示使用者意見**：
   - 在規劃與實作任何偏好設定功能前，必須明確主動詢問使用者偏好採用何種方式保存：
     * **客戶端儲存**：`localStorage`（持久化於當前瀏覽器）、`sessionStorage`（單次會話關閉即清空）、或 `Cookie`（隨 HTTP 標頭攜帶）。
     * **伺服器端資料庫儲存**：`T00_Ref`（跨裝置同步，但需評估寫入頻率與防抖策略）。
   - 必須完全由使用者拍板指定保存位置後，方可推進實作。

## 核心資料庫架構與嚴格命名鐵律 (Database & Strict Identifier Rules)

### 絕對大小寫與雙引號轉義規範 (Mandatory Quoted Identifiers)

1. **DDL 背景與 H2 解析陷阱**：
   - 專案資料庫結構（見 `references/H2_Database_Schema_20261020.sql`）在建表時所有資料表名稱與主要欄位皆使用雙引號宣告（例如 `CREATE CACHED TABLE PUBLIC."T05_Staff"`、`"ST_Email"`、`"ST_password_hash"`、`"ST_IsActive"`、`"T01_Projects"`、`"PJ_Code"`）。
   - H2 Database（特別是 1.4.196 等既有版本）的 SQL 解析器預設會將所有未加雙引號的識別字強制轉為全大寫（例如 `T05_Staff` 自動被轉為 `T05_STAFF`）。
   - 若 Java 中的 SQL 未加上轉義雙引號，H2 無法匹配到原始以駝峰大小寫宣告的表名，必然拋出 `Table "T05_STAFF" not found [42102-196]` 嚴重例外。

2. **所有後端 SQL 強制鐵律**：
   - **所有涉及 H2 資料表與欄位的 SQL 語句，必須 100% 使用轉義雙引號 `\"...\"` 精確包裹原始 CamelCase 大小寫名稱**。
   - **資料表名稱標準**：`\"T00_Ref\"`, `\"T01_Projects\"`, `\"T02_Phase\"`, `\"T03_Events\"`, `\"T04_Missions\"`, `\"T05_Staff\"`, `\"T06_ProjectRoles\"`, `\"T07_JoinMissions\"`, `\"T08_MultiComment\"`, `\"T09_MessageRead\"`, `\"T99_AuditLog\"`。
   - **常見關鍵欄位標準**：`\"ST_Email\"`, `\"ST_Name\"`, `\"ST_password_hash\"`, `\"ST_Right\"`, `\"ST_IsActive\"`, `\"PJ_Code\"`, `\"PJ_Name\"`, `\"PH_Name\"`, `\"EV_Title\"`, `\"MS_Name\"`。
   - **嚴禁行為**：嚴禁在 Java 程式碼中撰寫裸名（如 `FROM T05_Staff`），必須一律寫作 `FROM \"T05_Staff\"`。
   - **連線參數規範**：H2 1.4.196 不支援 `CASE_INSENSITIVE_IDENTIFIERS` 等高版本連線參數，統一依賴 `IGNORECASE=TRUE` 並透過精確轉義雙引號完成無縫匹配。

### 會話儲存與認證金鑰標準 (Session & Storage Key Uniformity)

- 登入認證成功後，全系統前端（包括 `login.js` 與 `portal.js`）統一使用以下金鑰名稱進行持久化儲存：
  - Token 金鑰：`pb_token`（同步寫入 `localStorage` 與 `sessionStorage`，供 HTTP Header `Authorization: Bearer <token>` 使用）。
  - User 上下文金鑰：`pb_user`（同步寫入 `localStorage` 與 `sessionStorage`，供使用者資訊與全域權限檢核使用）。
  - 為保持向下相容性，亦可同時保留 `token` 與 `currentUser` 作為次級鏡像，但主鍵必須為 `pb_token` 與 `pb_user`。
