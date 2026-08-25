document.addEventListener('DOMContentLoaded', () => {
    // ---- DOM Elements ----
    const loginSection = document.getElementById('loginSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const headerActions = document.getElementById('headerActions');
    const adminPwdInput = document.getElementById('adminPwdInput');
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    // Stats
    const statTotal = document.getElementById('statTotal');
    const statUnused = document.getElementById('statUnused');
    const statUsed = document.getElementById('statUsed');
    const statExpired = document.getElementById('statExpired');
    const storageStatus = document.getElementById('storageStatus');

    // CDKEY Modal & Overview
    const cdkeyModal = document.getElementById('cdkeyModal');
    const openCdkeyModalBtn = document.getElementById('openCdkeyModalBtn');
    const closeCdkeyModalBtn = document.getElementById('closeCdkeyModalBtn');
    const quickClearExpiredBtn = document.getElementById('quickClearExpiredBtn');
    const clearUsedKeysBtn = document.getElementById('clearUsedKeysBtn');
    const modalStatTotal = document.getElementById('modalStatTotal');
    const modalStatUnused = document.getElementById('modalStatUnused');
    const modalStatUsed = document.getElementById('modalStatUsed');
    const modalStatExpired = document.getElementById('modalStatExpired');

    // Settings Modal & Overview Indicators
    const settingsModal = document.getElementById('settingsModal');
    const openSettingsModalBtn = document.getElementById('openSettingsModalBtn');
    const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    const overviewClerkStatus = document.getElementById('overviewClerkStatus');
    const overviewR2Status = document.getElementById('overviewR2Status');
    const overviewDomainStatus = document.getElementById('overviewDomainStatus');

    // CDKEY Gen & Table
    const generateCdkeyBtn = document.getElementById('generateCdkeyBtn');
    const cdkeyCount = document.getElementById('cdkeyCount');
    const cdkeyDuration = document.getElementById('cdkeyDuration');
    const cdkeyResultWrapper = document.getElementById('cdkeyResultWrapper');
    const cdkeyResultList = document.getElementById('cdkeyResultList');
    const copyAllCdkeysBtn = document.getElementById('copyAllCdkeysBtn');
    const cdkeyTableBody = document.getElementById('cdkeyTableBody');
    const searchKeyInput = document.getElementById('searchKeyInput');
    const clearExpiredKeysBtn = document.getElementById('clearExpiredKeysBtn');
    const filterTabs = document.querySelectorAll('.filter-tabs:not(#siteFilterTabs) .filter-tab');
    const keyDurationFilter = document.getElementById('keyDurationFilter');
    const exportScopeSelect = document.getElementById('exportScopeSelect');
    const cleanScopeSelect = document.getElementById('cleanScopeSelect');
    const doCleanByTypeBtn = document.getElementById('doCleanByTypeBtn');

    // Counts (Keys)
    const countAll = document.getElementById('countAll');
    const countUnused = document.getElementById('countUnused');
    const countUsed = document.getElementById('countUsed');
    const countExpired = document.getElementById('countExpired');

    // Sites Table & Stats
    const sitesTableBody = document.getElementById('sitesTableBody');
    const siteStatTotal = document.getElementById('siteStatTotal');
    const siteStatActive = document.getElementById('siteStatActive');
    const siteStatExpired = document.getElementById('siteStatExpired');
    const siteStatR2 = document.getElementById('siteStatR2');
    const siteCountAll = document.getElementById('siteCountAll');
    const siteCountActive = document.getElementById('siteCountActive');
    const siteCountExpired = document.getElementById('siteCountExpired');
    const searchSiteInput = document.getElementById('searchSiteInput');
    const refreshSitesBtn = document.getElementById('refreshSitesBtn');
    const siteFilterTabs = document.querySelectorAll('#siteFilterTabs .filter-tab');

    // R2 & Domain
    const saveR2ConfigBtn = document.getElementById('saveR2ConfigBtn');
    const testR2Btn = document.getElementById('testR2Btn');
    const saveDomainConfigBtn = document.getElementById('saveDomainConfigBtn');
    const primaryDomainInput = document.getElementById('primaryDomainInput');
    const useHttpsSelect = document.getElementById('useHttpsSelect');

    // State
    let adminPassword = '';
    let allKeys = [];
    let allSites = [];
    let currentFilter = 'all';
    let currentDurationFilter = 'all';
    let searchQuery = '';
    let currentSiteFilter = 'all';
    let searchSiteQuery = '';

    // ---- Theme Engine (UI/UX Pro Max) ----
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    
    function initTheme() {
        const savedTheme = localStorage.getItem('app_theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        setTheme(currentTheme, false);
    }

    function setTheme(theme, save = true) {
        document.documentElement.setAttribute('data-theme', theme);
        if (save) {
            localStorage.setItem('app_theme', theme);
        }
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme, true);
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    window.addEventListener('storage', (e) => {
        if (e.key === 'app_theme' && e.newValue) {
            setTheme(e.newValue, false);
        }
    });

    initTheme();

    // ---- Toast System ----
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const iconSvg = type === 'success' 
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' 
            : type === 'error' 
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-error)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' 
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mac-blue)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        toast.innerHTML = `<span style="display:flex;align-items:center;">${iconSvg}</span><span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function formatDate(isoStr) {
        if (!isoStr) return '-';
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function formatDuration(dur) {
        if (dur === '3d') return '3天体验';
        if (dur === '7d') return '7天周卡';
        if (dur === '1m' || dur === '30d') return '1个月';
        if (dur === '3m' || dur === '90d') return '3个月';
        if (dur === '6m' || dur === '180d') return '半年';
        if (dur === '1y' || dur === '365d') return '1年';
        return dur || '标准';
    }

    // ---- Login ----
    adminLoginBtn.addEventListener('click', doLogin);
    adminPwdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    async function doLogin() {
        const pwd = adminPwdInput.value.trim();
        if (!pwd) {
            showToast('请输入密码', 'error');
            return;
        }

        adminLoginBtn.disabled = true;
        adminLoginBtn.textContent = '登录中...';

        try {
            adminPassword = pwd;
            await refreshAllData();

            loginSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');
            headerActions.style.display = 'flex';
            showToast('登录成功', 'success');

            loadR2Config();
            loadDomainConfig();
            loadClerkConfig();
            loadCdkeyBuyConfig();
            loadHealthStatus();
        } catch (error) {
            adminPassword = '';
            showToast(error.message || '密码错误', 'error');
        } finally {
            adminLoginBtn.disabled = false;
            adminLoginBtn.textContent = '登 录';
        }
    }

    logoutBtn.addEventListener('click', () => {
        adminPassword = '';
        dashboardSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        headerActions.style.display = 'none';
        adminPwdInput.value = '';
        showToast('已退出登录', 'info');
    });

    // ---- Load & Refresh Data ----
    async function refreshAllData() {
        await Promise.all([fetchKeys(), fetchSites()]);
    }

    async function fetchKeys() {
        const response = await fetch(`/api/admin/keys?password=${encodeURIComponent(adminPassword)}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || '密码错误');
        }
        allKeys = data.data.keys || [];
        updateKeyStatsAndTable();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function fetchSites() {
        try {
            const response = await fetch(`/api/admin/sites?password=${encodeURIComponent(adminPassword)}`);
            const data = await response.json();
            if (data.success) {
                allSites = data.data.sites || [];
                updateSiteStatsAndTable();
            }
        } catch (e) {
            console.warn('Failed to fetch sites:', e);
        }
    }

    // ---- Render CDKEY Table & Stats ----
    function updateKeyStatsAndTable() {
        const total = allKeys.length;
        const unused = allKeys.filter(k => k.status === 'unused').length;
        const active = allKeys.filter(k => k.status === 'active').length;
        const expired = allKeys.filter(k => k.status === 'expired' || k.status === 'used').length;

        if (statTotal) statTotal.textContent = total;
        if (statUnused) statUnused.textContent = unused;
        if (statUsed) statUsed.textContent = active;
        if (statExpired) statExpired.textContent = expired;

        if (modalStatTotal) modalStatTotal.textContent = total;
        if (modalStatUnused) modalStatUnused.textContent = unused;
        if (modalStatUsed) modalStatUsed.textContent = active;
        if (modalStatExpired) modalStatExpired.textContent = expired;

        if (countAll) countAll.textContent = total;
        if (countUnused) countUnused.textContent = unused;
        if (countUsed) countUsed.textContent = active;
        if (countExpired) countExpired.textContent = expired;

        renderCDKeyTable();
    }

    function renderCDKeyTable() {
        if (!cdkeyTableBody) return;

        let filtered = allKeys;

        if (currentFilter !== 'all') {
            if (currentFilter === 'active') {
                filtered = filtered.filter(k => k.status === 'active');
            } else if (currentFilter === 'expired') {
                filtered = filtered.filter(k => k.status === 'expired' || k.status === 'used');
            } else {
                filtered = filtered.filter(k => k.status === currentFilter);
            }
        }

        if (currentDurationFilter !== 'all') {
            filtered = filtered.filter(k => k.duration === currentDurationFilter);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(k => 
                k.key.toLowerCase().includes(q) || 
                (k.siteInfo && (k.siteInfo.subdomain || k.siteInfo.siteId).toLowerCase().includes(q))
            );
        }

        if (filtered.length === 0) {
            cdkeyTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 30px;">无匹配卡密记录</td></tr>`;
            return;
        }

        cdkeyTableBody.innerHTML = filtered.map(k => {
            const count = Number(k.usedCount) || 0;
            const maxUses = Number(k.maxUses) || 0;

            let statusBadge = '<span class="badge badge-unused">待激活</span>';
            if (k.status === 'expired') {
                statusBadge = '<span class="badge badge-expired">已到期</span>';
            } else if (k.status === 'used' || (maxUses > 0 && count >= maxUses)) {
                statusBadge = '<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: var(--accent-error);">已用完</span>';
            } else if (k.status === 'active' || count > 0) {
                statusBadge = `<span class="badge badge-used" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-success);">生效中</span>`;
            }

            let usageDisplay = '';
            if (maxUses > 0) {
                if (count >= maxUses) {
                    usageDisplay = `<span class="badge" style="background: rgba(239, 68, 68, 0.12); color: var(--accent-error); font-weight: 600;">${count} / ${maxUses} 次 (上限)</span>`;
                } else {
                    usageDisplay = `<span class="badge" style="background: rgba(59, 130, 246, 0.12); color: var(--mac-blue); font-weight: 600;">${count} / ${maxUses} 次</span>`;
                }
            } else {
                usageDisplay = `<span class="badge" style="background: var(--mac-surface); border: 1px solid var(--mac-border); color: var(--text-secondary);">${count} 次 (不限)</span>`;
            }

            const durationBadge = `<span class="badge badge-duration">${formatDuration(k.duration)}</span>`;
            
            let siteLink = '-';
            if (k.siteInfo && (k.siteCount > 1 || count > 1)) {
                siteLink = `<div style="display:flex; flex-direction:column; gap:2px;">
                    <a href="${k.siteInfo.url}" target="_blank" style="font-weight: 500;">${escapeHtml(k.siteInfo.subdomain || k.siteInfo.siteId)}</a>
                    <span style="color: var(--mac-blue); font-size: 11px;">共生成 ${k.siteCount || count} 个站点</span>
                </div>`;
            } else if (k.siteInfo) {
                siteLink = `<a href="${k.siteInfo.url}" target="_blank">${escapeHtml(k.siteInfo.subdomain || k.siteInfo.siteId)}</a>`;
            } else if (k.lastUsedBySiteId || k.usedBySiteId) {
                siteLink = `<span style="color: var(--text-secondary);">${escapeHtml(k.lastUsedBySiteId || k.usedBySiteId)}</span>`;
            } else if (count > 0) {
                siteLink = `<span style="color: var(--mac-blue); font-size: 12px;">已生成 ${count} 个站点</span>`;
            }

            let expDisplay = '-';
            if (k.expiresAt) {
                expDisplay = formatDate(k.expiresAt);
            } else {
                expDisplay = `<span style="color: var(--text-muted); font-size: 11.5px;">首次使用起算 ${formatDuration(k.duration)}</span>`;
            }

            return `
                <tr>
                    <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text-primary);">
                        ${escapeHtml(k.key)}
                        <button class="action-icon-btn copy-single-key" data-key="${k.key}" title="复制卡密"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                    </td>
                    <td>${durationBadge}</td>
                    <td>${usageDisplay}</td>
                    <td>${statusBadge}</td>
                    <td>${siteLink}</td>
                    <td style="color: var(--text-secondary);">${formatDate(k.createdAt)}</td>
                    <td style="color: var(--text-secondary);">${expDisplay}</td>
                    <td style="text-align: right;">
                        <button class="action-icon-btn danger delete-key-btn" data-key="${k.key}" title="删除卡密"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                    </td>
                </tr>
            `;
        }).join('');

        // Event delegation for table action buttons
        cdkeyTableBody.querySelectorAll('.copy-single-key').forEach(btn => {
            btn.addEventListener('click', () => {
                navigator.clipboard.writeText(btn.dataset.key);
                showToast('已复制卡密', 'success');
            });
        });

        cdkeyTableBody.querySelectorAll('.delete-key-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteSingleKey(btn.dataset.key));
        });
    }

    // ---- Render Sites Table & Stats ----
    function updateSiteStatsAndTable() {
        const total = allSites.length;
        const active = allSites.filter(s => !s.isExpired).length;
        const expired = allSites.filter(s => s.isExpired).length;
        const r2Count = allSites.filter(s => s.storage === 'r2').length;

        if (siteStatTotal) siteStatTotal.textContent = total;
        if (siteStatActive) siteStatActive.textContent = active;
        if (siteStatExpired) siteStatExpired.textContent = expired;
        if (siteStatR2) siteStatR2.textContent = r2Count;

        if (siteCountAll) siteCountAll.textContent = total;
        if (siteCountActive) siteCountActive.textContent = active;
        if (siteCountExpired) siteCountExpired.textContent = expired;

        renderSitesTable();
    }

    function renderSitesTable() {
        if (!sitesTableBody) return;

        let filtered = allSites;

        if (currentSiteFilter === 'active') {
            filtered = filtered.filter(s => !s.isExpired);
        } else if (currentSiteFilter === 'expired') {
            filtered = filtered.filter(s => s.isExpired);
        }

        if (searchSiteQuery) {
            const q = searchSiteQuery.toLowerCase();
            filtered = filtered.filter(s => 
                (s.subdomain && s.subdomain.toLowerCase().includes(q)) ||
                (s.customPath && s.customPath.toLowerCase().includes(q)) ||
                (s.siteId && s.siteId.toLowerCase().includes(q)) ||
                (s.url && s.url.toLowerCase().includes(q)) ||
                (s.userEmail && s.userEmail.toLowerCase().includes(q)) ||
                (s.cdkey && s.cdkey.toLowerCase().includes(q))
            );
        }

        if (filtered.length === 0) {
            sitesTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 30px;">无匹配站点记录</td></tr>`;
            return;
        }

        sitesTableBody.innerHTML = filtered.map(s => {
            const isExp = s.isExpired;
            const statusBadge = isExp 
                ? '<span class="badge badge-expired">已到期失效</span>'
                : '<span class="badge badge-used">正常运行中</span>';

            const storageBadge = s.storage === 'r2' 
                ? '<span class="badge badge-duration" style="background: rgba(10, 132, 255, 0.12); color: var(--mac-blue);">Cloudflare R2</span>'
                : '<span class="badge badge-duration" style="background: rgba(148, 163, 184, 0.12); color: var(--text-secondary);">本地存储</span>';

            const userDisplay = s.userEmail 
                ? `<span style="color: var(--mac-purple); font-weight: 500; font-size: 12px; display:inline-flex; align-items:center; gap:3px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${escapeHtml(s.userEmail)}</span>` 
                : (s.userId ? `<span style="color: var(--text-secondary); font-size: 11px;">ID: ${escapeHtml(s.userId.slice(-8))}</span>` : '<span style="color: var(--text-muted); font-size: 12px;">历史未关联</span>');

            return `
                <tr>
                    <td style="font-weight: 600; color: var(--text-primary);">${escapeHtml(s.subdomain || s.customPath || s.siteId)}</td>
                    <td><a href="${s.url}" target="_blank">${escapeHtml(s.url)}</a></td>
                    <td>${userDisplay}</td>
                    <td style="font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--text-secondary);">${escapeHtml(s.cdkey || '-')}</td>
                    <td><span class="badge badge-duration">${formatDuration(s.duration)}</span></td>
                    <td>${storageBadge}</td>
                    <td style="color: var(--text-secondary);">${formatDate(s.createdAt)}</td>
                    <td>${statusBadge}</td>
                    <td style="text-align: right;">
                        <button class="action-icon-btn danger delete-site-btn" data-siteid="${s.siteId}" title="删除站点文件与记录"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                    </td>
                </tr>
            `;
        }).join('');

        sitesTableBody.querySelectorAll('.delete-site-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteSingleSite(btn.dataset.siteid));
        });
    }

    // ---- Filter & Search Listeners ----
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            renderCDKeyTable();
        });
    });

    if (searchKeyInput) {
        searchKeyInput.addEventListener('input', () => {
            searchQuery = searchKeyInput.value.trim();
            renderCDKeyTable();
        });
    }

    if (keyDurationFilter) {
        keyDurationFilter.addEventListener('change', () => {
            currentDurationFilter = keyDurationFilter.value;
            renderCDKeyTable();
        });
    }

    // Site Filter & Search Listeners
    siteFilterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            siteFilterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentSiteFilter = tab.dataset.siteFilter || 'all';
            renderSitesTable();
        });
    });

    if (searchSiteInput) {
        searchSiteInput.addEventListener('input', () => {
            searchSiteQuery = searchSiteInput.value.trim();
            renderSitesTable();
        });
    }

    if (refreshSitesBtn) {
        refreshSitesBtn.addEventListener('click', async () => {
            refreshSitesBtn.disabled = true;
            await fetchSites();
            showToast('站点列表已刷新', 'success');
            refreshSitesBtn.disabled = false;
        });
    }

    // ---- Custom Max Uses Input Toggle ----
    const cdkeyMaxUsesSelect = document.getElementById('cdkeyMaxUsesSelect');
    const cdkeyMaxUsesCustom = document.getElementById('cdkeyMaxUsesCustom');
    if (cdkeyMaxUsesSelect && cdkeyMaxUsesCustom) {
        cdkeyMaxUsesSelect.addEventListener('change', () => {
            if (cdkeyMaxUsesSelect.value === 'custom') {
                cdkeyMaxUsesCustom.style.display = 'block';
                cdkeyMaxUsesCustom.focus();
            } else {
                cdkeyMaxUsesCustom.style.display = 'none';
            }
        });
    }

    // ---- Generate CDKEYs ----
    generateCdkeyBtn.addEventListener('click', async () => {
        const count = parseInt(cdkeyCount.value);
        const duration = cdkeyDuration.value;
        const maxUsesSelectVal = cdkeyMaxUsesSelect ? cdkeyMaxUsesSelect.value : '0';
        const maxUses = maxUsesSelectVal === 'custom' ? (parseInt(cdkeyMaxUsesCustom ? cdkeyMaxUsesCustom.value : 0) || 0) : (parseInt(maxUsesSelectVal) || 0);

        if (isNaN(count) || count < 1 || count > 100) {
            return showToast('生成数量需在 1-100 之间', 'error');
        }

        generateCdkeyBtn.disabled = true;
        generateCdkeyBtn.textContent = '生成中...';

        try {
            const response = await fetch('/api/admin/generate-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count, duration, maxUses, password: adminPassword })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || '生成失败');
            }

            const createdKeys = data.data.keys || [];
            const keyStrings = createdKeys.map(k => typeof k === 'string' ? k : k.key);
            
            cdkeyResultWrapper.style.display = 'block';
            cdkeyResultList.value = keyStrings.join('\n');
            const usageDesc = maxUses > 0 ? `限用 ${maxUses} 次` : '不限次数';
            showToast(`成功生成 ${keyStrings.length} 个【${formatDuration(duration)} · ${usageDesc}】卡密`, 'success');

            await fetchKeys();
        } catch (error) {
            showToast(error.message || '生成失败', 'error');
        } finally {
            generateCdkeyBtn.disabled = false;
            generateCdkeyBtn.textContent = '立即生成';
        }
    });

    // ---- Mode Switcher: Generate vs Import ----
    const tabModeGenerate = document.getElementById('tabModeGenerate');
    const tabModeImport = document.getElementById('tabModeImport');
    const panelGenerateKeys = document.getElementById('panelGenerateKeys');
    const panelImportKeys = document.getElementById('panelImportKeys');

    if (tabModeGenerate && tabModeImport && panelGenerateKeys && panelImportKeys) {
        tabModeGenerate.addEventListener('click', () => {
            tabModeGenerate.classList.add('active', 'btn-primary');
            tabModeGenerate.classList.remove('btn-outline');
            tabModeImport.classList.remove('active', 'btn-primary');
            tabModeImport.classList.add('btn-outline');
            panelGenerateKeys.style.display = 'block';
            panelImportKeys.style.display = 'none';
        });

        tabModeImport.addEventListener('click', () => {
            tabModeImport.classList.add('active', 'btn-primary');
            tabModeImport.classList.remove('btn-outline');
            tabModeGenerate.classList.remove('active', 'btn-primary');
            tabModeGenerate.classList.add('btn-outline');
            panelImportKeys.style.display = 'block';
            panelGenerateKeys.style.display = 'none';
        });
    }

    // ---- Import Keys Logic ----
    const importKeysTextarea = document.getElementById('importKeysTextarea');
    const importPreviewCount = document.getElementById('importPreviewCount');
    const importKeyDuration = document.getElementById('importKeyDuration');
    const importKeyMaxUses = document.getElementById('importKeyMaxUses');
    const importKeyStatus = document.getElementById('importKeyStatus');
    const importKeyOverwrite = document.getElementById('importKeyOverwrite');
    const doImportKeysBtn = document.getElementById('doImportKeysBtn');

    if (importKeysTextarea && importPreviewCount) {
        importKeysTextarea.addEventListener('input', () => {
            const lines = importKeysTextarea.value.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
            importPreviewCount.textContent = `已识别 ${lines.length} 条有效卡密`;
        });
    }

    if (doImportKeysBtn) {
        doImportKeysBtn.addEventListener('click', async () => {
            const rawText = importKeysTextarea ? importKeysTextarea.value.trim() : '';
            if (!rawText) {
                return showToast('请先输入或粘贴要导入的卡密', 'error');
            }

            const duration = importKeyDuration ? importKeyDuration.value : '1m';
            const maxUses = importKeyMaxUses ? (parseInt(importKeyMaxUses.value) || 0) : 0;
            const status = importKeyStatus ? importKeyStatus.value : 'unused';
            const overwrite = importKeyOverwrite ? importKeyOverwrite.checked : false;

            doImportKeysBtn.disabled = true;
            doImportKeysBtn.textContent = '导入中...';

            try {
                const response = await fetch('/api/admin/import-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        keysText: rawText,
                        duration,
                        maxUses,
                        status,
                        overwrite,
                        password: adminPassword
                    })
                });

                let data;
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    const text = await response.text();
                    if (response.status === 404) {
                        throw new Error('未找到导入接口(404)，请检查服务器端 Node.js 服务是否已重启');
                    }
                    throw new Error(`服务器响应异常(${response.status}): ${text.slice(0, 100)}`);
                }

                if (!response.ok || !data.success) {
                    throw new Error(data.message || '导入失败');
                }

                showToast(data.message || '导入成功！', 'success');
                if (importKeysTextarea) importKeysTextarea.value = '';
                if (importPreviewCount) importPreviewCount.textContent = '已输入 0 行';

                await fetchKeys();
            } catch (error) {
                showToast(error.message || '导入出错', 'error');
            } finally {
                doImportKeysBtn.disabled = false;
                doImportKeysBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 3px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>确认导入';
            }
        });
    }

    function downloadTextFile(filename, textContent) {
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    copyAllCdkeysBtn.addEventListener('click', async () => {
        if (!cdkeyResultList.value) return showToast('没有可复制的卡密', 'error');
        try {
            await navigator.clipboard.writeText(cdkeyResultList.value);
            showToast('已复制新生成的全部卡密', 'success');
        } catch {
            cdkeyResultList.select();
            document.execCommand('copy');
            showToast('已复制新生成的全部卡密', 'success');
        }
    });

    const exportNewCdkeysBtn = document.getElementById('exportNewCdkeysBtn');
    if (exportNewCdkeysBtn) {
        exportNewCdkeysBtn.addEventListener('click', () => {
            if (!cdkeyResultList.value || !cdkeyResultList.value.trim()) return showToast('没有可导出的新卡密', 'error');
            const dateStr = new Date().toISOString().slice(0, 10);
            downloadTextFile(`cdkeys_new_${dateStr}.txt`, cdkeyResultList.value.trim());
            showToast('已导出新卡密文本文件', 'success');
        });
    }

    const exportFilteredKeysBtn = document.getElementById('exportFilteredKeysBtn');
    if (exportFilteredKeysBtn) {
        exportFilteredKeysBtn.addEventListener('click', () => {
            const scope = exportScopeSelect ? exportScopeSelect.value : 'current';
            let keysToExport = [];
            let fileName = '';
            let fileHeader = '';

            const dateStr = new Date().toISOString().slice(0, 10);

            if (scope === 'unused_all') {
                keysToExport = allKeys.filter(k => k.status === 'unused');
                fileName = `cdkeys_unactivated_all_${dateStr}.txt`;
                fileHeader = `# 秒转链接 - 全量待激活卡密列表 (共 ${keysToExport.length} 条)\n# 导出时间: ${new Date().toLocaleString('zh-CN')}\n# 可直接复制用于批量发货或卡密分发（用户在有效期内可无限次生成链接）\n\n`;
            } else if (scope === 'unused_3d') {
                keysToExport = allKeys.filter(k => k.status === 'unused' && k.duration === '3d');
                fileName = `cdkeys_unused_3days_${dateStr}.txt`;
                fileHeader = `# 秒转链接 - 3天体验卡(待激活) (共 ${keysToExport.length} 条)\n# 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
            } else if (scope === 'unused_1m') {
                keysToExport = allKeys.filter(k => k.status === 'unused' && (k.duration === '1m' || k.duration === '30d'));
                fileName = `cdkeys_unused_1month_${dateStr}.txt`;
                fileHeader = `# 秒转链接 - 1个月月卡(待激活) (共 ${keysToExport.length} 条)\n# 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
            } else if (scope === 'unused_6m') {
                keysToExport = allKeys.filter(k => k.status === 'unused' && (k.duration === '6m' || k.duration === '180d'));
                fileName = `cdkeys_unused_6months_${dateStr}.txt`;
                fileHeader = `# 秒转链接 - 半年卡(待激活) (共 ${keysToExport.length} 条)\n# 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
            } else if (scope === 'unused_1y') {
                keysToExport = allKeys.filter(k => k.status === 'unused' && (k.duration === '1y' || k.duration === '365d'));
                fileName = `cdkeys_unused_1year_${dateStr}.txt`;
                fileHeader = `# 秒转链接 - 1年年卡(待激活) (共 ${keysToExport.length} 条)\n# 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
            } else if (scope === 'all_detail') {
                keysToExport = allKeys;
                fileName = `cdkeys_all_ledger_${dateStr}.txt`;
                fileHeader = `# 秒转链接 - 全量卡密完整台账 (共 ${keysToExport.length} 条)\n# 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
            } else {
                // 'current' view
                keysToExport = allKeys;
                if (currentFilter !== 'all') {
                    if (currentFilter === 'active' || currentFilter === 'used') {
                        keysToExport = keysToExport.filter(k => k.status === 'active' || k.status === 'used');
                    } else {
                        keysToExport = keysToExport.filter(k => k.status === currentFilter);
                    }
                }
                if (currentDurationFilter !== 'all') keysToExport = keysToExport.filter(k => k.duration === currentDurationFilter);
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    keysToExport = keysToExport.filter(k => 
                        k.key.toLowerCase().includes(q) || 
                        (k.siteInfo && (k.siteInfo.subdomain || k.siteInfo.siteId).toLowerCase().includes(q))
                    );
                }
                fileName = `cdkeys_filtered_${currentFilter}_${currentDurationFilter}_${dateStr}.txt`;
                fileHeader = `# 秒转链接 - 筛选结果卡密导出 (共 ${keysToExport.length} 条)\n# 筛选状态: ${currentFilter} | 筛选时长: ${currentDurationFilter}\n\n`;
            }

            if (keysToExport.length === 0) return showToast('所选范围没有可导出的卡密', 'error');

            let content = '';
            if (scope.startsWith('unused_')) {
                content = fileHeader + keysToExport.map(k => k.key).join('\n');
            } else {
                const lines = keysToExport.map(k => {
                    const count = Number(k.usedCount) || 0;
                    const maxUses = Number(k.maxUses) || 0;
                    const quotaText = maxUses > 0 ? `${count}/${maxUses}次` : `${count}次(不限)`;
                    const statusName = k.status === 'unused' ? '待激活' : (k.status === 'expired' ? '已到期' : (k.status === 'used' ? '已用完' : '生效中'));
                    const siteName = k.siteInfo ? (k.siteInfo.subdomain || k.siteInfo.siteId) : (count > 0 ? `已生成${count}个` : '-');
                    const expText = k.expiresAt ? formatDate(k.expiresAt) : '首次使用起算';
                    return `${k.key}\t|\t时长: ${formatDuration(k.duration)}\t|\t使用额度: ${quotaText}\t|\t状态: ${statusName}\t|\t到期时间: ${expText}\t|\t站点: ${siteName}`;
                });
                content = fileHeader + lines.join('\n');
            }

            downloadTextFile(fileName, content);
            showToast(`已成功导出 ${keysToExport.length} 条卡密`, 'success');
        });
    }

    // Type-based and Scope-based Cleanup
    if (doCleanByTypeBtn) {
        doCleanByTypeBtn.addEventListener('click', async () => {
            const scope = cleanScopeSelect ? cleanScopeSelect.value : 'expired';
            let payload = { password: adminPassword };
            let confirmMsg = '';

            if (scope === 'expired') {
                payload.deleteExpired = true;
                confirmMsg = '确定要清理全量【已到期失效】的卡密记录吗？';
            } else if (scope === 'active' || scope === 'used') {
                payload.deleteActive = true;
                confirmMsg = '确定要清理全量【生效中】的卡密记录吗？（未激活的卡密不受影响）';
            } else if (scope === 'unused') {
                payload.deleteUnused = true;
                confirmMsg = '⚠️ 确定要清理所有【待激活/未生成】的卡密吗？（未激活的卡密将被全部清除）';
            } else if (['3d', '1m', '6m', '1y', '3m', '7d', 'forever', 'unlimited'].includes(scope)) {
                const durNames = { '3d': '3天体验卡', '1m': '1个月月卡', '6m': '半年卡(6个月)', '1y': '1年年卡', '3m': '3个月季卡', '7d': '7天周卡', 'forever': '永久有效卡' };
                payload.deleteDuration = scope;
                confirmMsg = `确定要清理所有【${durNames[scope] || scope}】类型的卡密吗？`;
            } else if (scope === 'all') {
                payload.deleteAll = true;
                confirmMsg = '🚨 严重警告：确定要彻底清空全量所有卡密吗？此操作不可逆！';
            }

            if (!confirm(confirmMsg)) return;

            try {
                const response = await fetch('/api/admin/keys', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    showToast(data.message, 'success');
                    await fetchKeys();
                } else {
                    showToast(data.message || '清理失败', 'error');
                }
            } catch (e) {
                showToast('请求失败', 'error');
            }
        });
    }

    // ---- Delete Operations ----
    async function deleteSingleKey(key) {
        if (!confirm(`确定要删除卡密「${key}」吗？`)) return;
        try {
            const response = await fetch('/api/admin/keys', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, password: adminPassword })
            });
            const data = await response.json();
            if (data.success) {
                showToast(data.message, 'success');
                await fetchKeys();
            } else {
                showToast(data.message || '删除失败', 'error');
            }
        } catch (e) {
            showToast('请求失败', 'error');
        }
    }

    // Modal Open & Close Listeners
    if (openCdkeyModalBtn && cdkeyModal) {
        openCdkeyModalBtn.addEventListener('click', () => {
            cdkeyModal.classList.remove('hidden');
            renderCDKeyTable();
        });
    }

    if (closeCdkeyModalBtn && cdkeyModal) {
        closeCdkeyModalBtn.addEventListener('click', () => {
            cdkeyModal.classList.add('hidden');
        });
        cdkeyModal.addEventListener('click', (e) => {
            if (e.target === cdkeyModal) {
                cdkeyModal.classList.add('hidden');
            }
        });
    }

    if (openSettingsModalBtn && settingsModal) {
        openSettingsModalBtn.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
        });
    }

    if (closeSettingsModalBtn && settingsModal) {
        closeSettingsModalBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.add('hidden');
            }
        });
    }

    const openSettingsForCdkeyBtn = document.getElementById('openSettingsForCdkeyBtn');
    if (openSettingsForCdkeyBtn && settingsModal) {
        openSettingsForCdkeyBtn.addEventListener('click', () => {
            if (cdkeyModal) cdkeyModal.classList.add('hidden');
            settingsModal.classList.remove('hidden');
            const urlInput = document.getElementById('cdkeyBuyUrlInput');
            if (urlInput) {
                setTimeout(() => {
                    urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    urlInput.focus();
                }, 100);
            }
        });
    }


    // Quick Clear Expired from Overview Card
    if (quickClearExpiredBtn) {
        quickClearExpiredBtn.addEventListener('click', () => {
            clearExpiredKeysAction();
        });
    }

    if (clearExpiredKeysBtn) {
        clearExpiredKeysBtn.addEventListener('click', () => {
            clearExpiredKeysAction();
        });
    }

    async function clearExpiredKeysAction() {
        if (!confirm('确定要清理全量【已到期】的卡密记录吗？')) return;
        try {
            const response = await fetch('/api/admin/keys', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deleteExpired: true, password: adminPassword })
            });
            const data = await response.json();
            if (data.success) {
                showToast(data.message, 'success');
                await fetchKeys();
            } else {
                showToast(data.message || '清理失败', 'error');
            }
        } catch (e) {
            showToast('请求失败', 'error');
        }
    }

    async function deleteSingleSite(siteId) {
        if (!confirm(`确定要删除已部署站点「${siteId}」及其相关本地文件吗？`)) return;
        try {
            const response = await fetch('/api/admin/sites', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId, password: adminPassword })
            });
            const data = await response.json();
            if (data.success) {
                showToast(data.message, 'success');
                await refreshAllData();
            } else {
                showToast(data.message || '删除失败', 'error');
            }
        } catch (e) {
            showToast('删除站点失败', 'error');
        }
    }

    // ---- R2 Config ----
    async function loadR2Config() {
        try {
            const response = await fetch(`/api/admin/r2-config?password=${encodeURIComponent(adminPassword)}`);
            const data = await response.json();

            if (data.success && data.data.config) {
                const cfg = data.data.config;
                document.getElementById('r2AccountId').value = cfg.accountId || '';
                document.getElementById('r2AccessKey').value = cfg.accessKeyId || '';
                document.getElementById('r2SecretKey').value = cfg.secretAccessKey || '';
                document.getElementById('r2Bucket').value = cfg.bucketName || '';
                document.getElementById('r2Domain').value = cfg.publicDomain || '';
                
                const isConfigured = !!(cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucketName);
                updateStorageStatus(isConfigured);
            }
        } catch (e) {
            console.warn('Failed to load R2 config:', e);
        }
    }

    saveR2ConfigBtn.addEventListener('click', async () => {
        const config = {
            accountId: document.getElementById('r2AccountId').value.trim(),
            accessKeyId: document.getElementById('r2AccessKey').value.trim(),
            secretAccessKey: document.getElementById('r2SecretKey').value.trim(),
            bucketName: document.getElementById('r2Bucket').value.trim(),
            publicDomain: document.getElementById('r2Domain').value.trim()
        };

        saveR2ConfigBtn.disabled = true;
        saveR2ConfigBtn.textContent = '保存中...';

        try {
            const response = await fetch('/api/admin/r2-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config, password: adminPassword })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || '保存失败');
            }

            const isConfigured = data.data.isConfigured;
            updateStorageStatus(isConfigured);
            showToast(`R2 配置已保存 (${isConfigured ? '已连接 R2' : '本地存储模式'})`, 'success');
        } catch (error) {
            showToast(error.message || '保存失败', 'error');
        } finally {
            saveR2ConfigBtn.disabled = false;
            saveR2ConfigBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>保存 R2 配置';
        }
    });

    testR2Btn.addEventListener('click', async () => {
        testR2Btn.disabled = true;
        testR2Btn.textContent = '测试中...';

        try {
            const response = await fetch('/api/admin/r2-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: adminPassword })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || '连接失败');
            }

            showToast('R2 连接测试成功！', 'success');
            updateStorageStatus(true);
        } catch (error) {
            showToast(error.message || 'R2 连接测试失败', 'error');
        } finally {
            testR2Btn.disabled = false;
            testR2Btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>测试连接';
        }
    });

    // ---- Domain Config ----
    async function loadDomainConfig() {
        try {
            const response = await fetch(`/api/admin/domain-config?password=${encodeURIComponent(adminPassword)}`);
            const data = await response.json();

            if (data.success && data.data) {
                primaryDomainInput.value = data.data.primaryDomain || '';
                useHttpsSelect.value = data.data.useHttps ? 'true' : 'false';
                
                if (overviewDomainStatus) {
                    const dom = data.data.primaryDomain;
                    const proto = data.data.useHttps ? 'https://' : 'http://';
                    overviewDomainStatus.innerHTML = dom 
                        ? `<span style="color: var(--accent-success); font-weight: 600;">● ${proto}${escapeHtml(dom)}</span>`
                        : '<span style="color: var(--text-secondary);">○ 默认服务器域名模式</span>';
                }
            }
        } catch (e) {
            console.warn('Failed to load Domain config:', e);
        }
    }

    if (saveDomainConfigBtn) {
        saveDomainConfigBtn.addEventListener('click', async () => {
            const primaryDomain = primaryDomainInput.value.trim();
            const useHttps = useHttpsSelect.value === 'true';

            saveDomainConfigBtn.disabled = true;
            saveDomainConfigBtn.textContent = '保存中...';

            try {
                const response = await fetch('/api/admin/domain-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ primaryDomain, useHttps, password: adminPassword })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || '保存失败');
                }

                if (overviewDomainStatus) {
                    const proto = useHttps ? 'https://' : 'http://';
                    overviewDomainStatus.innerHTML = primaryDomain 
                        ? `<span style="color: var(--accent-success); font-weight: 600;">● ${proto}${escapeHtml(primaryDomain)}</span>`
                        : '<span style="color: var(--text-secondary);">○ 默认服务器域名模式</span>';
                }

                showToast('主域名配置已保存', 'success');
            } catch (error) {
                showToast(error.message || '保存失败', 'error');
            } finally {
                saveDomainConfigBtn.disabled = false;
                saveDomainConfigBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>保存域名配置';
            }
        });
    }

    // ---- Clerk Auth Config ----
    async function loadClerkConfig() {
        try {
            const response = await fetch(`/api/admin/clerk-config?password=${encodeURIComponent(adminPassword)}`);
            const data = await response.json();

            if (data.success && data.data) {
                const pubInput = document.getElementById('clerkPublishableKeyInput');
                const secInput = document.getElementById('clerkSecretKeyInput');
                if (pubInput) pubInput.value = data.data.publishableKey || '';
                if (secInput) secInput.value = data.data.secretKey || '';

                if (overviewClerkStatus) {
                    const isOk = !!(data.data.publishableKey);
                    overviewClerkStatus.innerHTML = isOk 
                        ? '<span style="color: var(--accent-success); font-weight: 600;">● 已配置 (已启用注册登录)</span>'
                        : '<span style="color: var(--accent-warning); font-weight: 600;">○ 未配置 (需填写公私钥)</span>';
                }
            }
        } catch (e) {
            console.warn('Failed to load Clerk config:', e);
        }
    }

    const saveClerkConfigBtn = document.getElementById('saveClerkConfigBtn');
    if (saveClerkConfigBtn) {
        saveClerkConfigBtn.addEventListener('click', async () => {
            const publishableKey = document.getElementById('clerkPublishableKeyInput').value.trim();
            const secretKey = document.getElementById('clerkSecretKeyInput').value.trim();

            saveClerkConfigBtn.disabled = true;
            saveClerkConfigBtn.textContent = '保存中...';

            try {
                const response = await fetch('/api/admin/clerk-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ publishableKey, secretKey, password: adminPassword })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || '保存失败');
                }

                if (overviewClerkStatus) {
                    const isOk = !!publishableKey;
                    overviewClerkStatus.innerHTML = isOk 
                        ? '<span style="color: var(--accent-success); font-weight: 600;">● 已配置 (已启用注册登录)</span>'
                        : '<span style="color: var(--accent-warning); font-weight: 600;">○ 未配置 (需填写公私钥)</span>';
                }

                showToast('Clerk 认证配置已成功更新！', 'success');
            } catch (error) {
                showToast(error.message || '保存失败', 'error');
            } finally {
                saveClerkConfigBtn.disabled = false;
                saveClerkConfigBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>保存 Clerk 配置';
            }
        });
    }

    // ---- CDKEY Acquisition Channel Link Config ----
    const saveCdkeyBuyConfigBtn = document.getElementById('saveCdkeyBuyConfigBtn');
    const cdkeyBuyUrlInput = document.getElementById('cdkeyBuyUrlInput');
    const cdkeyBuyTextInput = document.getElementById('cdkeyBuyTextInput');
    const overviewCdkeyBuyStatus = document.getElementById('overviewCdkeyBuyStatus');
    const cdkeyModalBuyStatus = document.getElementById('cdkeyModalBuyStatus');

    function updateCdkeyBuyStatusUI(url, text) {
        const hasUrl = Boolean(url && url.trim());
        const displayTxt = text ? ` (${escapeHtml(text)})` : '';
        if (overviewCdkeyBuyStatus) {
            overviewCdkeyBuyStatus.innerHTML = hasUrl 
                ? `<span style="color: var(--accent-success); font-weight: 600;">● 已配置${displayTxt}</span>`
                : '<span style="color: var(--text-secondary);">○ 未配置外部跳转</span>';
        }
        if (cdkeyModalBuyStatus) {
            cdkeyModalBuyStatus.innerHTML = hasUrl
                ? `<span style="color: var(--accent-success); font-weight: 600;">已开启：<a href="${escapeHtml(url)}" target="_blank" style="color: var(--mac-blue); text-decoration: underline;">${escapeHtml(url)}</a>${displayTxt}</span>`
                : '<span style="color: var(--text-secondary);">未配置（用户端点击将友好提示联系管理员）</span>';
        }
    }

    async function safeFetchJson(url, options = {}) {
        const resp = await fetch(url, options);
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error(`服务器未响应JSON (HTTP ${resp.status})，若刚更新代码请在服务器重启Node进程(如 pm2 restart)`);
        }
        const data = await resp.json();
        return { resp, data };
    }

    async function loadCdkeyBuyConfig() {
        try {
            const { data } = await safeFetchJson(`/api/admin/cdkey-buy-config?password=${encodeURIComponent(adminPassword)}`);

            if (data.success && data.data) {
                if (cdkeyBuyUrlInput) cdkeyBuyUrlInput.value = data.data.cdkeyBuyUrl || '';
                if (cdkeyBuyTextInput) cdkeyBuyTextInput.value = data.data.cdkeyBuyText || '';
                updateCdkeyBuyStatusUI(data.data.cdkeyBuyUrl, data.data.cdkeyBuyText);
            }
        } catch (e) {
            console.warn('Failed to load CDKEY buy config:', e);
        }
    }

    if (saveCdkeyBuyConfigBtn) {
        saveCdkeyBuyConfigBtn.addEventListener('click', async () => {
            const cdkeyBuyUrl = cdkeyBuyUrlInput ? cdkeyBuyUrlInput.value.trim() : '';
            const cdkeyBuyText = cdkeyBuyTextInput ? cdkeyBuyTextInput.value.trim() : '';

            saveCdkeyBuyConfigBtn.disabled = true;
            saveCdkeyBuyConfigBtn.textContent = '保存中...';

            try {
                const { resp, data } = await safeFetchJson('/api/admin/cdkey-buy-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cdkeyBuyUrl, cdkeyBuyText, password: adminPassword })
                });

                if (!resp.ok || !data.success) {
                    throw new Error(data.message || '保存失败');
                }

                updateCdkeyBuyStatusUI(cdkeyBuyUrl, cdkeyBuyText);
                showToast('卡密获取渠道配置已成功保存！', 'success');
            } catch (error) {
                showToast(error.message || '保存失败', 'error');
            } finally {
                saveCdkeyBuyConfigBtn.disabled = false;
                saveCdkeyBuyConfigBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>保存卡密渠道配置';
            }
        });
    }

    // ---- Health Status ----
    async function loadHealthStatus() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();

            if (data.success) {
                const isR2 = data.storage === 'Cloudflare R2';
                updateStorageStatus(isR2);
            }
        } catch (e) {
            storageStatus.textContent = '⚠️ 无法连接';
            storageStatus.className = 'status-value';
        }
    }

    function updateStorageStatus(isR2) {
        if (isR2) {
            storageStatus.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>Cloudflare R2';
            storageStatus.className = 'status-value connected';
        } else {
            storageStatus.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>本地存储';
            storageStatus.className = 'status-value local';
        }

        if (overviewR2Status) {
            overviewR2Status.innerHTML = isR2 
                ? '<span style="color: var(--mac-blue); font-weight: 600;">● 已连接 Cloudflare R2</span>'
                : '<span style="color: var(--text-secondary);">○ 服务器本地存储模式</span>';
        }
    }

    // =========================================================================
    // GOOGLE ANTIGRAVITY INTERACTIVE PARTICLE ENGINE (CURSOR-TRACKING SPOTLIGHT)
    // =========================================================================
    function initAntigravityBackground() {
        const canvas = document.getElementById('antigravityCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = 0;
        let height = 0;
        let dpr = 1;
        let animationFrameId = null;
        let particles = [];

        const mouse = {
            x: -9999,
            y: -9999,
            prevX: -9999,
            prevY: -9999,
            vx: 0,
            vy: 0,
            active: false
        };

        const spotlight = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            radius: 300,
            intensity: 0,
            targetIntensity: 0,
            forceRadius: 150
        };

        const darkPalette = [
            '#3B82F6', '#60A5FA', '#8B5CF6', '#A78BFA', '#06B6D4',
            '#22D3EE', '#EC4899', '#F43F5E', '#10B981', '#6366F1'
        ];

        const lightPalette = [
            '#2563EB', '#3B82F6', '#7C3AED', '#8B5CF6', '#0284C7',
            '#0D9488', '#E11D48', '#4F46E5', '#059669', '#D97706'
        ];

        function getColors() {
            const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
            return isDark ? darkPalette : lightPalette;
        }

        class Particle {
            constructor(ox, oy, color) {
                this.ox = ox;
                this.oy = oy;
                this.x = ox;
                this.y = oy;
                this.vx = 0;
                this.vy = 0;
                this.isDash = Math.random() > 0.25;
                this.length = this.isDash ? (3.5 + Math.random() * 3.5) : (2.0 + Math.random() * 0.8);
                this.thickness = 2.0; // Increased to 2.0px
                this.angle = Math.random() * Math.PI * 2;
                this.targetAngle = this.angle;
                this.baseAngle = (Math.random() - 0.5) * 0.8;
                this.phase = Math.random() * Math.PI * 2;
                this.floatSpeed = 0.008 + Math.random() * 0.012;
                this.floatRadius = 2 + Math.random() * 3.5;
                this.color = color;
                this.baseAlpha = 0.55 + Math.random() * 0.45;
                this.currentAlpha = 0;
                this.scale = 0.95 + Math.random() * 0.2;
            }

            update(time, mouseState, spot) {
                this.phase += this.floatSpeed;
                const ambientX = Math.cos(this.phase) * this.floatRadius;
                const ambientY = Math.sin(this.phase * 1.3) * this.floatRadius;
                const targetX = this.ox + ambientX;
                const targetY = this.oy + ambientY;

                const sdx = this.x - spot.x;
                const sdy = this.y - spot.y;
                const distToSpotlight = Math.hypot(sdx, sdy);

                if (spot.intensity > 0.005 && distToSpotlight < spot.radius) {
                    const normDist = distToSpotlight / spot.radius;
                    const falloff = Math.pow(1 - normDist, 1.5);
                    this.currentAlpha = this.baseAlpha * falloff * spot.intensity;
                } else {
                    this.currentAlpha = 0;
                }

                if (mouseState.active && distToSpotlight < spot.forceRadius && distToSpotlight > 0.1) {
                    const forceFactor = 1 - (distToSpotlight / spot.forceRadius);
                    const force = Math.pow(forceFactor, 1.8) * 7.0;
                    const nx = sdx / distToSpotlight;
                    const ny = sdy / distToSpotlight;

                    this.vx += nx * force;
                    this.vy += ny * force;

                    const speed = Math.hypot(mouseState.vx, mouseState.vy);
                    if (speed > 0.5) {
                        const swirl = forceFactor * 0.22;
                        this.vx += -mouseState.vy * swirl;
                        this.vy += mouseState.vx * swirl;
                    }

                    this.targetAngle = Math.atan2(sdy, sdx);
                } else {
                    this.targetAngle = this.baseAngle + Math.sin(this.phase) * 0.25;
                }

                const springK = 0.055;
                const damping = 0.86;

                const ax = (targetX - this.x) * springK;
                const ay = (targetY - this.y) * springK;

                this.vx = (this.vx + ax) * damping;
                this.vy = (this.vy + ay) * damping;

                this.x += this.vx;
                this.y += this.vy;

                let angleDiff = this.targetAngle - this.angle;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                this.angle += angleDiff * 0.14;
            }

            draw(ctx) {
                if (this.currentAlpha < 0.01) return;

                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                ctx.globalAlpha = this.currentAlpha;
                ctx.fillStyle = this.color;
                ctx.strokeStyle = this.color;

                if (this.isDash) {
                    const halfLen = (this.length * this.scale) / 2;
                    ctx.lineWidth = this.thickness * this.scale;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(-halfLen, 0);
                    ctx.lineTo(halfLen, 0);
                    ctx.stroke();
                } else {
                    const r = (this.thickness * this.scale) / 1.1;
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }
        }

        function resize() {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;

            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            
            const isMobile = width < 768;
            spotlight.radius = isMobile ? 220 : 320;
            spotlight.forceRadius = isMobile ? 120 : 160;

            createParticles();
        }

        function createParticles() {
            particles = [];
            const colors = getColors();

            const isMobile = width < 768;
            const spacing = isMobile ? 32 : 26;
            const cols = Math.ceil(width / spacing) + 1;
            const rows = Math.ceil(height / spacing) + 1;

            let colorIdx = 0;
            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    const jitterX = (Math.random() - 0.5) * (spacing * 0.65);
                    const jitterY = (Math.random() - 0.5) * (spacing * 0.65);
                    const x = i * spacing + jitterX;
                    const y = j * spacing + jitterY;
                    const color = colors[colorIdx % colors.length];
                    colorIdx++;
                    particles.push(new Particle(x, y, color));
                }
            }
        }

        function onPointerMove(e) {
            const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : null);
            const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : null);

            if (clientX === null || clientY === null) return;

            if (mouse.prevX === -9999) {
                mouse.prevX = clientX;
                mouse.prevY = clientY;
                spotlight.x = clientX;
                spotlight.y = clientY;
            } else {
                mouse.prevX = mouse.x;
                mouse.prevY = mouse.y;
            }

            mouse.x = clientX;
            mouse.y = clientY;
            mouse.vx = Math.max(-30, Math.min(30, mouse.x - mouse.prevX));
            mouse.vy = Math.max(-30, Math.min(30, mouse.y - mouse.prevY));
            mouse.active = true;
            spotlight.targetIntensity = 1.0;
        }

        function onPointerLeave() {
            mouse.active = false;
            spotlight.targetIntensity = 0.0;
        }

        window.addEventListener('mousemove', onPointerMove, { passive: true });
        window.addEventListener('touchstart', onPointerMove, { passive: true });
        window.addEventListener('touchmove', onPointerMove, { passive: true });
        window.addEventListener('touchend', onPointerLeave, { passive: true });
        document.addEventListener('mouseleave', onPointerLeave);

        window.addEventListener('click', (e) => {
            const cx = e.clientX;
            const cy = e.clientY;
            if (cx === undefined || cy === undefined) return;

            particles.forEach(p => {
                const dx = p.x - cx;
                const dy = p.y - cy;
                const dist = Math.hypot(dx, dy);
                if (dist < spotlight.radius && dist > 1) {
                    const force = (1 - dist / spotlight.radius) * 12;
                    p.vx += (dx / dist) * force;
                    p.vy += (dy / dist) * force;
                    p.targetAngle = Math.atan2(dy, dx);
                }
            });
        });

        const themeObserver = new MutationObserver(() => {
            const colors = getColors();
            particles.forEach((p, idx) => {
                p.color = colors[idx % colors.length];
            });
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        function render() {
            if (document.hidden) {
                animationFrameId = requestAnimationFrame(render);
                return;
            }

            if (mouse.active) {
                spotlight.x += (mouse.x - spotlight.x) * 0.16;
                spotlight.y += (mouse.y - spotlight.y) * 0.16;
            }
            spotlight.intensity += (spotlight.targetIntensity - spotlight.intensity) * 0.08;

            mouse.vx *= 0.85;
            mouse.vy *= 0.85;

            ctx.clearRect(0, 0, width, height);

            if (spotlight.intensity > 0.002) {
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    p.update(0, mouse, spotlight);
                    p.draw(ctx);
                }
            }

            animationFrameId = requestAnimationFrame(render);
        }

        window.addEventListener('resize', resize);
        resize();
        animationFrameId = requestAnimationFrame(render);
    }

    initAntigravityBackground();
});
