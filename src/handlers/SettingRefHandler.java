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
 * 2. 依據 UI 偏好儲存決策原則，側欄收合高頻 UI 狀態已回歸前端 localStorage，本處理器不再承接側欄資料庫讀寫。
 * 3. 審計絕對隔離鐵律：本處理器嚴禁引入或調用 ProjectRemarkLedger，確保個人介面偏好異動 0 台帳污染。
 * 4. 嚴格執行 H2 資料庫雙引號轉義規範 (\"T00_Ref\", \"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_Text\" 等)。
 */
public class SettingRefHandler implements HttpHandler {

    private static final String CAT_SHORTCUT = "USER_SHORTCUT";

    /**
     * [職責與邊界] 接收並分發 /api/setting/* 及相容之 /api/portal/shortcut/* HTTP 請求
     * [Input Contract] HttpExchange (需帶有 Authorization: Bearer <pb_token>)
     * [Output Contract] 標準 JSON 回應 (含 "success": true/false 與 "status": "SUCCESS"/"FAILED")
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
     * [職責與邊界] 讀取當前登入者於 "T00_Ref" 中的個人釘選捷徑清單 (相容 Stage 2 過渡與 Stage 3 Zone 8 捷徑列)
     * [Input Contract] exchange: HttpExchange, user: 已驗證之 UserSession
     * [Output Contract] JSON: {"success":true,"status":"SUCCESS","shortcuts":[...]}
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