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
import java.sql.SQLException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 後台管理員操作處理器 (System Administration Handler)
 *
 * 職責與邊界：
 * 1. 嚴格執行零信任 ADMIN 身分鑑權，非管理員請求一律攔截並阻斷。
 * 2. 人員生命週期管理：列出同仁 (/api/admin/staff/list)、建立同仁 (/api/admin/staff/create)、啟用/停用帳號 (/api/admin/staff/toggle-active)。
 * 3. 密碼治理升級：重設人員密碼 (/api/admin/staff/reset-password) 全面改用 Salted Hash，並踢除已登入 Session。
 * 4. 暴露同仁密碼安全性狀態 (isSalted)，支援管理介面標註舊版無鹽 SHA-256 帳號。
 * 5. 全面使用嚴格轉義雙引號 (\"T05_Staff\", \"T01_Projects\") 對齊 H2 Schema 定義。
 */
public class AdminHandler implements HttpHandler {

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

        // 零信任身分鑑權：必須具備有效 Session 且 ST_Right 必須為 ADMIN
        UserSession adminSession = Security.authenticate(exchange);
        if (adminSession == null || !"ADMIN".equalsIgnoreCase(adminSession.stRight)) {
            sendError(exchange, 403, "Access denied: Administrator privileges required");
            return;
        }

        String path = exchange.getRequestURI().getPath();
        try {
            switch (path) {
                case "/api/admin/staff/list":
                    if ("GET".equalsIgnoreCase(method)) {
                        handleStaffList(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/admin/staff/create":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleStaffCreate(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/admin/staff/reset-password":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleResetPassword(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/admin/staff/toggle-active":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleToggleActive(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/admin/projects/options":
                    if ("GET".equalsIgnoreCase(method)) {
                        handleProjectOptions(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                default:
                    sendError(exchange, 404, "Admin endpoint not found");
                    break;
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendError(exchange, 500, "Internal server error: " + e.getMessage());
        }
    }

    /**
     * [職責] 列出全體同仁清單，含關聯外判專案資訊與密碼加鹽安全狀態 (isSalted)
     */
    private void handleStaffList(HttpExchange exchange) throws IOException {
        String sql = "SELECT s.PK_T05, s.\"ST_Email\", s.\"ST_Name\", s.\"ST_Right\", s.\"ST_IsActive\", " +
                     "       COALESCE(s.FK_T05_PK_T01_CUSTOM, 0) AS FK_T05_PK_T01_CUSTOM, " +
                     "       s.\"ST_password_hash\", " +
                     "       p.\"PJ_Code\", p.\"PJ_Name\" " +
                     "FROM \"T05_Staff\" s " +
                     "LEFT JOIN \"T01_Projects\" p ON s.FK_T05_PK_T01_CUSTOM = p.PK_T01 " +
                     "ORDER BY s.PK_T05 ASC";

        StringBuilder json = new StringBuilder();
        json.append("{\"success\":true,\"staffList\":[");

        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {

            boolean first = true;
            while (rs.next()) {
                if (!first) {
                    json.append(",");
                }
                first = false;

                long pkT05 = rs.getLong("PK_T05");
                String email = rs.getString("ST_Email");
                String name = rs.getString("ST_Name");
                String right = rs.getString("ST_Right");
                boolean isActive = rs.getBoolean("ST_IsActive");
                long customProjectId = rs.getLong("FK_T05_PK_T01_CUSTOM");
                String passwordHash = rs.getString("ST_password_hash");
                String pjCode = rs.getString("PJ_Code");
                String pjName = rs.getString("PJ_Name");

                boolean isSalted = !Security.needsRehash(passwordHash);

                json.append("{")
                    .append("\"pkT05\":").append(pkT05).append(",")
                    .append("\"email\":\"").append(JsonUtil.escape(email != null ? email : "")).append("\",")
                    .append("\"name\":\"").append(JsonUtil.escape(name != null ? name : "")).append("\",")
                    .append("\"stRight\":\"").append(JsonUtil.escape(right != null ? right : "USER")).append("\",")
                    .append("\"isActive\":").append(isActive).append(",")
                    .append("\"customProjectId\":").append(customProjectId).append(",")
                    .append("\"customProjectCode\":\"").append(JsonUtil.escape(pjCode != null ? pjCode : "")).append("\",")
                    .append("\"customProjectName\":\"").append(JsonUtil.escape(pjName != null ? pjName : "")).append("\",")
                    .append("\"isSalted\":").append(isSalted)
                    .append("}");
            }
        } catch (SQLException e) {
            throw new IOException("Database error fetching staff list: " + e.getMessage(), e);
        }

        json.append("]}");
        JsonUtil.sendJson(exchange, 200, json.toString());
    }

    /**
     * [職責] 建立新同仁帳號，強制以 Salted SHA-256 格式儲存密碼，並檢驗身分排他約束
     */
    private void handleStaffCreate(HttpExchange exchange) throws IOException {
        String body = readBody(exchange);

        String email = extractJsonField(body, "email").trim().toLowerCase();
        String name = extractJsonField(body, "name").trim();
        String password = extractJsonField(body, "password");
        String stRight = extractJsonField(body, "stRight").trim().toUpperCase();
        String customProjStr = extractJsonField(body, "customProjectId").trim();

        long customProjectId = 0L;
        if (!customProjStr.isEmpty()) {
            try {
                customProjectId = Long.parseLong(customProjStr);
            } catch (NumberFormatException ignored) {}
        }

        if (email.isEmpty() || name.isEmpty() || password.isEmpty()) {
            sendError(exchange, 400, "Email, Name, and Password are required fields");
            return;
        }

        if (!"ADMIN".equals(stRight) && !"USER".equals(stRight)) {
            stRight = "USER";
        }

        try (Connection conn = DB.getConnection()) {
            if (customProjectId > 0) {
                // 外判人員：確認目標專案存在
                String checkProjSql = "SELECT COUNT(*) FROM \"T01_Projects\" WHERE PK_T01 = ?";
                try (PreparedStatement ps = conn.prepareStatement(checkProjSql)) {
                    ps.setLong(1, customProjectId);
                    try (ResultSet rs = ps.executeQuery()) {
                        if (!rs.next() || rs.getInt(1) == 0) {
                            sendError(exchange, 400, "Specified custom project does not exist");
                            return;
                        }
                    }
                }

                // 檢查同一專案下是否已存在相同 Email 之人員
                String checkDupSql = "SELECT COUNT(*) FROM \"T05_Staff\" WHERE LOWER(TRIM(\"ST_Email\")) = ? AND FK_T05_PK_T01_CUSTOM = ?";
                try (PreparedStatement ps = conn.prepareStatement(checkDupSql)) {
                    ps.setString(1, email);
                    ps.setLong(2, customProjectId);
                    try (ResultSet rs = ps.executeQuery()) {
                        if (rs.next() && rs.getInt(1) > 0) {
                            sendError(exchange, 400, "A contractor account with this email already exists for the selected project");
                            return;
                        }
                    }
                }
            } else {
                // 內部全域同仁：全域僅能有一筆 (CUSTOM = 0)
                String checkDupSql = "SELECT COUNT(*) FROM \"T05_Staff\" WHERE LOWER(TRIM(\"ST_Email\")) = ? AND COALESCE(FK_T05_PK_T01_CUSTOM, 0) = 0";
                try (PreparedStatement ps = conn.prepareStatement(checkDupSql)) {
                    ps.setString(1, email);
                    try (ResultSet rs = ps.executeQuery()) {
                        if (rs.next() && rs.getInt(1) > 0) {
                            sendError(exchange, 400, "An internal staff account with this email already exists");
                            return;
                        }
                    }
                }
            }

            // 產生全新加鹽雜湊 (saltHex:hashHex)
            String saltedPasswordHash = Security.hashPassword(password);

            String insertSql = "INSERT INTO \"T05_Staff\" (\"ST_Email\", \"ST_Name\", \"ST_password_hash\", \"ST_Right\", \"ST_IsActive\", FK_T05_PK_T01_CUSTOM) " +
                               "VALUES (?, ?, ?, ?, TRUE, ?)";

            long generatedPk = 0L;
            try (PreparedStatement ps = conn.prepareStatement(insertSql, PreparedStatement.RETURN_GENERATED_KEYS)) {
                ps.setString(1, email);
                ps.setString(2, name);
                ps.setString(3, saltedPasswordHash);
                ps.setString(4, stRight);
                ps.setLong(5, customProjectId);
                ps.executeUpdate();

                try (ResultSet keys = ps.getGeneratedKeys()) {
                    if (keys.next()) {
                        generatedPk = keys.getLong(1);
                    }
                }
            }

            String json = "{"
                    + "\"success\":true,"
                    + "\"message\":\"Staff account created successfully with Salted SHA-256\","
                    + "\"pkT05\":" + generatedPk
                    + "}";
            JsonUtil.sendJson(exchange, 200, json);

        } catch (SQLException e) {
            throw new IOException("Database error creating staff account: " + e.getMessage(), e);
        }
    }

    /**
     * [職責] 管理員重設同仁密碼，全面以 Salted SHA-256 儲存並強制剔除現有 Session
     */
    private void handleResetPassword(HttpExchange exchange) throws IOException {
        String body = readBody(exchange);

        String pkStr = extractJsonField(body, "pkT05").trim();
        long pkT05 = 0L;
        if (!pkStr.isEmpty()) {
            try {
                pkT05 = Long.parseLong(pkStr);
            } catch (NumberFormatException ignored) {}
        }

        String newPassword = extractJsonField(body, "newPassword");

        if (pkT05 <= 0 || newPassword.isEmpty()) {
            sendError(exchange, 400, "Valid Staff ID (pkT05) and newPassword are required");
            return;
        }

        String saltedHash = Security.hashPassword(newPassword);
        String sql = "UPDATE \"T05_Staff\" SET \"ST_password_hash\" = ? WHERE PK_T05 = ?";

        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, saltedHash);
            ps.setLong(2, pkT05);
            int rows = ps.executeUpdate();

            if (rows == 0) {
                sendError(exchange, 404, "Staff account not found");
                return;
            }

            Security.invalidateUserSessions(pkT05);
            sendSuccessMessage(exchange, "Password successfully reset to Salted SHA-256. Active sessions invalidated.");

        } catch (SQLException e) {
            throw new IOException("Database error resetting staff password: " + e.getMessage(), e);
        }
    }

    /**
     * [職責] 切換同仁帳號啟用/停用狀態 (\"ST_IsActive\")
     */
    private void handleToggleActive(HttpExchange exchange) throws IOException {
        String body = readBody(exchange);

        String pkStr = extractJsonField(body, "pkT05").trim();
        long pkT05 = 0L;
        if (!pkStr.isEmpty()) {
            try {
                pkT05 = Long.parseLong(pkStr);
            } catch (NumberFormatException ignored) {}
        }

        String activeStr = extractJsonField(body, "isActive").trim();
        if (pkT05 <= 0 || activeStr.isEmpty()) {
            sendError(exchange, 400, "Valid Staff ID (pkT05) and isActive status are required");
            return;
        }

        boolean newActiveStatus = Boolean.parseBoolean(activeStr);
        String sql = "UPDATE \"T05_Staff\" SET \"ST_IsActive\" = ? WHERE PK_T05 = ?";

        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setBoolean(1, newActiveStatus);
            ps.setLong(2, pkT05);
            int rows = ps.executeUpdate();

            if (rows == 0) {
                sendError(exchange, 404, "Staff account not found");
                return;
            }

            if (!newActiveStatus) {
                Security.invalidateUserSessions(pkT05);
            }

            sendSuccessMessage(exchange, "Account status updated successfully to: " + (newActiveStatus ? "ACTIVE" : "INACTIVE"));

        } catch (SQLException e) {
            throw new IOException("Database error updating staff status: " + e.getMessage(), e);
        }
    }

    /**
     * [職責] 提供供外判人員綁定之專案選項目錄
     */
    private void handleProjectOptions(HttpExchange exchange) throws IOException {
        String sql = "SELECT PK_T01, \"PJ_Code\", \"PJ_Name\" FROM \"T01_Projects\" ORDER BY \"PJ_Code\" ASC";
        StringBuilder json = new StringBuilder();
        json.append("{\"success\":true,\"projects\":[");

        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {

            boolean first = true;
            while (rs.next()) {
                if (!first) {
                    json.append(",");
                }
                first = false;

                long pkT01 = rs.getLong("PK_T01");
                String code = rs.getString("PJ_Code");
                String name = rs.getString("PJ_Name");

                json.append("{")
                    .append("\"pkT01\":").append(pkT01).append(",")
                    .append("\"pjCode\":\"").append(JsonUtil.escape(code != null ? code : "")).append("\",")
                    .append("\"pjName\":\"").append(JsonUtil.escape(name != null ? name : "")).append("\"")
                    .append("}");
            }
        } catch (SQLException e) {
            throw new IOException("Database error fetching project options: " + e.getMessage(), e);
        }

        json.append("]}");
        JsonUtil.sendJson(exchange, 200, json.toString());
    }

    private void sendSuccessMessage(HttpExchange exchange, String message) throws IOException {
        String json = "{"
                + "\"success\":true,"
                + "\"message\":\"" + JsonUtil.escape(message != null ? message : "") + "\""
                + "}";
        JsonUtil.sendJson(exchange, 200, json);
    }

    private void sendError(HttpExchange exchange, int statusCode, String message) throws IOException {
        String json = "{"
                + "\"success\":false,"
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