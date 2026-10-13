package common;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class DB {
    
    // 針對 NVMe SSD (C:) 與 32GB RAM 調優之 JDBC URL
    private static final String JDBC_URL = 
        "jdbc:h2:C:/pm-server/DB/pmdb/data/pmdb;" +
        "AUTO_SERVER=TRUE;" +           // 允許外部除錯工具 (DBeaver 等) 同時連線
        "DB_CLOSE_DELAY=-1;" +          // 保持資料庫常駐記憶體，避免連線數為 0 時反覆重啟卸載快取
        "IGNORECASE=TRUE;" +            // 識別字與查詢大小寫無關
        "LOCK_TIMEOUT=10000;" +         // 鎖定等待上限 10 秒
        "DEFAULT_LOCK_TIMEOUT=10000;" + // 統一各 Session 等待容忍
        "CACHE_SIZE=524288;" +          // 分配 512MB RAM 給 H2 專屬快取 (善用 32GB RAM，避開磁碟讀取)
        "PAGE_SIZE=4096;" +             // 4KB 頁面大小，對齊 NVMe SSD 實體讀寫區塊
        "WRITE_DELAY=1000";             // 批量延遲 1 秒刷盤，降低 SSD 磨損並提高並發寫入效能
	
    private static final String DB_USER = "";
    private static final String DB_PASSWORD = "";

    static {
        try {
            Class.forName("org.h2.Driver");
        } catch (ClassNotFoundException e) {
            System.err.println("[ERROR] H2 Driver not found in classpath!");
            e.printStackTrace();
        }
    }

    public static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(JDBC_URL, DB_USER, DB_PASSWORD);
    }

    public static void closeQuietly(AutoCloseable res) {
        if (res != null) {
            try {
                res.close();
            } catch (Exception ignored) {}
        }
    }

    // 通用交易安全介面：避免跨表更新時中途報錯留下半成品資料
    @FunctionalInterface
    public interface TransactionWork<T> {
        T execute(Connection conn) throws Exception;
    }

    public static <T> T executeInTransaction(TransactionWork<T> work) throws Exception {
        try (Connection conn = getConnection()) {
            boolean originalAutoCommit = conn.getAutoCommit();
            conn.setAutoCommit(false);
            try {
                T result = work.execute(conn);
                conn.commit();
                return result;
            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(originalAutoCommit);
            }
        }
    }
}