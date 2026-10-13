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

public class AuthHandler implements HttpHandler {

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

        String body = readBody(exchange);

        try {
            switch (path) {
                case "/api/auth/login":
                    handleLogin(exchange, body);
                    break;
                case "/api/auth/verify-password":
                    handleVerifyPassword(exchange, body);
                    break;
                case "/api/auth/change-password":
                    handleChangePassword(exchange, body);
                    break;
                case "/api/auth/admin-set-password":
                    handleAdminSetPassword(exchange, body);
                    break;
                default:
                    JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Endpoint not found");
            }
        } catch (Exception e) {
            e.printStackTrace();
            JsonUtil.sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    // ==========================================
    // 1. 使用者登入驗證
    // ==========================================
    private void handleLogin(HttpExchange exchange, String body) throws Exception {
        String email = extractJsonField(body, "email");
        String password = extractJsonField(body, "password");
        String passwordHash = extractJsonField(body, "password_hash");

        // 若前端傳入明文 password，由後端 Security.sha256 統一執行標準雜湊；若傳入 password_hash 亦向下相容
        String finalHash = null;
        if (password != null && !password.isEmpty()) {
            finalHash = Security.sha256(password);
        } else if (passwordHash != null && !passwordHash.isEmpty()) {
            finalHash = passwordHash;
        }

        if (email == null || finalHash == null) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Missing email or password");
            return;
        }

        email = email.trim();
        // 彈性相容公務電郵 domain
        if (!email.toLowerCase().endsWith("@swd.gov.hk") && !email.contains("@")) {
            email = email + "@swd.gov.hk";
        }

        try (Connection conn = DB.getConnection()) {
            String sqlStaff = "SELECT \"PK_T05\", \"ST_Email\", \"ST_Name\", \"ST_NickName\", \"ST_Rank\", \"ST_Post\", \"ST_Right\" " +
                              "FROM \"T05_Staff\" " +
                              "WHERE LOWER(\"ST_Email\") = LOWER(?) AND LOWER(\"ST_password_hash\") = LOWER(?) AND \"ST_IsActive\" = TRUE";

            long pkT05 = -1;
            String name = null, nickname = null, rank = null, post = null, stRight = null;

            try (PreparedStatement ps = conn.prepareStatement(sqlStaff)) {
                ps.setString(1, email);
                ps.setString(2, finalHash);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        pkT05 = rs.getLong("PK_T05");
                        email = rs.getString("ST_Email");
                        name = rs.getString("ST_Name");
                        nickname = rs.getString("ST_NickName");
                        rank = rs.getString("ST_Rank");
                        post = rs.getString("ST_Post");
                        stRight = rs.getString("ST_Right");
                    }
                }
            }

            if (pkT05 == -1) {
                JsonUtil.sendError(exchange, 401, "INVALID_CREDENTIALS", "帳號或密碼錯誤");
                return;
            }

            // 查詢同仁專案權限 (T06_ProjectRoles)
            StringBuilder roleJson = new StringBuilder("{");
            String sqlRoles = "SELECT \"FK_T06_PK_T01\", \"PR_Right\" FROM \"T06_ProjectRoles\" " +
                              "WHERE \"FK_T06_PK_T05\" = ? AND \"PR_ignore_delete\" = FALSE " +
                              "  AND (\"PR_EndDate\" IS NULL OR \"PR_EndDate\" >= CURRENT_TIMESTAMP)";
            try (PreparedStatement ps = conn.prepareStatement(sqlRoles)) {
                ps.setLong(1, pkT05);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) roleJson.append(",");
                        roleJson.append("\"").append(rs.getLong("FK_T06_PK_T01")).append("\":\"")
                                .append(rs.getString("PR_Right")).append("\"");
                        first = false;
                    }
                }
            }
            roleJson.append("}");

            Security.UserSession session = new Security.UserSession(pkT05, email, name, stRight);
            String token = Security.generateToken(session);

            String resp = "{"
                + "\"status\":\"SUCCESS\","
                + "\"token\":\"" + token + "\","
                + "\"user\":{"
                + "\"pk_t05\":" + pkT05 + ","
                + "\"email\":\"" + email + "\","
                + "\"name\":\"" + name + "\","
                + "\"nickname\":\"" + (nickname == null ? "" : nickname) + "\","
                + "\"rank\":\"" + (rank == null ? "" : rank) + "\","
                + "\"post\":\"" + (post == null ? "" : post) + "\","
                + "\"st_right\":\"" + (stRight == null ? "" : stRight) + "\""
                + "},"
                + "\"project_roles\":" + roleJson.toString()
                + "}";

            JsonUtil.sendJson(exchange, 200, resp);
        }
    }

    // ==========================================
    // 2. 驗證現有密碼
    // ==========================================
    private void handleVerifyPassword(HttpExchange exchange, String body) throws Exception {
        Security.UserSession user = Security.authenticate(exchange.getRequestHeaders().getFirst("Authorization"));
        if (user == null) {
            JsonUtil.sendError(exchange, 401, "UNAUTHORIZED", "Valid token required");
            return;
        }

        String password = extractJsonField(body, "password");
        String passwordHash = extractJsonField(body, "password_hash");
        String finalHash = (password != null && !password.isEmpty()) ? Security.sha256(password) : passwordHash;

        if (finalHash == null) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Missing password");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            String sql = "SELECT COUNT(*) FROM \"T05_Staff\" WHERE \"PK_T05\" = ? AND LOWER(\"ST_password_hash\") = LOWER(?) AND \"ST_IsActive\" = TRUE";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setLong(1, user.pkT05);
                ps.setString(2, finalHash);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next() && rs.getInt(1) > 0) {
                        JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\"}");
                        return;
                    }
                }
            }
        }
        JsonUtil.sendError(exchange, 400, "INVALID_PASSWORD", "Password verification failed");
    }

    // ==========================================
    // 3. 使用者自行修改密碼
    // ==========================================
    private void handleChangePassword(HttpExchange exchange, String body) throws Exception {
        Security.UserSession user = Security.authenticate(exchange.getRequestHeaders().getFirst("Authorization"));
        if (user == null) {
            JsonUtil.sendError(exchange, 401, "UNAUTHORIZED", "Valid token required");
            return;
        }

        String oldPass = extractJsonField(body, "old_password");
        String newPass = extractJsonField(body, "new_password");
        String oldHash = (oldPass != null && !oldPass.isEmpty()) ? Security.sha256(oldPass) : extractJsonField(body, "old_password_hash");
        String newHash = (newPass != null && !newPass.isEmpty()) ? Security.sha256(newPass) : extractJsonField(body, "new_password_hash");

        if (oldHash == null || newHash == null) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Both old and new password required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            String sqlVerify = "SELECT COUNT(*) FROM \"T05_Staff\" WHERE \"PK_T05\" = ? AND LOWER(\"ST_password_hash\") = LOWER(?)";
            try (PreparedStatement ps = conn.prepareStatement(sqlVerify)) {
                ps.setLong(1, user.pkT05);
                ps.setString(2, oldHash);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next() || rs.getInt(1) == 0) {
                        JsonUtil.sendError(exchange, 400, "OLD_PASSWORD_MISMATCH", "舊密碼不相符");
                        return;
                    }
                }
            }

            String sqlUpdate = "UPDATE \"T05_Staff\" SET \"ST_password_hash\" = ? WHERE \"PK_T05\" = ?";
            try (PreparedStatement ps = conn.prepareStatement(sqlUpdate)) {
                ps.setString(1, newHash);
                ps.setLong(2, user.pkT05);
                ps.executeUpdate();
            }
            JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\"}");
        }
    }

    // ==========================================
    // 4. 管理員後台為員工指派/重設密碼
    // ==========================================
    private void handleAdminSetPassword(HttpExchange exchange, String body) throws Exception {
        Security.UserSession user = Security.authenticate(exchange.getRequestHeaders().getFirst("Authorization"));
        if (user == null || !"ADMIN".equalsIgnoreCase(user.stRight)) {
            JsonUtil.sendError(exchange, 403, "FORBIDDEN", "需要管理員 (ADMIN) 權限");
            return;
        }

        Integer staffId = extractJsonInt(body, "staff_id");
        String plainPassword = extractJsonField(body, "password");

        if (staffId == null || plainPassword == null || plainPassword.trim().isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "缺少 staff_id 或 password");
            return;
        }

        // 統一由 Java 後端執行標準 SHA-256 雜湊
        String standardHash = Security.sha256(plainPassword.trim());

        try (Connection conn = DB.getConnection()) {
            String sql = "UPDATE \"T05_Staff\" SET \"ST_password_hash\" = ?, \"ST_IsActive\" = TRUE, \"ST_ActiveDate\" = CURRENT_TIMESTAMP WHERE \"PK_T05\" = ?";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, standardHash);
                ps.setInt(2, staffId);
                int updated = ps.executeUpdate();
                if (updated > 0) {
                    JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\"}");
                } else {
                    JsonUtil.sendError(exchange, 404, "NOT_FOUND", "找不到指定的員工 ID");
                }
            }
        }
    }

    // ==========================================
    // 內部解析工具
    // ==========================================
    private String readBody(HttpExchange exchange) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            return sb.toString();
        }
    }

    private String extractJsonField(String json, String field) {
        String pattern = "\"" + field + "\"\\s*:\\s*\"([^\"]*)\"";
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(pattern).matcher(json);
        if (m.find()) return m.group(1);
        return null;
    }

    private Integer extractJsonInt(String json, String field) {
        String pattern = "\"" + field + "\"\\s*:\\s*(\\d+)";
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(pattern).matcher(json);
        if (m.find()) return Integer.parseInt(m.group(1));
        return null;
    }
}