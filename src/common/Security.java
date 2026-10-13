package common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class Security {

    public static class UserSession {
        public final long pkT05;
        public final String email;
        public final String name;
        public final String stRight; // "USER" or "ADMIN"

        public UserSession(long pkT05, String email, String name, String stRight) {
            this.pkT05 = pkT05;
            this.email = email;
            this.name = name;
            this.stRight = stRight;
        }
    }

    // Token 快取 (生產環境若重啟可改存 DB 或常駐記憶體)
    private static final Map<String, UserSession> TOKEN_CACHE = new ConcurrentHashMap<>();

    public static String generateToken(UserSession session) {
        String token = UUID.randomUUID().toString().replace("-", "");
        TOKEN_CACHE.put(token, session);
        return token;
    }

    public static UserSession authenticate(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authHeader.substring(7).trim();
        return TOKEN_CACHE.get(token);
    }

    public static void invalidateToken(String token) {
        TOKEN_CACHE.remove(token);
    }

    public static void invalidateUserSessions(long pkT05) {
        TOKEN_CACHE.entrySet().removeIf(entry -> entry.getValue().pkT05 == pkT05);
    }

    public static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 algorithm missing", e);
        }
    }
}