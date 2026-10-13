package handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import common.DB;
import common.JsonUtil;
import common.Security;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

public class MissionHandler implements HttpHandler {

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
            if ("GET".equals(method) && "/api/portal/mission/my-handle-missions".equals(path)) {
                handleMyHandleMissions(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/mission/my-joined-missions".equals(path)) {
                handleMyJoinedMissions(exchange, user);
            } else {
                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Endpoint not found");
            }
        } catch (Exception e) {
            e.printStackTrace();
            JsonUtil.sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    private void handleMyHandleMissions(HttpExchange exchange, Security.UserSession user) throws Exception {
        try (Connection conn = DB.getConnection()) {
            // 我作為 PIC 的任務
            String sql = "SELECT m.PK_T04, m.\"MS_Name\", m.\"MS_Status\", m.\"MS_TargetStartDate\", m.\"MS_Frozen\", p.\"PJ_Code\" " +
                         "FROM \"T04_Missions\" m " +
                         "JOIN \"T03_Events\" e ON m.FK_T04_PK_T03 = e.PK_T03 " +
                         "JOIN \"T02_Phase\" ph ON e.FK_T03_PK_T02 = ph.PK_T02 " +
                         "JOIN \"T01_Projects\" p ON ph.FK_T02_PK_T01 = p.PK_T01 " +
                         "WHERE m.FK_T04_PK_T05_PIC = ? AND m.\"MS_ignore_delete\" = FALSE " +
                         "ORDER BY m.\"MS_TargetStartDate\" DESC";

            StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"missions\":[");
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setLong(1, user.pkT05);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(",");
                        sb.append("{")
                          .append("\"pk_t04\":").append(rs.getInt("PK_T04")).append(",")
                          .append("\"pj_code\":\"").append(JsonUtil.escape(rs.getString("PJ_Code"))).append("\",")
                          .append("\"ms_title\":\"").append(JsonUtil.escape(rs.getString("MS_Name"))).append("\",")
                          .append("\"ms_status\":\"").append(JsonUtil.escape(rs.getString("MS_Status"))).append("\",")
                          .append("\"start_datetime\":\"").append(rs.getTimestamp("MS_TargetStartDate") != null ? rs.getTimestamp("MS_TargetStartDate").toString() : "").append("\",")
                          .append("\"is_frozen\":").append(rs.getBoolean("MS_Frozen"))
                          .append("}");
                        first = false;
                    }
                }
            }
            sb.append("]}");
            JsonUtil.sendJson(exchange, 200, sb.toString());
        }
    }

    private void handleMyJoinedMissions(HttpExchange exchange, Security.UserSession user) throws Exception {
        try (Connection conn = DB.getConnection()) {
            // 透過 T07_JoinMissions 被指派協同的任務
            String sql = "SELECT m.PK_T04, m.\"MS_Name\", m.\"MS_Status\", p.\"PJ_Code\", j.\"JM_Frozen\" " +
                         "FROM \"T07_JoinMissions\" j " +
                         "JOIN \"T04_Missions\" m ON j.FK_T07_PK_T04 = m.PK_T04 " +
                         "JOIN \"T03_Events\" e ON m.FK_T04_PK_T03 = e.PK_T03 " +
                         "JOIN \"T02_Phase\" ph ON e.FK_T03_PK_T02 = ph.PK_T02 " +
                         "JOIN \"T01_Projects\" p ON ph.FK_T02_PK_T01 = p.PK_T01 " +
                         "WHERE j.FK_T07_PK_T05 = ? AND j.\"JM_ignore_delete\" = FALSE AND m.\"MS_ignore_delete\" = FALSE " +
                         "ORDER BY m.\"MS_CreatedDate\" DESC";

            StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"missions\":[");
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setLong(1, user.pkT05);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(",");
                        sb.append("{")
                          .append("\"pk_t04\":").append(rs.getInt("PK_T04")).append(",")
                          .append("\"pj_code\":\"").append(JsonUtil.escape(rs.getString("PJ_Code"))).append("\",")
                          .append("\"ms_title\":\"").append(JsonUtil.escape(rs.getString("MS_Name"))).append("\",")
                          .append("\"ms_status\":\"").append(JsonUtil.escape(rs.getString("MS_Status"))).append("\",")
                          .append("\"is_restricted_guest\":false")
                          .append("}");
                        first = false;
                    }
                }
            }
            sb.append("]}");
            JsonUtil.sendJson(exchange, 200, sb.toString());
        }
    }
}