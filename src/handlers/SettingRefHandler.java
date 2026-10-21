package handlers;

import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import common.DB;
import common.Security;
import common.Security.UserSession;

public class SettingRefHandler implements HttpHandler {

    private static final Set<String> RESERVED_SYSTEM_FOLDERS = Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList("PREPARE", "WORKING", "ARCHIVE"))
    );

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();

        if ("OPTIONS".equalsIgnoreCase(method)) {
            sendResponse(exchange, 204, "");
            return;
        }

        UserSession session = Security.authenticate(exchange);
        if (session == null) {
            sendJsonResponse(exchange, 401, "{\"status\":\"FAILED\",\"message\":\"Missing or invalid Authorization header\"}");
            return;
        }

        long userId = session.pkT05;
        if (userId <= 0) {
            sendJsonResponse(exchange, 401, "{\"status\":\"FAILED\",\"message\":\"Unable to identify user context\"}");
            return;
        }

        try {
            switch (path) {
                case "/api/setting/folder/list":
                    if ("GET".equalsIgnoreCase(method)) {
                        handleFolderList(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/folder/save":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleFolderSave(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/folder/rename":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleFolderRename(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/folder/delete":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleFolderDelete(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/folder/assign":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleFolderAssign(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/shortcut/list":
                    if ("GET".equalsIgnoreCase(method)) {
                        handleShortcutList(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/shortcut/save":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleShortcutSave(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/shortcut/reorder":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleShortcutReorder(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/shortcut/delete":
                    if ("POST".equalsIgnoreCase(method)) {
                        handleShortcutDelete(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/preferences/list":
                    if ("GET".equalsIgnoreCase(method)) {
                        handlePreferencesList(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/preferences/save":
                    if ("POST".equalsIgnoreCase(method)) {
                        handlePreferencesSave(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                case "/api/setting/preferences/delete":
                    if ("POST".equalsIgnoreCase(method)) {
                        handlePreferencesDelete(exchange, userId);
                    } else {
                        sendResponse(exchange, 405, "Method Not Allowed");
                    }
                    break;
                default:
                    sendResponse(exchange, 404, "Not Found");
                    break;
            }
        } catch (Exception e) {
            e.printStackTrace();
            sendJsonResponse(exchange, 500, "{\"status\":\"ERROR\",\"message\":\"" + escapeJson(e.getMessage()) + "\"}");
        }
    }

    // ======================================================================
    // 1. Folder Management Services
    // ======================================================================

    private void handleFolderList(HttpExchange exchange, long userId) throws SQLException, IOException {
        List<Map<String, Object>> folders = new ArrayList<>();
        List<Map<String, Object>> mappings = new ArrayList<>();

        try (Connection conn = DB.getConnection()) {
            String folderSql = "SELECT PK_T00, \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_Text\", \"Ref_SortValue\", FK_T00_PK_T05 "
                             + "FROM \"T00_Ref\" "
                             + "WHERE \"Ref_CategoryA\" = '{\"label\":\"System\",\"Module\":\"FOLDER\"}' "
                             + "  AND (FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL) "
                             + "ORDER BY \"Ref_SortValue\" ASC, PK_T00 ASC";
            try (PreparedStatement ps = conn.prepareStatement(folderSql)) {
                ps.setLong(1, userId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        int pkT00 = rs.getInt("PK_T00");
                        String catB = rs.getString("Ref_CategoryB");
                        String catC = rs.getString("Ref_CategoryC");
                        String refText = rs.getString("Ref_Text");
                        long ownerFk = rs.getLong("FK_T00_PK_T05");
                        boolean isFkNull = rs.wasNull();

                        String folderName = extractJsonValue(catB, "SettingValue");
                        boolean isSystem = isFkNull || (folderName != null && RESERVED_SYSTEM_FOLDERS.contains(folderName.toUpperCase()));
                        
						boolean zone4Visible = false;
						if (refText != null) {
							String rt = refText.trim();
							if ("VISIBLE".equalsIgnoreCase(rt)) {
								zone4Visible = true;
							} else if (rt.contains("\"zone4_visible\":true") || rt.contains("\"zone4_visible\": true")) {
								zone4Visible = true;
							}
						}

                        Map<String, Object> map = new java.util.HashMap<>();
                        map.put("pkT00", pkT00);
                        map.put("folderName", folderName != null ? folderName : "");
                        map.put("status", catC != null ? catC : "Enable");
                        map.put("zone4Visible", zone4Visible);
                        map.put("isSystem", isSystem);
                        folders.add(map);
                    }
                }
            }

            String mapSql = "SELECT PK_T00, \"Ref_CategoryB\", \"Ref_Text\" "
                          + "FROM \"T00_Ref\" "
                          + "WHERE \"Ref_CategoryA\" = '{\"label\":\"Table\",\"TableName\":\"T01_Projects\",\"FieldName\":\"PK_T01\"}' "
                          + "  AND FK_T00_PK_T05 = ?";
            try (PreparedStatement ps = conn.prepareStatement(mapSql)) {
                ps.setLong(1, userId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        int pkT00 = rs.getInt("PK_T00");
                        String catB = rs.getString("Ref_CategoryB");
                        String pjId = rs.getString("Ref_Text");
                        String folderName = extractJsonValue(catB, "SettingValue");

                        Map<String, Object> map = new java.util.HashMap<>();
                        map.put("pkT00", pkT00);
                        map.put("pjId", pjId);
                        map.put("folderName", folderName != null ? folderName : "");
                        mappings.add(map);
                    }
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("{\"status\":\"SUCCESS\",");
        sb.append("\"folders\":[");
        for (int i = 0; i < folders.size(); i++) {
            Map<String, Object> f = folders.get(i);
            if (i > 0) sb.append(",");
            sb.append("{")
              .append("\"pkT00\":").append(f.get("pkT00")).append(",")
              .append("\"folderName\":\"").append(escapeJson((String) f.get("folderName"))).append("\",")
              .append("\"status\":\"").append(escapeJson((String) f.get("status"))).append("\",")
              .append("\"zone4Visible\":").append(f.get("zone4Visible")).append(",")
              .append("\"isSystem\":").append(f.get("isSystem"))
              .append("}");
        }
        sb.append("],\"mappings\":[");
        for (int i = 0; i < mappings.size(); i++) {
            Map<String, Object> m = mappings.get(i);
            if (i > 0) sb.append(",");
            sb.append("{")
              .append("\"pkT00\":").append(m.get("pkT00")).append(",")
              .append("\"pjId\":\"").append(escapeJson((String) m.get("pjId"))).append("\",")
              .append("\"folderName\":\"").append(escapeJson((String) m.get("folderName"))).append("\"")
              .append("}");
        }
        sb.append("]}");

        sendJsonResponse(exchange, 200, sb.toString());
    }

    private void handleFolderSave(HttpExchange exchange, long userId) throws Exception {
        String body = readBody(exchange);
        String folderName = extractJsonField(body, "folderName");
        boolean zone4Visible = extractJsonBoolean(body, "zone4Visible", true);
        boolean enable = extractJsonBoolean(body, "enable", true);
        Integer pkT00 = extractJsonInteger(body, "pkT00");

        if (folderName.isEmpty()) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Folder name cannot be empty.\"}");
            return;
        }

        if (pkT00 == null && RESERVED_SYSTEM_FOLDERS.contains(folderName.toUpperCase())) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Cannot create custom folder with reserved system name '" + escapeJson(folderName) + "'.\"}");
            return;
        }

        String catA = "{\"label\":\"System\",\"Module\":\"FOLDER\"}";
        String catB = "{\"SettingName\":\"FOLDER_NAME\",\"SettingValue\":\"" + escapeJson(folderName) + "\"}";
        String catC = enable ? "Enable" : "Disable";
        String refText = zone4Visible ? "VISIBLE" : "HIDDEN";

        validateRefFieldLength(catA, 255, "Ref_CategoryA");
        validateRefFieldLength(catB, 255, "Ref_CategoryB");
        validateRefFieldLength(catC, 255, "Ref_CategoryC");
        validateRefFieldLength(refText, 255, "Ref_Text");

        try (Connection conn = DB.getConnection()) {
            if (pkT00 != null && pkT00 > 0) {
                String checkSql = "SELECT \"Ref_CategoryB\", FK_T00_PK_T05 FROM \"T00_Ref\" WHERE PK_T00 = ? AND (FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL)";
                try (PreparedStatement psCheck = conn.prepareStatement(checkSql)) {
                    psCheck.setInt(1, pkT00);
                    psCheck.setLong(2, userId);
                    try (ResultSet rs = psCheck.executeQuery()) {
                        if (rs.next()) {
                            rs.getLong("FK_T00_PK_T05");
                            if (rs.wasNull()) {
                                sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"System default folders cannot be modified.\"}");
                                return;
                            }
                        }
                    }
                }

                String updateSql = "UPDATE \"T00_Ref\" "
                                 + "SET \"Ref_CategoryB\" = ?, \"Ref_CategoryC\" = ?, \"Ref_Text\" = ? "
                                 + "WHERE PK_T00 = ? AND FK_T00_PK_T05 = ?";
                try (PreparedStatement ps = conn.prepareStatement(updateSql)) {
                    ps.setString(1, catB);
                    ps.setString(2, catC);
                    ps.setString(3, refText);
                    ps.setInt(4, pkT00);
                    ps.setLong(5, userId);
                    ps.executeUpdate();
                }
            } else {
                String dupSql = "SELECT COUNT(*) FROM \"T00_Ref\" "
                              + "WHERE \"Ref_CategoryA\" = ? AND (FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL) AND LOWER(\"Ref_CategoryB\") = LOWER(?)";
                try (PreparedStatement psDup = conn.prepareStatement(dupSql)) {
                    psDup.setString(1, catA);
                    psDup.setLong(2, userId);
                    psDup.setString(3, catB);
                    try (ResultSet rs = psDup.executeQuery()) {
                        if (rs.next() && rs.getInt(1) > 0) {
                            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"A folder named '" + escapeJson(folderName) + "' already exists.\"}");
                            return;
                        }
                    }
                }

                String insertSql = "INSERT INTO \"T00_Ref\" (\"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_SortValue\", \"Ref_Text\", FK_T00_PK_T05) "
                                 + "VALUES (?, ?, ?, 999, ?, ?)";
                try (PreparedStatement psIns = conn.prepareStatement(insertSql)) {
                    psIns.setString(1, catA);
                    psIns.setString(2, catB);
                    psIns.setString(3, catC);
                    psIns.setString(4, refText);
                    psIns.setLong(5, userId);
                    psIns.executeUpdate();
                }
            }
        }

        sendJsonResponse(exchange, 200, "{\"status\":\"SUCCESS\",\"message\":\"Folder saved successfully.\"}");
    }

    private void handleFolderRename(HttpExchange exchange, long userId) throws Exception {
        String body = readBody(exchange);
        Integer pkT00 = extractJsonInteger(body, "pkT00");
        String newFolderName = extractJsonField(body, "newFolderName");

        if (pkT00 == null || pkT00 <= 0) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Valid folder PK_T00 is required.\"}");
            return;
        }

        if (newFolderName.isEmpty()) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"New folder name cannot be empty.\"}");
            return;
        }

        if (RESERVED_SYSTEM_FOLDERS.contains(newFolderName.toUpperCase())) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Cannot rename folder to reserved system name '" + escapeJson(newFolderName) + "'.\"}");
            return;
        }

        String catA = "{\"label\":\"System\",\"Module\":\"FOLDER\"}";
        String newCatB = "{\"SettingName\":\"FOLDER_NAME\",\"SettingValue\":\"" + escapeJson(newFolderName) + "\"}";
        String newAssignCatB = "{\"SettingName\":\"ASSIGNED_FOLDER\",\"SettingValue\":\"" + escapeJson(newFolderName) + "\"}";

        validateRefFieldLength(newCatB, 255, "Ref_CategoryB");
        validateRefFieldLength(newAssignCatB, 255, "Ref_CategoryB");

        try (Connection conn = DB.getConnection()) {
            conn.setAutoCommit(false);
            try {
                String findSql = "SELECT \"Ref_CategoryB\", FK_T00_PK_T05 FROM \"T00_Ref\" WHERE PK_T00 = ? AND (FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL)";
                String oldFolderName = null;
                try (PreparedStatement psFind = conn.prepareStatement(findSql)) {
                    psFind.setInt(1, pkT00);
                    psFind.setLong(2, userId);
                    try (ResultSet rs = psFind.executeQuery()) {
                        if (!rs.next()) {
                            conn.rollback();
                            sendJsonResponse(exchange, 404, "{\"status\":\"FAILED\",\"message\":\"Target folder not found.\"}");
                            return;
                        }
                        rs.getLong("FK_T00_PK_T05");
                        if (rs.wasNull()) {
                            conn.rollback();
                            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"System default folders cannot be renamed.\"}");
                            return;
                        }
                        oldFolderName = extractJsonValue(rs.getString("Ref_CategoryB"), "SettingValue");
                    }
                }

                String dupSql = "SELECT COUNT(*) FROM \"T00_Ref\" "
                              + "WHERE \"Ref_CategoryA\" = ? AND (FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL) AND LOWER(\"Ref_CategoryB\") = LOWER(?) AND PK_T00 <> ?";
                try (PreparedStatement psDup = conn.prepareStatement(dupSql)) {
                    psDup.setString(1, catA);
                    psDup.setLong(2, userId);
                    psDup.setString(3, newCatB);
                    psDup.setInt(4, pkT00);
                    try (ResultSet rs = psDup.executeQuery()) {
                        if (rs.next() && rs.getInt(1) > 0) {
                            conn.rollback();
                            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"A folder named '" + escapeJson(newFolderName) + "' already exists.\"}");
                            return;
                        }
                    }
                }

                String updateFolderSql = "UPDATE \"T00_Ref\" SET \"Ref_CategoryB\" = ? WHERE PK_T00 = ? AND FK_T00_PK_T05 = ?";
                try (PreparedStatement psUpFolder = conn.prepareStatement(updateFolderSql)) {
                    psUpFolder.setString(1, newCatB);
                    psUpFolder.setInt(2, pkT00);
                    psUpFolder.setLong(3, userId);
                    psUpFolder.executeUpdate();
                }

                String oldAssignCatB = "{\"SettingName\":\"ASSIGNED_FOLDER\",\"SettingValue\":\"" + escapeJson(oldFolderName) + "\"}";
                String cascadeAssignSql = "UPDATE \"T00_Ref\" "
                                        + "SET \"Ref_CategoryB\" = ? "
                                        + "WHERE \"Ref_CategoryA\" = '{\"label\":\"Table\",\"TableName\":\"T01_Projects\",\"FieldName\":\"PK_T01\"}' "
                                        + "  AND \"Ref_CategoryB\" = ? "
                                        + "  AND FK_T00_PK_T05 = ?";
                try (PreparedStatement psCascade = conn.prepareStatement(cascadeAssignSql)) {
                    psCascade.setString(1, newAssignCatB);
                    psCascade.setString(2, oldAssignCatB);
                    psCascade.setLong(3, userId);
                    psCascade.executeUpdate();
                }

                conn.commit();
                sendJsonResponse(exchange, 200, "{\"status\":\"SUCCESS\",\"message\":\"Folder and assigned mappings renamed successfully.\"}");
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }
        }
    }

    private void handleFolderDelete(HttpExchange exchange, long userId) throws Exception {
        String body = readBody(exchange);
        Integer pkT00 = extractJsonInteger(body, "pkT00");

        if (pkT00 == null || pkT00 <= 0) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Valid folder PK_T00 is required.\"}");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            conn.setAutoCommit(false);
            try {
                String findSql = "SELECT \"Ref_CategoryB\", FK_T00_PK_T05 FROM \"T00_Ref\" WHERE PK_T00 = ? AND (FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL)";
                String folderName = null;
                try (PreparedStatement psFind = conn.prepareStatement(findSql)) {
                    psFind.setInt(1, pkT00);
                    psFind.setLong(2, userId);
                    try (ResultSet rs = psFind.executeQuery()) {
                        if (!rs.next()) {
                            conn.rollback();
                            sendJsonResponse(exchange, 404, "{\"status\":\"FAILED\",\"message\":\"Target folder not found.\"}");
                            return;
                        }
                        rs.getLong("FK_T00_PK_T05");
                        if (rs.wasNull()) {
                            conn.rollback();
                            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"System default folders cannot be deleted.\"}");
                            return;
                        }
                        folderName = extractJsonValue(rs.getString("Ref_CategoryB"), "SettingValue");
                    }
                }

                String delFolderSql = "DELETE FROM \"T00_Ref\" WHERE PK_T00 = ? AND FK_T00_PK_T05 = ?";
                try (PreparedStatement psDel = conn.prepareStatement(delFolderSql)) {
                    psDel.setInt(1, pkT00);
                    psDel.setLong(2, userId);
                    psDel.executeUpdate();
                }

                String assignCatB = "{\"SettingName\":\"ASSIGNED_FOLDER\",\"SettingValue\":\"" + escapeJson(folderName) + "\"}";
                String cascadeCleanSql = "DELETE FROM \"T00_Ref\" "
                                       + "WHERE \"Ref_CategoryA\" = '{\"label\":\"Table\",\"TableName\":\"T01_Projects\",\"FieldName\":\"PK_T01\"}' "
                                       + "  AND \"Ref_CategoryB\" = ? "
                                       + "  AND FK_T00_PK_T05 = ?";
                try (PreparedStatement psClean = conn.prepareStatement(cascadeCleanSql)) {
                    psClean.setString(1, assignCatB);
                    psClean.setLong(2, userId);
                    psClean.executeUpdate();
                }

                conn.commit();
                sendJsonResponse(exchange, 200, "{\"status\":\"SUCCESS\",\"message\":\"Folder and its assigned mappings permanently deleted.\"}");
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }
        }
    }

    private void handleFolderAssign(HttpExchange exchange, long userId) throws Exception {
        String body = readBody(exchange);
        String pjIdStr = extractJsonField(body, "pjId");
        String targetFolder = extractJsonField(body, "targetFolder");
        String mode = extractJsonField(body, "mode");

        if (pjIdStr.isEmpty()) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Project ID is required.\"}");
            return;
        }

        if (mode.isEmpty()) mode = "MOVE";
        mode = mode.toUpperCase();

        if (("MOVE".equals(mode) || "COPY".equals(mode) || "REMOVE_CURRENT".equals(mode)) && targetFolder.isEmpty()) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Target folder name is required for mode " + mode + ".\"}");
            return;
        }

        String mapCatA = "{\"label\":\"Table\",\"TableName\":\"T01_Projects\",\"FieldName\":\"PK_T01\"}";
        String mapCatB = !targetFolder.isEmpty() ? "{\"SettingName\":\"ASSIGNED_FOLDER\",\"SettingValue\":\"" + escapeJson(targetFolder) + "\"}" : "";

        validateRefFieldLength(mapCatA, 255, "Ref_CategoryA");
        if (!mapCatB.isEmpty()) {
            validateRefFieldLength(mapCatB, 255, "Ref_CategoryB");
        }
        validateRefFieldLength(pjIdStr, 255, "Ref_Text");

        try (Connection conn = DB.getConnection()) {
            conn.setAutoCommit(false);
            try {
                if ("MOVE".equals(mode) || "REMOVE".equals(mode)) {
                    String cleanSql = "DELETE FROM \"T00_Ref\" "
                                    + "WHERE \"Ref_CategoryA\" = ? AND \"Ref_Text\" = ? AND FK_T00_PK_T05 = ?";
                    try (PreparedStatement psClean = conn.prepareStatement(cleanSql)) {
                        psClean.setString(1, mapCatA);
                        psClean.setString(2, pjIdStr);
                        psClean.setLong(3, userId);
                        psClean.executeUpdate();
                    }
                } else if ("REMOVE_CURRENT".equals(mode)) {
                    String cleanCurSql = "DELETE FROM \"T00_Ref\" "
                                       + "WHERE \"Ref_CategoryA\" = ? AND \"Ref_CategoryB\" = ? AND \"Ref_Text\" = ? AND FK_T00_PK_T05 = ?";
                    try (PreparedStatement psCur = conn.prepareStatement(cleanCurSql)) {
                        psCur.setString(1, mapCatA);
                        psCur.setString(2, mapCatB);
                        psCur.setString(3, pjIdStr);
                        psCur.setLong(4, userId);
                        psCur.executeUpdate();
                    }
                }

                if ("MOVE".equals(mode) || "COPY".equals(mode)) {
                    String checkSql = "SELECT COUNT(*) FROM \"T00_Ref\" "
                                    + "WHERE \"Ref_CategoryA\" = ? AND \"Ref_CategoryB\" = ? AND \"Ref_Text\" = ? AND FK_T00_PK_T05 = ?";
                    boolean exists = false;
                    try (PreparedStatement psCheck = conn.prepareStatement(checkSql)) {
                        psCheck.setString(1, mapCatA);
                        psCheck.setString(2, mapCatB);
                        psCheck.setString(3, pjIdStr);
                        psCheck.setLong(4, userId);
                        try (ResultSet rs = psCheck.executeQuery()) {
                            if (rs.next() && rs.getInt(1) > 0) exists = true;
                        }
                    }

                    if (!exists) {
                        // 修正：使用 5 個佔位符對齊 5 個 PreparedStatement 參數
                        String insertSql = "INSERT INTO \"T00_Ref\" (\"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_SortValue\", \"Ref_Text\", FK_T00_PK_T05) "
                                         + "VALUES (?, ?, ?, 999, ?, ?)";
                        try (PreparedStatement psIns = conn.prepareStatement(insertSql)) {
                            psIns.setString(1, mapCatA);
                            psIns.setString(2, mapCatB);
                            psIns.setString(3, "Enable");
                            psIns.setString(4, pjIdStr);
                            psIns.setLong(5, userId);
                            psIns.executeUpdate();
                        }
                    }
                }

                conn.commit();
                sendJsonResponse(exchange, 200, "{\"status\":\"SUCCESS\",\"message\":\"Project assignment updated.\"}");
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }
        }
    }

    // ======================================================================
    // 2. Shortcut Management Services
    // ======================================================================

    private void handleShortcutList(HttpExchange exchange, long userId) throws SQLException, IOException {
        List<Map<String, Object>> shortcuts = new ArrayList<>();

        String sql = "SELECT PK_T00, \"Ref_CategoryB\", \"Ref_Text\", \"Ref_SortValue\" "
                   + "FROM \"T00_Ref\" "
                   + "WHERE \"Ref_CategoryA\" = '{\"label\":\"System\",\"Module\":\"SHORTCUT\"}' "
                   + "  AND FK_T00_PK_T05 = ? "
                   + "ORDER BY \"Ref_SortValue\" ASC, PK_T00 ASC";

        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int pkT00 = rs.getInt("PK_T00");
                    String catB = rs.getString("Ref_CategoryB");
                    String refText = rs.getString("Ref_Text");
                    int sort = rs.getInt("Ref_SortValue");

                    String title = extractJsonValue(catB, "SettingValue");
                    Map<String, Object> map = new java.util.HashMap<>();
                    map.put("pkT00", pkT00);
                    map.put("title", title != null ? title : "Shortcut");
                    map.put("hashParam", refText != null ? refText : "");
                    map.put("sortValue", sort);
                    shortcuts.add(map);
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("{\"status\":\"SUCCESS\",\"shortcuts\":[");
        for (int i = 0; i < shortcuts.size(); i++) {
            Map<String, Object> sc = shortcuts.get(i);
            if (i > 0) sb.append(",");
            sb.append("{")
              .append("\"pkT00\":").append(sc.get("pkT00")).append(",")
              .append("\"title\":\"").append(escapeJson((String) sc.get("title"))).append("\",")
              .append("\"hashParam\":\"").append(escapeJson((String) sc.get("hashParam"))).append("\",")
              .append("\"sortValue\":").append(sc.get("sortValue"))
              .append("}");
        }
        sb.append("]}");

        sendJsonResponse(exchange, 200, sb.toString());
    }

    private void handleShortcutSave(HttpExchange exchange, long userId) throws Exception {
        String body = readBody(exchange);
        String title = extractJsonField(body, "title");
        String hashParam = extractJsonField(body, "hashParam");
        Integer pkT00 = extractJsonInteger(body, "pkT00");

        if (title.isEmpty() || hashParam.isEmpty()) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Both Title and Target URL/Hash are required.\"}");
            return;
        }

        String catA = "{\"label\":\"System\",\"Module\":\"SHORTCUT\"}";
        String catB = "{\"SettingName\":\"SHORTCUT_TITLE\",\"SettingValue\":\"" + escapeJson(title) + "\"}";

        validateRefFieldLength(catA, 255, "Ref_CategoryA");
        validateRefFieldLength(catB, 255, "Ref_CategoryB");
        validateRefFieldLength(hashParam, 255, "Ref_Text");

        try (Connection conn = DB.getConnection()) {
            if (pkT00 != null && pkT00 > 0) {
                String updateSql = "UPDATE \"T00_Ref\" SET \"Ref_CategoryB\" = ?, \"Ref_Text\" = ? "
                                 + "WHERE PK_T00 = ? AND FK_T00_PK_T05 = ?";
                try (PreparedStatement ps = conn.prepareStatement(updateSql)) {
                    ps.setString(1, catB);
                    ps.setString(2, hashParam);
                    ps.setInt(3, pkT00);
                    ps.setLong(4, userId);
                    ps.executeUpdate();
                }
            } else {
                int nextSort = 1;
                String maxSql = "SELECT COALESCE(MAX(\"Ref_SortValue\"), 0) + 1 FROM \"T00_Ref\" "
                              + "WHERE \"Ref_CategoryA\" = ? AND FK_T00_PK_T05 = ?";
                try (PreparedStatement psMax = conn.prepareStatement(maxSql)) {
                    psMax.setString(1, catA);
                    psMax.setLong(2, userId);
                    try (ResultSet rs = psMax.executeQuery()) {
                        if (rs.next()) nextSort = rs.getInt(1);
                    }
                }

                String insertSql = "INSERT INTO \"T00_Ref\" (\"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_SortValue\", \"Ref_Text\", FK_T00_PK_T05) "
                                 + "VALUES (?, ?, 'Enable', ?, ?, ?)";
                try (PreparedStatement psIns = conn.prepareStatement(insertSql)) {
                    psIns.setString(1, catA);
                    psIns.setString(2, catB);
                    psIns.setInt(3, nextSort);
                    psIns.setString(4, hashParam);
                    psIns.setLong(5, userId);
                    psIns.executeUpdate();
                }
            }
        }

        sendJsonResponse(exchange, 200, "{\"status\":\"SUCCESS\",\"message\":\"Shortcut saved successfully.\"}");
    }

    private void handleShortcutReorder(HttpExchange exchange, long userId) throws Exception {
        String body = readBody(exchange);
        List<Integer> ids = extractIntegerList(body, "ids");

        if (ids == null || ids.isEmpty()) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"IDs array is required.\"}");
            return;
        }

        String sql = "UPDATE \"T00_Ref\" SET \"Ref_SortValue\" = ? WHERE PK_T00 = ? AND FK_T00_PK_T05 = ?";
        try (Connection conn = DB.getConnection()) {
            conn.setAutoCommit(false);
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                for (int i = 0; i < ids.size(); i++) {
                    ps.setInt(1, i + 1);
                    ps.setInt(2, ids.get(i));
                    ps.setLong(3, userId);
                    ps.addBatch();
                }
                ps.executeBatch();
                conn.commit();
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }
        }

        sendJsonResponse(exchange, 200, "{\"status\":\"SUCCESS\",\"message\":\"Shortcuts reordered successfully.\"}");
    }

    private void handleShortcutDelete(HttpExchange exchange, long userId) throws Exception {
        String body = readBody(exchange);
        Integer pkT00 = extractJsonInteger(body, "pkT00");

        if (pkT00 == null || pkT00 <= 0) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Valid PK_T00 is required.\"}");
            return;
        }

        String sql = "DELETE FROM \"T00_Ref\" WHERE PK_T00 = ? AND FK_T00_PK_T05 = ? AND \"Ref_CategoryA\" = '{\"label\":\"System\",\"Module\":\"SHORTCUT\"}'";
        try (Connection conn = DB.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, pkT00);
            ps.setLong(2, userId);
            ps.executeUpdate();
        }

        sendJsonResponse(exchange, 200, "{\"status\":\"SUCCESS\",\"message\":\"Shortcut removed.\"}");
    }

    // ======================================================================
    // 3. Workspace Preferences Services (Three-Table Model & Permission Check)
    // ======================================================================

    private void handlePreferencesList(HttpExchange exchange, long userId) throws SQLException, IOException {
        List<Map<String, Object>> dictionaryRecords = new ArrayList<>();
        List<Map<String, Object>> projectRelatedRecords = new ArrayList<>();
        List<Map<String, Object>> systemUiRecords = new ArrayList<>();

        try (Connection conn = DB.getConnection()) {
            String dictSql = "SELECT PK_T00, \"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_SortValue\", \"Ref_Text\" "
                           + "FROM \"T00_Ref\" "
                           + "WHERE FK_T00_PK_T05 = ? AND \"Ref_CategoryA\" NOT LIKE '{%' "
                           + "ORDER BY \"Ref_CategoryA\" ASC, \"Ref_SortValue\" ASC, PK_T00 ASC";
            try (PreparedStatement ps = conn.prepareStatement(dictSql)) {
                ps.setLong(1, userId);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        dictionaryRecords.add(mapRowToRef(rs));
                    }
                }
            }

            List<String> fullProjectIds = new ArrayList<>();
            String fullPjSql = "SELECT FK_T06_PK_T01 FROM \"T06_ProjectRoles\" "
                             + "WHERE FK_T06_PK_T05 = ? AND \"PR_Right\" = 'FULL' AND \"PR_ignore_delete\" = FALSE";
            try (PreparedStatement psFull = conn.prepareStatement(fullPjSql)) {
                psFull.setLong(1, userId);
                try (ResultSet rsFull = psFull.executeQuery()) {
                    while (rsFull.next()) {
                        fullProjectIds.add(String.valueOf(rsFull.getInt(1)));
                    }
                }
            }

            if (!fullProjectIds.isEmpty()) {
                StringBuilder inClause = new StringBuilder();
                for (int i = 0; i < fullProjectIds.size(); i++) {
                    if (i > 0) inClause.append(",");
                    inClause.append("?");
                }

                String pjRelSql = "SELECT PK_T00, \"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_SortValue\", \"Ref_Text\" "
                                + "FROM \"T00_Ref\" "
                                + "WHERE \"Ref_CategoryA\" LIKE '{\"label\":\"Table\"%' "
                                + "  AND \"Ref_Text\" IN (" + inClause + ") "
                                + "  AND FK_T00_PK_T05 IS NULL "
                                + "ORDER BY \"Ref_Text\" ASC, PK_T00 ASC";
                try (PreparedStatement psPj = conn.prepareStatement(pjRelSql)) {
                    for (int i = 0; i < fullProjectIds.size(); i++) {
                        psPj.setString(i + 1, fullProjectIds.get(i));
                    }
                    try (ResultSet rsPj = psPj.executeQuery()) {
                        while (rsPj.next()) {
                            projectRelatedRecords.add(mapRowToRef(rsPj));
                        }
                    }
                }
            }

            String uiSql = "SELECT PK_T00, \"Ref_CategoryA\", \"Ref_CategoryB\", \"Ref_CategoryC\", \"Ref_SortValue\", \"Ref_Text\" "
                         + "FROM \"T00_Ref\" "
                         + "WHERE \"Ref_CategoryA\" LIKE '{\"label\":\"System\"%' "
                         + "  AND \"Ref_CategoryA\" NOT LIKE '%\"Module\":\"FOLDER\"%' "
                         + "  AND \"Ref_CategoryA\" NOT LIKE '%\"Module\":\"SHORTCUT\"%' "
                         + "  AND (FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL) "
                         + "ORDER BY \"Ref_CategoryA\" ASC, \"Ref_Text\" ASC, PK_T00 ASC";
            try (PreparedStatement psUi = conn.prepareStatement(uiSql)) {
                psUi.setLong(1, userId);
                try (ResultSet rsUi = psUi.executeQuery()) {
                    while (rsUi.next()) {
                        systemUiRecords.add(mapRowToRef(rsUi));
                    }
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("{\"status\":\"SUCCESS\",");
        sb.append("\"dictionaryRecords\":").append(renderRefListJson(dictionaryRecords)).append(",");
        sb.append("\"projectRelatedRecords\":").append(renderRefListJson(projectRelatedRecords)).append(",");
        sb.append("\"systemUiRecords\":").append(renderRefListJson(systemUiRecords));
        sb.append("}");

        sendJsonResponse(exchange, 200, sb.toString());
    }

    private void handlePreferencesSave(HttpExchange exchange, long userId) throws Exception {
        String body = readBody(exchange);
        Integer pkT00 = extractJsonInteger(body, "pkT00");
        String categoryB = extractJsonField(body, "categoryB");
        String categoryC = extractJsonField(body, "categoryC");
        Integer sortValue = extractJsonInteger(body, "sortValue");
        String refText = extractJsonField(body, "refText");

        if (pkT00 == null || pkT00 <= 0) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Valid reference entry PK_T00 is required for inline editing.\"}");
            return;
        }

        if (categoryC.isEmpty() || (!"Enable".equalsIgnoreCase(categoryC) && !"Disable".equalsIgnoreCase(categoryC))) {
            categoryC = "Enable";
        }

        if (!categoryB.isEmpty()) validateRefFieldLength(categoryB, 255, "Ref_CategoryB");
        validateRefFieldLength(categoryC, 255, "Ref_CategoryC");
        if (!refText.isEmpty()) validateRefFieldLength(refText, 255, "Ref_Text");

        try (Connection conn = DB.getConnection()) {
            String checkSql = "SELECT PK_T00, \"Ref_CategoryA\", \"Ref_Text\", FK_T00_PK_T05 FROM \"T00_Ref\" WHERE PK_T00 = ?";
            String catA = null;
            String originalRefText = null;
            Long recordUserId = null;

            try (PreparedStatement psCheck = conn.prepareStatement(checkSql)) {
                psCheck.setInt(1, pkT00);
                try (ResultSet rs = psCheck.executeQuery()) {
                    if (!rs.next()) {
                        sendJsonResponse(exchange, 404, "{\"status\":\"FAILED\",\"message\":\"Target reference entry not found.\"}");
                        return;
                    }
                    catA = rs.getString("Ref_CategoryA");
                    originalRefText = rs.getString("Ref_Text");
                    long uid = rs.getLong("FK_T00_PK_T05");
                    if (!rs.wasNull()) recordUserId = uid;
                }
            }

            if (catA != null && catA.startsWith("{\"label\":\"Table\"")) {
                if (originalRefText != null) {
                    int pjId = 0;
                    try { pjId = Integer.parseInt(originalRefText); } catch (Exception ignored) {}
                    if (!verifyUserHasFullRight(conn, userId, pjId)) {
                        sendJsonResponse(exchange, 403, "{\"status\":\"FAILED\",\"message\":\"Access denied. FULL project ownership right required to alter project settings.\"}");
                        return;
                    }
                }
                String updatePjSql = "UPDATE \"T00_Ref\" SET \"Ref_CategoryC\" = ? WHERE PK_T00 = ?";
                try (PreparedStatement psUp = conn.prepareStatement(updatePjSql)) {
                    psUp.setString(1, categoryC);
                    psUp.setInt(2, pkT00);
                    psUp.executeUpdate();
                }
            } else if (catA != null && catA.startsWith("{\"label\":\"System\"")) {
                String updateUiSql = "UPDATE \"T00_Ref\" SET \"Ref_CategoryC\" = ? WHERE PK_T00 = ? AND (FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL)";
                try (PreparedStatement psUp = conn.prepareStatement(updateUiSql)) {
                    psUp.setString(1, categoryC);
                    psUp.setInt(2, pkT00);
                    psUp.setLong(3, userId);
                    psUp.executeUpdate();
                }
            } else {
                if (recordUserId == null || recordUserId != userId) {
                    sendJsonResponse(exchange, 403, "{\"status\":\"FAILED\",\"message\":\"Cannot modify shared or other users' dictionary records.\"}");
                    return;
                }
                String updateDictSql = "UPDATE \"T00_Ref\" "
                                     + "SET \"Ref_CategoryB\" = ?, \"Ref_CategoryC\" = ?, \"Ref_SortValue\" = ?, \"Ref_Text\" = ? "
                                     + "WHERE PK_T00 = ? AND FK_T00_PK_T05 = ?";
                try (PreparedStatement psUp = conn.prepareStatement(updateDictSql)) {
                    psUp.setString(1, !categoryB.isEmpty() ? categoryB : null);
                    psUp.setString(2, categoryC);
                    if (sortValue != null) psUp.setInt(3, sortValue); else psUp.setNull(3, java.sql.Types.INTEGER);
                    psUp.setString(4, !refText.isEmpty() ? refText : null);
                    psUp.setInt(5, pkT00);
                    psUp.setLong(6, userId);
                    psUp.executeUpdate();
                }
            }
        }

        sendJsonResponse(exchange, 200, "{\"status\":\"SUCCESS\",\"message\":\"Preference record updated successfully.\"}");
    }

    private void handlePreferencesDelete(HttpExchange exchange, long userId) throws Exception {
        String body = readBody(exchange);
        Integer pkT00 = extractJsonInteger(body, "pkT00");

        if (pkT00 == null || pkT00 <= 0) {
            sendJsonResponse(exchange, 400, "{\"status\":\"FAILED\",\"message\":\"Valid reference entry PK_T00 is required.\"}");
            return;
        }

        try (Connection conn = DB.getConnection()) {
            String checkSql = "SELECT PK_T00, \"Ref_CategoryA\", \"Ref_Text\", FK_T00_PK_T05 FROM \"T00_Ref\" WHERE PK_T00 = ?";
            String catA = null;
            String originalRefText = null;
            Long recordUserId = null;

            try (PreparedStatement psCheck = conn.prepareStatement(checkSql)) {
                psCheck.setInt(1, pkT00);
                try (ResultSet rs = psCheck.executeQuery()) {
                    if (!rs.next()) {
                        sendJsonResponse(exchange, 404, "{\"status\":\"FAILED\",\"message\":\"Target reference entry not found.\"}");
                        return;
                    }
                    catA = rs.getString("Ref_CategoryA");
                    originalRefText = rs.getString("Ref_Text");
                    long uid = rs.getLong("FK_T00_PK_T05");
                    if (!rs.wasNull()) recordUserId = uid;
                }
            }

            if (catA != null && catA.startsWith("{\"label\":\"Table\"")) {
                if (originalRefText != null) {
                    int pjId = 0;
                    try { pjId = Integer.parseInt(originalRefText); } catch (Exception ignored) {}
                    if (!verifyUserHasFullRight(conn, userId, pjId)) {
                        sendJsonResponse(exchange, 403, "{\"status\":\"FAILED\",\"message\":\"Access denied. FULL project ownership right required to delete project settings.\"}");
                        return;
                    }
                }
                String delPjSql = "DELETE FROM \"T00_Ref\" WHERE PK_T00 = ?";
                try (PreparedStatement psDel = conn.prepareStatement(delPjSql)) {
                    psDel.setInt(1, pkT00);
                    psDel.executeUpdate();
                }
            } else if (catA != null && catA.startsWith("{\"label\":\"System\"")) {
                String delUiSql = "DELETE FROM \"T00_Ref\" WHERE PK_T00 = ? AND (FK_T00_PK_T05 = ? OR FK_T00_PK_T05 IS NULL)";
                try (PreparedStatement psDel = conn.prepareStatement(delUiSql)) {
                    psDel.setInt(1, pkT00);
                    psDel.setLong(2, userId);
                    psDel.executeUpdate();
                }
            } else {
                if (recordUserId == null || recordUserId != userId) {
                    sendJsonResponse(exchange, 403, "{\"status\":\"FAILED\",\"message\":\"Cannot delete shared or other users' dictionary records.\"}");
                    return;
                }
                String delDictSql = "DELETE FROM \"T00_Ref\" WHERE PK_T00 = ? AND FK_T00_PK_T05 = ?";
                try (PreparedStatement psDel = conn.prepareStatement(delDictSql)) {
                    psDel.setInt(1, pkT00);
                    psDel.setLong(2, userId);
                    psDel.executeUpdate();
                }
            }
        }

        sendJsonResponse(exchange, 200, "{\"status\":\"SUCCESS\",\"message\":\"Reference entry deleted permanently.\"}");
    }

    private boolean verifyUserHasFullRight(Connection conn, long userId, int pjId) throws SQLException {
        if (pjId <= 0) return false;
        String sql = "SELECT COUNT(*) FROM \"T06_ProjectRoles\" "
                   + "WHERE FK_T06_PK_T05 = ? AND FK_T06_PK_T01 = ? AND \"PR_Right\" = 'FULL' AND \"PR_ignore_delete\" = FALSE";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, userId);
            ps.setInt(2, pjId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    // ======================================================================
    // Helper Methods & String Parsers
    // ======================================================================

    private Map<String, Object> mapRowToRef(ResultSet rs) throws SQLException {
        Map<String, Object> map = new java.util.HashMap<>();
        map.put("pkT00", rs.getInt("PK_T00"));
        map.put("categoryA", rs.getString("Ref_CategoryA"));
        map.put("categoryB", rs.getString("Ref_CategoryB"));
        map.put("categoryC", rs.getString("Ref_CategoryC"));
        int sort = rs.getInt("Ref_SortValue");
        map.put("sortValue", rs.wasNull() ? null : sort);
        map.put("refText", rs.getString("Ref_Text"));
        return map;
    }

    private String renderRefListJson(List<Map<String, Object>> list) {
        StringBuilder sb = new StringBuilder();
        sb.append("[");
        for (int i = 0; i < list.size(); i++) {
            Map<String, Object> r = list.get(i);
            if (i > 0) sb.append(",");
            sb.append("{")
              .append("\"pkT00\":").append(r.get("pkT00")).append(",")
              .append("\"categoryA\":\"").append(escapeJson((String) r.get("categoryA"))).append("\",")
              .append("\"categoryB\":").append(r.get("categoryB") != null ? ("\"" + escapeJson((String) r.get("categoryB")) + "\"") : "null").append(",")
              .append("\"categoryC\":\"").append(escapeJson((String) r.get("categoryC"))).append("\",")
              .append("\"sortValue\":").append(r.get("sortValue") != null ? r.get("sortValue") : "null").append(",")
              .append("\"refText\":").append(r.get("refText") != null ? ("\"" + escapeJson((String) r.get("refText")) + "\"") : "null")
              .append("}");
        }
        sb.append("]");
        return sb.toString();
    }

    private void validateRefFieldLength(String value, int maxLength, String fieldName) throws Exception {
        if (value != null && value.length() > maxLength) {
            throw new IllegalArgumentException(fieldName + " exceeds database capacity (Length: " + value.length() + ", Max: " + maxLength + ")");
        }
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

    private String extractJsonValue(String json, String key) {
        return extractJsonField(json, key);
    }

    private Integer extractJsonInteger(String json, String key) {
        String val = extractJsonField(json, key);
        if (!val.isEmpty()) {
            try {
                return Integer.parseInt(val);
            } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    private boolean extractJsonBoolean(String json, String key, boolean defaultVal) {
        String val = extractJsonField(json, key);
        if ("true".equalsIgnoreCase(val)) return true;
        if ("false".equalsIgnoreCase(val)) return false;
        return defaultVal;
    }

    private List<Integer> extractIntegerList(String json, String key) {
        List<Integer> list = new ArrayList<>();
        if (json == null) return list;
        String pattern = "\"" + key + "\":[";
        int start = json.indexOf(pattern);
        if (start != -1) {
            int end = json.indexOf("]", start);
            if (end != -1) {
                String sub = json.substring(start + pattern.length(), end);
                String[] tokens = sub.split(",");
                for (String t : tokens) {
                    try {
                        list.add(Integer.parseInt(t.trim()));
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        return list;
    }

    private String escapeJson(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\b", "\\b")
                  .replace("\f", "\\f")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }

    private void sendJsonResponse(HttpExchange exchange, int statusCode, String response) throws IOException {
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private void sendResponse(HttpExchange exchange, int statusCode, String response) throws IOException {
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}