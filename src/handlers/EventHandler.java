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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class EventHandler implements HttpHandler {

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
            if ("GET".equals(method) && "/api/portal/event/init-refs".equals(path)) {
                handleEventInitRefs(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/event/create".equals(path)) {
                handleCreateEvent(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/event/depth-limit/toggle".equals(path)) {
                handleToggleDepthLimit(exchange, user);
            } else if ("POST".equals(method) && "/api/portal/event/ref/create-custom".equals(path)) {
                handleCreateCustomRef(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/event/list".equals(path)) {
                handleEventList(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/event/detail".equals(path)) {
                handleEventDetail(exchange, user);
            } else {
                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Endpoint not found in EventHandler");
            }
        } catch (Exception e) {
            e.printStackTrace();
            JsonUtil.sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    // ==========================================================================
    // 1. 初始化事件參考資料 (保障操作者本人入列 + 名單 B 廠商隔離)
    // ==========================================================================
    private void handleEventInitRefs(HttpExchange exchange, Security.UserSession user) throws Exception {
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

            // 1.1 查詢 Phases
            String sqlPhases = "SELECT PK_T02, \"PH_Name\", \"PH_Sequence\", \"PH_Status\", \"PH_Frozen\", " +
                               "       \"PH_ignore_delete\", \"PH_TargetStartDate\", \"PH_TargetEndDate\", " +
                               "       \"PH_ActualStartDate\", \"PH_ActualEndDate\" " +
                               "FROM \"T02_Phase\" " +
                               "WHERE FK_T02_PK_T01 = ? " +
                               "ORDER BY \"PH_ignore_delete\" ASC, \"PH_Sequence\" ASC";

            StringBuilder sbPhases = new StringBuilder("[");
            try (PreparedStatement ps = conn.prepareStatement(sqlPhases)) {
                ps.setInt(1, pjId);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sbPhases.append(",");
                        sbPhases.append("{")
                                .append("\"pk_t02\":").append(rs.getInt("PK_T02")).append(",")
                                .append("\"ph_name\":\"").append(JsonUtil.escape(rs.getString("PH_Name"))).append("\",")
                                .append("\"ph_sequence\":").append(rs.getInt("PH_Sequence")).append(",")
                                .append("\"ph_status\":\"").append(JsonUtil.escape(rs.getString("PH_Status"))).append("\",")
                                .append("\"ph_frozen\":").append(rs.getBoolean("PH_Frozen")).append(",")
                                .append("\"ph_ignore_delete\":").append(rs.getBoolean("PH_ignore_delete")).append(",")
                                .append("\"ph_target_start\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_TargetStartDate"))).append("\",")
                                .append("\"ph_target_end\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_TargetEndDate"))).append("\",")
                                .append("\"ph_actual_start\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_ActualStartDate"))).append("\",")
                                .append("\"ph_actual_end\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("PH_ActualEndDate"))).append("\"")
                                .append("}");
                        first = false;
                    }
                }
            }
            sbPhases.append("]");

            // 1.2 查詢名單 A：專案成員 (記錄是否包含本人)
            String sqlMembers = "SELECT s.PK_T05, s.\"ST_Name\", s.\"ST_Rank\", s.\"ST_Email\", r.\"PR_RoleType\" " +
                                "FROM \"T06_ProjectRoles\" r " +
                                "JOIN \"T05_Staff\" s ON r.FK_T06_PK_T05 = s.PK_T05 " +
                                "WHERE r.FK_T06_PK_T01 = ? AND r.\"PR_ignore_delete\" = FALSE AND s.\"ST_IsActive\" = TRUE " +
                                "  AND (r.\"PR_EndDate\" IS NULL OR r.\"PR_EndDate\" >= CURRENT_TIMESTAMP) " +
                                "ORDER BY s.\"ST_Name\" ASC";

            StringBuilder sbMembers = new StringBuilder("[");
            boolean firstMember = true;
            boolean selfIncluded = false;

            try (PreparedStatement ps = conn.prepareStatement(sqlMembers)) {
                ps.setInt(1, pjId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        int staffId = rs.getInt("PK_T05");
                        if (staffId == (int) user.pkT05) {
                            selfIncluded = true;
                        }
                        if (!firstMember) sbMembers.append(",");
                        sbMembers.append("{")
                                 .append("\"pk_t05\":").append(staffId).append(",")
                                 .append("\"st_name\":\"").append(JsonUtil.escape(rs.getString("ST_Name"))).append("\",")
                                 .append("\"st_rank\":\"").append(JsonUtil.escape(rs.getString("ST_Rank"))).append("\",")
                                 .append("\"st_email\":\"").append(JsonUtil.escape(rs.getString("ST_Email"))).append("\",")
                                 .append("\"pr_roletype\":\"").append(JsonUtil.escape(rs.getString("PR_RoleType"))).append("\"")
                                 .append("}");
                        firstMember = false;
                    }
                }
            }

            // 保障操作者本人必定具備選派資格
            if (!selfIncluded) {
                String sqlSelf = "SELECT PK_T05, \"ST_Name\", \"ST_Rank\", \"ST_Email\" FROM \"T05_Staff\" WHERE PK_T05 = ?";
                try (PreparedStatement psSelf = conn.prepareStatement(sqlSelf)) {
                    psSelf.setLong(1, user.pkT05);
                    try (ResultSet rsSelf = psSelf.executeQuery()) {
                        if (rsSelf.next()) {
                            if (!firstMember) sbMembers.insert(1, ",");
                            String selfJson = "{" +
                                    "\"pk_t05\":" + rsSelf.getInt("PK_T05") + "," +
                                    "\"st_name\":\"" + JsonUtil.escape(rsSelf.getString("ST_Name")) + "\"," +
                                    "\"st_rank\":\"" + JsonUtil.escape(rsSelf.getString("ST_Rank")) + "\"," +
                                    "\"st_email\":\"" + JsonUtil.escape(rsSelf.getString("ST_Email")) + "\"," +
                                    "\"pr_roletype\":\"Member\"" +
                                    "}";
                            sbMembers.insert(1, selfJson);
                        }
                    }
                }
            }
            sbMembers.append("]");

            // 1.3 查詢名單 B：跨部門未加入成員 (隔離其他專案的廠商)
            String sqlNonMembers = "SELECT s.PK_T05, s.\"ST_Name\", s.\"ST_Rank\", s.\"ST_Email\", " +
                                   "       COALESCE(s.\"ST_Company_Department\", 'Other') AS DEPT " +
                                   "FROM \"T05_Staff\" s " +
                                   "WHERE s.\"ST_IsActive\" = TRUE AND s.PK_T05 <> ? " +
                                   "  AND (s.FK_T05_PK_T01_CUSTOM = 0 OR s.FK_T05_PK_T01_CUSTOM = ?) " +
                                   "  AND s.PK_T05 NOT IN (" +
                                   "      SELECT FK_T06_PK_T05 FROM \"T06_ProjectRoles\" " +
                                   "      WHERE FK_T06_PK_T01 = ? AND \"PR_ignore_delete\" = FALSE " +
                                   "        AND (\"PR_EndDate\" IS NULL OR \"PR_EndDate\" >= CURRENT_TIMESTAMP)" +
                                   "  ) " +
                                   "ORDER BY DEPT ASC, s.\"ST_Name\" ASC";

            Map<String, List<String>> deptMap = new HashMap<>();
            try (PreparedStatement ps = conn.prepareStatement(sqlNonMembers)) {
                ps.setLong(1, user.pkT05);
                ps.setInt(2, pjId);
                ps.setInt(3, pjId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        String dept = rs.getString("DEPT");
                        String jsonStaff = "{" +
                                "\"pk_t05\":" + rs.getInt("PK_T05") + "," +
                                "\"st_name\":\"" + JsonUtil.escape(rs.getString("ST_Name")) + "\"," +
                                "\"st_rank\":\"" + JsonUtil.escape(rs.getString("ST_Rank")) + "\"," +
                                "\"st_email\":\"" + JsonUtil.escape(rs.getString("ST_Email")) + "\"" +
                                "}";
                        deptMap.computeIfAbsent(dept, k -> new ArrayList<>()).add(jsonStaff);
                    }
                }
            }

            StringBuilder sbDeptTree = new StringBuilder("{");
            boolean firstDept = true;
            for (Map.Entry<String, List<String>> entry : deptMap.entrySet()) {
                if (!firstDept) sbDeptTree.append(",");
                sbDeptTree.append("\"").append(JsonUtil.escape(entry.getKey())).append("\":[");
                sbDeptTree.append(String.join(",", entry.getValue()));
                sbDeptTree.append("]");
                firstDept = false;
            }
            sbDeptTree.append("}");

            // 1.4 查詢字典
            String sqlRefs = "SELECT \"Ref_CategoryA\", \"Ref_Text\" FROM \"T00_Ref\" " +
                             "WHERE \"Ref_CategoryA\" IN ('T03_EV_Type', 'T03_EV_Status') " +
                             "  AND (FK_T00_PK_T05 IS NULL OR FK_T00_PK_T05 = ?) " +
                             "ORDER BY \"Ref_SortValue\" ASC, PK_T00 ASC";

            StringBuilder sbTypes = new StringBuilder("[");
            StringBuilder sbStatuses = new StringBuilder("[");
            boolean firstType = true, firstStatus = true;

            try (PreparedStatement ps = conn.prepareStatement(sqlRefs)) {
                ps.setLong(1, user.pkT05);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        String cat = rs.getString("Ref_CategoryA");
                        String text = rs.getString("Ref_Text");
                        if ("T03_EV_Type".equalsIgnoreCase(cat)) {
                            if (!firstType) sbTypes.append(",");
                            sbTypes.append("\"").append(JsonUtil.escape(text)).append("\"");
                            firstType = false;
                        } else if ("T03_EV_Status".equalsIgnoreCase(cat)) {
                            if (!firstStatus) sbStatuses.append(",");
                            sbStatuses.append("\"").append(JsonUtil.escape(text)).append("\"");
                            firstStatus = false;
                        }
                    }
                }
            }
            sbTypes.append("]");
            sbStatuses.append("]");

            boolean isDepthUnlimited = isDepthLimitUnlocked(conn, pjId);

            String jsonResult = "{" +
                    "\"status\":\"SUCCESS\"," +
                    "\"phases\":" + sbPhases.toString() + "," +
                    "\"project_members\":" + sbMembers.toString() + "," +
                    "\"dept_staff_tree\":" + sbDeptTree.toString() + "," +
                    "\"event_types\":" + sbTypes.toString() + "," +
                    "\"event_statuses\":" + sbStatuses.toString() + "," +
                    "\"depth_limit_unlimited\":" + isDepthUnlimited +
                    "}";

            JsonUtil.sendJson(exchange, 200, jsonResult);
        }
    }

    // ==========================================================================
    // 2. 儲存事件 (★ 硬驗證：VIEWER 角色絕對禁止任何 Create/Edit/Delete/Freeze 操作)
    // ==========================================================================
    private void handleCreateEvent(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = JsonUtil.readBody(exchange);

        Integer pkT03 = JsonUtil.extractInt(body, "pk_t03");
        boolean isEdit = (pkT03 != null && pkT03 > 0);

        Integer phaseId = JsonUtil.extractInt(body, "fk_t03_pk_t02");
        Integer parentEventId = JsonUtil.extractInt(body, "fk_t03_pk_t03_parent");
        if (parentEventId != null && parentEventId <= 0) {
            parentEventId = null;
        }

        String baseTitle = JsonUtil.extractString(body, "ev_title");
        String type = JsonUtil.extractString(body, "ev_type");
        String status = JsonUtil.extractString(body, "ev_status");
        String startDate = JsonUtil.extractString(body, "ev_start_date");
        String endDate = JsonUtil.extractString(body, "ev_end_date");
        Integer ownerStaffId = JsonUtil.extractInt(body, "fk_t03_pk_t05_owner");
        Boolean autoAssignOwner = JsonUtil.extractBool(body, "owner_auto_assign");
        if (autoAssignOwner == null) autoAssignOwner = false;
        String folderLink = JsonUtil.extractString(body, "ev_folder_link");
        String desc = JsonUtil.extractString(body, "ev_description");
        String remark = JsonUtil.extractString(body, "ev_remark");
        Boolean ignoreDelete = JsonUtil.extractBool(body, "ev_ignore_delete");
        if (ignoreDelete == null) ignoreDelete = false;
        Boolean frozen = JsonUtil.extractBool(body, "ev_frozen");
        if (frozen == null) frozen = false;
        String auditReason = JsonUtil.extractString(body, "audit_reason");

        Integer batchCount = JsonUtil.extractInt(body, "batch_count");
        if (batchCount == null || batchCount <= 0 || isEdit) {
            batchCount = 1;
        } else if (batchCount > 20) {
            batchCount = 20;
        }

        String batchNamingMode = JsonUtil.extractString(body, "batch_naming_mode");
        String batchSeparator = JsonUtil.extractString(body, "batch_separator");
        if (batchSeparator == null) batchSeparator = " - ";

        if (!isEdit && (ownerStaffId == null || ownerStaffId <= 0)) {
            ownerStaffId = (int) user.pkT05;
        }

        try (Connection conn = DB.getConnection()) {
            conn.setAutoCommit(false);
            try {
                int targetProjectId = -1;

                if (isEdit) {
                    // 編輯模式
                    String checkOriginSql = "SELECT e.*, ph.FK_T02_PK_T01, ph.\"PH_Frozen\" AS PHASE_FROZEN FROM \"T03_Events\" e " +
                                            "JOIN \"T02_Phase\" ph ON e.FK_T03_PK_T02 = ph.PK_T02 " +
                                            "WHERE e.PK_T03 = ?";
                    long originCreatorId = -1;
                    long originOwnerId = -1;
                    boolean originFrozen = false;
                    boolean originDeleted = false;
                    boolean parentPhaseFrozen = false;
                    String rawOriginTitle = "";
                    String originLedgerTitle = "";
                    int originPhaseId = -1;
                    String originType = "";
                    String originDesc = "";

                    try (PreparedStatement psOrigin = conn.prepareStatement(checkOriginSql)) {
                        psOrigin.setInt(1, pkT03);
                        try (ResultSet rsOrigin = psOrigin.executeQuery()) {
                            if (!rsOrigin.next()) {
                                conn.rollback();
                                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Event record not found");
                                return;
                            }
                            targetProjectId = rsOrigin.getInt("FK_T02_PK_T01");
                            originCreatorId = rsOrigin.getLong("FK_T03_PK_T05_Creator");
                            originOwnerId = rsOrigin.getLong("FK_T03_PK_T05_Owner");
                            originFrozen = rsOrigin.getBoolean("EV_Frozen");
                            originDeleted = rsOrigin.getBoolean("EV_ignore_delete");
                            parentPhaseFrozen = rsOrigin.getBoolean("PHASE_FROZEN");
                            rawOriginTitle = rsOrigin.getString("EV_Title");
                            originLedgerTitle = "Event #" + pkT03 + " [" + rawOriginTitle + "]";
                            originPhaseId = rsOrigin.getInt("FK_T03_PK_T02");
                            originType = rsOrigin.getString("EV_Type");
                            originDesc = rsOrigin.getString("EV_Description");
                        }
                    }

                    // ★ 後端零信任防線 1：VIEWER 角色具備最高否決權，絕對禁止任何修改或刪除
                    String userRight = getProjectRight(conn, targetProjectId, user.pkT05);
                    if (userRight == null || "VIEWER".equalsIgnoreCase(userRight)) {
                        conn.rollback();
                        JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Access Denied: VIEWER role cannot modify or delete events in this project");
                        return;
                    }

                    if (parentPhaseFrozen) {
                        conn.rollback();
                        JsonUtil.sendError(exchange, 403, "PHASE_FROZEN", "Operation Rejected: The parent phase of this event is frozen. All child events and missions are locked.");
                        return;
                    }

                    boolean isProjectFull = "FULL".equalsIgnoreCase(userRight);
                    boolean isCreator = (originCreatorId > 0 && originCreatorId == user.pkT05);
                    boolean isOwner = (originOwnerId > 0 && originOwnerId == user.pkT05);
                    boolean hasFullFieldEdit = isProjectFull || isCreator;

                    if (!isProjectFull && !isCreator && !isOwner) {
                        conn.rollback();
                        JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Access Denied: Only members with FULL role, the Event Creator, or the Event Owner can edit this event");
                        return;
                    }

                    if (originFrozen && frozen && !ignoreDelete) {
                        conn.rollback();
                        JsonUtil.sendError(exchange, 403, "EVENT_FROZEN", "Operation Rejected: This event is frozen and cannot be modified. Please unfreeze it first.");
                        return;
                    }

                    if (!hasFullFieldEdit) {
                        phaseId = originPhaseId;
                        baseTitle = rawOriginTitle;
                        type = originType;
                        desc = originDesc;
                        ownerStaffId = (int) originOwnerId;
                        autoAssignOwner = false;
                    } else if (!isProjectFull) {
                        autoAssignOwner = false;
                        if (ownerStaffId != null && ownerStaffId > 0 && !verifyProjectMember(conn, targetProjectId, ownerStaffId)) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Creator cannot assign an owner outside the current project roster");
                            return;
                        }
                    }

                    if (!originDeleted && ignoreDelete) {
                        if (!isProjectFull) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Only FULL role members can delete events");
                            return;
                        }
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when deleting an event");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, targetProjectId, user, "EVENT_SOFT_DELETE", originLedgerTitle, auditReason);
                    } else if (originDeleted && !ignoreDelete) {
                        if (!isProjectFull) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Only FULL role members can restore events");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, targetProjectId, user, "EVENT_RESTORED", originLedgerTitle, auditReason);
                    }

                    if (!originFrozen && frozen) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when freezing an event");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, targetProjectId, user, "EVENT_FROZEN", originLedgerTitle, auditReason);
                    } else if (originFrozen && !frozen) {
                        if (auditReason == null || auditReason.trim().isEmpty()) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 400, "REASON_REQUIRED", "Reason is required when unfreezing an event");
                            return;
                        }
                        ProjectRemarkLedger.append(conn, targetProjectId, user, "EVENT_UNFROZEN", originLedgerTitle, auditReason);
                    }

                    String updateSql = "UPDATE \"T03_Events\" SET " +
                                       "FK_T03_PK_T02 = ?, \"FK_T03_PK_T05_Owner\" = ?, \"EV_Title\" = ?, " +
                                       "\"EV_Description\" = ?, \"EV_Type\" = ?, \"EV_Remark\" = ?, " +
                                       "\"EV_Status\" = ?, \"EV_FolderLink\" = ?, \"EV_EventStartDateTime\" = ?, " +
                                       "\"EV_EventEndDateTime\" = ?, \"EV_ignore_delete\" = ?, " +
                                       "\"EV_Frozen\" = ?, " +
                                       "\"EV_FrozenDateTime\" = CASE " +
                                       "    WHEN ? = TRUE AND \"EV_Frozen\" = FALSE THEN CURRENT_TIMESTAMP " +
                                       "    WHEN ? = FALSE THEN NULL " +
                                       "    ELSE \"EV_FrozenDateTime\" END " +
                                       "WHERE PK_T03 = ?";
                    try (PreparedStatement psUpd = conn.prepareStatement(updateSql)) {
                        psUpd.setInt(1, phaseId);
                        if (ownerStaffId != null && ownerStaffId > 0) psUpd.setInt(2, ownerStaffId);
                        else psUpd.setNull(2, java.sql.Types.INTEGER);
                        psUpd.setString(3, baseTitle.trim());
                        psUpd.setString(4, desc == null ? "" : desc.trim());
                        psUpd.setString(5, type == null ? "Meeting" : type.trim());
                        psUpd.setString(6, remark == null ? "" : remark.trim());
                        psUpd.setString(7, status == null ? "Scheduled" : status.trim());
                        psUpd.setString(8, folderLink == null ? "" : folderLink.trim());
                        JsonUtil.setTimestampSafely(psUpd, 9, startDate);
                        JsonUtil.setTimestampSafely(psUpd, 10, endDate);
                        psUpd.setBoolean(11, ignoreDelete);
                        psUpd.setBoolean(12, frozen);
                        psUpd.setBoolean(13, frozen);
                        psUpd.setBoolean(14, frozen);
                        psUpd.setInt(15, pkT03);
                        psUpd.executeUpdate();
                    }

                } else {
                    // 新增模式
                    if (phaseId == null || phaseId <= 0 || baseTitle == null || baseTitle.trim().isEmpty()) {
                        conn.rollback();
                        JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Target Phase and Event Title are required");
                        return;
                    }

                    String checkPhaseSql = "SELECT FK_T02_PK_T01, \"PH_Frozen\", \"PH_ignore_delete\" FROM \"T02_Phase\" WHERE PK_T02 = ?";
                    try (PreparedStatement psCheck = conn.prepareStatement(checkPhaseSql)) {
                        psCheck.setInt(1, phaseId);
                        try (ResultSet rsCheck = psCheck.executeQuery()) {
                            if (!rsCheck.next()) {
                                conn.rollback();
                                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Target phase record not found");
                                return;
                            }
                            if (rsCheck.getBoolean("PH_ignore_delete")) {
                                conn.rollback();
                                JsonUtil.sendError(exchange, 400, "PHASE_DELETED", "Cannot add event to a deleted phase");
                                return;
                            }
                            targetProjectId = rsCheck.getInt("FK_T02_PK_T01");

                            if (rsCheck.getBoolean("PH_Frozen")) {
                                conn.rollback();
                                JsonUtil.sendError(exchange, 403, "PHASE_FROZEN", "Target phase is frozen. New events are restricted");
                                return;
                            }
                        }
                    }

                    // ★ 後端零信任防線 2：VIEWER 角色絕對禁止建立任何 Event
                    String userRight = getProjectRight(conn, targetProjectId, user.pkT05);
                    if (userRight == null || "VIEWER".equalsIgnoreCase(userRight)) {
                        conn.rollback();
                        JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Access Denied: VIEWER role cannot create events in this project");
                        return;
                    }

                    boolean isProjectFull = "FULL".equalsIgnoreCase(userRight);
                    int calculatedDepthLevel = 1;

                    if (parentEventId == null) {
                        if (!isProjectFull) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Access Denied: Only members with FULL project role can create top-level events");
                            return;
                        }
                        calculatedDepthLevel = 1;
                    } else {
                        String checkParentSql = "SELECT \"EV_DepthLevel\", \"EV_Frozen\", \"EV_ignore_delete\", \"FK_T03_PK_T05_Owner\", \"FK_T03_PK_T05_Creator\" FROM \"T03_Events\" WHERE PK_T03 = ?";
                        int parentDepth = 1;
                        try (PreparedStatement psParent = conn.prepareStatement(checkParentSql)) {
                            psParent.setInt(1, parentEventId);
                            try (ResultSet rsParent = psParent.executeQuery()) {
                                if (!rsParent.next() || rsParent.getBoolean("EV_ignore_delete")) {
                                    conn.rollback();
                                    JsonUtil.sendError(exchange, 400, "INVALID_PARENT", "Parent event not found or deleted");
                                    return;
                                }
                                if (rsParent.getBoolean("EV_Frozen") && !isProjectFull) {
                                    conn.rollback();
                                    JsonUtil.sendError(exchange, 403, "PARENT_FROZEN", "Parent event is frozen. Cannot attach sub-event");
                                    return;
                                }
                                long parentOwnerId = rsParent.getLong("FK_T03_PK_T05_Owner");
                                long parentCreatorId = rsParent.getLong("FK_T03_PK_T05_Creator");
                                boolean isParentOwner = (parentOwnerId > 0 && parentOwnerId == user.pkT05);
                                boolean isParentCreator = (parentCreatorId > 0 && parentCreatorId == user.pkT05);

                                if (!isProjectFull && !isParentOwner && !isParentCreator) {
                                    conn.rollback();
                                    JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Access Denied: Only FULL role members, Parent Event Creator, or Owner can create sub-events");
                                    return;
                                }
                                parentDepth = rsParent.getInt("EV_DepthLevel");
                            }
                        }

                        calculatedDepthLevel = parentDepth + 1;

                        if (calculatedDepthLevel > 3) {
                            boolean isUnlocked = isDepthLimitUnlocked(conn, targetProjectId);
                            if (!isUnlocked) {
                                conn.rollback();
                                JsonUtil.sendError(exchange, 400, "DEPTH_LIMIT_EXCEEDED", 
                                    "Maximum sub-event depth level (3) reached for this project. Full role members can unlock this limit in Event Settings.");
                                return;
                            }
                        }
                    }

                    if (!isProjectFull) {
                        if (Boolean.TRUE.equals(autoAssignOwner)) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Access Denied: Non-FULL members cannot invite external department staff to the project roster");
                            return;
                        }
                        if (ownerStaffId != null && ownerStaffId > 0 && !verifyProjectMember(conn, targetProjectId, ownerStaffId)) {
                            conn.rollback();
                            JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Selected owner is not a current project member");
                            return;
                        }
                    } else {
                        if (ownerStaffId != null && ownerStaffId > 0 && Boolean.TRUE.equals(autoAssignOwner)) {
                            enrollStaffToProject(conn, targetProjectId, ownerStaffId, baseTitle.trim(), user);
                        }
                    }

                    String insertSql = "INSERT INTO \"T03_Events\" (" +
                                       "FK_T03_PK_T02, \"FK_T03_PK_T03_Parent\", \"FK_T03_PK_T05_Creator\", \"FK_T03_PK_T05_Owner\", " +
                                       "\"EV_DepthLevel\", \"EV_Title\", \"EV_Description\", \"EV_Type\", \"EV_Remark\", " +
                                       "\"EV_Status\", \"EV_FolderLink\", \"EV_EventStartDateTime\", \"EV_EventEndDateTime\", " +
                                       "\"EV_CreatedDate\", \"EV_ignore_delete\", \"EV_Frozen\", \"EV_FrozenDateTime\") " +
                                       "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, FALSE, ?, ?)";

                    List<Integer> generatedIds = new ArrayList<>();

                    for (int i = 1; i <= batchCount; i++) {
                        String eventTitle = baseTitle.trim();
                        if (batchCount > 1) {
                            if ("PREFIX".equalsIgnoreCase(batchNamingMode)) {
                                eventTitle = i + batchSeparator + baseTitle.trim();
                            } else if ("SUFFIX".equalsIgnoreCase(batchNamingMode)) {
                                eventTitle = baseTitle.trim() + batchSeparator + i;
                            }
                        }

                        try (PreparedStatement psIns = conn.prepareStatement(insertSql, Statement.RETURN_GENERATED_KEYS)) {
                            psIns.setInt(1, phaseId);
                            if (parentEventId != null && parentEventId > 0) psIns.setInt(2, parentEventId);
                            else psIns.setNull(2, java.sql.Types.INTEGER);
                            psIns.setLong(3, user.pkT05);
                            if (ownerStaffId != null && ownerStaffId > 0) psIns.setInt(4, ownerStaffId);
                            else psIns.setNull(4, java.sql.Types.INTEGER);
                            psIns.setInt(5, calculatedDepthLevel);
                            psIns.setString(6, eventTitle);
                            psIns.setString(7, desc == null ? "" : desc.trim());
                            psIns.setString(8, type == null ? "Meeting" : type.trim());
                            psIns.setString(9, remark == null ? "" : remark.trim());
                            psIns.setString(10, status == null ? "Scheduled" : status.trim());
                            psIns.setString(11, folderLink == null ? "" : folderLink.trim());
                            JsonUtil.setTimestampSafely(psIns, 12, startDate);
                            JsonUtil.setTimestampSafely(psIns, 13, endDate);
                            psIns.setBoolean(14, frozen);
                            if (frozen) {
                                psIns.setTimestamp(15, new java.sql.Timestamp(System.currentTimeMillis()));
                            } else {
                                psIns.setNull(15, java.sql.Types.TIMESTAMP);
                            }
                            psIns.executeUpdate();
                            try (ResultSet rsKeys = psIns.getGeneratedKeys()) {
                                if (rsKeys.next()) {
                                    generatedIds.add(rsKeys.getInt(1));
                                }
                            }
                        }
                    }

                    if (!generatedIds.isEmpty()) {
                        pkT03 = generatedIds.get(0);
                    }
                }

                conn.commit();
                JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\",\"pk_t03\":" + pkT03 + ",\"batch_count\":" + batchCount + "}");
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }
        }
    }

    private void handleToggleDepthLimit(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = JsonUtil.readBody(exchange);
        Integer pjId = JsonUtil.extractInt(body, "pj");
        Boolean enableUnlimited = JsonUtil.extractBool(body, "unlimited");

        if (pjId == null || pjId <= 0 || enableUnlimited == null) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Project ID (pj) and unlimited status are required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            String userRight = getProjectRight(conn, pjId, user.pkT05);
            boolean isProjectFull = "FULL".equalsIgnoreCase(userRight);
            if (!isProjectFull) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Only members with FULL project role can configure depth limits");
                return;
            }

            conn.setAutoCommit(false);
            try {
                String targetState = enableUnlimited ? "Enable" : "Disable";
                String pjIdStr = String.valueOf(pjId);

                String checkSql = "SELECT PK_T00 FROM \"T00_Ref\" " +
                                  "WHERE \"Ref_CategoryA\" = 'T03_EV_DepthLevel' " +
                                  "  AND \"Ref_CategoryB\" = 'No Limit' " +
                                  "  AND \"Ref_Text\" = ?";
                Integer existingRefId = null;
                try (PreparedStatement psCheck = conn.prepareStatement(checkSql)) {
                    psCheck.setString(1, pjIdStr);
                    try (ResultSet rsCheck = psCheck.executeQuery()) {
                        if (rsCheck.next()) existingRefId = rsCheck.getInt("PK_T00");
                    }
                }

                if (existingRefId != null) {
                    String updateSql = "UPDATE \"T00_Ref\" SET \"Ref_CategoryC\" = ?, FK_T00_PK_T05 = ? WHERE PK_T00 = ?";
                    try (PreparedStatement psUpd = conn.prepareStatement(updateSql)) {
                        psUpd.setString(1, targetState);
                        psUpd.setInt(2, (int) user.pkT05);
                        psUpd.setInt(3, existingRefId);
                        psUpd.executeUpdate();
                    }
                } else {
                    String insertSql = "INSERT INTO \"T00_Ref\" (\"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_Text\", FK_T00_PK_T05, \"Ref_SortValue\") " +
                                       "VALUES ('T03_EV_DepthLevel', 'No Limit', ?, ?, ?, 1)";
                    try (PreparedStatement psIns = conn.prepareStatement(insertSql)) {
                        psIns.setString(1, targetState);
                        psIns.setString(2, pjIdStr);
                        psIns.setInt(3, (int) user.pkT05);
                        psIns.executeUpdate();
                    }
                }

                ProjectRemarkLedger.append(conn, pjId, user, "EVENT_DEPTH_LIMIT_CHANGED", 
                    "Depth Limit " + (enableUnlimited ? "Unlocked (No Limit)" : "Locked (Max 3 Levels)"), 
                    "Configured by Project Administrator");

                conn.commit();
                JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\",\"depth_limit_unlimited\":" + enableUnlimited + "}");
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }
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

    private void handleEventList(HttpExchange exchange, Security.UserSession user) throws Exception {
        int pjId = extractQueryInt(exchange, "pj");
        String phParam = extractQueryString(exchange, "ph");
        boolean myHandleOnly = "true".equalsIgnoreCase(extractQueryString(exchange, "my_handle"));
        boolean includeDeleted = "true".equalsIgnoreCase(extractQueryString(exchange, "include_deleted"));

        if (pjId <= 0 && (phParam == null || phParam.trim().isEmpty())) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Parameter pj or ph is required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            int resolvedPjId = pjId;
            if (resolvedPjId <= 0 && phParam != null) {
                String firstPh = phParam.split(",")[0].trim();
                if (firstPh.matches("\\d+")) {
                    String findPjSql = "SELECT FK_T02_PK_T01 FROM \"T02_Phase\" WHERE PK_T02 = ?";
                    try (PreparedStatement psPj = conn.prepareStatement(findPjSql)) {
                        psPj.setInt(1, Integer.parseInt(firstPh));
                        try (ResultSet rsPj = psPj.executeQuery()) {
                            if (rsPj.next()) resolvedPjId = rsPj.getInt(1);
                        }
                    }
                }
            }

            if (resolvedPjId > 0 && !verifyProjectMember(conn, resolvedPjId, user.pkT05)) {
                JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Unauthorized to view events in this project");
                return;
            }

            String projectRight = getProjectRight(conn, resolvedPjId, user.pkT05);
            boolean isEventOnly = "EVENT ONLY".equalsIgnoreCase(projectRight);

            String userCompany = "";
            int userCustomPj = 0;
            if (isEventOnly) {
                String staffInfoSql = "SELECT \"ST_Company_Department\", FK_T05_PK_T01_CUSTOM FROM \"T05_Staff\" WHERE PK_T05 = ?";
                try (PreparedStatement psStaff = conn.prepareStatement(staffInfoSql)) {
                    psStaff.setLong(1, user.pkT05);
                    try (ResultSet rsStaff = psStaff.executeQuery()) {
                        if (rsStaff.next()) {
                            userCompany = rsStaff.getString("ST_Company_Department");
                            userCustomPj = rsStaff.getInt("FK_T05_PK_T01_CUSTOM");
                        }
                    }
                }
            }

            StringBuilder sql = new StringBuilder(
                "SELECT e.PK_T03, e.FK_T03_PK_T02, e.\"FK_T03_PK_T03_Parent\", e.\"EV_DepthLevel\", " +
                "       e.\"EV_Title\", e.\"EV_Type\", e.\"EV_Status\", " +
                "       e.\"EV_EventStartDateTime\", e.\"EV_EventEndDateTime\", e.\"EV_FolderLink\", " +
                "       e.\"EV_Description\", e.\"EV_Remark\", e.\"EV_Frozen\", e.\"EV_FrozenDateTime\", " +
                "       e.\"EV_ignore_delete\", e.\"FK_T03_PK_T05_Owner\", e.\"FK_T03_PK_T05_Creator\", " +
                "       ph.\"PH_Name\", ph.\"PH_Sequence\", ph.\"PH_ignore_delete\", ph.\"PH_Frozen\", " +
                "       owner.\"ST_Name\" AS OWNER_NAME, owner.\"ST_Rank\" AS OWNER_RANK, owner.\"ST_Email\" AS OWNER_EMAIL, " +
                "       owner.\"ST_Company_Department\" AS OWNER_COMPANY, owner.FK_T05_PK_T01_CUSTOM AS OWNER_CUSTOM_PJ " +
                "FROM \"T03_Events\" e " +
                "JOIN \"T02_Phase\" ph ON e.FK_T03_PK_T02 = ph.PK_T02 " +
                "LEFT JOIN \"T05_Staff\" owner ON e.\"FK_T03_PK_T05_Owner\" = owner.PK_T05 " +
                "WHERE 1=1 "
            );

            List<Object> params = new ArrayList<>();

            if (!includeDeleted) {
                sql.append(" AND e.\"EV_ignore_delete\" = FALSE ");
            }

            if (phParam != null && !phParam.trim().isEmpty()) {
                List<Integer> phIds = Arrays.stream(phParam.split(","))
                        .map(String::trim)
                        .filter(s -> s.matches("\\d+"))
                        .map(Integer::parseInt)
                        .collect(Collectors.toList());

                if (!phIds.isEmpty()) {
                    String inClause = phIds.stream().map(id -> "?").collect(Collectors.joining(","));
                    sql.append(" AND e.FK_T03_PK_T02 IN (").append(inClause).append(") ");
                    params.addAll(phIds);
                } else if (resolvedPjId > 0) {
                    sql.append(" AND ph.FK_T02_PK_T01 = ? ");
                    params.add(resolvedPjId);
                }
            } else if (resolvedPjId > 0) {
                sql.append(" AND ph.FK_T02_PK_T01 = ? ");
                params.add(resolvedPjId);
            }

            if (isEventOnly) {
                if (userCustomPj != 0 && userCompany != null && !userCompany.trim().isEmpty()) {
                    sql.append(" AND (e.\"FK_T03_PK_T05_Owner\" = ? OR e.\"FK_T03_PK_T05_Owner\" IN (" +
                               "     SELECT s.PK_T05 FROM \"T05_Staff\" s " +
                               "     WHERE s.\"ST_Company_Department\" = ? AND s.FK_T05_PK_T01_CUSTOM <> 0" +
                               ")) ");
                    params.add(user.pkT05);
                    params.add(userCompany.trim());
                } else {
                    sql.append(" AND e.\"FK_T03_PK_T05_Owner\" = ? ");
                    params.add(user.pkT05);
                }
            } else if (myHandleOnly) {
                sql.append(" AND e.\"FK_T03_PK_T05_Owner\" = ? ");
                params.add(user.pkT05);
            }

            sql.append(" ORDER BY e.\"EV_DepthLevel\" ASC, e.\"EV_EventStartDateTime\" ASC, e.PK_T03 ASC");

            StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"depth_limit_unlimited\":")
                    .append(isDepthLimitUnlocked(conn, resolvedPjId))
                    .append(",\"events\":[");

            try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
                for (int i = 0; i < params.size(); i++) {
                    ps.setObject(i + 1, params.get(i));
                }
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(",");
                        sb.append("{")
                          .append("\"pk_t03\":").append(rs.getInt("PK_T03")).append(",")
                          .append("\"fk_t02\":").append(rs.getInt("FK_T03_PK_T02")).append(",")
                          .append("\"parent_id\":").append(rs.getObject("FK_T03_PK_T03_Parent") == null ? "null" : rs.getInt("FK_T03_PK_T03_Parent")).append(",")
                          .append("\"depth_level\":").append(rs.getInt("EV_DepthLevel")).append(",")
                          .append("\"ph_name\":\"").append(JsonUtil.escape(rs.getString("PH_Name"))).append("\",")
                          .append("\"ph_sequence\":").append(rs.getInt("PH_Sequence")).append(",")
                          .append("\"ph_ignore_delete\":").append(rs.getBoolean("PH_ignore_delete")).append(",")
                          .append("\"ph_frozen\":").append(rs.getBoolean("PH_Frozen")).append(",")
                          .append("\"ev_title\":\"").append(JsonUtil.escape(rs.getString("EV_Title"))).append("\",")
                          .append("\"ev_type\":\"").append(JsonUtil.escape(rs.getString("EV_Type"))).append("\",")
                          .append("\"ev_status\":\"").append(JsonUtil.escape(rs.getString("EV_Status"))).append("\",")
                          .append("\"ev_start_date\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("EV_EventStartDateTime"))).append("\",")
                          .append("\"ev_end_date\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("EV_EventEndDateTime"))).append("\",")
                          .append("\"ev_folder_link\":\"").append(JsonUtil.escape(rs.getString("EV_FolderLink"))).append("\",")
                          .append("\"ev_description\":\"").append(JsonUtil.escape(rs.getString("EV_Description"))).append("\",")
                          .append("\"ev_remark\":\"").append(JsonUtil.escape(rs.getString("EV_Remark"))).append("\",")
                          .append("\"ev_frozen\":").append(rs.getBoolean("EV_Frozen")).append(",")
                          .append("\"ev_frozen_date\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("EV_FrozenDateTime"))).append("\",")
                          .append("\"ev_ignore_delete\":").append(rs.getBoolean("EV_ignore_delete")).append(",")
                          .append("\"creator_id\":").append(rs.getObject("FK_T03_PK_T05_Creator") == null ? "null" : rs.getInt("FK_T03_PK_T05_Creator")).append(",")
                          .append("\"owner_id\":").append(rs.getObject("FK_T03_PK_T05_Owner") == null ? "null" : rs.getInt("FK_T03_PK_T05_Owner")).append(",")
                          .append("\"owner_name\":\"").append(JsonUtil.escape(rs.getString("OWNER_NAME"))).append("\",")
                          .append("\"owner_rank\":\"").append(JsonUtil.escape(rs.getString("OWNER_RANK"))).append("\",")
                          .append("\"owner_email\":\"").append(JsonUtil.escape(rs.getString("OWNER_EMAIL"))).append("\",")
                          .append("\"owner_company\":\"").append(JsonUtil.escape(rs.getString("OWNER_COMPANY"))).append("\"")
                          .append("}");
                        first = false;
                    }
                }
            }
            sb.append("]}");
            JsonUtil.sendJson(exchange, 200, sb.toString());
        }
    }

    private void handleEventDetail(HttpExchange exchange, Security.UserSession user) throws Exception {
        int evId = extractQueryInt(exchange, "ev");
        if (evId <= 0) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Event ID (ev) is required");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            String sql = "SELECT e.*, ph.FK_T02_PK_T01, ph.\"PH_Frozen\" AS PHASE_FROZEN, " +
                         "       owner.\"ST_Name\" AS OWNER_NAME, owner.\"ST_Company_Department\" AS OWNER_COMPANY, " +
                         "       owner.FK_T05_PK_T01_CUSTOM AS OWNER_CUSTOM_PJ " +
                         "FROM \"T03_Events\" e " +
                         "JOIN \"T02_Phase\" ph ON e.FK_T03_PK_T02 = ph.PK_T02 " +
                         "LEFT JOIN \"T05_Staff\" owner ON e.\"FK_T03_PK_T05_Owner\" = owner.PK_T05 " +
                         "WHERE e.PK_T03 = ? AND e.\"EV_ignore_delete\" = FALSE";

            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setInt(1, evId);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Event record not found");
                        return;
                    }

                    int pjId = rs.getInt("FK_T02_PK_T01");
                    if (!verifyProjectMember(conn, pjId, user.pkT05)) {
                        JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Unauthorized to access this project");
                        return;
                    }

                    StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"data\":{");
                    sb.append("\"pk_t03\":").append(rs.getInt("PK_T03")).append(",")
                      .append("\"fk_t02\":").append(rs.getInt("FK_T03_PK_T02")).append(",")
                      .append("\"parent_id\":").append(rs.getObject("FK_T03_PK_T03_Parent") == null ? "null" : rs.getInt("FK_T03_PK_T03_Parent")).append(",")
                      .append("\"ev_depth_level\":").append(rs.getInt("EV_DepthLevel")).append(",")
                      .append("\"ev_title\":\"").append(JsonUtil.escape(rs.getString("EV_Title"))).append("\",")
                      .append("\"ev_type\":\"").append(JsonUtil.escape(rs.getString("EV_Type"))).append("\",")
                      .append("\"ev_status\":\"").append(JsonUtil.escape(rs.getString("EV_Status"))).append("\",")
                      .append("\"ev_description\":\"").append(JsonUtil.escape(rs.getString("EV_Description"))).append("\",")
                      .append("\"ev_remark\":\"").append(JsonUtil.escape(rs.getString("EV_Remark"))).append("\",")
                      .append("\"ev_folder_link\":\"").append(JsonUtil.escape(rs.getString("EV_FolderLink"))).append("\",")
                      .append("\"ev_start_date\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("EV_EventStartDateTime"))).append("\",")
                      .append("\"ev_end_date\":\"").append(JsonUtil.formatTimestamp(rs.getTimestamp("EV_EventEndDateTime"))).append("\",")
                      .append("\"ev_frozen\":").append(rs.getBoolean("EV_Frozen")).append(",")
                      .append("\"creator_id\":").append(rs.getObject("FK_T03_PK_T05_Creator") == null ? "null" : rs.getInt("FK_T03_PK_T05_Creator")).append(",")
                      .append("\"owner_id\":").append(rs.getObject("FK_T03_PK_T05_Owner") == null ? "null" : rs.getInt("FK_T03_PK_T05_Owner")).append(",")
                      .append("\"owner_name\":\"").append(JsonUtil.escape(rs.getString("OWNER_NAME"))).append("\"")
                      .append("}}");

                    JsonUtil.sendJson(exchange, 200, sb.toString());
                }
            }
        }
    }

    private boolean isDepthLimitUnlocked(Connection conn, int pjId) throws Exception {
        if (pjId <= 0) return false;
        String sql = "SELECT 1 FROM \"T00_Ref\" " +
                     "WHERE \"Ref_CategoryA\" = 'T03_EV_DepthLevel' " +
                     "  AND \"Ref_CategoryB\" = 'No Limit' " +
                     "  AND UPPER(\"Ref_CategoryC\") = 'ENABLE' " +
                     "  AND \"Ref_Text\" = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, String.valueOf(pjId));
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private void enrollStaffToProject(Connection conn, int pjId, int staffId, String eventTitle, Security.UserSession user) throws Exception {
        String checkRoleSql = "SELECT PK_T06, \"PR_ignore_delete\" FROM \"T06_ProjectRoles\" " +
                             "WHERE FK_T06_PK_T01 = ? AND FK_T06_PK_T05 = ?";
        Integer existingRoleId = null;
        boolean isDeletedRole = false;

        try (PreparedStatement psRoleCheck = conn.prepareStatement(checkRoleSql)) {
            psRoleCheck.setInt(1, pjId);
            psRoleCheck.setInt(2, staffId);
            try (ResultSet rsRole = psRoleCheck.executeQuery()) {
                if (rsRole.next()) {
                    existingRoleId = rsRole.getInt("PK_T06");
                    isDeletedRole = rsRole.getBoolean("PR_ignore_delete");
                }
            }
        }

        if (existingRoleId != null) {
            if (isDeletedRole) {
                String reactivateSql = "UPDATE \"T06_ProjectRoles\" SET " +
                                       "\"PR_ignore_delete\" = FALSE, \"PR_StartDate\" = CURRENT_TIMESTAMP, " +
                                       "\"PR_EndDate\" = NULL WHERE PK_T06 = ?";
                try (PreparedStatement psReactivate = conn.prepareStatement(reactivateSql)) {
                    psReactivate.setInt(1, existingRoleId);
                    psReactivate.executeUpdate();
                }
                ProjectRemarkLedger.append(conn, pjId, user, "MEMBER_AUTO_ENROLLED", 
                    "Reactivated Officer [Staff ID: " + staffId + "] as Project Member", 
                    "Assigned as Owner for Event [" + eventTitle + "]");
            }
        } else {
            String insertRoleSql = "INSERT INTO \"T06_ProjectRoles\" " +
                                   "(FK_T06_PK_T01, FK_T06_PK_T05, \"PR_RoleType\", \"PR_Right\", \"PR_StartDate\", \"PR_ignore_delete\") " +
                                   "VALUES (?, ?, 'Member', 'GENERAL', CURRENT_TIMESTAMP, FALSE)";
            try (PreparedStatement psRoleIns = conn.prepareStatement(insertRoleSql)) {
                psRoleIns.setInt(1, pjId);
                psRoleIns.setInt(2, staffId);
                psRoleIns.executeUpdate();
            }
            ProjectRemarkLedger.append(conn, pjId, user, "MEMBER_AUTO_ENROLLED", 
                "Auto-enrolled Officer [Staff ID: " + staffId + "] as Project Member", 
                "Assigned as Owner for Event [" + eventTitle + "]");
        }
    }

    private boolean verifyProjectMember(Connection conn, int pjId, long staffId) throws Exception {
        return ProjectHandler.verifyProjectMember(conn, pjId, staffId);
    }

    private String getProjectRight(Connection conn, int pjId, long staffId) throws Exception {
        return ProjectHandler.getProjectRight(conn, pjId, staffId);
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

    private String extractQueryString(HttpExchange exchange, String key) {
        String query = exchange.getRequestURI().getQuery();
        if (query != null) {
            for (String param : query.split("&")) {
                String[] pair = param.split("=");
                if (pair.length == 2 && key.equals(pair[0])) {
                    return pair[1];
                }
            }
        }
        return null;
    }
}