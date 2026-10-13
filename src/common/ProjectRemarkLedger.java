package common;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.text.SimpleDateFormat;
import java.util.Date;

public class ProjectRemarkLedger {

    private static final SimpleDateFormat SDF = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

    /**
     * 追加結構化審計記錄至 T01_Projects.PJ_Remark
     */
    public static void append(Connection conn, int pjId, Security.UserSession user, 
                              String actionType, String targetInfo, String reason) throws Exception {
        if (pjId <= 0) return;

        String timestamp;
        synchronized (SDF) {
            timestamp = SDF.format(new Date());
        }

        String operatorName = (user != null && user.name != null) ? user.name : "System";
        long operatorId = (user != null) ? user.pkT05 : -1;
        String cleanReason = (reason != null && !reason.trim().isEmpty()) ? reason.trim() : "N/A";

        StringBuilder sb = new StringBuilder();
        sb.append("\n============================================================\n")
          .append("[").append(timestamp).append("] ACTION: [").append(actionType).append("]\n")
          .append("OPERATOR : ").append(operatorName).append(" (Staff ID: ").append(operatorId).append(")\n")
          .append("TARGET   : ").append(targetInfo).append("\n")
          .append("REASON   : ").append(cleanReason).append("\n")
          .append("============================================================\n");

        String logText = sb.toString();

        String sql = "UPDATE \"T01_Projects\" SET \"PJ_Remark\" = CONCAT(COALESCE(\"PJ_Remark\", ''), ?) WHERE PK_T01 = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, logText);
            ps.setInt(2, pjId);
            ps.executeUpdate();
        }
    }
}