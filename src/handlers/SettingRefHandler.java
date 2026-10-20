package handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import common.DB;
import common.JsonUtil;
import common.Security;
import common.Security.UserSession;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * 個人介面偏好與 T00_Ref 設定治理處理器 (Personal Settings & Reference Governance Handler)
 * File: src/handlers/SettingRefHandler.java
 *
 * 職責與邊界：
 * 1. 專責處理當前登入者 (FK_T00_PK_T05 = user.pkT05) 於 "T00_Ref" 資料表的個人化設定。
 * 2. Stage 2 核心支援：Zone 1 左側導航欄展開/收合偏好 (/api/setting/sidebar-pref) 與個人捷徑列表讀取。
 * 3. 審計絕對隔離鐵律：本處理器嚴禁引入或調用 ProjectRemarkLedger，確保個人介面偏好異動 0 台帳污染。
 * 4. 嚴格執行 H2 資料庫雙引號轉義規範 (\"T00_Ref\", \"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_Text\" 等)。
 */
public class SettingRefHandler implements HttpHandler {

    private static final String CAT_UI_PREF = "UI_PREF";
    private static final String KEY_SIDEBAR_COLLAPSED = "SIDEBAR_COLLAPSED";
    private static final String CAT_SHORTCUT = "USER_SHORTCUT";

    /**
     * [職責與邊界] 接收並分發 /api/setting/* 及相容之 /api/portal/shortcut/* HTTP 請求
     * [Input Contract] HttpExchange (需帶有 Authorization: Bearer <pb_token>)
     * [Output Contract] 標準 JSON 回應 (含 "success": true/false 與 "status": "SUCCESS"/"FAILED")
     * [Call Graph] Called By: AppServer HTTP Context -> Calls: handleGetSidebarPref, handleSaveSidebarPref, handleGetShortcutList
     */
    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod().toUpperCase();

        // 統一處理 CORS OPTIONS 預檢請求
        if ("OPTIONS".equals(method)) {
            JsonUtil.sendJson(exchange, 204, "");
            return;
        }

        // 零信任身分驗證：直接使用 HttpExchange 多載 (對齊 Stage 1 重構收斂規範)
        UserSession user = Security.authenticate(exchange);
        if (user == null) {
            sendError(exchange, 401, "UNAUTHORIZED", "Valid session token (pb_token) is required");
            return;
        }

        String path = exchange.getRequestURI().getPath();
        try {
            switch (path) {
                case "/api/setting/sidebar-pref":
                    if ("GET".equals(method)) {
                        handleGetSidebarPref(exchange, user);
                    } else if ("POST".equals(method)) {
                        handleSaveSidebarPref(exchange, user);
                    } else {
                        sendError(exchange, 405, "METHOD_NOT_ALLOWED", "Method Not Allowed");
                    }
                    break;

                case "/api/setting/shortcut/list":
                case "/api/portal/shortcut/list":
                    if ("GET".equals(method)) {
                        handleGetShortcutList(exchange, user);
                    } else {
                        sendError(exchange, 405, "METHOD_NOT_ALLOWED", "Method Not Allowed");
                    }
                    break;

                default:
                    sendError(exchange, 404, "NOT_FOUND", "Setting endpoint not found: " + path);
                    break;
            }
        } catch (SQLException sqlEx) {
            sqlEx.printStackTrace();
            sendError(exchange, 400, "DATABASE_ERROR", "Database operation failed: " + sqlEx.getMessage());
        } catch (Exception ex) {
            ex.printStackTrace();
            sendError(exchange, 400, "REQUEST_FAILED", "Request processing failed: " + ex.getMessage());
        }
    }

    /**
     * [職責與邊界] 讀取當前登入者的左側導航欄收合偏好狀態 (Zone 1 Sidebar Collapse State)
     * [Input Contract] exchange: HttpExchange, user: 已驗證之 UserSession (使用 user.pkT05)
     * [Output Contract] JSON: {"success":true,"status":"SUCCESS","collapsed":true|false}
     * [Call Graph] Called By: SettingRefHandler.handle -> Calls: DB.getConnection, JsonUtil.sendJson
     */
    private void handleGetSidebarPref(HttpExchange exchange, UserSession user) throws SQLException, IOException {
        String sql = "SELECT \"Ref_Text\" FROM \"T00_Ref\" " +
                     "WHERE \"Ref_CategoryA\" = ? AND \"Ref_CategoryB\" = ? AND FK_T00_PK_T05 = ? " +
                     "ORDER BY PK_T00 DESC LIMIT 1";

        boolean isCollapsed = false;
        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, CAT_UI_PREF);
            ps.setString(2, KEY_SIDEBAR_COLLAPSED);
            ps.setLong(3, user.pkT05);

            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    String val = rs.getString("Ref_Text");
                    isCollapsed = "true".equalsIgnoreCase(val != null ? val.trim() : "false")
                               || "1".equals(val != null ? val.trim() : "0");
                }
            }
        }

        String json = "{"
                + "\"success\":true,"
                + "\"status\":\"SUCCESS\","
                + "\"collapsed\":" + isCollapsed + ","
                + "\"is_collapsed\":" + isCollapsed
                + "}";
        JsonUtil.sendJson(exchange, 200, json);
    }

    /**
     * [職責與邊界] 儲存或更新當前登入者的左側導航欄收合偏好狀態至 "T00_Ref"（嚴格不寫入 ProjectRemarkLedger）
     * [Input Contract] JSON Body: {"collapsed": true|false} (相容 is_collapsed / isCollapsed 及字串 "true"/"false")
     * [Output Contract] JSON: {"success":true,"status":"SUCCESS","collapsed":true|false,"message":"..."}
     * [Call Graph] Called By: SettingRefHandler.handle -> Calls: extractBooleanCompat, DB.getConnection, JsonUtil.sendJson
     */
    private void handleSaveSidebarPref(HttpExchange exchange, UserSession user) throws SQLException, IOException {
        String body = JsonUtil.readBody(exchange);
        Boolean collapsedVal = extractBooleanCompat(body, "collapsed", "is_collapsed", "isCollapsed");
        if (collapsedVal == null) {
            sendError(exchange, 400, "BAD_REQUEST", "Field 'collapsed' (boolean) is required");
            return;
        }

        String targetText = collapsedVal ? "true" : "false";

        try (Connection conn = DB.getConnection()) {
            conn.setAutoCommit(false);
            try {
                // 1. 檢查是否已存在該使用者的 SIDEBAR_COLLAPSED 記錄
                String checkSql = "SELECT PK_T00 FROM \"T00_Ref\" " +
                                  "WHERE \"Ref_CategoryA\" = ? AND \"Ref_CategoryB\" = ? AND FK_T00_PK_T05 = ? " +
                                  "ORDER BY PK_T00 DESC LIMIT 1";
                Integer existingPkT00 = null;
                try (PreparedStatement psCheck = conn.prepareStatement(checkSql)) {
                    psCheck.setString(1, CAT_UI_PREF);
                    psCheck.setString(2, KEY_SIDEBAR_COLLAPSED);
                    psCheck.setLong(3, user.pkT05);
                    try (ResultSet rs = psCheck.executeQuery()) {
                        if (rs.next()) {
                            existingPkT00 = rs.getInt("PK_T00");
                        }
                    }
                }

                // 2. 更新既有記錄或插入新記錄
                if (existingPkT00 != null) {
                    String updateSql = "UPDATE \"T00_Ref\" SET \"Ref_Text\" = ? WHERE PK_T00 = ? AND FK_T00_PK_T05 = ?";
                    try (PreparedStatement psUpd = conn.prepareStatement(updateSql)) {
                        psUpd.setString(1, targetText);
                        psUpd.setInt(2, existingPkT00);
                        psUpd.setLong(3, user.pkT05);
                        psUpd.executeUpdate();
                    }
                } else {
                    String insertSql = "INSERT INTO \"T00_Ref\" " +
                                       "(\"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_SortValue\", \"Ref_Text\", FK_T00_PK_T05) " +
                                       "VALUES (?, ?, ' PERSONAL_UI ', 1, ?, ?)";
                    try (PreparedStatement psIns = conn.prepareStatement(insertSql)) {
                        psIns.setString(1, CAT_UI_PREF);
                        psIns.setString(2, KEY_SIDEBAR_COLLAPSED);
                        psIns.setString(3, targetText);
                        psIns.setLong(4, user.pkT05);
                        psIns.executeUpdate();
                    }
                }

                conn.commit();
            } catch (SQLException ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }
        }

        String json = "{"
                + "\"success\":true,"
                + "\"status\":\"SUCCESS\","
                + "\"collapsed\":" + collapsedVal + ","
                + "\"is_collapsed\":" + collapsedVal + ","
                + "\"message\":\"Sidebar preference updated\""
                + "}";
        JsonUtil.sendJson(exchange, 200, json);
    }

    /**
     * [職責與邊界] 讀取當前登入者於 "T00_Ref" 中的個人釘選捷徑清單 (相容 Stage 2 過渡與 Stage 3 Zone 8 捷徑列)
     * [Input Contract] exchange: HttpExchange, user: 已驗證之 UserSession
     * [Output Contract] JSON: {"success":true,"status":"SUCCESS","shortcuts":[...]}
     * [Call Graph] Called By: SettingRefHandler.handle -> Calls: DB.getConnection, JsonUtil.sendJson
     */
    private void handleGetShortcutList(HttpExchange exchange, UserSession user) throws SQLException, IOException {
        String sql = "SELECT PK_T00, \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_SortValue\", \"Ref_Text\" " +
                     "FROM \"T00_Ref\" " +
                     "WHERE \"Ref_CategoryA\" = ? AND FK_T00_PK_T05 = ? " +
                     "ORDER BY COALESCE(\"Ref_SortValue\", 999) ASC, PK_T00 ASC";

        StringBuilder sb = new StringBuilder();
        sb.append("{\"success\":true,\"status\":\"SUCCESS\",\"shortcuts\":[");

        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, CAT_SHORTCUT);
            ps.setLong(2, user.pkT05);

            try (ResultSet rs = ps.executeQuery()) {
                boolean first = true;
                while (rs.next()) {
                    if (!first) sb.append(",");
                    first = false;

                    int pkT00 = rs.getInt("PK_T00");
                    String title = rs.getString("Ref_CategoryB");
                    if (title == null || title.trim().isEmpty()) {
                        title = rs.getString("Ref_Text");
                    }
                    String hashParam = rs.getString("Ref_Text");
                    int sortVal = rs.getInt("Ref_SortValue");

                    sb.append("{")
                      .append("\"pk_t00\":").append(pkT00).append(",")
                      .append("\"pkT00\":").append(pkT00).append(",")
                      .append("\"title\":\"").append(JsonUtil.escape(title != null ? title : "Shortcut")).append("\",")
                      .append("\"hash_param\":\"").append(JsonUtil.escape(hashParam != null ? hashParam : "")).append("\",")
                      .append("\"hashParam\":\"").append(JsonUtil.escape(hashParam != null ? hashParam : "")).append("\",")
                      .append("\"sort_value\":").append(sortVal)
                      .append("}");
                }
            }
        }

        sb.append("]}");
        JsonUtil.sendJson(exchange, 200, sb.toString());
    }

    /**
     * [職責與邊界] 雙向相容提取 JSON 布林欄位 (同時支援駝峰、底線及布林/字串格式)
     */
    private Boolean extractBooleanCompat(String json, String... fieldNames) {
        if (json == null || json.isEmpty()) return null;
        for (String field : fieldNames) {
            Boolean boolVal = JsonUtil.extractBool(json, field);
            if (boolVal != null) {
                return boolVal;
            }
            String strVal = JsonUtil.extractString(json, field);
            if (strVal != null && !strVal.trim().isEmpty()) {
                String clean = strVal.trim().toLowerCase();
                if ("true".equals(clean) || "1".equals(clean)) return Boolean.TRUE;
                if ("false".equals(clean) || "0".equals(clean)) return Boolean.FALSE;
            }
        }
        return null;
    }

    /**
     * [職責與邊界] 統一錯誤回應格式，保證同時包含 "success":false 與 "status":"FAILED"
     */
    private void sendError(HttpExchange exchange, int statusCode, String code, String message) throws IOException {
        String json = "{"
                + "\"success\":false,"
                + "\"status\":\"FAILED\","
                + "\"code\":\"" + JsonUtil.escape(code != null ? code : "ERROR") + "\","
                + "\"message\":\"" + JsonUtil.escape(message != null ? message : "Unexpected error") + "\""
                + "}";
        JsonUtil.sendJson(exchange, statusCode, json);
    }
}
