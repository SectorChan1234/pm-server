
package handlers;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;

public class StaticHandler implements HttpHandler {
    // 靜態網頁所在目錄
    private static final String BASE_DIR = "C:/pm-server/public";

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod().toUpperCase();
        if (!"GET".equals(method) && !"HEAD".equals(method)) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }

        URI uri = exchange.getRequestURI();
        String path = uri.getPath();

        // 訪問根目錄時，預設讀取 index.html
        if (path == null || path.equals("/") || path.trim().isEmpty()) {
            path = "/index.html";
        }

        // 防範目錄遍歷安全問題 (Directory Traversal)
        if (path.contains("..")) {
            exchange.sendResponseHeaders(403, -1);
            return;
        }

        File file = new File(BASE_DIR, path);
        if (!file.exists() || file.isDirectory()) {
            String notFoundMsg = "404 Not Found: " + path;
            byte[] notFoundBytes = notFoundMsg.getBytes("UTF-8");
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=UTF-8");
            exchange.sendResponseHeaders(404, notFoundBytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(notFoundBytes);
            }
            return;
        }

        String mimeType = getContentType(file.getName());
        exchange.getResponseHeaders().set("Content-Type", mimeType);
        exchange.sendResponseHeaders(200, file.length());

        try (FileInputStream fis = new FileInputStream(file);
             OutputStream os = exchange.getResponseBody()) {
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = fis.read(buffer)) != -1) {
                os.write(buffer, 0, bytesRead);
            }
        }
    }

    private String getContentType(String filename) {
        String name = filename.toLowerCase();
        if (name.endsWith(".html") || name.endsWith(".htm")) return "text/html; charset=UTF-8";
        if (name.endsWith(".css")) return "text/css; charset=UTF-8";
        if (name.endsWith(".js")) return "application/javascript; charset=UTF-8";
        if (name.endsWith(".json")) return "application/json; charset=UTF-8";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }
}