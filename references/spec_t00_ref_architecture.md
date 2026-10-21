# T00_Ref 資料字典與擴充設定結構規範 (Data Dictionary & EAV Setting Architecture)
**文件版本**：`1.2.0 (System Folder Governance & Ref_Text Visibility Architecture)`  
**適用範圍**：ProjectBook Enterprise Workspace (全系統通用)  
**參照 Schema**：`H2_Database_Schema_20261020.sql` 之 `"T00_Ref"`、`"T06_ProjectRoles"`

---

## 一、 核心設計哲學與實體長度定義

`"T00_Ref"` 為全系統核心之多功能元數據表，同時承載「標準資料字典」、「系統與專案層級擴充設定 (EAV: Entity-Attribute-Value 模型)」、「個人工作區配置」以及「專案分類資料夾與捷徑管理」。
依據最新資料庫定義，核心欄位規格如下：
* **`"Ref_CategoryA"`**：`VARCHAR_IGNORECASE(255)`
* **`"Ref_CategoryB"`**：`VARCHAR_IGNORECASE(255)`
* **`"Ref_CategoryC"`**：`VARCHAR_IGNORECASE(255)`
* **`"Ref_SortValue"`**：`INT`
* **`"Ref_Text"`**：`VARCHAR_IGNORECASE(255)`
* **`FK_T00_PK_T05`**：`INT`（外鍵關聯 `"T05_Staff"`，允許 `NULL`）

> **Java 後端寫入防呆鐵律**：後端 Handler 在將任何資料寫入 `Ref_CategoryA`、`Ref_CategoryB`、`Ref_CategoryC` 或 `Ref_Text` 前，**必須於 Java 程式碼內前置檢查字串長度不得超過 255 字元**，並於寫入 JSON 時進行緊湊化處理（Minified JSON，去除無意義空格換行），杜絕 SQL 欄位溢位例外。

---

## 二、 雙軌結構標準規範 (Dual-Track Architecture)

全系統存入 `"T00_Ref"` 的數據，嚴格分為以下情境：

### 情況 1：直接對應 SQL 欄位之標準字典項 (Data Dictionary)
用於系統下拉選單、狀態枚舉（如專案狀態、階段狀態、事件類型、角色權限等）。

| 欄位名稱 | 型別與約束 | 標準值定義與規範 | 說明與範例 |
| :--- | :--- | :--- | :--- |
| **`"Ref_CategoryA"`** | `VARCHAR(255)` | `TXX_FieldName` | 直接映射目標資料表與欄位名稱。<br>例：`T01_PJ_Status`、`T02_PH_Status`、`T03_EV_Type`、`T06_PR_RoleType` |
| **`"Ref_CategoryB"`** | `VARCHAR(255)` | Sub-group 名稱或 `NULL` | 次級群組分類標籤。無次級分組時**預設為 `NULL`**。前端 Workspace Preferences 顯示為 `Sub Category`（可編輯）。 |
| **`"Ref_CategoryC"`** | `VARCHAR(255)` | `'Enable'` 或 `'Disable'` | 字典啟用狀態開關。**新增時預設為 `'Enable'`**。前端 Workspace Preferences 顯示為 `Status`（可編輯）。 |
| **`"Ref_SortValue"`** | `INT` | 排序整數 | 顯示先後順序。**新增自訂字典時一律預設為 `999`**（排在末端，由使用者後續調整）。前端可編輯。 |
| **`"Ref_Text"`** | `VARCHAR(255)` | 顯示標籤文字或純值 | 字典選項顯示之文字。<br>例：`"Planning"`、`"Completed"`、`"Meeting"`。前端可編輯（限 255 字元）。 |
| **`FK_T00_PK_T05`** | `INT` (可空) | `NULL` 或 `PK_T05` | **權限作用域**：<br>• `NULL`：全系統全體使用者通用預設字典。<br>• `PK_T05`：指定使用者擴充之個人自訂字典項。 |

---

### 情況 2：System-Project Related Settings (專案關聯系統設定)
用於針對專案或專案子物件（Phase、Event、Mission）的系統層級行為設定與旗標。**此類設定的 `Ref_Text` 統一存放專案 ID (`PK_T01`)**，以便進行快速權限過濾與分組聚類。

#### 2.1 針對 Project 專案本身之設定
* **`Ref_CategoryA`**：`{"label":"Table","Scope":"Projects"}`
* **`Ref_CategoryB`**：`{"SettingName":"<SettingName>","SettingValue":"<Value>"}` (例：`{"SettingName":"AUTO_FREEZE_ARCHIVE","SettingValue":"30D"}`)
* **`Ref_CategoryC`**：`'Enable'` 或 `'Disable'` (狀態開關)
* **`Ref_SortValue`**：`NULL`
* **`Ref_Text`**：**`PK_T01` 的數值**（例如 `"123"`）
* **`FK_T00_PK_T05`**：**`NULL`**（全專案成員通用之系統設定，不綁定單一使用者）

#### 2.2 針對 Phase / Event / Mission 等子物件之設定
* **`Ref_CategoryA`**：`{"label":"Table","Scope":"Others","TableName":"<TableName>","<PK_Field>":<ID>}`  
  例：`{"label":"Table","Scope":"Others","TableName":"T02_Phase","PK_T02":123}`  
  例：`{"label":"Table","Scope":"Others","TableName":"T03_Events","PK_T03":108}`
* **`Ref_CategoryB`**：`{"SettingName":"<SettingName>","SettingValue":"<Value>"}` (例：`{"SettingName":"Limit_EV_DepthLevel","SettingValue":"No Limit"}`)
* **`Ref_CategoryC`**：`'Enable'` 或 `'Disable'` (狀態開關)
* **`Ref_SortValue`**：`NULL`
* **`Ref_Text`**：**所屬專案 `PK_T01` 的數值**（例如 `"123"`，即使設定作用於 Event/Phase，`Ref_Text` 依然錨定所屬專案 ID）
* **`FK_T00_PK_T05`**：**`NULL`**（專案層級通用設定）

---

### 情況 3：System-UI Settings (使用者介面配置設定)
用於非專案綁定之 UI 行為、工作區外觀或系統偏好（排除 FOLDER 與 SHORTCUT 獨立工作台）。

* **`Ref_CategoryA`**：`{"label":"System","Module":"<ModuleName>"}` (例：`{"label":"System","Module":"UI_CUSTOM"}`)
* **`Ref_CategoryB`**：`{"SettingName":"<SettingName>","SettingValue":"<Value>"}`
* **`Ref_CategoryC`**：`'Enable'` 或 `'Disable'`
* **`Ref_SortValue`**：`NULL` 或排序序號
* **`Ref_Text`**：外觀識別碼、附加參數或 `GLOBAL`
* **`FK_T00_PK_T05`**：`PK_T05`（使用者個人偏好）或 `NULL`（系統預設）

---

### 情況 4：Folder Management & Project Categorization (資料夾治理準則)

用於個人專案分類資料夾及左側專案下拉選單（Current Project options / Zone 4）之過濾呈現。

#### 4.1 系統資料夾判定與治理準則 (System Folder Governance)
1. **非硬編碼判定 (Dynamic Attribute-Based Identification)**：
   * 系統資料夾**不再以特定資料夾名稱進行硬編碼判定**。
   * 判定標準：凡 `Ref_CategoryB` 中含有 **`"FolderType":"SYSTEM_FOLDER"`**，或 `FK_T00_PK_T05 IS NULL` 者，即宣告為系統資料夾（System Folder）。
   * **標準資料庫儲存格式**：
     ```json
     {"SettingName":"FOLDER_NAME","SettingValue":"<FolderName>","FolderType":"SYSTEM_FOLDER"}
     ```
   * **標準系統資料夾清單**：
     * `Draft`（原 Prepare 資料夾已正式更名為 `Draft`）
     * `Working`
     * `Archive`
     * `Trash`
2. **全域單一性原則 (Zero Redundant System Folders)**：
   * 系統資料夾全系統僅保留一組共用記錄，其 **`FK_T00_PK_T05 IS NULL`**。
   * 後端**嚴禁**於使用者登入或檢索時，為個別使用者重複插入 `FK_T00_PK_T05 = userId` 的系統資料夾副本。
3. **使用者權限絕對封鎖 (Immutable System Folders)**：
   * 系統資料夾**不可由使用者編輯、重新命名或刪除**（前端不顯示 Rename、Delete 按鈕，後端對非自訂資料夾之修改請求直接攔截並拒絕）。
   * 使用者建立或重命名自訂資料夾時，新名稱**禁止與任何既有系統資料夾同名**（不分大小寫）。

#### 4.2 下拉選單顯示準則 (Strict Ref_Text Visibility Criteria)
* **`Ref_Text` 欄位語意**：
  * 用於控制資料夾是否於左側專案選單（Current Project options）中作為分組標籤顯示。
  * **支援值格式**：
    * 純字串：`"VISIBLE"`（顯示）或 `"HIDDEN"`（隱藏）。
    * JSON 格式相容：`{"zone4_visible":true}` 或 `{"zone4_visible":false}`。
* **絕對遵循原則 (Strict Inheritance for All Folders)**：
  * **無論是系統資料夾（如 Archive、Draft）或自訂資料夾，其在 Current Project options 中的顯示皆必須 100% 嚴格遵循 `Ref_Text` 的設定**。
  * 若資料夾之 `Ref_Text` 為不可見（如 `HIDDEN` 或 `{"zone4_visible":false}`），則該資料夾及其名下的所有專案**絕對不出現在 Current Project options 下拉選單中**。
  * **已歸類專案排他性**：只要專案已被指派至任一資料夾，即便該資料夾因 `zone4_visible: false` 而隱藏，該專案也**絕對不可被視為未分類專案推入 `Uncategorized Projects`**。

#### 4.3 專案與資料夾指派關聯 (Project-to-Folder Mapping)
* **`Ref_CategoryA`**：`{"label":"Table","TableName":"T01_Projects","FieldName":"PK_T01"}`
* **`Ref_CategoryB`**：`{"SettingName":"ASSIGNED_FOLDER","SettingValue":"<FolderName>"}`
* **`Ref_CategoryC`**：`'Enable'`
* **`Ref_SortValue`**：`999`
* **`Ref_Text`**：專案 ID（`PK_T01`，如 `"123"`）
* **`FK_T00_PK_T05`**：`PK_T05`（所屬使用者的個人專案整理）
* **生命週期連帶完整性 (Cascade Integrity)**：
  * **刪除資料夾時**：必須透過資料庫事務同步物理刪除該使用者名下所有屬於該資料夾的專案指派記錄（Cascade Delete），杜絕未來重建同名資料夾時幽靈資料復活。
  * **重命名自訂資料夾時**：必須透過資料庫事務同步將名下所有指派記錄的 `SettingValue` 更新為新資料夾名稱（Cascade Update）。

---

## 三、 Workspace Preferences 查詢與操作權威邊界 (Governance Rules)

在 `Workspace Preferences` 工作台讀取與管理 `T00_Ref` 時，依下列規則進行呈現與權限過濾：

### 1. 表格 A：Table A (自訂資料字典)
* **標題顯示**：統一標註為 **`Table A`**。
* **資料來源**：`"T00_Ref"` 中 `Ref_CategoryA` 不以 `{` 開頭且 `FK_T00_PK_T05 = user.pkT05`。
* **欄位結構**：
  * `Category` (`Category A`)：轉換為自然可讀文字，**Table 與 Field 之間統一以連字號 `-` 連接**（純顯示，不可編輯）。
    * 轉換對照：`T01_PJ_Status` $\rightarrow$ `Project-Status`、`T02_PH_Status` $\rightarrow$ `Phase-Status`、`T03_EV_Type` $\rightarrow$ `Event-Type`、`T06_PR_RoleType` $\rightarrow$ `Project Role-RoleType`。
  * `Sub Category` (`Category B`)：直接顯示原始值（**可編輯**）。
  * `Ref_Text`：顯示文字（**可編輯**，限 255 字元）。
  * `Status` (`Category C`)：`Enable` / `Disable`（**可編輯切換**）。
  * `Ref_SortValue`：排序整數（**可編輯**，預設 999）。
  * `Actions`：`[Save]` / `[Delete]`。
* **快取失效髒標記 (Dirty Flag Integration)**：
  * 使用者更新或刪除字典記錄成功後，前端主動設置 `window.isDictionaryDirty = true`，以供下游業務模組（Phase、Event 等）切換進入時按需無感重拉最新字典。

### 2. 表格 B：Table B (專案系統設定)
* **標題顯示**：統一標註為 **`Table B`**。
* **無資料自動隱藏**：若當前使用者在所屬專案中沒有任何 Table B 設定記錄，**整塊 Table B 區域（包含標題列與空白提示）完全隱藏不顯示**。
* **核心權限守衛 (FULL Right Verification)**：
  * 必須先於 `"T06_ProjectRoles"` 中核查當前使用者擁有 `FULL` 權限的專案清單：
    ```sql
    SELECT FK_T06_PK_T01 FROM "T06_ProjectRoles" 
    WHERE FK_T06_PK_T05 = ? AND "PR_Right" = 'FULL' AND "PR_ignore_delete" = FALSE
    ```
  * 僅將這些 `FK_T06_PK_T01` 清單轉換為字串集合，作為 `"T00_Ref"` 的查詢條件：
    ```sql
    SELECT * FROM "T00_Ref"
    WHERE "Ref_CategoryA" LIKE '{"label":"Table"%'
      AND "Ref_Text" IN ('1', '5', '12', ...)
      AND FK_T00_PK_T05 IS NULL
    ```
  * **非 FULL 權限者無法檢視或修改任何專案系統設定**。
* **分組呈現**：依 `Project ID`（即 `Ref_Text` 對應的專案）進行聚類分組。
* **欄位結構**（**Target Ref 徹底隱藏不顯示**）：
  * `SettingName`：自 `Category B` 解析之鍵名（純顯示，不可編輯）。
  * `SettingValue`：自 `Category B` 解析之鍵值（純顯示，不可編輯）。
  * `Status` (`Category C`)：`Enable` / `Disable`（**唯一可切換欄位**）。
  * `Actions`：`[Save]` / `[Delete]`。

### 3. 表格 C：Table C (使用者介面配置)
* **標題顯示**：統一標註為 **`Table C`**。
* **無資料自動隱藏**：若沒有任何 Table C 記錄，**整塊 Table C 區域（包含標題列與空白提示）完全隱藏不顯示**。
* **資料來源**：`"T00_Ref"` 中 `Ref_CategoryA` 為 JSON、`label="System"` 且排除 `FOLDER` 與 `SHORTCUT`。
* **分組呈現**：依 **`Category A + Ref_Text`** 進行聚類分組。
* **欄位結構**（**Target Ref 徹底隱藏不顯示**）：
  * `SettingName`：自 `Category B` 解析之鍵名（純顯示，不可編輯）。
  * `SettingValue`：自 `Category B` 解析之鍵值（純顯示，不可編輯）。
  * `Status` (`Category C`)：`Enable` / `Disable`（**唯一可切換欄位**）。
  * `Actions`：`[Save]` / `[Delete]`。