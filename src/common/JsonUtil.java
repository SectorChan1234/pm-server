package common;

import com.sun.net.httpserver.HttpExchange;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class JsonUtil {

    // 限制單次請求主體最大 1MB，避免惡意超大封包耗盡記憶體
    private static final int MAX_BODY_BYTES = 1024 * 1024;

    // ==========================================
    // 1. JSON 輸出與轉義安全工具
    // ==========================================
    public static String escape(String s) {
        if (s == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"':
                    sb.append("\\\"");
                    break;
                case '\\':
                    sb.append("\\\\");
                    break;
                case '\b':
                    sb.append("\\b");
                    break;
                case '\f':
                    sb.append("\\f");
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                default:
                    if (ch <= '\u001F') {
                        String hex = Integer.toHexString(ch);
                        sb.append("\\u");
                        for (int k = 0; k < 4 - hex.length(); k++) {
                            sb.append('0');
                        }
                        sb.append(hex);
                    } else {
                        sb.append(ch);
                    }
            }
        }
        return sb.toString();
    }

    public static void sendJson(HttpExchange exchange, int statusCode, String response) throws IOException {
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    public static void sendError(HttpExchange exchange, int statusCode, String code, String message) throws IOException {
        String json = "{\"status\":\"ERROR\",\"code\":\"" + escape(code) + "\",\"message\":\"" + escape(message) + "\"}";
        sendJson(exchange, statusCode, json);
    }

    // ==========================================
    // 2. HTTP Request Body 串流讀取工具
    // ==========================================
    public static String readBody(HttpExchange exchange) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            char[] buffer = new char[4096];
            int totalRead = 0;
            int bytesRead;

            while ((bytesRead = reader.read(buffer)) != -1) {
                totalRead += bytesRead;
                if (totalRead > MAX_BODY_BYTES) {
                    throw new IOException("Payload Too Large: Request body exceeds 1MB limit.");
                }
                sb.append(buffer, 0, bytesRead);
            }
            return sb.toString();
        }
    }

    // ==========================================
    // 3. 強固型 JSON 欄位提取工具 (支援跨行與反斜線還原)
    // ==========================================
    public static String extractString(String json, String field) {
        if (json == null || field == null) return null;

        // 支援引號轉義與跨行內容匹配
        String regex = "\"" + Pattern.quote(field) + "\"\\s*:\\s*\"((?:\\\\\"|[^\"])*)\"";
        Pattern pattern = Pattern.compile(regex, Pattern.DOTALL);
        Matcher matcher = pattern.matcher(json);

        if (matcher.find()) {
            String rawVal = matcher.group(1);
            // 還原 JSON 轉義字元
            return rawVal.replace("\\\"", "\"")
                         .replace("\\\\", "\\")
                         .replace("\\n", "\n")
                         .replace("\\r", "\r")
                         .replace("\\t", "\t");
        }
        return null;
    }

    public static Integer extractInt(String json, String field) {
        if (json == null || field == null) return null;

        String regex = "\"" + Pattern.quote(field) + "\"\\s*:\\s*(-?\\d+)";
        Matcher matcher = Pattern.compile(regex).matcher(json);
        if (matcher.find()) {
            try {
                return Integer.parseInt(matcher.group(1));
            } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    public static Boolean extractBool(String json, String field) {
        if (json == null || field == null) return null;

        String regex = "\"" + Pattern.quote(field) + "\"\\s*:\\s*(true|false)";
        Matcher matcher = Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(json);
        if (matcher.find()) {
            return Boolean.parseBoolean(matcher.group(1));
        }
        return null;
    }

    // ==========================================
    // 4. 資料庫安全轉換與 PreparedStatement 綁定
    // ==========================================
    public static void setTimestampSafely(PreparedStatement ps, int paramIndex, String dateStr) throws SQLException {
        if (dateStr == null || dateStr.trim().isEmpty()) {
            ps.setNull(paramIndex, Types.TIMESTAMP);
            return;
        }

        String s = dateStr.trim().replace("T", " ");
        if (s.length() == 10) {
            s += " 00:00:00";
        } else if (s.length() == 16) {
            s += ":00";
        }

        try {
            ps.setTimestamp(paramIndex, Timestamp.valueOf(s));
        } catch (IllegalArgumentException e) {
            // 當傳入非標準格式時，安全寫入 NULL，避免整筆 SQL 交易崩潰
            ps.setNull(paramIndex, Types.TIMESTAMP);
        }
    }

    public static String formatTimestamp(Timestamp ts) {
        return ts != null ? ts.toString() : "";
    }
}