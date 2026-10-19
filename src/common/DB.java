package common;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

public class DB {

    private static final String DRIVER_CLASS = "org.h2.Driver";
    private static final String DB_USER = "";
    private static final String DB_PASSWORD = "";

    private static String resolvedJdbcUrl = null;
    private static boolean loggedStartup = false;

    static {
        try {
            Class.forName(DRIVER_CLASS);
        } catch (ClassNotFoundException e) {
            System.err.println("[ERROR] H2 Driver not found in classpath!");
            e.printStackTrace();
        }
    }

    /**
     * 動態解析資料庫檔案路徑，擺脫 C: / D: / O: 硬編碼限制，相容不同電腦與執行環境
     */
    private static synchronized String getJdbcUrl() {
        if (resolvedJdbcUrl != null) {
            return resolvedJdbcUrl;
        }

        // 取得當前專案執行目錄
        String userDir = System.getProperty("user.dir");
        File primaryDbFile = new File(userDir, "DB/pmdb/data/pmdb.mv.db");

        String dbBasePath;
        if (primaryDbFile.exists()) {
            dbBasePath = primaryDbFile.getAbsolutePath().replace(".mv.db", "");
        } else {
            // 向上一層目錄查找 (防範自 bin/ 或 build/ 子目錄執行)
            File parentDbFile = new File(userDir, "../DB/pmdb/data/pmdb.mv.db");
            if (parentDbFile.exists()) {
                dbBasePath = parentDbFile.getAbsolutePath().replace(".mv.db", "");
            } else {
                dbBasePath = new File(userDir, "DB/pmdb/data/pmdb").getAbsolutePath();
            }
        }

        // 統一路徑斜線格式
        dbBasePath = dbBasePath.replace("\\", "/");

        // 完整保留 NVMe SSD 與 32GB RAM 調優參數
        resolvedJdbcUrl = "jdbc:h2:" + dbBasePath + ";" +
            "AUTO_SERVER=TRUE;" +           // 允許外部除錯工具 (DBeaver 等) 同時連線
            "DB_CLOSE_DELAY=-1;" +          // 保持資料庫常駐記憶體，避免連線數為 0 時反覆重啟卸載快取
            "IGNORECASE=TRUE;" +            // 識別字與查詢大小寫無關 (H2 1.4.196 原生支援)
            "LOCK_TIMEOUT=10000;" +         // 鎖定等待上限 10 秒
            "DEFAULT_LOCK_TIMEOUT=10000;" + // 統一各 Session 等待容忍
            "CACHE_SIZE=524288;" +          // 分配 512MB RAM 給 H2 專屬快取 (善用 32GB RAM，避開磁碟讀取)
            "PAGE_SIZE=4096;" +             // 4KB 頁面大小，對齊 NVMe SSD 實體讀寫區塊
            "WRITE_DELAY=1000";             // 批量延遲 1 秒刷盤，降低 SSD 磨損並提高並發寫入效能

        return resolvedJdbcUrl;
    }

    public static Connection getConnection() throws SQLException {
        String url = getJdbcUrl();
        Connection conn = DriverManager.getConnection(url, DB_USER, DB_PASSWORD);

        // 首次連線輸出診斷資訊至 CMD 視窗
        if (!loggedStartup) {
            synchronized (DB.class) {
                if (!loggedStartup) {
                    diagnoseDatabase(conn, url);
                    loggedStartup = true;
                }
            }
        }

        return conn;
    }

    /**
     * 自我診斷：以精準大小寫引號 "T05_Staff" 查詢，對齊 H2 DDL 定義
     */
    private static void diagnoseDatabase(Connection conn, String url) {
        System.out.println("==================================================");
        System.out.println("[DB Notice] H2 Database Connected Successfully");
        System.out.println("[DB Notice] Target JDBC URL: " + url);

        try (Statement st = conn.createStatement()) {
            // 使用嚴格引號匹配 PUBLIC."T05_Staff"
            try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM \"T05_Staff\"")) {
                if (rs.next()) {
                    System.out.println("[DB Notice] Schema Health Check: Table 'T05_Staff' exists (Total records: " + rs.getInt(1) + ")");
                }
            }
        } catch (SQLException e) {
            System.err.println("[DB Warning] Table 'T05_Staff' NOT found in this database file!");
            System.err.println("[DB Warning] Error detail: " + e.getMessage());
            System.err.println("[DB Warning] Please verify if 'pmdb.mv.db' is located at the path specified above.");
        }
        System.out.println("==================================================");
    }

    public static void closeQuietly(AutoCloseable res) {
        if (res != null) {
            try {
                res.close();
            } catch (Exception ignored) {}
        }
    }

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