package handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import common.DB;
import common.JsonUtil;
import common.Security;
import common.Security.UserSession;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * H2 資料庫萬用管理與審計處理器 (Database Admin & Universal SQL Handler)
 *
 * 職責與邊界：
 * 1. 嚴格限定 ADMIN 身分方可存取 (/api/query, /api/execute, /api/admin/query, /api/admin/execute)。
 * 2. 執行通用動態 SELECT 查詢，動態遍歷 ResultSetMetaData 輸出結構化 JSON。
 * 3. 執行 DDL / DML 變更操作，並以轉義雙引號寫入 \"T99_AuditLog\" 審計日誌。
 * 4. 全面防止後端 500 崩潰，將底層 SQL 異常資訊安全傳遞回前端主控台。
 */
public class DBAdminHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        if ("OPTIONS".equalsIgnoreCase(method)) {
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        // 1. 零信任鑑權：驗證 ADMIN 權限
        UserSession adminSession = Security.authenticate(exchange);
        if (adminSession == null || !"ADMIN".equalsIgnoreCase(adminSession.stRight)) {
            sendError(exchange, 403, "Access denied: Administrator privileges required");
            return;
        }

        String path = exchange.getRequestURI().getPath();
        if (!"POST".equalsIgnoreCase(method)) {
            sendError(exchange, 405, "Method Not Allowed");
            return;
        }

        try {
            String body = readBody(exchange);
            String sql = extractJsonField(body, "sql").trim();

            if (sql.isEmpty()) {
                sendError(exchange, 400, "SQL statement is required");
                return;
            }

            // 路由判斷：包含 execute 則為執行更新，其餘皆視為查詢
            if (path.contains("execute")) {
                handleExecute(exchange, sql, adminSession);
            } else {
                handleQuery(exchange, sql, adminSession);
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendError(exchange, 500, "Internal Server Error in DBAdminHandler: " + e.getMessage());
        }
    }

    /**
     * [職責] 執行通用 SELECT 查詢並將結果序列化為 JSON
     */
    private void handleQuery(HttpExchange exchange, String sql, UserSession admin) throws IOException {
        StringBuilder json = new StringBuilder();
        json.append("{\"success\":true,\"status\":\"SUCCESS\",\"data\":[");

        try (Connection conn = DB.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            ResultSetMetaData meta = rs.getMetaData();
            int colCount = meta.getColumnCount();
            boolean firstRow = true;

            while (rs.next()) {
                if (!firstRow) {
                    json.append(",");
                }
                firstRow = false;

                json.append("{");
                for (int i = 1; i <= colCount; i++) {
                    String colName = meta.getColumnLabel(i);
                    Object val = rs.getObject(i);

                    if (i > 1) {
                        json.append(",");
                    }
                    json.append("\"").append(JsonUtil.escape(colName)).append("\":");

                    if (val == null) {
                        json.append("null");
                    } else if (val instanceof Boolean || val instanceof Number) {
                        json.append(val.toString());
                    } else {
                        json.append("\"").append(JsonUtil.escape(val.toString())).append("\"");
                    }
                }
                json.append("}");
            }
            json.append("]}");
            JsonUtil.sendJson(exchange, 200, json.toString());

        } catch (SQLException e) {
            // 將具體 SQL 錯誤安全回傳前端，不觸發 HTTP 500
            String errorMsg = e.getMessage() != null ? e.getMessage() : e.toString();
            sendError(exchange, 400, "SQL Query Error: " + errorMsg);
        }
    }

    /**
     * [職責] 執行通用 DDL / DML 並寫入 \"T99_AuditLog\"
     */
    private void handleExecute(HttpExchange exchange, String sql, UserSession admin) throws IOException {
        String clientIp = exchange.getRemoteAddress() != null ? exchange.getRemoteAddress().getAddress().getHostAddress() : "UNKNOWN";
        int affectedRows = 0;
        String executionStatus = "SUCCESS";
        String executionError = null;

        try (Connection conn = DB.getConnection();
             Statement stmt = conn.createStatement()) {

            affectedRows = stmt.executeUpdate(sql);

            String json = "{"
                    + "\"success\":true,"
                    + "\"status\":\"SUCCESS\","
                    + "\"affectedRows\":" + affectedRows + ","
                    + "\"message\":\"Statement executed successfully\""
                    + "}";
            JsonUtil.sendJson(exchange, 200, json);

        } catch (SQLException e) {
            executionStatus = "FAILED";
            executionError = e.getMessage();
            sendError(exchange, 400, "SQL Execution Error: " + executionError);
        } finally {
            // 寫入審計日誌，嚴格使用轉義雙引號對齊 Schema
            writeAuditLog(admin.pkT05, admin.email, clientIp, sql, executionStatus, executionError);
        }
    }

    /**
     * [職責] 將管理員 SQL 變更寫入 \"T99_AuditLog\"
     */
    private void writeAuditLog(long adminPkT05, String adminEmail, String clientIp, String sqlStatement, String status, String errorMsg) {
        String auditSql = "INSERT INTO \"T99_AuditLog\" (FK_T99_PK_T05, \"AL_AdminEmail\", \"AL_ClientIP\", \"AL_SqlStatement\", \"AL_Status\", \"AL_ErrorMessage\") " +
                          "VALUES (?, ?, ?, ?, ?, ?)";
        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(auditSql)) {
            ps.setLong(1, adminPkT05);
            ps.setString(2, adminEmail != null ? adminEmail : "");
            ps.setString(3, clientIp != null ? clientIp : "");
            ps.setString(4, sqlStatement != null ? sqlStatement : "");
            ps.setString(5, status);
            ps.setString(6, errorMsg);
            ps.executeUpdate();
        } catch (SQLException ex) {
            System.err.println("[Audit Warning] Failed to insert audit log into T99_AuditLog: " + ex.getMessage());
        }
    }

    private void sendError(HttpExchange exchange, int statusCode, String message) throws IOException {
        String json = "{"
                + "\"success\":false,"
                + "\"status\":\"FAILED\","
                + "\"message\":\"" + JsonUtil.escape(message != null ? message : "") + "\""
                + "}";
        JsonUtil.sendJson(exchange, statusCode, json);
    }

    private String extractJsonField(String json, String field) {
        if (json == null || field == null || json.isEmpty()) {
            return "";
        }
        Pattern pattern = Pattern.compile("\"" + Pattern.quote(field) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
        Matcher matcher = pattern.matcher(json);
        if (matcher.find()) {
            return unescapeJson(matcher.group(1));
        }
        Pattern unquotedPattern = Pattern.compile("\"" + Pattern.quote(field) + "\"\\s*:\\s*([^,}\\s]+)");
        Matcher unquotedMatcher = unquotedPattern.matcher(json);
        if (unquotedMatcher.find()) {
            String val = unquotedMatcher.group(1).trim();
            if (!"null".equalsIgnoreCase(val)) {
                return val;
            }
        }
        return "";
    }

    private String unescapeJson(String input) {
        if (input == null || input.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        boolean inEscape = false;
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (inEscape) {
                switch (c) {
                    case '"': sb.append('"'); break;
                    case '\\': sb.append('\\'); break;
                    case '/': sb.append('/'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'n': sb.append('\n'); break;
                    case 'r': sb.append('\r'); break;
                    case 't': sb.append('\t'); break;
                    default: sb.append(c); break;
                }
                inEscape = false;
            } else if (c == '\\') {
                inEscape = true;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private String readBody(HttpExchange exchange) throws IOException {
        InputStream is = exchange.getRequestBody();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buffer = new byte[1024];
        int len;
        while ((len = is.read(buffer)) != -1) {
            baos.write(buffer, 0, len);
        }
        return baos.toString(StandardCharsets.UTF_8.name());
    }
}