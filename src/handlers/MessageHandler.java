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
import java.sql.Statement;

public class MessageHandler implements HttpHandler {

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
            if ("GET".equals(method) && "/api/portal/message/unread-count".equals(path)) {
                handleUnreadCount(exchange, user);
            } else if ("GET".equals(method) && "/api/portal/message/thread".equals(path)) {
                handleMessageThread(exchange);
            } else if ("POST".equals(method) && "/api/portal/message/send".equals(path)) {
                handleSendMessage(exchange, user);
            } else {
                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Endpoint not found");
            }
        } catch (Exception e) {
            e.printStackTrace();
            JsonUtil.sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    private void handleUnreadCount(HttpExchange exchange, Security.UserSession user) throws Exception {
        try (Connection conn = DB.getConnection()) {
            String sql = "SELECT COUNT(*) FROM \"T09_MessageRead\" " +
                         "WHERE FK_T09_PK_T05 = ? AND \"MR_MessageRead\" = FALSE AND \"MC_ignore_delete\" = FALSE";
            int count = 0;
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setLong(1, user.pkT05);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) count = rs.getInt(1);
                }
            }
            JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\",\"unread_count\":" + count + "}");
        }
    }

    private void handleMessageThread(HttpExchange exchange) throws Exception {
        String query = exchange.getRequestURI().getQuery();
        Integer pj = null, ev = null, ms = null;
        if (query != null) {
            for (String param : query.split("&")) {
                String[] pair = param.split("=");
                if (pair.length == 2) {
                    if ("pj".equals(pair[0])) pj = Integer.parseInt(pair[1]);
                    if ("ev".equals(pair[0])) ev = Integer.parseInt(pair[1]);
                    if ("ms".equals(pair[0])) ms = Integer.parseInt(pair[1]);
                }
            }
        }

        try (Connection conn = DB.getConnection()) {
            // 優先比對具體層級 (MS -> EV -> PJ)
            StringBuilder sql = new StringBuilder(
                "SELECT m.PK_T08, m.\"MC_Message\", m.\"MC_LastUpdatedDateTime\", m.\"FK_T08_PK_T05_from\", " +
                "       s.\"ST_Name\" AS FROM_NAME, q.PK_T08 AS Q_ID, q.\"MC_Message\" AS Q_MSG, qs.\"ST_Name\" AS Q_NAME " +
                "FROM \"T08_MultiComment\" m " +
                "JOIN \"T05_Staff\" s ON m.\"FK_T08_PK_T05_from\" = s.PK_T05 " +
                "LEFT JOIN \"T08_MultiComment\" q ON m.FK_T08_PK_T08 = q.PK_T08 " +
                "LEFT JOIN \"T05_Staff\" qs ON q.\"FK_T08_PK_T05_from\" = qs.PK_T05 " +
                "WHERE m.\"MC_ignore_delete\" = FALSE "
            );

            if (ms != null) {
                sql.append("AND m.FK_T08_PK_T04 = ? ");
            } else if (ev != null) {
                sql.append("AND m.FK_T08_PK_T03 = ? ");
            } else if (pj != null) {
                sql.append("AND m.FK_T08_PK_T01 = ? ");
            } else {
                JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\",\"messages\":[]}");
                return;
            }
            // 連登式排序：最新留言在底端
            sql.append("ORDER BY m.\"MC_LastUpdatedDateTime\" ASC");

            StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"messages\":[");
            try (PreparedStatement ps = conn.prepareStatement(sql.toString())) {
                int targetId = ms != null ? ms : (ev != null ? ev : pj);
                ps.setInt(1, targetId);

                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(",");
                        sb.append("{")
                          .append("\"pk_t08\":").append(rs.getInt("PK_T08")).append(",")
                          .append("\"from_name\":\"").append(JsonUtil.escape(rs.getString("FROM_NAME"))).append("\",")
                          .append("\"message\":\"").append(JsonUtil.escape(rs.getString("MC_Message"))).append("\",")
                          .append("\"created_datetime\":\"").append(rs.getTimestamp("MC_LastUpdatedDateTime") != null ? rs.getTimestamp("MC_LastUpdatedDateTime").toString() : "").append("\"");

                        if (rs.getInt("Q_ID") > 0) {
                            String quoteSnippet = rs.getString("Q_MSG");
                            if (quoteSnippet != null && quoteSnippet.length() > 50) quoteSnippet = quoteSnippet.substring(0, 50) + "...";
                            sb.append(",\"quote\":{")
                              .append("\"from_name\":\"").append(JsonUtil.escape(rs.getString("Q_NAME"))).append("\",")
                              .append("\"snippet\":\"").append(JsonUtil.escape(quoteSnippet)).append("\"")
                              .append("}");
                        }
                        sb.append("}");
                        first = false;
                    }
                }
            }
            sb.append("]}");
            JsonUtil.sendJson(exchange, 200, sb.toString());
        }
    }

    private void handleSendMessage(HttpExchange exchange, Security.UserSession user) throws Exception {
        String body = readBody(exchange);
        String message = extractJsonField(body, "message");
        Integer pj = extractJsonInt(body, "fk_t08_pk_t01");
        Integer ev = extractJsonInt(body, "fk_t08_pk_t03");
        Integer ms = extractJsonInt(body, "fk_t08_pk_t04");
        Integer quoteId = extractJsonInt(body, "fk_t08_pk_t08_quote");

        if (message == null || message.trim().isEmpty()) {
            JsonUtil.sendError(exchange, 400, "BAD_REQUEST", "Message content cannot be empty");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            String sql = "INSERT INTO \"T08_MultiComment\" (FK_T08_PK_T01, FK_T08_PK_T03, FK_T08_PK_T04, FK_T08_PK_T08, \"FK_T08_PK_T05_from\", \"MC_Message\", \"MC_LastUpdatedDateTime\") " +
                         "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)";

            try (PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
                if (pj != null && pj > 0) ps.setInt(1, pj); else ps.setNull(1, java.sql.Types.INTEGER);
                if (ev != null && ev > 0) ps.setInt(2, ev); else ps.setNull(2, java.sql.Types.INTEGER);
                if (ms != null && ms > 0) ps.setInt(3, ms); else ps.setNull(3, java.sql.Types.INTEGER);
                if (quoteId != null && quoteId > 0) ps.setInt(4, quoteId); else ps.setNull(4, java.sql.Types.INTEGER);
                ps.setLong(5, user.pkT05);
                ps.setString(6, message);
                ps.executeUpdate();
            }
            JsonUtil.sendJson(exchange, 200, "{\"status\":\"SUCCESS\"}");
        }
    }

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