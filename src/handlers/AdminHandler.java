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

public class AdminHandler implements HttpHandler {

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
            // T00_Ref 捷徑庫支援全體同仁讀取
            if ("GET".equals(method) && "/api/portal/shortcut/list".equals(path)) {
                handleShortcutList(exchange, user);
            } else {
                // 其他維護功能需具備 ADMIN 權限
                if (!"ADMIN".equalsIgnoreCase(user.stRight)) {
                    JsonUtil.sendError(exchange, 403, "FORBIDDEN", "Admin privilege required");
                    return;
                }
                JsonUtil.sendError(exchange, 404, "NOT_FOUND", "Endpoint not found");
            }
        } catch (Exception e) {
            e.printStackTrace();
            JsonUtil.sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    private void handleShortcutList(HttpExchange exchange, Security.UserSession user) throws Exception {
        try (Connection conn = DB.getConnection()) {
            String sql = "SELECT PK_T00, \"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_SortValue\", \"Ref_Text\" " +
                         "FROM \"T00_Ref\" " +
                         "WHERE FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL " +
                         "ORDER BY \"Ref_SortValue\" ASC";

            StringBuilder sb = new StringBuilder("{\"status\":\"SUCCESS\",\"shortcuts\":[");
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setLong(1, user.pkT05);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(",");
                        sb.append("{")
                          .append("\"pk_t00\":").append(rs.getInt("PK_T00")).append(",")
                          .append("\"title\":\"").append(JsonUtil.escape(rs.getString("Ref_Text"))).append("\",")
                          .append("\"hash_param\":\"").append(JsonUtil.escape(rs.getString("Ref_CategoryA"))).append("\"")
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