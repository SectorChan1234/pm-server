package handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import common.DB;
import common.JsonUtil;
import common.Security;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;

public class DBAdminHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod().toUpperCase();
        String path = exchange.getRequestURI().getPath();

        if ("OPTIONS".equals(method)) {
            JsonUtil.sendJson(exchange, 204, "");
            return;
        }

        if (!"POST".equals(method)) {
            JsonUtil.sendError(exchange, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
            return;
        }

        // 身分與權限驗證：必須為 ADMIN 角色
        String authHeader = exchange.getRequestHeaders().getFirst("Authorization");
        Security.UserSession user = Security.authenticate(authHeader);

        if (user == null || !"ADMIN".equalsIgnoreCase(user.stRight)) {
            JsonUtil.sendError(exchange, 403, "FORBIDDEN", "管理員專用權限，拒絕存取");
            return;
        }

        String sql = readBody(exchange).trim();
        if (sql.isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "SQL 語句不可為空");
            return;
        }

        try {
            if ("/api/query".equals(path)) {
                handleQuery(exchange, sql);
            } else if ("/api/execute".equals(path)) {
                handleExecute(exchange, sql, user);
            } else {
                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Endpoint not found");
            }
        } catch (Exception e) {
            e.printStackTrace();
            JsonUtil.sendError(exchange, 500, "SQL_ERROR", e.getMessage());
        }
    }

    private void handleQuery(HttpExchange exchange, String sql) throws Exception {
        try (Connection conn = DB.getConnection();
             Statement stmt = conn.createStatement()) {

            boolean isResultSet = stmt.execute(sql);
            if (isResultSet) {
                try (ResultSet rs = stmt.getResultSet()) {
                    ResultSetMetaData meta = rs.getMetaData();
                    int colCount = meta.getColumnCount();

                    StringBuilder sb = new StringBuilder("[");
                    boolean firstRow = true;

                    while (rs.next()) {
                        if (!firstRow) sb.append(",");
                        sb.append("{");
                        for (int i = 1; i <= colCount; i++) {
                            String colName = meta.getColumnLabel(i);
                            String val = rs.getString(i);

                            if (i > 1) sb.append(",");
                            sb.append("\"").append(JsonUtil.escape(colName)).append("\":");
                            if (val == null) {
                                sb.append("null");
                            } else {
                                sb.append("\"").append(JsonUtil.escape(val)).append("\"");
                            }
                        }
                        sb.append("}");
                        firstRow = false;
                    }
                    sb.append("]");
                    JsonUtil.sendJson(exchange, 200, sb.toString());
                    return;
                }
            }
            JsonUtil.sendJson(exchange, 200, "[]");
        }
    }

    private void handleExecute(HttpExchange exchange, String sql, Security.UserSession user) throws Exception {
        String upperSql = sql.toUpperCase();

        // 核心安全底線：禁止對 T99_AuditLog 進行清空、刪除或修改 (落實 Append-Only)
        if (upperSql.contains("T99_AUDITLOG") && 
           (upperSql.contains("DELETE") || upperSql.contains("UPDATE") || upperSql.contains("DROP") || upperSql.contains("TRUNCATE"))) {
            JsonUtil.sendError(exchange, 403, "AUDIT_LOG_PROTECTED", "安全違規：T99_AuditLog 為嚴格唯讀稽核表，嚴禁變更或刪除");
            return;
        }

        String clientIp = exchange.getRemoteAddress().getAddress().getHostAddress();
        int affectedRows = 0;
        String status = "SUCCESS";
        String errorMsg = null;

        try (Connection conn = DB.getConnection()) {
            try (Statement stmt = conn.createStatement()) {
                affectedRows = stmt.executeUpdate(sql);
            } catch (Exception ex) {
                status = "FAIL";
                errorMsg = ex.getMessage();
                throw ex;
            } finally {
                // 自動使用 PreparedStatement 將審計日誌安全寫入 T99_AuditLog
                writeAuditLog(conn, user.pkT05, user.email, clientIp, sql, status, errorMsg);
            }

            String resp = "{\"status\":\"SUCCESS\",\"affectedRows\":" + affectedRows + "}";
            JsonUtil.sendJson(exchange, 200, resp);
        }
    }

    private void writeAuditLog(Connection conn, long staffId, String email, String clientIp, String sql, String status, String errorMsg) {
        String logSql = "INSERT INTO \"T99_AuditLog\" " +
                        "(\"AL_ActionTime\", FK_T99_PK_T05, \"AL_AdminEmail\", \"AL_ClientIP\", \"AL_SqlStatement\", \"AL_Status\", \"AL_ErrorMessage\") " +
                        "VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)";
        try (PreparedStatement ps = conn.prepareStatement(logSql)) {
            ps.setLong(1, staffId);
            ps.setString(2, email);
            ps.setString(3, clientIp);
            ps.setString(4, sql);
            ps.setString(5, status);
            ps.setString(6, errorMsg == null ? "" : errorMsg);
            ps.executeUpdate();
        } catch (Exception e) {
            System.err.println("寫入審計日誌異常: " + e.getMessage());
        }
    }

    private String readBody(HttpExchange exchange) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line).append("\n");
            return sb.toString();
        }
    }
}