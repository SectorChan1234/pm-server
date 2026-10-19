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
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 身分認證與會話處理器 (Authentication & Access Control Handler)
 *
 * 職責與邊界：
 * 1. 處理 Portal 登入 (/api/auth/login)、後台管理員登入 (/api/auth/admin-login) 與登出 (/api/auth/logout)。
 * 2. 實作內部同仁與外判人員 (FK_T05_PK_T01_CUSTOM) 登入狀態機，支援外判身分之次級 PJ_Code 動態驗證。
 * 3. 嚴格執行 Salted SHA-256 身分校驗，徹底移除舊版無鹽雜湊過渡相容與無感升級代碼。
 * 4. 支援當前使用者狀態獲取 (/api/auth/me) 與使用者自主變更密碼 (/api/auth/change-password)。
 * 5. 全面使用嚴格轉義雙引號 (\"T05_Staff\", \"T01_Projects\") 對齊 H2 Schema 定義。
 */
public class AuthHandler implements HttpHandler {

    private static class StaffCandidate {
        long pkT05;
        String email;
        String name;
        String passwordHash;
        String stRight;
        boolean isActive;
        long fkT05PkT01Custom;
    }

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

        String path = exchange.getRequestURI().getPath();
        try {
            switch (path) {
                case "/api/auth/login":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleLogin(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/auth/admin-login":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleAdminLogin(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/auth/logout":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleLogout(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/auth/me":
                    if ("GET".equalsIgnoreCase(method)) {
                        handleMe(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/auth/change-password":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleChangePassword(exchange);
                    } else {
                        sendError(exchange, 405, "Method Not Allowed");
                    }
                    break;
                default:
                    sendError(exchange, 404, "Auth endpoint not found");
                    break;
            }
        } catch (Exception e) {
            e.printStackTrace();
            String detail = e.getMessage() != null ? e.getMessage() : e.toString();
            if (e.getCause() != null && e.getCause().getMessage() != null) {
                detail += " -> Caused by: " + e.getCause().getMessage();
            }
            sendError(exchange, 500, "Internal server error: " + detail);
        }
    }

    private void handleLogin(HttpExchange exchange) throws IOException {
        String body = readBody(exchange);
        String email = extractJsonField(body, "email").trim().toLowerCase();
        String password = extractJsonField(body, "password");
        String projectCode = extractJsonField(body, "projectCode").trim();

        if (email.isEmpty() || password.isEmpty()) {
            sendError(exchange, 400, "Email and password are required");
            return;
        }

        List<StaffCandidate> candidates = queryStaffByEmail(email);
        if (candidates.isEmpty()) {
            sendError(exchange, 401, "Invalid email or password");
            return;
        }

        StaffCandidate matchedStaff = null;

        if (candidates.size() == 1) {
            matchedStaff = candidates.get(0);
        } else {
            if (projectCode.isEmpty()) {
                sendRequireProjectCode(exchange);
                return;
            }

            long targetPkT01 = queryProjectIdByCode(projectCode);
            if (targetPkT01 <= 0) {
                sendError(exchange, 401, "Invalid Project Code or credentials");
                return;
            }

            for (StaffCandidate candidate : candidates) {
                if (candidate.fkT05PkT01Custom == targetPkT01) {
                    matchedStaff = candidate;
                    break;
                }
            }

            if (matchedStaff == null) {
                sendError(exchange, 401, "No contractor account associated with the specified Project Code");
                return;
            }
        }

        boolean isValid = Security.verifyPassword(password, matchedStaff.passwordHash);
        if (!isValid) {
            sendError(exchange, 401, "Invalid email or password");
            return;
        }

        UserSession session = new UserSession(
                matchedStaff.pkT05,
                matchedStaff.email,
                matchedStaff.name,
                matchedStaff.stRight,
                matchedStaff.fkT05PkT01Custom
        );
        String token = Security.generateToken(session);

        sendLoginSuccess(exchange, token, matchedStaff);
    }

    private void handleAdminLogin(HttpExchange exchange) throws IOException {
        String body = readBody(exchange);
        String email = extractJsonField(body, "email").trim().toLowerCase();
        String password = extractJsonField(body, "password");

        if (email.isEmpty() || password.isEmpty()) {
            sendError(exchange, 400, "Email and password are required");
            return;
        }

        List<StaffCandidate> candidates = queryStaffByEmail(email);
        StaffCandidate adminCandidate = null;

        for (StaffCandidate candidate : candidates) {
            if ("ADMIN".equalsIgnoreCase(candidate.stRight) && candidate.fkT05PkT01Custom == 0) {
                adminCandidate = candidate;
                break;
            }
        }

        if (adminCandidate == null) {
            sendError(exchange, 401, "Administrative account not found or access denied");
            return;
        }

        boolean isValid = Security.verifyPassword(password, adminCandidate.passwordHash);
        if (!isValid) {
            sendError(exchange, 401, "Invalid administrative credentials");
            return;
        }

        UserSession session = new UserSession(
                adminCandidate.pkT05,
                adminCandidate.email,
                adminCandidate.name,
                adminCandidate.stRight,
                0L
        );
        String token = Security.generateToken(session);

        sendAdminLoginSuccess(exchange, token, adminCandidate);
    }

    private void handleLogout(HttpExchange exchange) throws IOException {
        Security.invalidateToken(exchange);
        sendSuccessMessage(exchange, "Logged out successfully");
    }

    private void handleMe(HttpExchange exchange) throws IOException {
        UserSession session = Security.authenticate(exchange);
        if (session == null) {
            sendError(exchange, 401, "Unauthorized session");
            return;
        }

        String json = "{"
                + "\"success\":true,"
                + "\"status\":\"SUCCESS\","
                + "\"user\":{"
                + "\"pkT05\":" + session.pkT05 + ","
                + "\"pk_t05\":" + session.pkT05 + ","
                + "\"email\":\"" + JsonUtil.escape(session.email) + "\","
                + "\"name\":\"" + JsonUtil.escape(session.name) + "\","
                + "\"stRight\":\"" + JsonUtil.escape(session.stRight) + "\","
                + "\"st_right\":\"" + JsonUtil.escape(session.stRight) + "\","
                + "\"fkT05PkT01Custom\":" + session.fkT05PkT01Custom
                + "}"
                + "}";
        JsonUtil.sendJson(exchange, 200, json);
    }

    private void handleChangePassword(HttpExchange exchange) throws IOException {
        UserSession session = Security.authenticate(exchange);
        if (session == null) {
            sendError(exchange, 401, "Unauthorized session");
            return;
        }

        String body = readBody(exchange);
        // 雙向相容駝峰與底線命名 (portal.js 使用 old_password / new_password)
        String oldPassword = extractJsonField(body, "oldPassword");
        if (oldPassword.isEmpty()) {
            oldPassword = extractJsonField(body, "old_password");
        }
        String newPassword = extractJsonField(body, "newPassword");
        if (newPassword.isEmpty()) {
            newPassword = extractJsonField(body, "new_password");
        }

        if (oldPassword.isEmpty() || newPassword.isEmpty()) {
            sendError(exchange, 400, "Old password and new password are required");
            return;
        }

        if (newPassword.length() < 6) {
            sendError(exchange, 400, "New password must be at least 6 characters long");
            return;
        }

        String currentStoredHash = null;
        String querySql = "SELECT \"ST_password_hash\" FROM \"T05_Staff\" WHERE PK_T05 = ? AND \"ST_IsActive\" = TRUE";

        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(querySql)) {
            ps.setLong(1, session.pkT05);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    currentStoredHash = rs.getString("ST_password_hash");
                }
            }
        } catch (SQLException e) {
            throw new IOException("Database error fetching current password hash: " + e.getMessage(), e);
        }

        if (currentStoredHash == null || !Security.verifyPassword(oldPassword, currentStoredHash)) {
            sendError(exchange, 400, "Incorrect current password");
            return;
        }

        String newSaltedHash = Security.hashPassword(newPassword);
        String updateSql = "UPDATE \"T05_Staff\" SET \"ST_password_hash\" = ? WHERE PK_T05 = ?";

        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(updateSql)) {
            ps.setString(1, newSaltedHash);
            ps.setLong(2, session.pkT05);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IOException("Database error updating password hash: " + e.getMessage(), e);
        }

        Security.invalidateUserSessions(session.pkT05);
        sendSuccessMessage(exchange, "Password changed successfully. Please log in again.");
    }

    /**
     * [職責] 根據 Email 檢索人員記錄，全面使用嚴格轉義引號對齊 Schema
     */
    private List<StaffCandidate> queryStaffByEmail(String email) throws IOException {
        List<StaffCandidate> list = new ArrayList<>();
        String sql = "SELECT PK_T05, \"ST_Email\", \"ST_Name\", \"ST_password_hash\", \"ST_Right\", \"ST_IsActive\", " +
                     "       COALESCE(FK_T05_PK_T01_CUSTOM, 0) AS FK_T05_PK_T01_CUSTOM " +
                     "FROM \"T05_Staff\" " +
                     "WHERE LOWER(TRIM(\"ST_Email\")) = ? AND \"ST_IsActive\" = TRUE";

        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    StaffCandidate c = new StaffCandidate();
                    c.pkT05 = rs.getLong("PK_T05");
                    c.email = rs.getString("ST_Email");
                    c.name = rs.getString("ST_Name");
                    c.passwordHash = rs.getString("ST_password_hash");
                    c.stRight = rs.getString("ST_Right");
                    c.isActive = rs.getBoolean("ST_IsActive");
                    c.fkT05PkT01Custom = rs.getLong("FK_T05_PK_T01_CUSTOM");
                    list.add(c);
                }
                return list;
            }
        } catch (SQLException e) {
            throw new IOException("Database query failed for staff candidates: " + e.getMessage(), e);
        }
    }

    /**
     * [職責] 根據專案代碼檢索專案主鍵，使用 \"T01_Projects\" 與 \"PJ_Code\"
     */
    private long queryProjectIdByCode(String projectCode) throws IOException {
        String sql = "SELECT PK_T01 FROM \"T01_Projects\" WHERE UPPER(TRIM(\"PJ_Code\")) = ?";
        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, projectCode.toUpperCase().trim());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getLong("PK_T01");
                }
            }
        } catch (SQLException e) {
            throw new IOException("Database query failed for project code: " + projectCode + ": " + e.getMessage(), e);
        }
        return 0L;
    }

    private void sendLoginSuccess(HttpExchange exchange, String token, StaffCandidate staff) throws IOException {
        String json = "{"
                + "\"success\":true,"
                + "\"status\":\"SUCCESS\","
                + "\"token\":\"" + JsonUtil.escape(token) + "\","
                + "\"user\":{"
                + "\"pkT05\":" + staff.pkT05 + ","
                + "\"pk_t05\":" + staff.pkT05 + ","
                + "\"email\":\"" + JsonUtil.escape(staff.email) + "\","
                + "\"name\":\"" + JsonUtil.escape(staff.name) + "\","
                + "\"stRight\":\"" + JsonUtil.escape(staff.stRight) + "\","
                + "\"st_right\":\"" + JsonUtil.escape(staff.stRight) + "\","
                + "\"fkT05PkT01Custom\":" + staff.fkT05PkT01Custom
                + "}"
                + "}";
        JsonUtil.sendJson(exchange, 200, json);
    }

    private void sendAdminLoginSuccess(HttpExchange exchange, String token, StaffCandidate admin) throws IOException {
        String json = "{"
                + "\"success\":true,"
                + "\"status\":\"SUCCESS\","
                + "\"token\":\"" + JsonUtil.escape(token) + "\","
                + "\"admin\":{"
                + "\"pkT05\":" + admin.pkT05 + ","
                + "\"pk_t05\":" + admin.pkT05 + ","
                + "\"email\":\"" + JsonUtil.escape(admin.email) + "\","
                + "\"name\":\"" + JsonUtil.escape(admin.name) + "\","
                + "\"stRight\":\"" + JsonUtil.escape(admin.stRight) + "\","
                + "\"st_right\":\"" + JsonUtil.escape(admin.stRight) + "\""
                + "}"
                + "}";
        JsonUtil.sendJson(exchange, 200, json);
    }

    private void sendRequireProjectCode(HttpExchange exchange) throws IOException {
        String json = "{"
                + "\"success\":false,"
                + "\"status\":\"FAILED\","
                + "\"requireProjectCode\":true,"
                + "\"code\":\"REQUIRE_PROJECT_CODE\","
                + "\"message\":\"Project Code is required for contractor profile\""
                + "}";
        JsonUtil.sendJson(exchange, 200, json);
    }

    private void sendSuccessMessage(HttpExchange exchange, String message) throws IOException {
        String json = "{"
                + "\"success\":true,"
                + "\"status\":\"SUCCESS\","
                + "\"message\":\"" + JsonUtil.escape(message != null ? message : "") + "\""
                + "}";
        JsonUtil.sendJson(exchange, 200, json);
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