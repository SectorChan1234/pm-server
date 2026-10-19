package common;

import com.sun.net.httpserver.HttpExchange;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 核心安全與會話管理元件 (Centralized Security & Session Governance Engine)
 *
 * 職責與邊界：
 * 1. 管理全系統記憶體內之 Bearer Token 會話快取 (TOKEN_CACHE) 與使用者身分上下文 (UserSession)。
 * 2. 提供加密雜湊服務：支援 16-byte 隨機加鹽雜湊 (Salted SHA-256, 格式為 "saltHex:hashHex")。
 * 3. 提供雙軌相容驗證：同時相容舊版無鹽純 SHA-256 雜湊與新版加鹽雜湊，並透過 MessageDigest.isEqual 執行常數時間比對以防禦計時攻擊 (Timing Attack)。
 * 4. 提供完整向下相容之 authenticate 多載方法 (同時支援傳入 String authHeader 或 HttpExchange)。
 */
public class Security {

    /**
     * 全域 Token 快取池：Key 為隨機 UUID Token 字串，Value 為對應之 UserSession 實例
     */
    public static final Map<String, UserSession> TOKEN_CACHE = new ConcurrentHashMap<>();

    /**
     * 加密級強隨機數產生器，專用於產生 16-byte (128-bit) 隨機密碼鹽值 (Salt)
     */
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    /**
     * 鹽值位元組長度 (16 Bytes = 32 Hex 字元)
     */
    private static final int SALT_BYTE_LENGTH = 16;

    /**
     * 使用者會話實體 (User Session Context)
     */
    public static class UserSession {
        public final long pkT05;
        public final String email;
        public final String name;
        public final String stRight;
        public final long fkT05PkT01Custom; // 0 代表內部全域同仁；> 0 代表限定單一專案之外判人員 (Contractor)

        public UserSession(long pkT05, String email, String name, String stRight) {
            this(pkT05, email, name, stRight, 0L);
        }

        public UserSession(long pkT05, String email, String name, String stRight, long fkT05PkT01Custom) {
            this.pkT05 = pkT05;
            this.email = email != null ? email : "";
            this.name = name != null ? name : "";
            this.stRight = stRight != null ? stRight : "";
            this.fkT05PkT01Custom = fkT05PkT01Custom;
        }
    }

    /**
     * [職責] 基礎無鹽 SHA-256 雜湊計算（保留供向下相容及舊版密碼比對使用）
     */
    public static String sha256(String input) {
        try {
            String safeInput = (input == null) ? "" : input;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = md.digest(safeInput.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(hashBytes);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 calculation failed", e);
        }
    }

    /**
     * [職責] 產生全新加鹽密碼雜湊 (Salted Password Hash)
     */
    public static String hashPassword(String rawPassword) {
        if (rawPassword == null) {
            rawPassword = "";
        }
        byte[] saltBytes = new byte[SALT_BYTE_LENGTH];
        SECURE_RANDOM.nextBytes(saltBytes);
        String saltHex = bytesToHex(saltBytes);
        String hashHex = hashWithSalt(saltHex, rawPassword);
        return saltHex + ":" + hashHex;
    }

    /**
     * [職責] 以指定之十六進位鹽值 (saltHex) 與明文密碼計算 SHA-256 雜湊
     */
    public static String hashWithSalt(String saltHex, String rawPassword) {
        try {
            String safeSalt = (saltHex == null) ? "" : saltHex.trim().toLowerCase();
            String safePass = (rawPassword == null) ? "" : rawPassword;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(safeSalt.getBytes(StandardCharsets.UTF_8));
            byte[] hashed = md.digest(safePass.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(hashed);
        } catch (Exception e) {
            throw new RuntimeException("Salted SHA-256 calculation failed", e);
        }
    }

    /**
     * [職責] 雙軌相容密碼驗證器（支援「新版 saltHex:hashHex」與「舊版純 SHA-256 Hex」）
     */
    public static boolean verifyPassword(String rawPassword, String storedPasswordHash) {
        if (rawPassword == null || storedPasswordHash == null) {
            return false;
        }
        String trimmedStored = storedPasswordHash.trim();
        if (trimmedStored.isEmpty()) {
            return false;
        }

        int colonIndex = trimmedStored.indexOf(':');
        if (colonIndex > 0) {
            String saltHex = trimmedStored.substring(0, colonIndex).trim().toLowerCase();
            String expectedHashHex = trimmedStored.substring(colonIndex + 1).trim().toLowerCase();
            if (saltHex.isEmpty() || expectedHashHex.isEmpty()) {
                return false;
            }
            String actualHashHex = hashWithSalt(saltHex, rawPassword);
            return constantTimeEquals(actualHashHex, expectedHashHex);
        } else {
            String expectedLegacyHex = trimmedStored.toLowerCase();
            String actualLegacyHex = sha256(rawPassword);
            return constantTimeEquals(actualLegacyHex, expectedLegacyHex);
        }
    }

    /**
     * [職責] 檢測密碼雜湊是否為舊版無鹽格式
     */
    public static boolean needsRehash(String storedPasswordHash) {
        if (storedPasswordHash == null) {
            return true;
        }
        String trimmed = storedPasswordHash.trim();
        int colonIdx = trimmed.indexOf(':');
        if (colonIdx <= 0) {
            return true;
        }
        String saltPart = trimmed.substring(0, colonIdx);
        String hashPart = trimmed.substring(colonIdx + 1);
        return (saltPart.length() != SALT_BYTE_LENGTH * 2) || (hashPart.length() != 64);
    }

    /**
     * [職責] 常數時間比對防禦 Timing Attack
     */
    public static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        byte[] aBytes = a.getBytes(StandardCharsets.UTF_8);
        byte[] bBytes = b.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(aBytes, bBytes);
    }

    /**
     * [職責] 產生隨機 UUID Token 並存入快取池
     */
    public static String generateToken(UserSession session) {
        String token = UUID.randomUUID().toString();
        TOKEN_CACHE.put(token, session);
        return token;
    }

    /**
     * [職責] 接收 Authorization Header 字串進行身分校驗 (向下相容既有全數 Handler)
     * [Input Contract] authHeader: 例如 "Bearer e3b0c442-..." 或純 Token 字串 (String)
     * [Output Contract] 驗證成功回傳對應 UserSession，否則回傳 null
     */
    public static UserSession authenticate(String authHeader) {
        if (authHeader == null || authHeader.trim().isEmpty()) {
            return null;
        }
        String token = authHeader.trim();
        if (token.regionMatches(true, 0, "Bearer ", 0, 7)) {
            token = token.substring(7).trim();
        }
        return TOKEN_CACHE.get(token);
    }

    /**
     * [職責] 直接由 HttpExchange 擷取標頭進行身分校驗 (多載便利方法)
     */
    public static UserSession authenticate(HttpExchange exchange) {
        String token = extractToken(exchange);
        if (token == null || token.isEmpty()) {
            return null;
        }
        return TOKEN_CACHE.get(token);
    }

    /**
     * [職責] 從 HttpExchange 擷取 Bearer Token 純字串
     */
    public static String extractToken(HttpExchange exchange) {
        if (exchange == null || exchange.getRequestHeaders() == null) {
            return null;
        }
        String authHeader = exchange.getRequestHeaders().getFirst("Authorization");
        if (authHeader != null && authHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return authHeader.substring(7).trim();
        }
        return null;
    }

    /**
     * [職責] 註銷單一 Token
     */
    public static void invalidateToken(String token) {
        if (token != null && !token.isEmpty()) {
            TOKEN_CACHE.remove(token);
        }
    }

    /**
     * [職責] 註銷當前請求對應的 Token
     */
    public static void invalidateToken(HttpExchange exchange) {
        String token = extractToken(exchange);
        invalidateToken(token);
    }

    /**
     * [職責] 強制剔除指定人員 (PK_T05) 的所有活躍 Session
     */
    public static void invalidateUserSessions(long pkT05) {
        Iterator<Map.Entry<String, UserSession>> it = TOKEN_CACHE.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, UserSession> entry = it.next();
            UserSession session = entry.getValue();
            if (session != null && session.pkT05 == pkT05) {
                it.remove();
            }
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}