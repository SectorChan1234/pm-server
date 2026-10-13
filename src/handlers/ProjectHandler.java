package handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import common.DB;
import common.JsonUtil;
import common.ProjectRemarkLedger;
import common.Security;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

public class ProjectHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod().toUpperCase();
        String path = exchange.getRequestURI().getPath();

        if ("OPTIONS".equals(method)) {
            JsonUtil.sendJson(exchange, 204, "");
            return;
        }

        Security.UserSession user = Security.authenticate(exchange.getRequestHeaders().getFirst("Authorization"));
        if (user == null) {
            JsonUtil.sendError(exchange, 401, "UNAUTHORIZED", "Valid token required");
            return;
        }

        try {
            if ("GET".equals(method) && "/api/portal/project/list".equals(path)) {
                handleProjectList(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/project/detail".equals(path)) {
                handleProjectDetail(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/project/phases".equals(path)) {
                handleProjectPhases(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/project/create".equals(path)) {
                handleCreateProject(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/project/update".equals(path)) {
                handleUpdateProject(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/project/delete".equals(path)) {
                handleDeleteProject(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/project/check-access".equals(path)) {
                handleCheckProjectAccess(exchange, user);
            } else {
                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Endpoint not found in ProjectHandler");
            }
        } catch (Exception e) {
            e.printStackTrace();
            JsonUtil.sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    // ==========================================
    // 1. 專案清單與詳情 (解除 EndDate 硬限制，僅以 PR_ignore_delete 為準)
    // ==========================================
    private void handleProjectList(HttpExchange exchange, Security.UserSession user) throws Exception {
        try (Connection conn = DB.getConnection()) {
            String sql = "SELECT p.PK_T01, p.\"PJ_Code\", p.\"PJ_Name\", p.\"PJ_Status\", r.\"PR_Right\" AS MY_RIGHT " +
                         "FROM \"T01_Projects\" p " +
                         "JOIN \"T06_ProjectRoles\" r ON p.PK_T01 = r.FK_T06_PK_T01 " +
                         "WHERE r.FK_T06_PK_T05 = ? AND r.\"PR_ignore_delete\" = FALSE AND p.\"PJ_ignore_delete\" = FALSE " +
                         "ORDER BY p.\"PJ_Code\"";

            StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"data\":[");
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setLong(1, user.pkT05);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(",");
                        sb.append("{")
                          .append("\"pk_t01\":").append(rs.getInt("PK_T01")).append(",")
                          .append("\"pj_code\":\"").append(JsonUtil.escape(rs.getString("PJ_Code"))).append("\",")
                          .append("\"pj_name\":\"").append(JsonUtil.escape(rs.getString("PJ_Name"))).append("\",")
                          .append("\"pj_status\":\"").append(JsonUtil.escape(rs.getString("PJ_Status"))).append("\",")
                          .append("\"my_right\":\"").append(JsonUtil.escape(rs.getString("MY_RIGHT"))).append("\"")
                          .append("}");
                        first = false;
                    }
                }
            }
            sb.append("]}");
            JsonUtil.sendJson(exchange, 200, sb.toString());
        }
    }

    private void handleProjectDetail(HttpExchange exchange, Security.UserSession user) throws Exception {
        int pjId = extractQueryInt(exchange, "pj");
        if (pjId <= 0) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID (pj) is required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            if (!verifyProjectMember(conn, pjId, user.pkT05)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Unauthorized: You are not assigned to this project");
                return;
            }

            String myRight = getProjectRight(conn, pjId, user.pkT05);
            boolean isFullAdmin = "FULL".equalsIgnoreCase(myRight) || "ADMIN".equalsIgnoreCase(user.stRight);

            String sql = "SELECT * FROM \"T01_Projects\" WHERE PK_T01 = ? AND \"PJ_ignore_delete\" = FALSE";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, pjId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        java.sql.ResultSetMetaData meta = rs.getMetaData();
                        int colCount = meta.getColumnCount();

                        StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"my_right\":\"")
                                .append(JsonUtil.escape(myRight != null ? myRight : "VIEWER")).append("\",\"data\":{");

                        boolean firstField = true;
                        for (int i = 1; i <= colCount; i++) {
                            String colName = meta.getColumnLabel(i);

                            if ("PJ_Remark".equalsIgnoreCase(colName)) {
                                if (!firstField) sb.append(",");
                                String remarkVal = isFullAdmin ? rs.getString("PJ_Remark") : "";
                                sb.append("\"PJ_Remark\":").append(remarkVal == null ? "null" : "\"" + JsonUtil.escape(remarkVal) + "\"");
                                firstField = false;
                                continue;
                            }

                            String val = rs.getString(i);
                            if (!firstField) sb.append(",");
                            sb.append("\"").append(JsonUtil.escape(colName)).append("\":");
                            if (val == null) {
                                sb.append("null");
                            } else {
                                sb.append("\"").append(JsonUtil.escape(val)).append("\"");
                            }
                            firstField = false;
                        }
                        sb.append("}}");
                        JsonUtil.sendJson(exchange, 200, sb.toString());
                        return;
                    }
                }
            }
            JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Project not found");
        }
    }

    private void handleProjectPhases(HttpExchange exchange, Security.UserSession user) throws Exception {
        int pjId = extractQueryInt(exchange, "pj");
        if (pjId <= 0) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Parameter pj is required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            if (!verifyProjectMember(conn, pjId, user.pkT05)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Unauthorized to view project phases");
                return;
            }

            String sql = "SELECT PK_T02, \"PH_Name\", \"PH_Description\", \"PH_Status\", \"PH_Sequence\", \"PH_Frozen\" " +
                         "FROM \"T02_Phase\" " +
                         "WHERE FK_T02_PK_T01 = ? AND \"PH_ignore_delete\" = FALSE " +
                         "ORDER BY \"PH_Sequence\" ASC";

            StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"phases\":[");
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, pjId);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(",");
                        sb.append("{")
                          .append("\"pk_t02\":").append(rs.getInt("PK_T02")).append(",")
                          .append("\"ph_name\":\"").append(JsonUtil.escape(rs.getString("PH_Name"))).append("\",")
                          .append("\"ph_description\":\"").append(JsonUtil.escape(rs.getString("PH_Description"))).append("\",")
                          .append("\"ph_status\":\"").append(JsonUtil.escape(rs.getString("PH_Status"))).append("\",")
                          .append("\"ph_sequence\":").append(rs.getInt("PH_Sequence")).append(",")
                          .append("\"ph_frozen\":").append(rs.getBoolean("PH_Frozen"))
                          .append("}");
                        first = false;
                    }
                }
            }
            sb.append("]}");
            JsonUtil.sendJson(exchange, 200, sb.toString());
        }
    }

    // ==========================================
    // 2. 專案建立、更新與刪除
    // ==========================================
    private void handleCreateProject(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = JsonUtil.readBody(exchange);
        String code = JsonUtil.extractString(body, "pj_code");
        String name = JsonUtil.extractString(body, "pj_name");
        String desc = JsonUtil.extractString(body, "pj_description");

        if (code == null || code.trim().isEmpty() || name == null || name.trim().isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project Code and Name are required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            conn.setAutoCommit(false);
            try {
                String sqlPj = "INSERT INTO \"T01_Projects\" (\"PJ_Code\", \"PJ_Name\", \"PJ_Description\", \"PJ_Status\", \"PJ_CreatedDate\", \"PJ_ignore_delete\") " +
                               "VALUES (?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, FALSE)";
                long newPjId = -1;

                try (PreparedStatement ps = conn.prepareStatement(sqlPj, Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, code.trim());
                    ps.setString(2, name.trim());
                    ps.setString(3, desc == null ? "" : desc.trim());
                    ps.executeUpdate();

                    try (ResultSet rs = ps.getGeneratedKeys()) {
                        if (rs.next()) {
                            newPjId = rs.getLong(1);
                        }
                    }
                }

                String sqlRole = "INSERT INTO \"T06_ProjectRoles\" (FK_T06_PK_T01, FK_T06_PK_T05, \"PR_RoleType\", \"PR_Right\", \"PR_StartDate\", \"PR_ignore_delete\") " +
                                 "VALUES (?, ?, 'Project Leader', 'FULL', CURRENT_TIMESTAMP, FALSE)";
                try (PreparedStatement psRole = conn.prepareStatement(sqlRole)) {
                    psRole.setLong(1, newPjId);
                    psRole.setLong(2, user.pkT05);
                    psRole.executeUpdate();
                }

                String sqlPhase = "INSERT INTO \"T02_Phase\" (FK_T02_PK_T01, \"PH_Name\", \"PH_Description\", \"PH_Sequence\", \"PH_Status\", \"PH_Frozen\", \"PH_ignore_delete\") " +
                                  "VALUES (?, 'Phase 1 - Initiation', 'Initial project setup and planning', 1, 'In Progress', FALSE, FALSE)";
                try (PreparedStatement psPhase = conn.prepareStatement(sqlPhase)) {
                    psPhase.setLong(1, newPjId);
                    psPhase.executeUpdate();
                }

                ProjectRemarkLedger.append(conn, (int) newPjId, user, "PROJECT_CREATED", 
                    "[" + code.trim() + "] " + name.trim(), "Initial project establishment");

                conn.commit();
                JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\",\"pk_t01\":" + newPjId + "}");
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }
        }
    }

    private void handleUpdateProject(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = JsonUtil.readBody(exchange);
        Integer pjId = JsonUtil.extractInt(body, "pk_t01");
        String name = JsonUtil.extractString(body, "pj_name");
        String desc = JsonUtil.extractString(body, "pj_description");
        String status = JsonUtil.extractString(body, "pj_status");
        String soa = JsonUtil.extractString(body, "pj_soa");
        String contractNo = JsonUtil.extractString(body, "pj_contract_no");
        String qps = JsonUtil.extractString(body, "pj_qps");
        String folderLink = JsonUtil.extractString(body, "pj_folder_link");

        String targetStart = JsonUtil.extractString(body, "pj_target_start_date");
        String targetEnd = JsonUtil.extractString(body, "pj_target_end_date");
        String actualStart = JsonUtil.extractString(body, "pj_actual_start_date");
        String actualEnd = JsonUtil.extractString(body, "pj_actual_end_date");

        if (pjId == null || pjId <= 0 || name == null || name.trim().isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID and Name are required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            if (!verifyProjectFullRight(conn, pjId, user.pkT05)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Only members with FULL Project Role are allowed to edit project details");
                return;
            }

            String sql = "UPDATE \"T01_Projects\" SET " +
                         "\"PJ_Name\" = ?, \"PJ_Description\" = ?, \"PJ_Status\" = ?, " +
                         "PJ_SOA = ?, \"PJ_ContractNo\" = ?, PJ_QPS = ?, " +
                         "\"PJ_FolderLink\" = ?, " +
                         "\"PJ_TargetStartDate\" = ?, \"PJ_TargetEndDate\" = ?, " +
                         "\"PJ_ActualStartDate\" = ?, \"PJ_ActualEndDate\" = ? " +
                         "WHERE PK_T01 = ? AND \"PJ_ignore_delete\" = FALSE";

            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, name.trim());
                ps.setString(2, desc == null ? "" : desc.trim());
                ps.setString(3, status == null ? "ACTIVE" : status.trim());
                ps.setString(4, soa == null ? "" : soa.trim());
                ps.setString(5, contractNo == null ? "" : contractNo.trim());
                ps.setString(6, qps == null ? "" : qps.trim());
                ps.setString(7, folderLink == null ? "" : folderLink.trim());

                JsonUtil.setTimestampSafely(ps, 8, targetStart);
                JsonUtil.setTimestampSafely(ps, 9, targetEnd);
                JsonUtil.setTimestampSafely(ps, 10, actualStart);
                JsonUtil.setTimestampSafely(ps, 11, actualEnd);

                ps.setInt(12, pjId);
                ps.executeUpdate();
            }
            JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\"}");
        }
    }

    private void handleDeleteProject(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = JsonUtil.readBody(exchange);
        Integer pjId = JsonUtil.extractInt(body, "pk_t01");
        String reason = JsonUtil.extractString(body, "reason");

        if (pjId == null || pjId <= 0 || reason == null || reason.trim().isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID and Deletion Reason are required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            if (!verifyProjectFullRight(conn, pjId, user.pkT05) && !"ADMIN".equalsIgnoreCase(user.stRight)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Only project leaders with FULL role can mark a project as deleted");
                return;
            }

            conn.setAutoCommit(false);
            try {
                String querySql = "SELECT \"PJ_Code\", \"PJ_Name\" FROM \"T01_Projects\" WHERE PK_T01 = ? AND \"PJ_ignore_delete\" = FALSE";
                String currentCode = null, pjName = null;
                try (PreparedStatement psQuery = conn.prepareStatement(querySql)) {
                    psQuery.setInt(1, pjId);
                    try (ResultSet rs = psQuery.executeQuery()) {
                        if (rs.next()) {
                            currentCode = rs.getString("PJ_Code");
                            pjName = rs.getString("PJ_Name");
                        }
                    }
                }

                if (currentCode == null) {
                    conn.rollback();
                    JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Project not found or already deleted");
                    return;
                }

                ProjectRemarkLedger.append(conn, pjId, user, "PROJECT_SOFT_DELETE", 
                    "[" + currentCode + "] " + pjName, reason);

                String suffix = "#D" + (System.currentTimeMillis() / 1000L);
                String baseCode = currentCode.length() > 38 ? currentCode.substring(0, 38) : currentCode;
                String deletedCode = baseCode + suffix;

                String updateSql = "UPDATE \"T01_Projects\" SET \"PJ_ignore_delete\" = TRUE, \"PJ_Code\" = ? WHERE PK_T01 = ?";
                try (PreparedStatement psUpdate = conn.prepareStatement(updateSql)) {
                    psUpdate.setString(1, deletedCode);
                    psUpdate.setInt(2, pjId);
                    psUpdate.executeUpdate();
                }

                conn.commit();
                JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\"}");
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }
        }
    }

    // ==========================================
    // 3. 專案存取權限核驗函式 (解除 EndDate 硬條件)
    // ==========================================
    public static boolean verifyProjectMember(Connection conn, int pjId, long staffId) throws Exception {
        String sql = "SELECT COUNT(*) FROM \"T06_ProjectRoles\" " +
                     "WHERE FK_T06_PK_T01 = ? AND FK_T06_PK_T05 = ? AND \"PR_ignore_delete\" = FALSE";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, pjId);
            ps.setLong(2, staffId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    public static boolean verifyProjectFullRight(Connection conn, int pjId, long staffId) throws Exception {
        String sql = "SELECT COUNT(*) FROM \"T06_ProjectRoles\" " +
                     "WHERE FK_T06_PK_T01 = ? AND FK_T06_PK_T05 = ? AND \"PR_Right\" = 'FULL' AND \"PR_ignore_delete\" = FALSE";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, pjId);
            ps.setLong(2, staffId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    public static String getProjectRight(Connection conn, int pjId, long staffId) throws Exception {
        String sql = "SELECT \"PR_Right\" FROM \"T06_ProjectRoles\" " +
                     "WHERE FK_T06_PK_T01 = ? AND FK_T06_PK_T05 = ? AND \"PR_ignore_delete\" = FALSE";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, pjId);
            ps.setLong(2, staffId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getString("PR_Right");
                }
            }
        }
        return null;
    }

    private void handleCheckProjectAccess(HttpExchange exchange, Security.UserSession user) throws Exception {
        int pjId = extractQueryInt(exchange, "pj");
        if (pjId <= 0) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID is required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            String sqlCheckPj = "SELECT \"PJ_Code\", \"PJ_Name\" FROM \"T01_Projects\" WHERE PK_T01 = ? AND \"PJ_ignore_delete\" = FALSE";
            String pjCode = null, pjName = null;
            try (PreparedStatement ps = conn.prepareStatement(sqlCheckPj)) {
                ps.setInt(1, pjId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        pjCode = rs.getString("PJ_Code");
                        pjName = rs.getString("PJ_Name");
                    }
                }
            }

            if (pjCode == null) {
                JsonUtil.sendJson(exchange, 200, "{\"status\":\"NOT_FOUND\",\"message\":\"Project not found (ID: " + pjId + ")\"}");
                return;
            }

            boolean hasAccess = verifyProjectMember(conn, pjId, user.pkT05);
            if (!hasAccess) {
                JsonUtil.sendJson(exchange, 200, "{\"status\":\"FORBIDDEN\",\"message\":\"Access denied: You are not assigned to project [" + pjCode + "] " + JsonUtil.escape(pjName) + "\"}");
            } else {
                JsonUtil.sendJson(exchange, 200, "{\"status\":\"AUTHORIZED\"}");
            }
        }
    }

    private int extractQueryInt(HttpExchange exchange, String key) {
        String query = exchange.getRequestURI().getQuery();
        if (query != null) {
            for (String param : query.split("&")) {
                String[] pair = param.split("=");
                if (pair.length == 2 && key.equals(pair[0])) {
                    try {
                        return Integer.parseInt(pair[1]);
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        return -1;
    }
}