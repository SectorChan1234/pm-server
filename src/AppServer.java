import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import handlers.*;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;

/**
 * ProjectBook 系統主伺服器入口 (Enterprise HTTP Server Bootstrap)
 * File: src/AppServer.java
 *
 * 職責與邊界：
 * 1. 綁定 0.0.0.0:8080 並配置固定執行緒池 (30 Threads)。
 * 2. 集中管理並掛載所有業務 API Context 與靜態資源處理器 (StaticHandler)。
 * 3. Stage 2 增量掛載 SettingRefHandler (/api/setting 與 /api/portal/shortcut)。
 */
public class AppServer {
    private static final int PORT = 8080;

    public static void main(String[] args) {
        try {
            // 明確綁定 0.0.0.0，允許 localhost 與區網 IP (10.X.X.X) 連線
            HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", PORT), 0);

            // 1. 簡易測試 API (不經資料庫)
            server.createContext("/api/ping", new HttpHandler() {
                @Override
                public void handle(HttpExchange exchange) throws IOException {
                    String response = "{\"success\":true,\"status\":\"PONG\",\"message\":\"AppServer is running!\"}";
                    byte[] bytes = response.getBytes("UTF-8");
                    exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
                    exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                    exchange.sendResponseHeaders(200, bytes.length);
                    try (OutputStream os = exchange.getResponseBody()) {
                        os.write(bytes);
                    }
                }
            });

            // 2. 實例化 Handler
            AuthHandler authHandler = new AuthHandler();
            MessageHandler messageHandler = new MessageHandler();
            ProjectHandler projectHandler = new ProjectHandler();
            MemberRelatedHandler memberRelatedHandler = new MemberRelatedHandler();
            PhaseHandler phaseHandler = new PhaseHandler();
            EventHandler eventHandler = new EventHandler();
            MissionHandler missionHandler = new MissionHandler();
            AdminHandler adminHandler = new AdminHandler();
            DBAdminHandler dbAdminHandler = new DBAdminHandler();
            SettingRefHandler settingRefHandler = new SettingRefHandler();

            // 3. API 路由掛載
            server.createContext("/api/auth", authHandler);
            server.createContext("/api/portal/message", messageHandler);

            // ★ Stage 2 & Stage 3 個人偏好與捷徑治理路由 (T00_Ref 專屬，0 台帳污染)
            server.createContext("/api/setting", settingRefHandler);
            server.createContext("/api/portal/shortcut", settingRefHandler);

            // ★ 專案模組拆分：精確路由優先配對給 MemberRelatedHandler
            server.createContext("/api/portal/project/members", memberRelatedHandler);
            server.createContext("/api/portal/project/available-staff", memberRelatedHandler);
            server.createContext("/api/portal/project/member/save", memberRelatedHandler);
            server.createContext("/api/portal/project/contractor/save", memberRelatedHandler);
            server.createContext("/api/portal/project/member-ref", memberRelatedHandler);
            server.createContext("/api/portal/project/ref/create-custom", memberRelatedHandler);

            // 其餘專案主體請求 (/list, /detail, /phases, /create, /update, /delete, /check-access)
            server.createContext("/api/portal/project", projectHandler);

            server.createContext("/api/portal/phase", phaseHandler);
            server.createContext("/api/portal/event", eventHandler);
            server.createContext("/api/portal/mission", missionHandler);
            server.createContext("/api/admin", adminHandler);

            // 資料庫維運工具 API
            server.createContext("/api/query", dbAdminHandler);
            server.createContext("/api/execute", dbAdminHandler);

            // 4. 靜態資源處理 (託管前端檔案)
            server.createContext("/", new StaticHandler());

            server.setExecutor(Executors.newFixedThreadPool(30));
            server.start();

            System.out.println("=================================================");
            System.out.println(" ProjectBook Server 啟動成功！");
            System.out.println(" 測試網址 1: http://localhost:" + PORT + "/test.html");
            System.out.println(" 測試網址 2: http://127.0.0.1:" + PORT + "/test.html");
            System.out.println(" 外部/區域網址: http://[本機IP]:" + PORT + "/test.html");
            System.out.println("=================================================");
        } catch (Exception e) {
            System.err.println("[FATAL] 伺服器啟動失敗: " + e.getMessage());
            e.printStackTrace();
        }
    }
}