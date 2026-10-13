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

public class MemberRelatedHandler implements HttpHandler {

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
            if ("GET".equals(method) && "/api/portal/project/member-ref".equals(path)) {
                handleMemberRef(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/project/ref/create-custom".equals(path)) {
                handleCreateCustomRef(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/project/members".equals(path)) {
                handleProjectMembers(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/project/available-staff".equals(path)) {
                handleAvailableStaff(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/project/member/save".equals(path)) {
                handleSaveMember(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/project/contractor/save".equals(path)) {
                handleSaveContractor(exchange, user);
            } else {
                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Endpoint not found in MemberRelatedHandler");
            }
        } catch (Exception e) {
            e.printStackTrace();
            JsonUtil.sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    // ==========================================
    // 1. 字典參考 API
    // ==========================================
    private void handleMemberRef(HttpExchange exchange, Security.UserSession user) throws Exception {
        try (Connection conn = DB.getConnection()) {
            String sql = "SELECT \"Ref_CategoryA\", \"Ref_Text\", \"Ref_SortValue\" FROM \"T00_Ref\" " +
                         "WHERE \"Ref_CategoryA\" IN ('T01_PJ_Status', 'T06_PR_RoleType', 'T06_PR_Right') " +
                         "  AND (FK_T00_PK_T05 IS NULL OR FK_T00_PK_T05 = ?) " +
                         "ORDER BY \"Ref_SortValue\" ASC, PK_T00 ASC";

            StringBuilder statuses = new StringBuilder("[");
            StringBuilder roleTypes = new StringBuilder("[");
            StringBuilder rights = new StringBuilder("[");
            boolean firstStatus = true, firstRole = true, firstRight = true;

            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setLong(1, user.pkT05);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        String cat = rs.getString("Ref_CategoryA");
                        String text = rs.getString("Ref_Text");
                        if ("T01_PJ_Status".equalsIgnoreCase(cat)) {
                            if (!firstStatus) statuses.append(",");
                            statuses.append("\"").append(JsonUtil.escape(text)).append("\"");
                            firstStatus = false;
                        } else if ("T06_PR_RoleType".equalsIgnoreCase(cat)) {
                            if (!firstRole) roleTypes.append(",");
                            roleTypes.append("\"").append(JsonUtil.escape(text)).append("\"");
                            firstRole = false;
                        } else if ("T06_PR_Right".equalsIgnoreCase(cat)) {
                            if (!firstRight) rights.append(",");
                            rights.append("\"").append(JsonUtil.escape(text)).append("\"");
                            firstRight = false;
                        }
                    }
                }
            }
            statuses.append("]");
            roleTypes.append("]");
            rights.append("]");

            String json = "{\"status\":\"SUCCESS\",\"statuses\":" + statuses.toString() +
                          ",\"role_types\":" + roleTypes.toString() + ",\"rights\":" + rights.toString() + "}";
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

    // ==========================================
    // 2. 專案成員清單 (支援區分 Contractor 與專屬欄位)
    // ==========================================
    private void handleProjectMembers(HttpExchange exchange, Security.UserSession user) throws Exception {
        int pjId = extractQueryInt(exchange, "pj");
        if (pjId <= 0) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID is required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            if (!ProjectHandler.verifyProjectMember(conn, pjId, user.pkT05)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Unauthorized to view project members");
                return;
            }

            String sql = "SELECT r.PK_T06, r.FK_T06_PK_T05, r.\"PR_RoleType\", r.\"PR_Right\", " +
                         "       r.\"PR_StartDate\", r.\"PR_EndDate\", r.\"PR_ignore_delete\", " +
                         "       s.\"ST_Name\", s.\"ST_NickName\", s.\"ST_Email\", s.\"ST_Rank\", s.\"ST_Post\", " +
                         "       s.\"ST_Tel\", s.\"ST_Remark\", s.\"ST_Company_Department\", s.FK_T05_PK_T01_Custom " +
                         "FROM \"T06_ProjectRoles\" r " +
                         "JOIN \"T05_Staff\" s ON r.FK_T06_PK_T05 = s.PK_T05 " +
                         "WHERE r.FK_T06_PK_T01 = ? " +
                         "ORDER BY s.FK_T05_PK_T01_Custom ASC, r.\"PR_ignore_delete\" ASC, r.\"PR_Right\" DESC, s.\"ST_Name\" ASC";

            StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"members\":[");
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, pjId);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        int customPjId = rs.getInt("FK_T05_PK_T01_Custom");
                        boolean isContractor = (customPjId > 0);

                        if (!first) sb.append(",");
                        sb.append("{")
                          .append("\"pk_t06\":").append(rs.getInt("PK_T06")).append(",")
                          .append("\"pk_t05\":").append(rs.getInt("FK_T06_PK_T05")).append(",")
                          .append("\"st_name\":\"").append(JsonUtil.escape(rs.getString("ST_Name"))).append("\",")
                          .append("\"st_nickname\":\"").append(JsonUtil.escape(rs.getString("ST_NickName"))).append("\",")
                          .append("\"st_email\":\"").append(JsonUtil.escape(rs.getString("ST_Email"))).append("\",")
                          .append("\"st_rank\":\"").append(JsonUtil.escape(rs.getString("ST_Rank"))).append("\",")
                          .append("\"st_post\":\"").append(JsonUtil.escape(rs.getString("ST_Post"))).append("\",")
                          .append("\"st_tel\":\"").append(JsonUtil.escape(rs.getString("ST_Tel"))).append("\",")
                          .append("\"st_remark\":\"").append(JsonUtil.escape(rs.getString("ST_Remark"))).append("\",")
                          .append("\"st_company\":\"").append(JsonUtil.escape(rs.getString("ST_Company_Department"))).append("\",")
                          .append("\"is_contractor\":").append(isContractor).append(",")
                          .append("\"pr_roletype\":\"").append(JsonUtil.escape(rs.getString("PR_RoleType"))).append("\",")
                          .append("\"pr_right\":\"").append(JsonUtil.escape(rs.getString("PR_Right"))).append("\",")
                          .append("\"pr_start_date\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PR_StartDate"))).append("\",")
                          .append("\"pr_end_date\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PR_EndDate"))).append("\",")
                          .append("\"pr_ignore_delete\":").append(rs.getBoolean("PR_ignore_delete"))
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
    // 3. 查詢可指派同仁 (排除該專案已有記錄者，包含全域與專屬同仁)
    // ==========================================
    private void handleAvailableStaff(HttpExchange exchange, Security.UserSession user) throws Exception {
        int pjId = extractQueryInt(exchange, "pj");
        if (pjId <= 0) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID is required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            if (!ProjectHandler.verifyProjectFullRight(conn, pjId, user.pkT05)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "FULL right required to view available staff");
                return;
            }

            // 僅查詢全域人員 (FK_T05_PK_T01_Custom = 0) 或此專案之自訂人員，且尚未加入本專案名冊者
            String sql = "SELECT s.PK_T05, s.\"ST_Name\", s.\"ST_Email\", s.\"ST_Rank\", s.\"ST_Post\", " +
                         "       s.\"ST_Company_Department\", s.FK_T05_PK_T01_Custom " +
                         "FROM \"T05_Staff\" s " +
                         "WHERE s.\"ST_IsActive\" = TRUE " +
                         "  AND (s.FK_T05_PK_T01_Custom = 0 OR s.FK_T05_PK_T01_Custom = ?) " +
                         "  AND s.PK_T05 NOT IN (" +
                         "      SELECT FK_T06_PK_T05 FROM \"T06_ProjectRoles\" " +
                         "      WHERE FK_T06_PK_T01 = ?" +
                         "  ) " +
                         "ORDER BY s.FK_T05_PK_T01_Custom ASC, s.\"ST_Name\" ASC";

            StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"staff\":[");
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, pjId);
                ps.setInt(2, pjId);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(",");
                        sb.append("{")
                          .append("\"pk_t05\":").append(rs.getInt("PK_T05")).append(",")
                          .append("\"st_name\":\"").append(JsonUtil.escape(rs.getString("ST_Name"))).append("\",")
                          .append("\"st_email\":\"").append(JsonUtil.escape(rs.getString("ST_Email"))).append("\",")
                          .append("\"st_rank\":\"").append(JsonUtil.escape(rs.getString("ST_Rank"))).append("\",")
                          .append("\"st_post\":\"").append(JsonUtil.escape(rs.getString("ST_Post"))).append("\",")
                          .append("\"st_company\":\"").append(JsonUtil.escape(rs.getString("ST_Company_Department"))).append("\",")
                          .append("\"is_contractor\":").append(rs.getInt("FK_T05_PK_T01_Custom") > 0)
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
    // 4. 儲存一般成員指派 (含防軟刪除復活防呆)
    // ==========================================
    private void handleSaveMember(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = JsonUtil.readBody(exchange);
        Integer pjId = JsonUtil.extractInt(body, "fk_t06_pk_t01");
        Integer staffId = JsonUtil.extractInt(body, "fk_t06_pk_t05");
        Integer pkT06 = JsonUtil.extractInt(body, "pk_t06");
        String roleType = JsonUtil.extractString(body, "pr_roletype");
        String right = JsonUtil.extractString(body, "pr_right");
        String startDate = JsonUtil.extractString(body, "pr_start_date");
        String endDate = JsonUtil.extractString(body, "pr_end_date");
        Boolean ignoreDelete = JsonUtil.extractBool(body, "pr_ignore_delete");
        String auditReason = JsonUtil.extractString(body, "audit_reason");

        if (pjId == null || staffId == null || right == null || right.trim().isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID, Staff ID and Right are required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            if (!ProjectHandler.verifyProjectFullRight(conn, pjId, user.pkT05)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Only members with FULL Project Role can perform member assignments");
                return;
            }

            conn.setAutoCommit(false);
            try {
                if (pkT06 == null || pkT06 <= 0) {
                    // 全新指派檢查：是否曾被加入過（即使已被軟刪除）
                    String checkExistSql = "SELECT PK_T06, \"PR_ignore_delete\" FROM \"T06_ProjectRoles\" WHERE FK_T06_PK_T01 = ? AND FK_T06_PK_T05 = ?";
                    try (PreparedStatement psExist = conn.prepareStatement(checkExistSql)) {
                        psExist.setInt(1, pjId);
                        psExist.setInt(2, staffId);
                        try (ResultSet rsExist = psExist.executeQuery()) {
                            if (rsExist.next()) {
                                boolean isDeleted = rsExist.getBoolean("PR_ignore_delete");
                                conn.rollback();
                                if (isDeleted) {
                                    JsonUtil.sendError(exchange, 400, "MEMBER_PREVIOUSLY_DELETED", 
                                        "This officer was previously soft-deleted. Please restore them via the 'Edit' button on the member roster.");
                                } else {
                                    JsonUtil.sendError(exchange, 400, "MEMBER_ALREADY_EXISTS", 
                                        "This officer is already an active member of this project.");
                                }
                                return;
                            }
                        }
                    }

                    String insertSql = "INSERT INTO \"T06_ProjectRoles\" " +
                                      "(FK_T06_PK_T01, FK_T06_PK_T05, \"PR_RoleType\", \"PR_Right\", \"PR_StartDate\", \"PR_EndDate\", \"PR_ignore_delete\") " +
                                      "VALUES (?, ?, ?, ?, ?, ?, FALSE)";
                    try (PreparedStatement psIns = conn.prepareStatement(insertSql)) {
                        psIns.setInt(1, pjId);
                        psIns.setInt(2, staffId);
                        psIns.setString(3, roleType == null ? "Member" : roleType.trim());
                        psIns.setString(4, right.trim());
                        JsonUtil.setTimestampSafely(psIns, 5, startDate);
                        JsonUtil.setTimestampSafely(psIns, 6, endDate);
                        psIns.executeUpdate();
                    }

                    ProjectRemarkLedger.append(conn, pjId, user, "MEMBER_ASSIGNED", 
                        "Staff ID: " + staffId + " assigned as [" + roleType + " | " + right + "]", "Standard project assignment");
                } else {
                    // 編輯現有記錄
                    String checkTargetSql = "SELECT r.FK_T06_PK_T05, r.\"PR_Right\", r.\"PR_RoleType\", r.\"PR_ignore_delete\", s.\"ST_Name\", s.\"ST_Rank\" " +
                                            "FROM \"T06_ProjectRoles\" r JOIN \"T05_Staff\" s ON r.FK_T06_PK_T05 = s.PK_T05 " +
                                            "WHERE r.PK_T06 = ? AND r.FK_T06_PK_T01 = ?";
                    boolean prevDelete = false;
                    String targetName = "", targetRank = "", prevRight = "", prevRole = "";

                    try (PreparedStatement psCheck = conn.prepareStatement(checkTargetSql)) {
                        psCheck.setInt(1, pkT06);
                        psCheck.setInt(2, pjId);
                        try (ResultSet rsCheck = psCheck.executeQuery()) {
                            if (rsCheck.next()) {
                                long targetStaffId = rsCheck.getLong("FK_T06_PK_T05");
                                prevRight = rsCheck.getString("PR_Right");
                                prevRole = rsCheck.getString("PR_RoleType");
                                prevDelete = rsCheck.getBoolean("PR_ignore_delete");
                                targetName = rsCheck.getString("ST_Name");
                                targetRank = rsCheck.getString("ST_Rank");

                                if ("FULL".equalsIgnoreCase(prevRight) && targetStaffId != user.pkT05 && !"FULL".equalsIgnoreCase(right)) {
                                    conn.rollback();
                                    JsonUtil.sendError(exchange, 403, "PROTECTED_ROLE", "Other members with FULL role are protected and cannot be demoted");
                                    return;
                                }
                            } else {
                                conn.rollback();
                                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Target project member record not found");
                                return;
                            }
                        }
                    }

                    boolean nowDelete = (ignoreDelete != null && ignoreDelete);
                    String officerLabel = "Officer [" + targetName + " (" + (targetRank == null ? "Staff" : targetRank) + ")]";

                    // 審計判定
                    if (!prevDelete && nowDelete) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when removing a member");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, pjId, user, "MEMBER_SOFT_DELETE", 
                            officerLabel + " - Was [" + prevRole + " | " + prevRight + "]", auditReason);
                    } else if (prevDelete && !nowDelete) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when restoring a member");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, pjId, user, "MEMBER_RESTORED", 
                            officerLabel + " - Restored as [" + roleType + " | " + right + "]", auditReason);
                    } else if (!prevRight.equalsIgnoreCase(right)) {
                        ProjectRemarkLedger.append(conn, pjId, user, "MEMBER_RIGHT_CHANGE", 
                            officerLabel + " right changed from [" + prevRight + "] to [" + right + "]", 
                            auditReason != null && !auditReason.trim().isEmpty() ? auditReason : "Role/Access Adjustment");
                    }

                    String updateSql = "UPDATE \"T06_ProjectRoles\" SET " +
                                      "\"PR_RoleType\" = ?, \"PR_Right\" = ?, \"PR_StartDate\" = ?, " +
                                      "\"PR_EndDate\" = ?, \"PR_ignore_delete\" = ? " +
                                      "WHERE PK_T06 = ? AND FK_T06_PK_T01 = ?";
                    try (PreparedStatement psUpd = conn.prepareStatement(updateSql)) {
                        psUpd.setString(1, roleType == null ? "Member" : roleType.trim());
                        psUpd.setString(2, right.trim());
                        JsonUtil.setTimestampSafely(psUpd, 3, startDate);
                        JsonUtil.setTimestampSafely(psUpd, 4, endDate);
                        psUpd.setBoolean(5, nowDelete);
                        psUpd.setInt(6, pkT06);
                        psUpd.setInt(7, pjId);
                        psUpd.executeUpdate();
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

// ==========================================
    // 5. 專用建立 / 編輯 Contractor (支援 Active Period、Soft Delete 與審計)
    // ==========================================
    private void handleSaveContractor(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = JsonUtil.readBody(exchange);
        Integer pjId = JsonUtil.extractInt(body, "fk_t01");
        Integer staffId = JsonUtil.extractInt(body, "pk_t05");
        String name = JsonUtil.extractString(body, "st_name");
        String email = JsonUtil.extractString(body, "st_email");
        String company = JsonUtil.extractString(body, "st_company");
        String tel = JsonUtil.extractString(body, "st_tel");
        String remark = JsonUtil.extractString(body, "st_remark");
        String roleType = JsonUtil.extractString(body, "pr_roletype");
        String startDate = JsonUtil.extractString(body, "pr_start_date");
        String endDate = JsonUtil.extractString(body, "pr_end_date");
        Boolean ignoreDelete = JsonUtil.extractBool(body, "pr_ignore_delete");
        String auditReason = JsonUtil.extractString(body, "audit_reason");

        if (pjId == null || pjId <= 0 || name == null || name.trim().isEmpty() || email == null || email.trim().isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID, Name, and Email are required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            if (!ProjectHandler.verifyProjectFullRight(conn, pjId, user.pkT05)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Only members with FULL Project Role can manage contractors");
                return;
            }

            conn.setAutoCommit(false);
            try {
                long targetStaffId = -1;
                boolean nowDelete = (ignoreDelete != null && ignoreDelete);

                if (staffId != null && staffId > 0) {
                    // 查驗前次狀態以比對軟刪除審計
                    String originSql = "SELECT r.\"PR_ignore_delete\", r.\"PR_RoleType\", s.\"ST_Name\", s.\"ST_Company_Department\" " +
                                       "FROM \"T06_ProjectRoles\" r JOIN \"T05_Staff\" s ON r.FK_T06_PK_T05 = s.PK_T05 " +
                                       "WHERE r.FK_T06_PK_T01 = ? AND r.FK_T06_PK_T05 = ?";
                    boolean prevDelete = false;
                    String orgName = name.trim();
                    try (PreparedStatement psOrg = conn.prepareStatement(originSql)) {
                        psOrg.setInt(1, pjId);
                        psOrg.setInt(2, staffId);
                        try (ResultSet rsOrg = psOrg.executeQuery()) {
                            if (rsOrg.next()) {
                                prevDelete = rsOrg.getBoolean("PR_ignore_delete");
                                orgName = rsOrg.getString("ST_Name");
                            } else {
                                conn.rollback();
                                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Contractor role record not found in this project");
                                return;
                            }
                        }
                    }

                    // 軟刪除與復原審計判定
                    String contractorLabel = "Contractor [" + orgName + " (" + (company != null ? company.trim() : "Vendor") + ")]";
                    if (!prevDelete && nowDelete) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when marking a contractor as deleted");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, pjId, user, "CONTRACTOR_SOFT_DELETE", contractorLabel, auditReason);
                    } else if (prevDelete && !nowDelete) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when restoring a contractor");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, pjId, user, "CONTRACTOR_RESTORED", contractorLabel, auditReason);
                    }

                    // 更新 T05_Staff
                    String updateStaffSql = "UPDATE \"T05_Staff\" SET \"ST_Name\" = ?, \"ST_Email\" = ?, " +
                                            "\"ST_Company_Department\" = ?, \"ST_Tel\" = ?, \"ST_Remark\" = ? " +
                                            "WHERE PK_T05 = ? AND FK_T05_PK_T01_Custom = ?";
                    try (PreparedStatement psUpd = conn.prepareStatement(updateStaffSql)) {
                        psUpd.setString(1, name.trim());
                        psUpd.setString(2, email.trim());
                        psUpd.setString(3, (company == null || company.trim().isEmpty()) ? "External Vendor" : company.trim());
                        psUpd.setString(4, tel != null ? tel.trim() : "");
                        psUpd.setString(5, remark != null ? remark.trim() : "");
                        psUpd.setInt(6, staffId);
                        psUpd.setInt(7, pjId);
                        psUpd.executeUpdate();
                        targetStaffId = staffId;
                    }

                    // 更新 T06_ProjectRoles (包含 PR_ignore_delete)
                    String updateRoleSql = "UPDATE \"T06_ProjectRoles\" SET \"PR_RoleType\" = ?, " +
                                           "\"PR_StartDate\" = ?, \"PR_EndDate\" = ?, \"PR_ignore_delete\" = ? " +
                                           "WHERE FK_T06_PK_T01 = ? AND FK_T06_PK_T05 = ?";
                    try (PreparedStatement psRole = conn.prepareStatement(updateRoleSql)) {
                        psRole.setString(1, (roleType == null || roleType.trim().isEmpty()) ? "Contractor" : roleType.trim());
                        JsonUtil.setTimestampSafely(psRole, 2, startDate);
                        JsonUtil.setTimestampSafely(psRole, 3, endDate);
                        psRole.setBoolean(4, nowDelete);
                        psRole.setInt(5, pjId);
                        psRole.setLong(6, targetStaffId);
                        psRole.executeUpdate();
                    }

                    if (prevDelete == nowDelete) {
                        ProjectRemarkLedger.append(conn, pjId, user, "CONTRACTOR_UPDATED", 
                            contractorLabel + " details updated", "Profile & period adjustment");
                    }
                } else {
                    // 新增 Contractor (寫入 T05_Staff，綁定專案)
                    String insertStaffSql = "INSERT INTO \"T05_Staff\" (" +
                                            "\"ST_Name\", \"ST_Email\", \"ST_Company_Department\", \"ST_Tel\", " +
                                            "\"ST_Remark\", FK_T05_PK_T01_Custom, \"ST_Right\", \"ST_IsActive\") " +
                                            "VALUES (?, ?, ?, ?, ?, ?, 'USER', TRUE)";
                    try (PreparedStatement psIns = conn.prepareStatement(insertStaffSql, Statement.RETURN_GENERATED_KEYS)) {
                        psIns.setString(1, name.trim());
                        psIns.setString(2, email.trim());
                        psIns.setString(3, (company == null || company.trim().isEmpty()) ? "External Vendor" : company.trim());
                        psIns.setString(4, tel != null ? tel.trim() : "");
                        psIns.setString(5, remark != null ? remark.trim() : "");
                        psIns.setInt(6, pjId);
                        psIns.executeUpdate();
                        try (ResultSet rs = psIns.getGeneratedKeys()) {
                            if (rs.next()) {
                                targetStaffId = rs.getLong(1);
                            }
                        }
                    }

                    // 一體化指派至 T06_ProjectRoles
                    String insertRoleSql = "INSERT INTO \"T06_ProjectRoles\" (" +
                                           "FK_T06_PK_T01, FK_T06_PK_T05, \"PR_RoleType\", \"PR_Right\", \"PR_StartDate\", \"PR_EndDate\", \"PR_ignore_delete\") " +
                                           "VALUES (?, ?, ?, 'EVENT ONLY', ?, ?, FALSE)";
                    try (PreparedStatement psRole = conn.prepareStatement(insertRoleSql)) {
                        psRole.setInt(1, pjId);
                        psRole.setLong(2, targetStaffId);
                        psRole.setString(3, (roleType == null || roleType.trim().isEmpty()) ? "Contractor" : roleType.trim());
                        JsonUtil.setTimestampSafely(psRole, 4, startDate);
                        JsonUtil.setTimestampSafely(psRole, 5, endDate);
                        psRole.executeUpdate();
                    }

                    ProjectRemarkLedger.append(conn, pjId, user, "CONTRACTOR_CREATED", 
                        "Contractor [" + name.trim() + " (" + email.trim() + ")] created with EVENT ONLY access", 
                        "New contractor onboarded");
                }

                conn.commit();
                JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\",\"pk_t05\":" + targetStaffId + "}");
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
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