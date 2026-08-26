document.addEventListener('DOMContentLoaded', () => {
    // ---- DOM Elements ----
    
    // Tabs
    const tabs = document.querySelectorAll('.tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const tabIndicator = document.querySelector('.tab-indicator');
    let currentUploadMode = 'html'; // 'html', 'zip', 'code'
    
    // Upload Zones
    const htmlDropZone = document.getElementById('htmlDropZone');
    const htmlFileInput = document.getElementById('htmlFileInput');
    const htmlFileInfo = document.getElementById('htmlFileInfo');
    const zipDropZone = document.getElementById('zipDropZone');
    const zipFileInput = document.getElementById('zipFileInput');
    const zipFileInfo = document.getElementById('zipFileInfo');
    
    // Code Editor
    const codeTextarea = document.getElementById('codeTextarea');
    const charCount = document.querySelector('.char-count');
    
    // Form & Actions
    const cdkeyInput = document.getElementById('cdkeyInput');
    const customPathInput = document.getElementById('customPathInput');
    const pathStatus = document.getElementById('pathStatus');
    const subdomainPreview = document.getElementById('subdomainPreview');
    const previewDomainText = document.getElementById('previewDomainText');
    const deployBtn = document.getElementById('deployBtn');
    const deploySection = document.getElementById('deploySection');
    const resultSection = document.getElementById('resultSection');
    
    // Result
    const resultLink = document.getElementById('resultLink');
    const copyBtn = document.getElementById('copyBtn');
    const previewBtn = document.getElementById('previewBtn');
    const newDeployBtn = document.getElementById('newDeployBtn');
    const qrcodeContainer = document.getElementById('qrcode');
    
    // Preview Modal
    const previewModal = document.getElementById('previewModal');
    const closePreviewBtn = document.getElementById('closePreviewBtn');
    const previewIframe = document.getElementById('previewIframe');
    const previewExternalLink = document.getElementById('previewExternalLink');

    // Clerk Auth & User Sites Elements
    const headerSignInBtn = document.getElementById('headerSignInBtn');
    const headerSignUpBtn = document.getElementById('headerSignUpBtn');
    const clerkUserButtonSlot = document.getElementById('clerkUserButton');
    const mySitesBtn = document.getElementById('mySitesBtn');
    const mySitesBadge = document.getElementById('mySitesBadge');
    const mySitesModal = document.getElementById('mySitesModal');
    const closeMySitesBtn = document.getElementById('closeMySitesBtn');
    const userSitesLoading = document.getElementById('userSitesLoading');
    const userSitesEmpty = document.getElementById('userSitesEmpty');
    const userSitesList = document.getElementById('userSitesList');
    const tabBtnSites = document.getElementById('tabBtnSites');
    const tabBtnKeys = document.getElementById('tabBtnKeys');
    const userSitesTabPane = document.getElementById('userSitesTabPane');
    const userKeysTabPane = document.getElementById('userKeysTabPane');
    const userSitesCount = document.getElementById('userSitesCount');
    const userKeysCount = document.getElementById('userKeysCount');
    const userKeysList = document.getElementById('userKeysList');
    const userKeysEmpty = document.getElementById('userKeysEmpty');
    
    // FAQ
    const faqItems = document.querySelectorAll('.faq-item');
    
    // State
    let selectedFile = null;
    let pathCheckTimer = null;
    let publicDomainConfig = { primaryDomain: '', protocol: 'http://' };
    let clerkInstance = null;
    let currentUserSites = [];
    let currentUserKeys = [];
    try {
        const cached = localStorage.getItem('cached_user_sites');
        if (cached) {
            currentUserSites = JSON.parse(cached);
            if (Array.isArray(currentUserSites) && currentUserSites.length > 0 && mySitesBadge) {
                mySitesBadge.textContent = currentUserSites.length;
            }
        }
        const cachedKeys = localStorage.getItem('cached_user_keys');
        if (cachedKeys) {
            currentUserKeys = JSON.parse(cachedKeys);
            if (Array.isArray(currentUserKeys) && userKeysCount) {
                userKeysCount.textContent = currentUserKeys.length;
            }
        }
    } catch (e) {}
    const SUBDOMAIN_REGEX = /^[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]$|^[a-z0-9]{3,30}$/;
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

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

    // ---- Device Viewport Switcher in Preview Modal ----
    const deviceToggles = document.getElementById('deviceToggles');
    const previewViewportWrapper = document.getElementById('previewViewportWrapper');
    if (deviceToggles && previewViewportWrapper) {
        const deviceBtns = deviceToggles.querySelectorAll('.device-btn');
        deviceBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                deviceBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const device = btn.getAttribute('data-device') || 'desktop';
                previewViewportWrapper.className = `preview-viewport-wrapper device-${device}`;
            });
        });
    }

    // ---- Safe JSON Fetch Helper ----
    async function safeFetchJson(url, options) {
        const resp = await fetch(url, options);
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error(`服务器响应格式错误 (HTTP ${resp.status})`);
        }
        const data = await resp.json();
        return { resp, data };
    }

    // ---- Fetch Public Config ----
    async function loadPublicConfig() {
        try {
            const { data } = await safeFetchJson('/api/public-config?t=' + Date.now());
            if (data.success && data.data) {
                publicDomainConfig = data.data;
                if (publicDomainConfig.primaryDomain) {
                    const domainHint = document.getElementById('domainHint');
                    if (domainHint) {
                        domainHint.innerHTML = `提示：主域名（<code>.${publicDomainConfig.primaryDomain}</code>）由网站统一配置提供，<b>不可修改</b>；您只需自定义前缀名称（如 <code>my-site</code>），留空则自动生成 3~4 位随机短前缀。`;
                    }
                }
                updateDomainPreview(customPathInput.value.trim().toLowerCase());

                // Apply CDKEY acquisition link settings
                applyCdkeyBuyConfig(publicDomainConfig);

                // Initialize Clerk if publishable key is available
                if (publicDomainConfig.clerkPublishableKey) {
                    initClerk(publicDomainConfig.clerkPublishableKey);
                }

                // Initialize Announcements Popup System
                if (publicDomainConfig.announcements) {
                    initAnnouncementSystem(publicDomainConfig.announcements);
                }
            }
        } catch (e) {
            console.error('Failed to load public config:', e);
        }
    }

    function normalizeBuyUrl(rawUrl) {
        if (!rawUrl) return '';
        let url = rawUrl.trim();
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        return url.replace(/ /g, '%20');
    }

    function applyCdkeyBuyConfig(config) {
        const rawUrl = (config && config.cdkeyBuyUrl) ? config.cdkeyBuyUrl.trim() : '';
        const buyText = (config && config.cdkeyBuyText) ? config.cdkeyBuyText.trim() : '获取卡密';
        const finalUrl = normalizeBuyUrl(rawUrl);

        const linkEl = document.getElementById('cdkeyBuyLink');
        const textEl = document.getElementById('cdkeyBuyText');
        const renewLinkEl = document.getElementById('modalRenewCdkeyBuyLink');
        const renewTextEls = document.querySelectorAll('.cdkey-buy-text-renew');
        const stepGetCdkeyEl = document.getElementById('stepGetCdkey');

        if (textEl) textEl.textContent = buyText;
        renewTextEls.forEach(el => { el.textContent = buyText; });

        function setupBuyLink(el) {
            if (!el) return;
            if (finalUrl) {
                el.href = finalUrl;
                el.target = '_blank';
                el.rel = 'noopener noreferrer';
                el.onclick = (e) => {
                    e.stopPropagation();
                };
            } else {
                el.removeAttribute('href');
                el.removeAttribute('target');
                el.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showToast('暂未配置卡密获取链接，请联系管理员获取卡密', 'info');
                };
            }
        }

        setupBuyLink(linkEl);
        setupBuyLink(renewLinkEl);

        if (stepGetCdkeyEl) {
            if (finalUrl) {
                stepGetCdkeyEl.style.cursor = 'pointer';
                stepGetCdkeyEl.title = '点击前往获取卡密';
                stepGetCdkeyEl.onclick = () => {
                    window.open(finalUrl, '_blank', 'noopener,noreferrer');
                };
            } else {
                stepGetCdkeyEl.style.cursor = 'default';
                stepGetCdkeyEl.title = '';
                stepGetCdkeyEl.onclick = null;
            }
        }
    }

    loadPublicConfig();

    // ---- Toast System ----
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const iconSvg = type === 'success' 
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' 
            : type === 'error' 
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-error)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' 
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--mac-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        toast.innerHTML = `<span style="display:inline-flex;align-items:center;margin-right:3px;">${iconSvg}</span><span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ---- Utility Functions ----
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    function resetFileSelection() {
        selectedFile = null;
        htmlFileInput.value = '';
        zipFileInput.value = '';
        htmlFileInfo.classList.add('hidden');
        zipFileInfo.classList.add('hidden');
        codeTextarea.value = '';
        updateCharCount();
    }

    // ---- Custom Path / Subdomain Real-time Check & Preview ----
    function setPathStatus(state, message) {
        // state: '' | 'checking' | 'ok' | 'error'
        pathStatus.className = 'path-status';
        if (state === 'checking') {
            pathStatus.innerHTML = '<svg class="spinner-inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mac-blue)" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
            pathStatus.title = '检测中...';
        } else if (state === 'ok') {
            pathStatus.className = 'path-status path-ok';
            pathStatus.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            pathStatus.title = message || '域名可用';
        } else if (state === 'error') {
            pathStatus.className = 'path-status path-error';
            pathStatus.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-error)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            pathStatus.title = message || '域名不可用';
        } else {
            pathStatus.innerHTML = '';
            pathStatus.title = '';
        }
    }

    function updateDomainPreview(val) {
        if (!subdomainPreview || !previewDomainText) return;

        const primary = publicDomainConfig.primaryDomain;
        const protocol = publicDomainConfig.protocol || 'http://';
        const domainSuffixTag = document.getElementById('domainSuffixTag');

        if (primary && domainSuffixTag) {
            domainSuffixTag.textContent = `.${primary}`;
            domainSuffixTag.style.display = 'inline-block';
        } else if (domainSuffixTag) {
            domainSuffixTag.style.display = 'none';
        }

        const prefixText = val ? escapeHtml(val) : '';
        subdomainPreview.classList.remove('hidden');

        if (primary) {
            previewDomainText.innerHTML = `${protocol}<strong style="color: #34d399; text-decoration: underline;">${prefixText}</strong>.<strong style="color: #c084fc;">${escapeHtml(primary)}</strong>`;
        } else {
            previewDomainText.innerHTML = `${window.location.origin}/_sites/<strong style="color: #34d399;">${prefixText}</strong>/`;
        }
    }

    async function checkPathAvailability(val) {
        if (!val) { 
            setPathStatus(''); 
            updateDomainPreview('');
            return; 
        }
        updateDomainPreview(val);

        if (!SUBDOMAIN_REGEX.test(val) || val.length < 3 || val.length > 30) {
            setPathStatus('error', '格式不正确：仅限小写字母、数字和连字符(-)，长度 3~30，首尾为字母或数字');
            return;
        }
        setPathStatus('checking');
        try {
            const resp = await fetch(`/api/check-path?path=${encodeURIComponent(val)}`);
            const data = await resp.json();
            if (data.available) {
                setPathStatus('ok', `域名「${val}」可用`);
            } else {
                let msg = `域名「${val}」已被占用`;
                if (data.reason === 'format') msg = '格式不正确';
                else if (data.reason === 'reserved') msg = `「${val}」为系统保留名称`;
                setPathStatus('error', msg);
            }
        } catch {
            setPathStatus('', '');
        }
    }

    customPathInput.addEventListener('input', () => {
        const val = customPathInput.value.trim().toLowerCase();
        if (customPathInput.value !== customPathInput.value.toLowerCase()) {
            customPathInput.value = customPathInput.value.toLowerCase();
        }
        updateDomainPreview(val);
        clearTimeout(pathCheckTimer);
        if (!val) { setPathStatus(''); return; }
        setPathStatus('checking');
        pathCheckTimer = setTimeout(() => checkPathAvailability(val), 500);
    });

    customPathInput.addEventListener('blur', () => {
        clearTimeout(pathCheckTimer);
        checkPathAvailability(customPathInput.value.trim());
    });

    // ---- Tab Switching ----
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            if (window.innerWidth > 768) {
                tabIndicator.style.transform = `translateX(${index * 100}%)`;
                tabIndicator.style.top = '4px';
            } else {
                tabIndicator.style.transform = `translateY(${index * 100}%)`;
                tabIndicator.style.left = '4px';
            }
            
            const target = tab.getAttribute('data-target');
            tabPanes.forEach(pane => pane.classList.remove('active'));
            const targetPane = document.getElementById(target);
            if (targetPane) targetPane.classList.add('active');
            
            currentUploadMode = target.replace('tab-', '');
            resetFileSelection();
        });
    });

    window.addEventListener('resize', () => {
        const activeIndex = Array.from(tabs).findIndex(t => t.classList.contains('active'));
        if (window.innerWidth > 768) {
            tabIndicator.style.transform = `translateX(${activeIndex * 100}%)`;
            tabIndicator.style.top = '4px';
        } else {
            tabIndicator.style.transform = `translateY(${activeIndex * 100}%)`;
            tabIndicator.style.left = '4px';
        }
    });

    // ---- File Upload Handling ----
    function handleFileDrop(e, type) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        
        const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
        if (!file) return;
        
        if (type === 'html' && !file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
            showToast('请上传 HTML 文件', 'error');
            return;
        }
        if (type === 'zip' && !file.name.endsWith('.zip')) {
            showToast('请上传 ZIP 压缩包', 'error');
            return;
        }
        
        if (file.size > MAX_FILE_SIZE) {
            showToast(`文件大小不能超过 20MB (当前: ${formatFileSize(file.size)})`, 'error');
            return;
        }
        
        selectedFile = file;
        
        const infoEl = type === 'html' ? htmlFileInfo : zipFileInfo;
        infoEl.querySelector('.file-name').textContent = file.name;
        infoEl.querySelector('.file-size').textContent = formatFileSize(file.size);
        infoEl.classList.remove('hidden');
        showToast('文件选择成功', 'success');
    }

    [htmlDropZone, zipDropZone].forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });
    });

    htmlDropZone.addEventListener('drop', (e) => handleFileDrop(e, 'html'));
    zipDropZone.addEventListener('drop', (e) => handleFileDrop(e, 'zip'));
    
    htmlDropZone.addEventListener('click', () => htmlFileInput.click());
    zipDropZone.addEventListener('click', () => zipFileInput.click());
    
    htmlFileInput.addEventListener('change', (e) => handleFileDrop(e, 'html'));
    zipFileInput.addEventListener('change', (e) => handleFileDrop(e, 'zip'));

    // ---- Code Editor ----
    function updateCharCount() {
        const count = codeTextarea.value.length;
        charCount.textContent = `${count} 字符`;
    }
    codeTextarea.addEventListener('input', updateCharCount);

    // ---- Deployment Flow (Real API) ----
    deployBtn.addEventListener('click', async () => {
        // 0. Enforce Login (No Guest Mode)
        if (!clerkInstance || !clerkInstance.isSignedIn) {
            showToast('请先注册或登录账号后再生成链接', 'error');
            if (clerkInstance && clerkInstance.openSignIn) {
                clerkInstance.openSignIn();
            } else if (headerSignInBtn) {
                headerSignInBtn.click();
            }
            return;
        }

        const cdkey = cdkeyInput.value.trim();
        if (!cdkey) {
            showToast('请输入卡密', 'error');
            cdkeyInput.focus();
            return;
        }
        
        const formData = new FormData();
        formData.append('cdkey', cdkey);

        // Append custom path if provided
        const customPath = customPathInput.value.trim().toLowerCase();
        if (customPath) {
            if (!SUBDOMAIN_REGEX.test(customPath) || customPath.length < 3 || customPath.length > 30) {
                showToast('自定义域名格式不正确，请检查后重试', 'error');
                customPathInput.focus();
                return;
            }
            formData.append('customPath', customPath);
        }
        
        if (currentUploadMode === 'html') {
            if (!selectedFile) return showToast('请先选择 HTML 文件', 'error');
            formData.append('type', 'html');
            formData.append('file', selectedFile);
        } else if (currentUploadMode === 'zip') {
            if (!selectedFile) return showToast('请先选择 ZIP 文件', 'error');
            formData.append('type', 'zip');
            formData.append('file', selectedFile);
        } else {
            const code = codeTextarea.value.trim();
            if (!code) return showToast('请先粘贴 HTML 代码', 'error');
            if (!code.includes('<html') && !code.includes('<body') && !code.includes('<div') && !code.includes('<!DOCTYPE') && !code.includes('<!doctype')) {
                return showToast('代码格式似乎不正确，请检查是否包含有效的 HTML 标签', 'error');
            }
            formData.append('type', 'code');
            formData.append('htmlCode', code);
        }
        
        deployBtn.disabled = true;
        deployBtn.querySelector('.btn-text').classList.add('hidden');
        deployBtn.querySelector('.btn-loader').classList.remove('hidden');
        
        try {
            let headers = {};
            if (clerkInstance && clerkInstance.session) {
                try {
                    const token = await clerkInstance.session.getToken();
                    if (token) headers['Authorization'] = `Bearer ${token}`;
                } catch (tokErr) {}
            }

            const { resp: response, data } = await safeFetchJson('/api/deploy', {
                method: 'POST',
                headers,
                body: formData
            });

            if (response.status === 401) {
                showToast(data.message || '请先注册或登录账号后再生成链接', 'error');
                if (clerkInstance && clerkInstance.openSignIn) {
                    clerkInstance.openSignIn();
                }
                return;
            }

            if (!response.ok || !data.success) {
                throw new Error(data.message || '部署失败，请稍后重试');
            }
            
            let displayUrl = data.data.url;
            if (displayUrl.startsWith('/')) {
                displayUrl = window.location.origin + displayUrl;
            }
            
            showSuccessResult(displayUrl, data.data);

            // Reload user sites if logged in
            if (clerkInstance && clerkInstance.isSignedIn) {
                loadUserSites(false);
            }
            
        } catch (error) {
            showToast(error.message || '网络错误，请稍后重试', 'error');
        } finally {
            deployBtn.disabled = false;
            deployBtn.querySelector('.btn-text').classList.remove('hidden');
            deployBtn.querySelector('.btn-loader').classList.add('hidden');
        }
    });
    
    function showSuccessResult(url, deployData) {
        deploySection.classList.add('hidden');
        resultSection.classList.remove('hidden');
        
        resultLink.value = url;
        previewExternalLink.href = url;
        
        qrcodeContainer.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrcodeContainer, {
                text: url,
                width: 150,
                height: 150,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }
        
        const fileInfo = deployData && deployData.fileCount ? `（共 ${deployData.fileCount} 个文件）` : '';
        showToast(`网页部署成功！${fileInfo}`, 'success');
        
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ---- Site Renewal Modal (Inside My Sites) ----
    const siteRenewModal = document.getElementById('siteRenewModal');
    const closeRenewModalBtn = document.getElementById('closeRenewModalBtn');
    const modalRenewSubdomainInput = document.getElementById('modalRenewSubdomainInput');
    const modalRenewExpiresAt = document.getElementById('modalRenewExpiresAt');
    const modalRenewCdkeyInput = document.getElementById('modalRenewCdkeyInput');
    const modalSubmitRenewBtn = document.getElementById('modalSubmitRenewBtn');

    function openRenewModal(subdomain, expiresAt) {
        if (!siteRenewModal) return;
        modalRenewSubdomainInput.value = subdomain;
        modalRenewCdkeyInput.value = '';
        if (!expiresAt) {
            modalRenewExpiresAt.textContent = '永久有效';
        } else {
            const expDate = new Date(expiresAt);
            const isExp = expDate.getTime() < Date.now();
            modalRenewExpiresAt.innerHTML = `${expDate.toLocaleString('zh-CN')} ${isExp ? '<span style="color:var(--accent-error); font-size:11px; margin-left:4px;">(已到期)</span>' : ''}`;
        }
        siteRenewModal.classList.remove('hidden');
        setTimeout(() => modalRenewCdkeyInput.focus(), 100);
    }

    if (closeRenewModalBtn && siteRenewModal) {
        closeRenewModalBtn.addEventListener('click', () => {
            siteRenewModal.classList.add('hidden');
        });
        siteRenewModal.addEventListener('click', (e) => {
            if (e.target === siteRenewModal) siteRenewModal.classList.add('hidden');
        });
    }

    if (modalSubmitRenewBtn) {
        modalSubmitRenewBtn.addEventListener('click', async () => {
            const subdomain = modalRenewSubdomainInput.value.trim().toLowerCase();
            const cdkey = modalRenewCdkeyInput.value.trim();

            if (!subdomain) return showToast('站点名称不能为空', 'error');
            if (!cdkey) {
                showToast('请输入续期卡密 (CDKEY)', 'error');
                modalRenewCdkeyInput.focus();
                return;
            }

            const btnText = modalSubmitRenewBtn.querySelector('.btn-text');
            const btnLoader = modalSubmitRenewBtn.querySelector('.btn-loader');

            modalSubmitRenewBtn.disabled = true;
            btnText.classList.add('hidden');
            btnLoader.classList.remove('hidden');

            try {
                let headers = { 'Content-Type': 'application/json' };
                if (clerkInstance && clerkInstance.session) {
                    try {
                        const token = await clerkInstance.session.getToken();
                        if (token) headers['Authorization'] = `Bearer ${token}`;
                    } catch (tErr) {}
                }

                const { resp: response, data } = await safeFetchJson('/api/renew', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ subdomain, cdkey })
                });

                if (!response.ok || !data.success) {
                    throw new Error(data.message || '续期失败');
                }

                const expText = data.data.expiresAt 
                    ? `最新到期时间为: ${new Date(data.data.expiresAt).toLocaleDateString('zh-CN')}`
                    : '已升级为永久有效';

                showToast(`网页「${data.data.subdomain}」续期成功！${expText}`, 'success');
                siteRenewModal.classList.add('hidden');
                
                // Refresh user sites list
                loadUserSites(false);

            } catch (error) {
                showToast(error.message || '续期失败，请检查卡密是否有效', 'error');
            } finally {
                modalSubmitRenewBtn.disabled = false;
                btnText.classList.remove('hidden');
                btnLoader.classList.add('hidden');
            }
        });
    }

    // ---- Result Actions ----
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(resultLink.value);
            showToast('链接已复制到剪贴板', 'success');
        } catch {
            resultLink.select();
            document.execCommand('copy');
            showToast('链接已复制到剪贴板', 'success');
        }
    });
    
    previewBtn.addEventListener('click', () => {
        previewIframe.src = resultLink.value;
        previewModal.classList.remove('hidden');
    });
    
    newDeployBtn.addEventListener('click', () => {
        resultSection.classList.add('hidden');
        deploySection.classList.remove('hidden');
        resetFileSelection();
        cdkeyInput.value = '';
        customPathInput.value = '';
        setPathStatus('');
    });

    // ---- FAQ Accordion (Multi-Expand Supported) ----
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            item.classList.toggle('active');
        });
    });

    // ---- Preview Modal ----
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) previewModal.classList.add('hidden');
    });
    
    closePreviewBtn.addEventListener('click', () => {
        previewModal.classList.add('hidden');
        previewIframe.src = '';
    });

    // ---- Scroll Reveal Animations ----
    const revealSections = document.querySelectorAll('.reveal-section');
    const featureCards = document.querySelectorAll('.feature-card');
    const stepItems = document.querySelectorAll('.step-item');
    const faqItemsReveal = document.querySelectorAll('.faq-item');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    // Observe feature cards with stagger
    featureCards.forEach((card, index) => {
        card.style.transitionDelay = `${index * 80}ms`;
        card.classList.add('reveal-item');
        revealObserver.observe(card);
    });

    // Observe step items with stagger
    stepItems.forEach((item, index) => {
        item.style.transitionDelay = `${index * 120}ms`;
        item.classList.add('reveal-item');
        revealObserver.observe(item);
    });

    // Observe FAQ items with stagger
    faqItemsReveal.forEach((item, index) => {
        item.style.transitionDelay = `${index * 100}ms`;
        item.classList.add('reveal-item');
        revealObserver.observe(item);
    });

    // Observe section titles
    document.querySelectorAll('.section-title').forEach(title => {
        title.classList.add('reveal-item');
        revealObserver.observe(title);
    });

    // ---- Button Ripple Effect ----
    document.querySelectorAll('.btn-primary, .btn-glow').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.className = 'btn-ripple';
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
            ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });

    // ---- Enhanced Drop Zone Interaction ----
    [htmlDropZone, zipDropZone].forEach(zone => {
        zone.addEventListener('dragenter', () => {
            zone.classList.add('drag-active');
        });
        zone.addEventListener('dragleave', (e) => {
            if (!zone.contains(e.relatedTarget)) {
                zone.classList.remove('drag-active');
            }
        });
        zone.addEventListener('drop', () => {
            zone.classList.remove('drag-active');
        });
    });

    // ---- Smooth Tab Content Transitions ----
    const tabContentContainer = document.querySelector('.tab-content-container');
    if (tabContentContainer) {
        const observer = new MutationObserver(() => {
            const activePane = tabContentContainer.querySelector('.tab-pane.active');
            if (activePane) {
                activePane.style.animation = 'none';
                activePane.offsetHeight; // trigger reflow
                activePane.style.animation = 'fadeInTab 0.35s var(--ease-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards';
            }
        });
        observer.observe(tabContentContainer, { childList: false, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    // ---- Prefers Reduced Motion ----
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (prefersReducedMotion.matches) {
        document.documentElement.style.setProperty('--transition', 'none');
        document.documentElement.style.setProperty('--transition-fast', 'none');
        document.querySelectorAll('.reveal-item').forEach(item => {
            item.classList.add('revealed');
        });
    }

    // ==================== Clerk Auth & User Center ====================
    let clerkInitError = null;
    let isClerkInitializing = false;

    async function initClerk(publishableKey) {
        if (!publishableKey || !publishableKey.startsWith('pk_')) {
            return;
        }

        isClerkInitializing = true;
        clerkInitError = null;

        try {
            // Load Script & Localization concurrently in parallel
            const scriptPromise = new Promise((resolve, reject) => {
                if (window.Clerk && (typeof window.Clerk === 'object' || typeof window.Clerk === 'function')) {
                    return resolve();
                }
                const script = document.createElement('script');
                script.setAttribute('data-clerk-publishable-key', publishableKey);
                script.async = true;
                script.crossOrigin = 'anonymous';
                script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
                script.onload = resolve;
                script.onerror = () => {
                    // Fallback to clerk frontend domain if CDN fails
                    let clerkDomain = '';
                    try {
                        const parts = publishableKey.split('_');
                        if (parts.length >= 3) clerkDomain = atob(parts[2]).slice(0, -1);
                    } catch (e) {}
                    if (clerkDomain) {
                        const fb = document.createElement('script');
                        fb.setAttribute('data-clerk-publishable-key', publishableKey);
                        fb.async = true;
                        fb.crossOrigin = 'anonymous';
                        fb.src = `https://${clerkDomain}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
                        fb.onload = resolve;
                        fb.onerror = () => reject(new Error('无法加载 Clerk 认证组件'));
                        document.head.appendChild(fb);
                    } else {
                        reject(new Error('无法加载 Clerk 认证组件'));
                    }
                };
                document.head.appendChild(script);
            });

            const locPromise = safeFetchJson('/api/auth/localization').catch(() => ({ data: null }));

            const [_, locResult] = await Promise.all([scriptPromise, locPromise]);

            if (!window.Clerk) {
                throw new Error('Clerk 脚本加载未完成');
            }

            let clerk = window.Clerk;
            if (typeof clerk === 'function') {
                clerk = new window.Clerk(publishableKey);
            }

            let localizationData = locResult?.data?.data?.localization || null;

            if (clerk.load) {
                await clerk.load({
                    localization: localizationData || undefined
                });
            }
            clerkInstance = clerk;
            isClerkInitializing = false;

            // Update Auth State
            handleClerkAuthState(clerkInstance);

            // Listen for user login / logout / switch events
            if (clerkInstance.addListener) {
                clerkInstance.addListener(() => {
                    handleClerkAuthState(clerkInstance);
                });
            }

        } catch (err) {
            isClerkInitializing = false;
            clerkInitError = err.message || '初始化失败';
            console.error('Clerk initialization error:', err);
        }
    }

    let isUserButtonMounted = false;

    function handleClerkAuthState(clerk) {
        if (!clerk) return;

        if (clerk.isSignedIn && clerk.user) {
            if (headerSignInBtn) headerSignInBtn.classList.add('hidden');
            if (headerSignUpBtn) headerSignUpBtn.classList.add('hidden');
            
            if (clerkUserButtonSlot) {
                clerkUserButtonSlot.classList.remove('hidden');
                // Guard: Only mount if not already mounted and active in DOM
                if (!isUserButtonMounted || !clerkUserButtonSlot.children.length) {
                    try {
                        clerkUserButtonSlot.innerHTML = '';
                        clerk.mountUserButton(clerkUserButtonSlot, {
                            afterSignOutUrl: window.location.href,
                            userProfileMode: 'modal'
                        });
                        isUserButtonMounted = true;
                    } catch (e) {
                        console.warn('mountUserButton error:', e);
                    }
                }
            }

            if (mySitesBtn) {
                mySitesBtn.classList.remove('hidden');
            }
            if (currentUserSites && currentUserSites.length > 0 && mySitesBadge) {
                mySitesBadge.textContent = currentUserSites.length;
            }
            loadUserSites(false);
        } else {
            isUserButtonMounted = false;
            if (headerSignInBtn) headerSignInBtn.classList.remove('hidden');
            if (headerSignUpBtn) headerSignUpBtn.classList.remove('hidden');
            if (clerkUserButtonSlot) {
                clerkUserButtonSlot.classList.add('hidden');
                if (clerk && clerk.unmountUserButton) {
                    try { clerk.unmountUserButton(clerkUserButtonSlot); } catch (e) {}
                }
                clerkUserButtonSlot.innerHTML = '';
            }
            if (mySitesBtn) {
                mySitesBtn.classList.add('hidden');
            }
            currentUserSites = [];
            if (mySitesBadge) mySitesBadge.textContent = '0';
        }
    }

    if (headerSignInBtn) {
        headerSignInBtn.addEventListener('click', async () => {
            if (isClerkInitializing) {
                showToast('Clerk 认证正在初始化中，请稍候 1-2 秒后再试...', 'info');
                return;
            }
            if (!clerkInstance) {
                if (clerkInitError) {
                    showToast(`Clerk 认证加载异常: ${clerkInitError}（若使用生产密钥 pk_live，需在 Clerk 控制台添加生产域名并完成验证）`, 'error');
                } else if (publicDomainConfig.clerkPublishableKey) {
                    showToast('Clerk 组件正在重新连接中，请稍后刷新重试...', 'info');
                    initClerk(publicDomainConfig.clerkPublishableKey);
                } else {
                    showToast('请先在管理后台 (admin.html) 中配置有效的 Clerk API 密钥', 'error');
                }
                return;
            }
            try {
                clerkInstance.openSignIn();
            } catch (err) {
                console.error('openSignIn error:', err);
                showToast('打开登录窗口失败: ' + err.message, 'error');
            }
        });
    }

    if (headerSignUpBtn) {
        headerSignUpBtn.addEventListener('click', async () => {
            if (isClerkInitializing) {
                showToast('Clerk 认证正在初始化中，请稍候 1-2 秒后再试...', 'info');
                return;
            }
            if (!clerkInstance) {
                if (clerkInitError) {
                    showToast(`Clerk 认证加载异常: ${clerkInitError}（若使用生产密钥 pk_live，需在 Clerk 控制台添加生产域名并完成验证）`, 'error');
                } else if (publicDomainConfig.clerkPublishableKey) {
                    showToast('Clerk 组件正在重新连接中，请稍后刷新重试...', 'info');
                    initClerk(publicDomainConfig.clerkPublishableKey);
                } else {
                    showToast('请先在管理后台 (admin.html) 中配置有效的 Clerk API 密钥', 'error');
                }
                return;
            }
            try {
                clerkInstance.openSignUp();
            } catch (err) {
                console.error('openSignUp error:', err);
                showToast('打开注册窗口失败: ' + err.message, 'error');
            }
        });
    }

    // Prevent closing Clerk modal when clicking outside on backdrop
    ['click', 'mousedown', 'pointerdown', 'touchstart'].forEach(evtType => {
        document.addEventListener(evtType, (e) => {
            const target = e.target;
            if (!target) return;
            const isBackdrop = target.classList?.contains('cl-modalBackdrop') ||
                (typeof target.className === 'string' && target.className.includes('modalBackdrop'));
            if (isBackdrop) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
    });

    if (tabBtnSites && tabBtnKeys) {
        tabBtnSites.addEventListener('click', () => {
            tabBtnSites.classList.add('active');
            tabBtnKeys.classList.remove('active');
            userSitesTabPane?.classList.remove('hidden');
            userKeysTabPane?.classList.add('hidden');
        });
        tabBtnKeys.addEventListener('click', () => {
            tabBtnKeys.classList.add('active');
            tabBtnSites.classList.remove('active');
            userKeysTabPane?.classList.remove('hidden');
            userSitesTabPane?.classList.add('hidden');
        });
    }

    if (mySitesBtn) {
        mySitesBtn.addEventListener('click', () => {
            if (mySitesModal) {
                mySitesModal.classList.remove('hidden');
                if (currentUserSites && currentUserSites.length > 0) {
                    renderUserSites(currentUserSites);
                }
                if (currentUserKeys && currentUserKeys.length > 0) {
                    renderUserKeys(currentUserKeys);
                }
                if ((currentUserSites && currentUserSites.length > 0) || (currentUserKeys && currentUserKeys.length > 0)) {
                    loadUserSites(false);
                } else {
                    loadUserSites(true);
                }
            }
        });
    }

    if (closeMySitesBtn && mySitesModal) {
        closeMySitesBtn.addEventListener('click', () => {
            mySitesModal.classList.add('hidden');
        });
        mySitesModal.addEventListener('click', (e) => {
            if (e.target === mySitesModal) {
                mySitesModal.classList.add('hidden');
            }
        });
    }

    const closeQrcodeModalBtn = document.getElementById('closeQrcodeModalBtn');
    const siteQrcodeModal = document.getElementById('siteQrcodeModal');
    if (closeQrcodeModalBtn && siteQrcodeModal) {
        closeQrcodeModalBtn.addEventListener('click', () => {
            siteQrcodeModal.classList.add('hidden');
        });
        siteQrcodeModal.addEventListener('click', (e) => {
            if (e.target === siteQrcodeModal) {
                siteQrcodeModal.classList.add('hidden');
            }
        });
    }

    function openQrcodeModal(url, siteName) {
        const modal = document.getElementById('siteQrcodeModal');
        const container = document.getElementById('modalQrcodeContainer');
        const titleEl = document.getElementById('modalQrcodeTitle');
        const subEl = document.getElementById('modalQrcodeSubdomain');
        const copyBtn = document.getElementById('modalQrcodeCopyBtn');
        const openBtn = document.getElementById('modalQrcodeOpenBtn');

        if (!modal || !container) return;

        if (titleEl) titleEl.textContent = siteName ? `站点二维码 - ${siteName}` : '网页访问二维码';
        if (subEl) subEl.textContent = url;
        if (openBtn) openBtn.href = url;

        container.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            new QRCode(container, {
                text: url,
                width: 200,
                height: 200,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        }

        if (copyBtn) {
            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(url);
                    showToast('链接已复制到剪贴板', 'success');
                } catch {
                    showToast('复制失败，请手动复制', 'error');
                }
            };
        }

        modal.classList.remove('hidden');
    }

    async function loadUserSites(showLoading = true) {
        if (!clerkInstance || !clerkInstance.isSignedIn) return;

        // If we already have sites cached in memory, render immediately with 0 delay
        if (currentUserSites && currentUserSites.length > 0) {
            renderUserSites(currentUserSites);
            showLoading = false;
        }
        if (currentUserKeys && currentUserKeys.length > 0) {
            renderUserKeys(currentUserKeys);
        }

        if (showLoading && userSitesLoading) {
            userSitesLoading.classList.remove('hidden');
            userSitesEmpty?.classList.add('hidden');
            userSitesList?.classList.add('hidden');
        }

        try {
            let headers = {};

            // Get token with 2s timeout so slow Clerk API won't block the whole modal
            if (clerkInstance.session) {
                try {
                    const tokenPromise = clerkInstance.session.getToken();
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('token_timeout')), 2000));
                    const token = await Promise.race([tokenPromise, timeoutPromise]);
                    if (token) headers['Authorization'] = `Bearer ${token}`;
                } catch (tErr) {
                    // Token timed out — still proceed, server can try JWT decode
                }
            }
            if (clerkInstance.user) {
                const email = clerkInstance.user.primaryEmailAddress?.emailAddress || 
                              clerkInstance.user.emailAddresses?.[0]?.emailAddress || '';
                if (email) headers['X-User-Email'] = email;
            }

            // Fetch with 5s total timeout
            const controller = new AbortController();
            const fetchTimeout = setTimeout(() => controller.abort(), 5000);

            const { data } = await safeFetchJson('/api/user/me', { headers, signal: controller.signal });
            clearTimeout(fetchTimeout);

            if (data && data.success) {
                currentUserSites = data.data.sites || [];
                currentUserKeys = data.data.keys || [];
                try {
                    localStorage.setItem('cached_user_sites', JSON.stringify(currentUserSites));
                    localStorage.setItem('cached_user_keys', JSON.stringify(currentUserKeys));
                } catch (e) {}
                if (mySitesBadge) {
                    mySitesBadge.textContent = currentUserSites.length;
                }
                if (userSitesCount) {
                    userSitesCount.textContent = currentUserSites.length;
                }
                if (userKeysCount) {
                    userKeysCount.textContent = currentUserKeys.length;
                }
                renderUserSites(currentUserSites);
                renderUserKeys(currentUserKeys);
            }
        } catch (e) {
            // On timeout/abort: if we have cached data, it's already rendered; otherwise show empty
            if (e.name === 'AbortError') {
                console.warn('loadUserSites: fetch timed out');
                if (!currentUserSites || currentUserSites.length === 0) {
                    renderUserSites([]);
                }
                if (!currentUserKeys || currentUserKeys.length === 0) {
                    renderUserKeys([]);
                }
            } else {
                console.error('Failed to load user sites:', e);
            }
        } finally {
            if (userSitesLoading) userSitesLoading.classList.add('hidden');
        }
    }

    function renderUserSites(sites) {
        if (!userSitesList || !userSitesEmpty) return;

        if (userSitesCount) userSitesCount.textContent = (sites && sites.length) || 0;

        if (!sites || sites.length === 0) {
            userSitesEmpty.classList.remove('hidden');
            userSitesList.classList.add('hidden');
            return;
        }

        userSitesEmpty.classList.add('hidden');
        userSitesList.classList.remove('hidden');
        userSitesList.innerHTML = '';

        sites.forEach(site => {
            const card = document.createElement('div');
            card.className = 'user-site-card';

            const isExp = site.isExpired;
            const expDateStr = site.expiresAt ? new Date(site.expiresAt).toLocaleDateString('zh-CN') : '永久有效';
            const createDateStr = site.createdAt ? new Date(site.createdAt).toLocaleDateString('zh-CN') : '近期';

            card.innerHTML = `
                <div class="user-site-top">
                    <div class="user-site-info">
                        <h4>
                            <span>${escapeHtml(site.subdomain || site.siteId)}</span>
                            <span class="user-site-badge ${isExp ? 'expired' : 'active'}">${isExp ? '已到期' : '运行中'}</span>
                        </h4>
                        <a href="${site.url}" target="_blank" rel="noopener">${site.url}</a>
                    </div>
                </div>
                <div class="user-site-meta">
                    <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 3px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>部署于: ${createDateStr}</span>
                    <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>有效期至: ${expDateStr}</span>
                    <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 3px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>存储: ${site.storage === 'r2' ? '云端 CDN' : '标准存储'}</span>
                </div>
                <div class="user-site-actions">
                    <button class="btn-icon-text copy-site-link" data-url="${site.url}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        <span>复制链接</span>
                    </button>
                    <button class="btn-icon-text qrcode-site-btn" data-url="${site.url}" data-name="${escapeHtml(site.subdomain || site.siteId)}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        <span>二维码</span>
                    </button>
                    <button class="btn-icon-text renew-site-btn" data-subdomain="${escapeHtml(site.subdomain || site.siteId)}" data-expires="${escapeHtml(site.expiresAt || '')}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        <span>续期</span>
                    </button>
                    <button class="btn-icon-text preview-site-link" data-url="${site.url}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>预览</span>
                    </button>
                    <button class="btn-icon-text danger delete-site-btn" data-id="${site.siteId}" data-name="${site.subdomain || site.siteId}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        <span>删除</span>
                    </button>
                </div>
            `;

            card.querySelector('.copy-site-link').addEventListener('click', async (e) => {
                const url = e.currentTarget.getAttribute('data-url');
                try {
                    await navigator.clipboard.writeText(url);
                    showToast('链接已复制到剪贴板', 'success');
                } catch {
                    showToast('复制失败，请手动复制', 'error');
                }
            });

            card.querySelector('.qrcode-site-btn').addEventListener('click', (e) => {
                const url = e.currentTarget.getAttribute('data-url');
                const name = e.currentTarget.getAttribute('data-name');
                openQrcodeModal(url, name);
            });

            card.querySelector('.renew-site-btn').addEventListener('click', (e) => {
                const sub = e.currentTarget.getAttribute('data-subdomain');
                const exp = e.currentTarget.getAttribute('data-expires');
                openRenewModal(sub, exp);
            });

            card.querySelector('.preview-site-link').addEventListener('click', (e) => {
                const url = e.currentTarget.getAttribute('data-url');
                if (previewIframe && previewModal) {
                    previewIframe.src = url;
                    if (previewExternalLink) previewExternalLink.href = url;
                    previewModal.classList.remove('hidden');
                }
            });

            card.querySelector('.delete-site-btn').addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const name = e.currentTarget.getAttribute('data-name');
                if (!confirm(`确定要删除站点「${name}」吗？删除后不可恢复。`)) return;

                try {
                    let headers = { 'Content-Type': 'application/json' };
                    if (clerkInstance && clerkInstance.session) {
                        try {
                            const token = await clerkInstance.session.getToken();
                            if (token) headers['Authorization'] = `Bearer ${token}`;
                        } catch (tErr) {}
                    }

                    const { data } = await safeFetchJson('/api/user/sites', {
                        method: 'DELETE',
                        headers,
                        body: JSON.stringify({ siteId: id })
                    });

                    if (data && data.success) {
                        showToast(`已删除站点「${name}」`, 'success');
                        loadUserSites(false);
                    } else {
                        throw new Error(data.message || '删除失败');
                    }
                } catch (err) {
                    showToast(err.message || '删除失败', 'error');
                }
            });

            userSitesList.appendChild(card);
        });
    }

    function renderUserKeys(keys) {
        if (!userKeysList || !userKeysEmpty) return;

        if (userKeysCount) userKeysCount.textContent = (keys && keys.length) || 0;

        if (!keys || keys.length === 0) {
            userKeysEmpty.classList.remove('hidden');
            userKeysList.classList.add('hidden');
            return;
        }

        userKeysEmpty.classList.add('hidden');
        userKeysList.classList.remove('hidden');
        userKeysList.innerHTML = '';

        const durNames = {
            '3d': '3天体验卡',
            '7d': '7天周卡',
            '1m': '1个月月卡',
            '3m': '3个月季卡',
            '6m': '半年卡(6个月)',
            '1y': '1年年卡',
            'forever': '永久有效卡',
            'unlimited': '永久有效卡'
        };

        keys.forEach(k => {
            const card = document.createElement('div');
            card.className = 'user-site-card';

            const isExp = k.isExpired;
            const maxUses = Number(k.maxUses) || 0;
            const usedCount = Number(k.usedCount) || 0;
            const isExhausted = maxUses > 0 && usedCount >= maxUses;

            let statusBadge = '<span class="user-site-badge active">正常有效</span>';
            if (isExp) {
                statusBadge = '<span class="user-site-badge expired">已到期</span>';
            } else if (isExhausted) {
                statusBadge = '<span class="user-site-badge" style="background: rgba(239, 68, 68, 0.15); color: var(--accent-error); border: 1px solid rgba(239, 68, 68, 0.3);">已达次数上限</span>';
            } else if (!k.activatedAt) {
                statusBadge = '<span class="user-site-badge" style="background: rgba(59, 130, 246, 0.15); color: var(--mac-blue); border: 1px solid rgba(59, 130, 246, 0.3);">未激活</span>';
            }

            const expDateStr = k.expiresAt 
                ? new Date(k.expiresAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) 
                : (k.activatedAt ? '长期有效' : '未激活');

            const activatedDateStr = k.activatedAt 
                ? new Date(k.activatedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) 
                : '尚未激活';

            const durationText = durNames[k.duration] || k.duration;
            const quotaDisplay = maxUses > 0 ? `${maxUses} 次` : '不限次数';
            const remainingDisplay = maxUses > 0 ? `${Math.max(0, maxUses - usedCount)} 次` : '无限制';

            card.innerHTML = `
                <div class="user-site-top">
                    <div class="key-header-left">
                        <div class="key-title-row">
                            <span class="key-code-tag">${escapeHtml(k.key)}</span>
                            ${statusBadge}
                        </div>
                        <div class="key-sub-row">
                            <span class="badge badge-duration" style="font-size: 11px; padding: 2px 8px; border-radius: 6px; background: rgba(59, 130, 246, 0.12); color: var(--mac-blue); font-weight: 600;">${durationText}</span>
                            <span>• 首次激活: ${activatedDateStr}</span>
                        </div>
                    </div>
                    <div class="user-site-actions">
                        <button class="btn-icon-text copy-cdkey-btn" data-key="${escapeHtml(k.key)}" title="点击复制完整卡密">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <span>复制卡密</span>
                        </button>
                    </div>
                </div>
                <div class="key-stats-grid">
                    <div class="key-stat-box">
                        <span class="key-stat-label">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            到期时间
                        </span>
                        <span class="key-stat-value" title="${expDateStr}">${expDateStr}</span>
                    </div>
                    <div class="key-stat-box">
                        <span class="key-stat-label">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            剩余可用
                        </span>
                        <span class="key-stat-value" style="color: ${isExhausted ? 'var(--accent-error)' : 'var(--accent-success, #10b981)'}; font-weight: 700;">${remainingDisplay}</span>
                    </div>
                    <div class="key-stat-box">
                        <span class="key-stat-label">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                            已使用
                        </span>
                        <span class="key-stat-value">${usedCount} 次</span>
                    </div>
                    <div class="key-stat-box">
                        <span class="key-stat-label">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                            总可用额度
                        </span>
                        <span class="key-stat-value" style="color: var(--mac-blue);">${quotaDisplay}</span>
                    </div>
                </div>
            `;

            card.querySelector('.copy-cdkey-btn').addEventListener('click', async (e) => {
                const keyText = e.currentTarget.getAttribute('data-key');
                try {
                    await navigator.clipboard.writeText(keyText);
                    showToast('卡密已复制到剪贴板', 'success');
                } catch {
                    showToast('复制失败，请手动复制', 'error');
                }
            });

            userKeysList.appendChild(card);
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

        // Mouse & Spotlight state
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

        // Vibrant Google Antigravity color palettes
        const darkPalette = [
            '#3B82F6', // Electric Blue
            '#60A5FA', // Sky Blue
            '#8B5CF6', // Purple
            '#A78BFA', // Light Violet
            '#06B6D4', // Cyan
            '#22D3EE', // Bright Cyan
            '#EC4899', // Pink
            '#F43F5E', // Rose
            '#10B981', // Emerald
            '#6366F1', // Indigo
            '#818CF8'  // Soft Indigo
        ];

        const lightPalette = [
            '#2563EB', // Royal Blue
            '#3B82F6', // Blue
            '#7C3AED', // Vivid Purple
            '#8B5CF6', // Violet
            '#0284C7', // Deep Cyan
            '#0D9488', // Teal
            '#E11D48', // Crimson Red
            '#4F46E5', // Indigo
            '#059669', // Emerald
            '#D97706'  // Amber
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
                
                // Form: ~75% mini-dashes, ~25% mini-dots (Antigravity geometry)
                this.isDash = Math.random() > 0.25;
                this.length = this.isDash ? (3.5 + Math.random() * 3.5) : (2.0 + Math.random() * 0.8);
                this.thickness = 2.0; // Increased to 2.0px
                
                // Rotation & Orientation
                this.angle = (Math.random() * Math.PI * 2);
                this.targetAngle = this.angle;
                this.baseAngle = (Math.random() - 0.5) * 0.8;
                
                // Ambient zero-gravity floating harmonic wave
                this.phase = Math.random() * Math.PI * 2;
                this.floatSpeed = 0.008 + Math.random() * 0.012;
                this.floatRadius = 2 + Math.random() * 3.5;
                
                this.color = color;
                this.baseAlpha = 0.55 + Math.random() * 0.45;
                this.currentAlpha = 0;
                this.scale = 0.95 + Math.random() * 0.2;
            }

            update(time, mouseState, spot) {
                // Harmonic ambient float
                this.phase += this.floatSpeed;
                const ambientX = Math.cos(this.phase) * this.floatRadius;
                const ambientY = Math.sin(this.phase * 1.3) * this.floatRadius;
                const targetX = this.ox + ambientX;
                const targetY = this.oy + ambientY;

                // Calculate distance from particle to the spotlight center
                const sdx = this.x - spot.x;
                const sdy = this.y - spot.y;
                const distToSpotlight = Math.hypot(sdx, sdy);

                // Compute spotlight visibility (radial falloff around cursor)
                if (spot.intensity > 0.005 && distToSpotlight < spot.radius) {
                    const normDist = distToSpotlight / spot.radius;
                    // Smooth cosine falloff curve
                    const falloff = Math.pow(1 - normDist, 1.5);
                    this.currentAlpha = this.baseAlpha * falloff * spot.intensity;
                } else {
                    this.currentAlpha = 0;
                }

                // If particle is visible and mouse is active within force field radius
                if (mouseState.active && distToSpotlight < spot.forceRadius && distToSpotlight > 0.1) {
                    const forceFactor = 1 - (distToSpotlight / spot.forceRadius);
                    const force = Math.pow(forceFactor, 1.8) * 7.0;
                    const nx = sdx / distToSpotlight;
                    const ny = sdy / distToSpotlight;

                    // Antigravity push
                    this.vx += nx * force;
                    this.vy += ny * force;

                    // Dynamic velocity swirl
                    const speed = Math.hypot(mouseState.vx, mouseState.vy);
                    if (speed > 0.5) {
                        const swirl = forceFactor * 0.22;
                        this.vx += -mouseState.vy * swirl;
                        this.vy += mouseState.vx * swirl;
                    }

                    // Align dash direction outwards
                    this.targetAngle = Math.atan2(sdy, sdx);
                } else {
                    this.targetAngle = this.baseAngle + Math.sin(this.phase) * 0.25;
                }

                // Spring physics back to anchor
                const springK = 0.055;
                const damping = 0.86;

                const ax = (targetX - this.x) * springK;
                const ay = (targetY - this.y) * springK;

                this.vx = (this.vx + ax) * damping;
                this.vy = (this.vy + ay) * damping;

                this.x += this.vx;
                this.y += this.vy;

                // Smooth rotation interpolation
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
            const spacing = isMobile ? 32 : 26; // denser grid so illuminated cloud looks rich
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

        // Pointer move handler
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

        // Click ripple wave
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

        // Theme switch listener
        const themeObserver = new MutationObserver(() => {
            const colors = getColors();
            particles.forEach((p, idx) => {
                p.color = colors[idx % colors.length];
            });
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        // Animation Loop
        function render() {
            if (document.hidden) {
                animationFrameId = requestAnimationFrame(render);
                return;
            }

            // Smooth spotlight movement & intensity transition
            if (mouse.active) {
                spotlight.x += (mouse.x - spotlight.x) * 0.16;
                spotlight.y += (mouse.y - spotlight.y) * 0.16;
            }
            spotlight.intensity += (spotlight.targetIntensity - spotlight.intensity) * 0.08;

            mouse.vx *= 0.85;
            mouse.vy *= 0.85;

            ctx.clearRect(0, 0, width, height);

            // Only update and draw when spotlight is active
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

    // ==========================================================================
    // ANNOUNCEMENT POPUP & CAROUSEL SYSTEM
    // ==========================================================================
    let currentAnnouncementConfig = null;
    let announcementCurrentSlide = 0;
    let announcementAutoPlayTimer = null;
    const ANNOUNCEMENT_STORAGE_KEY = 'html_link_announcement_last_read';

    const announcementModal = document.getElementById('announcementModal');
    const closeAnnouncementModalBtn = document.getElementById('closeAnnouncementModalBtn');
    const confirmAnnouncementBtn = document.getElementById('confirmAnnouncementBtn');
    const navAnnouncementBtn = document.getElementById('navAnnouncementBtn');
    const announcementUnreadDot = document.getElementById('announcementUnreadDot');
    const announcementViewport = document.getElementById('announcementViewport');
    const announcementTrack = document.getElementById('announcementTrack');
    const announcementDots = document.getElementById('announcementDots');
    const announcementPrevBtn = document.getElementById('announcementPrevBtn');
    const announcementNextBtn = document.getElementById('announcementNextBtn');
    const announcementControls = document.getElementById('announcementControls');
    const announcementCounterPill = document.getElementById('announcementCounterPill');

    function initAnnouncementSystem(announcementData) {
        if (!announcementData) return;
        currentAnnouncementConfig = announcementData;

        const enabled = Boolean(announcementData.enabled);
        const items = Array.isArray(announcementData.items) ? announcementData.items : [];

        if (!enabled || items.length === 0) {
            if (navAnnouncementBtn) navAnnouncementBtn.classList.add('hidden');
            return;
        }

        // Show header announcement button
        if (navAnnouncementBtn) navAnnouncementBtn.classList.remove('hidden');

        // Check if user has read the latest version
        const lastReadTime = localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY);
        const isNewAnnouncement = !lastReadTime || (announcementData.updatedAt && new Date(announcementData.updatedAt).getTime() > new Date(lastReadTime).getTime());

        if (isNewAnnouncement && announcementUnreadDot) {
            announcementUnreadDot.classList.remove('hidden');
        }

        // Auto-popup if it's new
        if (isNewAnnouncement) {
            setTimeout(() => {
                openAnnouncementModal();
            }, 600);
        }
    }

    function renderAnnouncementSlides(items) {
        if (!announcementTrack || !announcementDots) return;
        announcementTrack.innerHTML = '';
        announcementDots.innerHTML = '';

        items.forEach((item, index) => {
            const slide = document.createElement('div');
            slide.className = 'announcement-slide';

            const tagColor = ['blue', 'green', 'orange', 'purple', 'red'].includes(item.tagColor) ? item.tagColor : 'blue';
            const tagHtml = item.tag ? `<span class="announcement-tag tag-${escapeHtml(tagColor)}">${escapeHtml(item.tag)}</span>` : '';
            const titleHtml = item.title ? `<h3 class="announcement-title">${escapeHtml(item.title)}</h3>` : '';
            const contentHtml = item.content ? `<div class="announcement-content">${escapeHtml(item.content)}</div>` : '';
            
            let linkHtml = '';
            if (item.link && item.link.trim()) {
                const linkText = item.linkText ? escapeHtml(item.linkText.trim()) : '查看详情';
                const safeUrl = escapeHtml(normalizeBuyUrl(item.link));
                linkHtml = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="announcement-link-btn">
                    <span>${linkText}</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>`;
            }

            slide.innerHTML = `
                ${tagHtml}
                ${titleHtml}
                ${contentHtml}
                ${linkHtml}
            `;
            announcementTrack.appendChild(slide);

            const dot = document.createElement('div');
            dot.className = `announcement-dot ${index === 0 ? 'active' : ''}`;
            dot.addEventListener('click', () => {
                goToAnnouncementSlide(index);
                resetAnnouncementAutoPlay();
            });
            announcementDots.appendChild(dot);
        });

        if (items.length <= 1) {
            if (announcementControls) announcementControls.style.display = 'none';
            if (announcementCounterPill) announcementCounterPill.style.display = 'none';
        } else {
            if (announcementControls) announcementControls.style.display = 'flex';
            if (announcementCounterPill) announcementCounterPill.style.display = 'inline-block';
        }
    }

    function goToAnnouncementSlide(index) {
        if (!currentAnnouncementConfig || !currentAnnouncementConfig.items) return;
        const items = currentAnnouncementConfig.items;
        if (items.length === 0) return;

        if (index < 0) index = items.length - 1;
        if (index >= items.length) index = 0;

        announcementCurrentSlide = index;

        if (announcementTrack) {
            announcementTrack.style.transform = `translateX(-${index * 100}%)`;
        }

        if (announcementCounterPill) {
            announcementCounterPill.textContent = `${index + 1} / ${items.length}`;
        }

        if (announcementDots) {
            const dots = announcementDots.querySelectorAll('.announcement-dot');
            dots.forEach((d, idx) => {
                if (idx === index) d.classList.add('active');
                else d.classList.remove('active');
            });
        }
    }

    function startAnnouncementAutoPlay() {
        stopAnnouncementAutoPlay();
        if (!currentAnnouncementConfig || !currentAnnouncementConfig.autoPlay) return;
        const items = currentAnnouncementConfig.items || [];
        if (items.length <= 1) return;

        const interval = Math.max(parseInt(currentAnnouncementConfig.interval, 10) || 6000, 2000);
        announcementAutoPlayTimer = setInterval(() => {
            goToAnnouncementSlide(announcementCurrentSlide + 1);
        }, interval);
    }

    function stopAnnouncementAutoPlay() {
        if (announcementAutoPlayTimer) {
            clearInterval(announcementAutoPlayTimer);
            announcementAutoPlayTimer = null;
        }
    }

    function resetAnnouncementAutoPlay() {
        stopAnnouncementAutoPlay();
        startAnnouncementAutoPlay();
    }

    function openAnnouncementModal() {
        if (!currentAnnouncementConfig || !currentAnnouncementConfig.items || currentAnnouncementConfig.items.length === 0) return;
        renderAnnouncementSlides(currentAnnouncementConfig.items);
        goToAnnouncementSlide(0);
        announcementModal.classList.remove('hidden');
        startAnnouncementAutoPlay();

        // Mark unread dot hidden
        if (announcementUnreadDot) announcementUnreadDot.classList.add('hidden');
    }

    function closeAnnouncementModal(markAsRead = true) {
        if (!announcementModal) return;
        announcementModal.classList.add('hidden');
        stopAnnouncementAutoPlay();

        if (markAsRead && currentAnnouncementConfig && currentAnnouncementConfig.updatedAt) {
            localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, currentAnnouncementConfig.updatedAt);
        }
    }

    // Event Listeners for announcement modal
    if (closeAnnouncementModalBtn) {
        closeAnnouncementModalBtn.addEventListener('click', () => closeAnnouncementModal(true));
    }
    if (confirmAnnouncementBtn) {
        confirmAnnouncementBtn.addEventListener('click', () => closeAnnouncementModal(true));
    }
    if (announcementModal) {
        announcementModal.addEventListener('click', (e) => {
            if (e.target === announcementModal) closeAnnouncementModal(true);
        });
    }
    if (navAnnouncementBtn) {
        navAnnouncementBtn.addEventListener('click', () => openAnnouncementModal());
    }
    if (announcementPrevBtn) {
        announcementPrevBtn.addEventListener('click', () => {
            goToAnnouncementSlide(announcementCurrentSlide - 1);
            resetAnnouncementAutoPlay();
        });
    }
    if (announcementNextBtn) {
        announcementNextBtn.addEventListener('click', () => {
            goToAnnouncementSlide(announcementCurrentSlide + 1);
            resetAnnouncementAutoPlay();
        });
    }
    if (announcementViewport) {
        announcementViewport.addEventListener('mouseenter', stopAnnouncementAutoPlay);
        announcementViewport.addEventListener('mouseleave', startAnnouncementAutoPlay);
    }

    // Keyboard navigation for announcement modal
    document.addEventListener('keydown', (e) => {
        if (!announcementModal || announcementModal.classList.contains('hidden')) return;
        if (e.key === 'Escape') {
            closeAnnouncementModal(true);
        } else if (e.key === 'ArrowLeft') {
            goToAnnouncementSlide(announcementCurrentSlide - 1);
            resetAnnouncementAutoPlay();
        } else if (e.key === 'ArrowRight') {
            goToAnnouncementSlide(announcementCurrentSlide + 1);
            resetAnnouncementAutoPlay();
        }
    });

    initAntigravityBackground();
});

