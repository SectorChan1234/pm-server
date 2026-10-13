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

public class PhaseHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod().toUpperCase();
        String path = exchange.getRequestURI().getPath();

        // 統一 CORS OPTIONS 預檢處理
        if ("OPTIONS".equals(method)) {
            JsonUtil.sendJson(exchange, 204, "");
            return;
        }

        // 統一驗證 Token
        Security.UserSession user = Security.authenticate(exchange.getRequestHeaders().getFirst("Authorization"));
        if (user == null) {
            JsonUtil.sendError(exchange, 401, "UNAUTHORIZED", "Valid token required");
            return;
        }

        try {
            if ("GET".equals(method) && "/api/portal/phase/list".equals(path)) {
                handlePhaseList(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/phase/refs".equals(path)) {
                handlePhaseRefs(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/phase/save".equals(path)) {
                handleSavePhase(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/phase/ref/create-custom".equals(path)) {
                handleCreateCustomRef(exchange, user);
            } else {
                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Endpoint not found");
            }
        } catch (Exception e) {
            e.printStackTrace();
            JsonUtil.sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    // ==========================================================================
    // 1. 查詢專案階段清單 (校驗使用者專案成員資格)
    // ==========================================================================
    private void handlePhaseList(HttpExchange exchange, Security.UserSession user) throws Exception {
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

            String sql = "SELECT PK_T02, \"PH_Name\", \"PH_Description\", \"PH_Status\", \"PH_Sequence\", " +
                         "       \"PH_FolderLink\", \"PH_TargetStartDate\", \"PH_TargetEndDate\", " +
                         "       \"PH_ActualStartDate\", \"PH_ActualEndDate\", \"PH_Frozen\", " +
                         "       \"PH_FrozenDateTime\", \"PH_CreatedDate\", \"PH_ignore_delete\" " +
                         "FROM \"T02_Phase\" " +
                         "WHERE FK_T02_PK_T01 = ? " +
                         "ORDER BY \"PH_ignore_delete\" ASC, \"PH_Sequence\" ASC";

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
                          .append("\"ph_folder_link\":\"").append(JsonUtil.escape(rs.getString("PH_FolderLink"))).append("\",")
                          .append("\"ph_target_start\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_TargetStartDate"))).append("\",")
                          .append("\"ph_target_end\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_TargetEndDate"))).append("\",")
                          .append("\"ph_actual_start\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_ActualStartDate"))).append("\",")
                          .append("\"ph_actual_end\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_ActualEndDate"))).append("\",")
                          .append("\"ph_frozen\":").append(rs.getBoolean("PH_Frozen")).append(",")
                          .append("\"ph_frozen_date\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_FrozenDateTime"))).append("\",")
                          .append("\"ph_created_date\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_CreatedDate"))).append("\",")
                          .append("\"ph_ignore_delete\":").append(rs.getBoolean("PH_ignore_delete"))
                          .append("}");
                        first = false;
                    }
                }
            }
            sb.append("]}");
            JsonUtil.sendJson(exchange, 200, sb.toString());
        }
    }

    // ==========================================================================
    // 2. 儲存階段 (建立/更新/凍結/軟刪除 + PJ_Remark 審計連動)
    // ==========================================================================
    private void handleSavePhase(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = JsonUtil.readBody(exchange);
        Integer pkT02 = JsonUtil.extractInt(body, "pk_t02");
        Integer pjId = JsonUtil.extractInt(body, "fk_t01");
        String name = JsonUtil.extractString(body, "ph_name");
        String desc = JsonUtil.extractString(body, "ph_description");
        String status = JsonUtil.extractString(body, "ph_status");
        Integer seq = JsonUtil.extractInt(body, "ph_sequence");
        int finalSeq = (seq != null && seq >= 0) ? seq : 1;
        String folder = JsonUtil.extractString(body, "ph_folder_link");
        Boolean frozen = JsonUtil.extractBool(body, "ph_frozen");
        Boolean ignoreDelete = JsonUtil.extractBool(body, "ph_ignore_delete");
        String auditReason = JsonUtil.extractString(body, "audit_reason");

        String targetStart = JsonUtil.extractString(body, "ph_target_start");
        String targetEnd = JsonUtil.extractString(body, "ph_target_end");
        String actualStart = JsonUtil.extractString(body, "ph_actual_start");
        String actualEnd = JsonUtil.extractString(body, "ph_actual_end");

        if (pjId == null || pjId <= 0 || name == null || name.trim().isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID and Phase Name are required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            if (!verifyProjectFullRight(conn, pjId, user.pkT05)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Only members with FULL Project Role are allowed to manage phases");
                return;
            }

            conn.setAutoCommit(false);
            try {
                boolean isEdit = (pkT02 != null && pkT02 > 0);
                boolean isFrozen = (frozen != null && frozen);
                boolean isDelete = (ignoreDelete != null && ignoreDelete);

                if (isEdit) {
                    // 查驗原狀態以判定審計
                    String originSql = "SELECT \"PH_Frozen\", \"PH_ignore_delete\", \"PH_Sequence\", \"PH_Name\" " +
                                       "FROM \"T02_Phase\" WHERE PK_T02 = ? AND FK_T02_PK_T01 = ?";
                    boolean prevFrozen = false, prevDelete = false;
                    String originTitle = "Phase #" + pkT02;
					//凍結防護，若 Phase 原本已凍結且請求中未解凍（frozen 依然為 true），禁止任何修改
					
					if (prevFrozen && isFrozen) {
									conn.rollback();
									JsonUtil.sendError(exchange, 403, "PHASE_FROZEN", "Operation Rejected: This phase is frozen and cannot be modified. Please unfreeze it first.");
									return;
					}
                    try (PreparedStatement psOrg = conn.prepareStatement(originSql)) {
                        psOrg.setInt(1, pkT02);
                        psOrg.setInt(2, pjId);
                        try (ResultSet rsOrg = psOrg.executeQuery()) {
                            if (rsOrg.next()) {
                                prevFrozen = rsOrg.getBoolean("PH_Frozen");
                                prevDelete = rsOrg.getBoolean("PH_ignore_delete");
                                originTitle = "P" + rsOrg.getInt("PH_Sequence") + ". " + rsOrg.getString("PH_Name");
                            } else {
                                conn.rollback();
                                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Target phase not found");
                                return;
                            }
                        }
                    }

                    // 審計連動 1：軟刪除 / 復原
                    if (!prevDelete && isDelete) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when marking a Phase as deleted");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, pjId, user, "PHASE_SOFT_DELETE", originTitle, auditReason);
                    } else if (prevDelete && !isDelete) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when restoring a Phase");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, pjId, user, "PHASE_RESTORED", originTitle, auditReason);
                    }

                    // 審計連動 2：凍結 / 解凍
                    if (!prevFrozen && isFrozen) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when freezing a Phase");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, pjId, user, "PHASE_FROZEN", originTitle, auditReason);
                    } else if (prevFrozen && !isFrozen) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when unfreezing a Phase");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, pjId, user, "PHASE_UNFROZEN", originTitle, auditReason);
                    }

                    String updateSql = "UPDATE \"T02_Phase\" SET " +
                                      "\"PH_Name\" = ?, \"PH_Description\" = ?, \"PH_Status\" = ?, \"PH_Sequence\" = ?, " +
                                      "\"PH_FolderLink\" = ?, \"PH_TargetStartDate\" = ?, \"PH_TargetEndDate\" = ?, " +
                                      "\"PH_ActualStartDate\" = ?, \"PH_ActualEndDate\" = ?, \"PH_Frozen\" = ?, " +
                                      "\"PH_FrozenDateTime\" = CASE " +
                                      "    WHEN ? = TRUE AND \"PH_Frozen\" = FALSE THEN CURRENT_TIMESTAMP " +
                                      "    WHEN ? = FALSE THEN NULL " +
                                      "    ELSE \"PH_FrozenDateTime\" END, " +
                                      "\"PH_ignore_delete\" = ? " +
                                      "WHERE PK_T02 = ? AND FK_T02_PK_T01 = ?";
                    try (PreparedStatement ps = conn.prepareStatement(updateSql)) {
                        ps.setString(1, name.trim());
                        ps.setString(2, desc != null ? desc.trim() : "");
                        ps.setString(3, status != null ? status.trim() : "Planning");
                        ps.setInt(4, finalSeq);
                        ps.setString(5, folder != null ? folder.trim() : "");
                        JsonUtil.setTimestampSafely(ps, 6, targetStart);
                        JsonUtil.setTimestampSafely(ps, 7, targetEnd);
                        JsonUtil.setTimestampSafely(ps, 8, actualStart);
                        JsonUtil.setTimestampSafely(ps, 9, actualEnd);
                        ps.setBoolean(10, isFrozen);
                        ps.setBoolean(11, isFrozen);
                        ps.setBoolean(12, isFrozen);
                        ps.setBoolean(13, isDelete);
                        ps.setInt(14, pkT02);
                        ps.setInt(15, pjId);
                        ps.executeUpdate();
                    }
                } else {
                    // 新增模式
                    String insertSql = "INSERT INTO \"T02_Phase\" (" +
                                      "FK_T02_PK_T01, \"PH_Name\", \"PH_Description\", \"PH_Status\", \"PH_Sequence\", " +
                                      "\"PH_FolderLink\", \"PH_TargetStartDate\", \"PH_TargetEndDate\", \"PH_ActualStartDate\", " +
                                      "\"PH_ActualEndDate\", \"PH_Frozen\", \"PH_FrozenDateTime\", \"PH_CreatedDate\", \"PH_ignore_delete\") " +
                                      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = TRUE THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP, ?)";
                    try (PreparedStatement ps = conn.prepareStatement(insertSql)) {
                        ps.setInt(1, pjId);
                        ps.setString(2, name.trim());
                        ps.setString(3, desc != null ? desc.trim() : "");
                        ps.setString(4, status != null ? status.trim() : "Planning");
                        ps.setInt(5, finalSeq);
                        ps.setString(6, folder != null ? folder.trim() : "");
                        JsonUtil.setTimestampSafely(ps, 7, targetStart);
                        JsonUtil.setTimestampSafely(ps, 8, targetEnd);
                        JsonUtil.setTimestampSafely(ps, 9, actualStart);
                        JsonUtil.setTimestampSafely(ps, 10, actualEnd);
                        ps.setBoolean(11, isFrozen);
                        ps.setBoolean(12, isFrozen);
                        ps.setBoolean(13, isDelete);
                        ps.executeUpdate();
                    }
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

    // ==========================================================================
    // 3. 查詢字典與範本 (T00_Ref)
    // ==========================================================================
    private void handlePhaseRefs(HttpExchange exchange, Security.UserSession user) throws Exception {
        try (Connection conn = DB.getConnection()) {
            String sql = "SELECT \"Ref_CategoryA\", \"Ref_Text\" FROM \"T00_Ref\" " +
                         "WHERE \"Ref_CategoryA\" IN ('T02_PH_Status', 'T02_PH_Template') " +
                         "  AND (FK_T00_PK_T05 IS NULL OR FK_T00_PK_T05 = ?) " +
                         "ORDER BY \"Ref_SortValue\" ASC, PK_T00 ASC";

            StringBuilder statuses = new StringBuilder("[");
            StringBuilder templates = new StringBuilder("[");
            boolean firstStatus = true, firstTpl = true;

            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setLong(1, user.pkT05);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        String cat = rs.getString("Ref_CategoryA");
                        String text = rs.getString("Ref_Text");
                        if ("T02_PH_Status".equalsIgnoreCase(cat)) {
                            if (!firstStatus) statuses.append(",");
                            statuses.append("\"").append(JsonUtil.escape(text)).append("\"");
                            firstStatus = false;
                        } else if ("T02_PH_Template".equalsIgnoreCase(cat)) {
                            if (!firstTpl) templates.append(",");
                            templates.append("\"").append(JsonUtil.escape(text)).append("\"");
                            firstTpl = false;
                        }
                    }
                }
            }
            statuses.append("]");
            templates.append("]");

            String json = "{\"status\":\"SUCCESS\",\"statuses\":" + statuses.toString() +
                          ",\"phase_templates\":" + templates.toString() + "}";
            JsonUtil.sendJson(exchange, 200, json);
        }
    }

    private void handleCreateCustomRef(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = JsonUtil.readBody(exchange);
        String category = JsonUtil.extractString(body, "category");
        String text = JsonUtil.extractString(body, "text");

        if (category == null || category.trim().isEmpty() || text == null || text.trim().isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Category and Text are required");
            return;
        }

        String catTrimmed = category.trim();
        String textTrimmed = text.trim();
        int staffId = (int) user.pkT05;

        try (Connection conn = DB.getConnection()) {
            String checkSql = "SELECT COUNT(*) FROM \"T00_Ref\" " +
                              "WHERE \"Ref_CategoryA\" = ? AND \"Ref_Text\" = ? " +
                              "  AND (FK_T00_PK_T05 IS NULL OR FK_T00_PK_T05 = ?)";
            try (PreparedStatement psCheck = conn.prepareStatement(checkSql)) {
                psCheck.setString(1, catTrimmed);
                psCheck.setString(2, textTrimmed);
                psCheck.setInt(3, staffId);
                try (ResultSet rsCheck = psCheck.executeQuery()) {
                    if (rsCheck.next() && rsCheck.getInt(1) > 0) {
                        JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\",\"text\":\"" + JsonUtil.escape(textTrimmed) + "\",\"existed\":true}");
                        return;
                    }
                }
            }

            String insertSql = "INSERT INTO \"T00_Ref\" (\"Ref_CategoryA\", \"Ref_SortValue\", \"Ref_Text\", FK_T00_PK_T05) " +
                               "VALUES (?, 999, ?, ?)";
            try (PreparedStatement psIns = conn.prepareStatement(insertSql)) {
                psIns.setString(1, catTrimmed);
                psIns.setString(2, textTrimmed);
                psIns.setInt(3, staffId);
                psIns.executeUpdate();
            }

            JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\",\"text\":\"" + JsonUtil.escape(textTrimmed) + "\"}");
        }
    }

    // ==========================================================================
    // 4. 輔助權限核驗
    // ==========================================================================
    private boolean verifyProjectMember(Connection conn, int pjId, long staffId) throws Exception {
        return ProjectHandler.verifyProjectMember(conn, pjId, staffId);
    }

    private boolean verifyProjectFullRight(Connection conn, int pjId, long staffId) throws Exception {
        return ProjectHandler.verifyProjectFullRight(conn, pjId, staffId);
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