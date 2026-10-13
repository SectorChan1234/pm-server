// ==========================================================================
// ProjectBook Collaboration Portal - Core Common Utilities
// File: /public/js/common-function.js
// Scope: Pure utility functions (Zero business dependencies, safe in HTTP/HTTPS)
// Standard: Defensive Programming & Professional Business UI
// ==========================================================================

/**
 * 1. HTML 安全跳脫 (XSS 防護與破版防禦)
 * 將危險字元轉為安全實體，避免腳本注入
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 2. 跨環境剪貼簿複製 (相容內聯網 HTTP IP、HTTPS 與嚴格原則環境)
 * @param {string} textToCopy 要複製的文字內容
 * @param {string} successHint 成功時顯示的自訂提示 (選填)
 */
function copyToClipboard(textToCopy, successHint) {
    if (!textToCopy) return;

    const defaultHint = 'Content copied to clipboard:\n' + textToCopy;
    const notifySuccess = () => {
        alert(successHint || defaultHint);
    };

    // 第一層：現代 Clipboard API (僅限 HTTPS 或 localhost 安全上下文)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy)
            .then(notifySuccess)
            .catch(() => fallbackCopy(textToCopy));
        return;
    }

    // 第二層：內聯網 HTTP IP 專用的隱藏 Textarea 降級方式
    fallbackCopy(textToCopy);

    function fallbackCopy(text) {
        let successful = false;
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            
            // 鎖定不可見樣式，避免畫面滾動與重繪干擾
            textArea.style.position = 'fixed';
            textArea.style.top = '0';
            textArea.style.left = '0';
            textArea.style.width = '2em';
            textArea.style.height = '2em';
            textArea.style.padding = '0';
            textArea.style.border = 'none';
            textArea.style.outline = 'none';
            textArea.style.boxShadow = 'none';
            textArea.style.background = 'transparent';
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            successful = document.execCommand('copy');
            document.body.removeChild(textArea);
        } catch (err) {
            successful = false;
        }

        if (successful) {
            notifySuccess();
        } else {
            // 第三層：作業系統原則嚴格限制時的手動複製防線
            prompt('Please press Ctrl+C to copy:', text);
        }
    }
}

/**
 * 3. 日期安全格式化 (YYYY-MM-DD)
 * 接受 ISO 字串、Timestamp 字串或空值，安全回傳
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const s = String(dateStr).trim();
    if (s.length >= 10) {
        return s.substring(0, 10);
    }
    return s || '-';
}

/**
 * 4. 日期時間安全格式化 (YYYY-MM-DD HH:mm)
 */
function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';
    const s = String(dateTimeStr).trim().replace('T', ' ');
    if (s.length >= 16) {
        return s.substring(0, 16);
    }
    return s || '-';
}

/**
 * 5. Windows / 網頁檔案路徑標準化轉換
 * @param {string} rawPath 原始輸入路徑
 * @returns {Object} 包含適合顯示的 webPath 與 Windows 檔案總管可用的 winPath
 */
function normalizePath(rawPath) {
    if (!rawPath) return { webPath: '', winPath: '', isHttp: false };
    const trimmed = rawPath.trim();
    const isHttp = /^https?:\/\//i.test(trimmed);

    if (isHttp) {
        return { webPath: trimmed, winPath: trimmed, isHttp: true };
    }

    const webPath = trimmed.replace(/\\/g, '/');
    const winPath = webPath.replace(/\//g, '\\');
    return { webPath, winPath, isHttp: false };
}

// ==========================================================================
// 6. Pure Date & Schedule Utilities (For Gantt & Phase Timeline)
// Scope: Zero-dependency, timezone-safe integer calculations
// ==========================================================================

/**
 * 6.1 純日期安全解析 (去除時分秒與時區偏差)
 * @param {string} dateStr 支援 'YYYY-MM-DD', 'YYYY/MM/DD' 或含時間字串
 * @returns {Date|null} 歸零為當地 00:00:00 的 Date 物件，無效則回傳 null
 */
function parsePureDate(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim().substring(0, 10);
    const parts = s.split(/[-/]/);
    if (parts.length !== 3) return null;

    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // JS 月份為 0-11
    const d = parseInt(parts[2], 10);

    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m, d, 0, 0, 0, 0);
}

/**
 * 6.2 純天數差計算 (整數天數，含正負號)
 * @param {string} startDateStr 開始日期
 * @param {string} endDateStr 結束日期
 * @returns {number|null} 結束日減開始日的天數差 (若結束日早於開始日則為負數)
 */
function calculateDaysBetween(startDateStr, endDateStr) {
    const d1 = parsePureDate(startDateStr);
    const d2 = parsePureDate(endDateStr);
    if (!d1 || !d2) return null;

    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((d2.getTime() - d1.getTime()) / msPerDay);
}

/**
 * 6.3 排程進度百分比計算 (0% ~ 100%)
 * @param {string} startDateStr 開始日期
 * @param {string} endDateStr 目標結束日期
 * @param {string} asOfDateStr 基準日 (選填，預設為今日)
 * @returns {number} 0 到 100 的整數百分比
 */
function calculateProgressPercent(startDateStr, endDateStr, asOfDateStr) {
    const totalDays = calculateDaysBetween(startDateStr, endDateStr);
    if (totalDays === null || totalDays <= 0) return 0;

    const asOf = asOfDateStr ? parsePureDate(asOfDateStr) : new Date();
    if (!asOf) return 0;

    // 將基準日時間歸零
    const cleanAsOf = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 0, 0, 0, 0);
    const d1 = parsePureDate(startDateStr);
    const elapsedDays = Math.round((cleanAsOf.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));

    if (elapsedDays <= 0) return 0;
    if (elapsedDays >= totalDays) return 100;
    return Math.round((elapsedDays / totalDays) * 100);
}

/**
 * 6.4 排程日期前後順序防呆驗證
 * @param {string} startDateStr 開始日期
 * @param {string} endDateStr 結束日期
 * @returns {boolean} true: 合法 (結束日 >= 開始日); false: 順序顛倒或無效
 */
function validateDateSequence(startDateStr, endDateStr) {
    const diff = calculateDaysBetween(startDateStr, endDateStr);
    if (diff === null) return true; // 若有空值由必填驗證處理，此處不判斷為順序顛倒
    return diff >= 0;
}

// ==========================================================================
// 全域資料變更前後生命週期管理 (Global Mutation Lifecycle Guard - Safe Logging)
// ==========================================================================
window.MutationGuard = {
    beforeMutation(actionName) {
        if (!navigator.onLine) {
            alert('[Network Offline] No internet connection detected. Action cancelled.');
            return false;
        }
        console.log('%c[MutationGuard] >> Initiating Data Update', 'color: #d97706; font-weight: bold;');
        return true;
    },

    notifySuccess(endpoint, responseData) {
        const ep = (endpoint || '').toLowerCase();
        let targetModule = 'Generic';

        if (ep.includes('/project/')) targetModule = 'Project';
        else if (ep.includes('/phase/')) targetModule = 'Phase';
        else if (ep.includes('/event/')) targetModule = 'Event';
        else if (ep.includes('/member')) targetModule = 'Member';
        else if (ep.includes('/mission')) targetModule = 'Mission';

        console.group(`%c[MutationGuard] [OK] Data Synchronized: [${targetModule}]`, 'color: #059669; font-weight: bold;');

        // 階層 1: 異動 Project
        if (targetModule === 'Project') {
            console.log('[Level 1] Invalidation: Project hierarchy refreshed');
            if (typeof window.invalidateEventRefsCache === 'function') window.invalidateEventRefsCache();
            if (typeof window.invalidatePhaseRefsCache === 'function') window.invalidatePhaseRefsCache();
            if (typeof window.invalidateMissionRefsCache === 'function') window.invalidateMissionRefsCache();
        }
        // 階層 2: 異動 Phase
        else if (targetModule === 'Phase') {
            console.log('[Level 2] Invalidation: Event & Mission caches cleared');
            if (typeof window.invalidateEventRefsCache === 'function') window.invalidateEventRefsCache();
            if (typeof window.invalidateMissionRefsCache === 'function') window.invalidateMissionRefsCache();
        }
        // 階層 3: 異動 Event
        else if (targetModule === 'Event') {
            console.log('[Level 3] Invalidation: Sub-Event & Mission caches cleared');
            if (typeof window.invalidateEventRefsCache === 'function') window.invalidateEventRefsCache();
            if (typeof window.invalidateMissionRefsCache === 'function') window.invalidateMissionRefsCache();
        }
        // 階層 4: 異動 Member
        else if (targetModule === 'Member') {
            console.log('[Level 4] Invalidation: Member assignment cache refreshed');
            if (typeof window.invalidateEventRefsCache === 'function') window.invalidateEventRefsCache();
        }

        console.groupEnd();
    }
};