document.addEventListener('DOMContentLoaded', () => {
    // State
    let fileTree = [];
    let allFiles = []; // Flattened list for search/sort
    let currentPath = ''; // Root
    let searchQuery = '';
    let sortMethodFiles = 'name_asc';
    let sortMethodFolders = 'name_asc';
    let currentEditFile = null;
    let modifiedTimestamps = {};

    // DOM Elements
    const folderTreeEl = document.getElementById('folderTree');
    const imageGridEl = document.getElementById('imageGrid');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const breadcrumbsEl = document.getElementById('breadcrumbs');
    const statusBarEl = document.getElementById('statusBar');
    const sortSelect = document.getElementById('sortSelect');
    const sortSelectSidebar = document.getElementById('sortSelectSidebar');
    const toastContainer = document.getElementById('toastContainer');

    // Modals
    const editModal = document.getElementById('editModal');
    const fullImageModal = document.getElementById('fullImageModal');
    const fullImage = document.getElementById('fullImage');
    const editFilenameInput = document.getElementById('editFilename');
    const editPromptInput = document.getElementById('editPrompt');
    const editImagePreview = document.getElementById('editImagePreview');
    const settingsModal = document.getElementById('settingsModal');
    const settingsBtn = document.getElementById('settingsBtn');
    const themeSelect = document.getElementById('themeSelect');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');

    // Context Menu
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `
        <div class="context-menu-item" id="ctxRenameFolder">重命名文件夹</div>
        <div class="context-menu-item" id="ctxNewSiblingFolder">新建同级文件夹</div>
        <div class="context-menu-item" id="ctxNewSubFolder">新建子集文件夹</div>
        <div class="context-menu-item" id="ctxDeleteFolder">删除当前文件夹</div>
    `;
    document.body.appendChild(contextMenu);

    let contextMenuTargetFolder = null;

    // Buttons
    const saveEditBtn = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    // Initialization
    // Restore state from LocalStorage
    if (localStorage.getItem('sortMethodFiles')) {
        sortMethodFiles = localStorage.getItem('sortMethodFiles');
        if (sortSelect) sortSelect.value = sortMethodFiles;
    } else if (localStorage.getItem('sortMethod')) {
        // Fallback for old key
        sortMethodFiles = localStorage.getItem('sortMethod');
        if (sortSelect) sortSelect.value = sortMethodFiles;
    }

    if (localStorage.getItem('sortMethodFolders')) {
        sortMethodFolders = localStorage.getItem('sortMethodFolders');
        if (sortSelectSidebar) sortSelectSidebar.value = sortMethodFolders;
    } else if (localStorage.getItem('sortMethod')) {
        // Fallback for old key
        sortMethodFolders = localStorage.getItem('sortMethod');
        if (sortSelectSidebar) sortSelectSidebar.value = sortMethodFolders;
    }

    if (localStorage.getItem('currentPath')) {
        currentPath = localStorage.getItem('currentPath');
    }

    // Restore Theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    if (themeSelect) themeSelect.value = savedTheme;

    loadData();

    // Sidebar Resize Functionality
    const sidebar = document.querySelector('.sidebar');
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    // Mouse down on sidebar (check if near right edge)
    sidebar.addEventListener('mousedown', (e) => {
        const rect = sidebar.getBoundingClientRect();
        const offsetX = e.clientX - rect.right;

        // If click is within 8px of the right edge
        if (Math.abs(offsetX) <= 8) {
            isResizing = true;
            startX = e.clientX;
            startWidth = rect.width;
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const delta = e.clientX - startX;
        const newWidth = startWidth + delta;

        // Apply min/max constraints
        const minWidth = 150;
        const maxWidth = 500;
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        sidebar.style.width = constrainedWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    // Event Listeners
    document.addEventListener('click', (e) => {
        // Close context menu
        contextMenu.style.display = 'none';
    });

    document.getElementById('ctxRenameFolder').addEventListener('click', async () => {
        if (contextMenuTargetFolder !== null) {
            // Get current folder name
            const currentName = contextMenuTargetFolder.includes('/')
                ? contextMenuTargetFolder.substring(contextMenuTargetFolder.lastIndexOf('/') + 1)
                : contextMenuTargetFolder;

            const newName = await showInputModal('请输入新文件夹名称:', currentName);
            if (newName && newName !== currentName) {
                renameFolder(contextMenuTargetFolder, newName);
            }
        }
    });

    document.getElementById('ctxNewSiblingFolder').addEventListener('click', async () => {
        if (contextMenuTargetFolder !== null) { // Can be empty string if we allowed root context menu, but root is hidden now.
            // If target is "Anime/Sub", parent is "Anime"
            // If target is "Anime", parent is ""
            const parentPath = contextMenuTargetFolder.includes('/')
                ? contextMenuTargetFolder.substring(0, contextMenuTargetFolder.lastIndexOf('/'))
                : '';

            const name = await showInputModal('请输入新文件夹名称:');
            if (name) createFolder(parentPath, name);
        }
    });

    document.getElementById('ctxNewSubFolder').addEventListener('click', async () => {
        if (contextMenuTargetFolder !== null) {
            const name = await showInputModal('请输入新文件夹名称:');
            if (name) createFolder(contextMenuTargetFolder, name);
        }
    });

    document.getElementById('ctxDeleteFolder').addEventListener('click', async () => {
        if (contextMenuTargetFolder) {
            if (await showConfirmModal(`确定要删除文件夹 "${contextMenuTargetFolder}" 及其所有内容吗?`)) {
                deleteFolder(contextMenuTargetFolder);
            }
        }
    });

    searchInput.addEventListener('input', debounce((e) => {
        searchQuery = e.target.value.toLowerCase();
        searchClear.style.display = searchQuery ? 'block' : 'none';

        if (searchQuery) {
            // Server-side search
            performSearch(searchQuery);
        } else {
            // Restore grid from current path
            renderGrid();
        }
    }, 500));

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        searchClear.style.display = 'none';
        renderGrid();
    });

    function handleFileSortChange(e) {
        sortMethodFiles = e.target.value;
        localStorage.setItem('sortMethodFiles', sortMethodFiles);
        renderGrid();
    }

    function handleFolderSortChange(e) {
        sortMethodFolders = e.target.value;
        localStorage.setItem('sortMethodFolders', sortMethodFolders);
        renderFolderTree();
        // Restore expansion of current path because renderFolderTree resets DOM
        if (currentPath) {
            expandToPath(currentPath);
        }
        updateActiveFolder();
    }

    if (sortSelect) sortSelect.addEventListener('change', handleFileSortChange);
    if (sortSelectSidebar) sortSelectSidebar.addEventListener('change', handleFolderSortChange);

    // Settings & Theme
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    document.querySelector('.close-settings-modal').addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.style.display = 'none';
    });

    themeSelect.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        showToast('主题已切换', 'success');
    });

    saveEditBtn.addEventListener('click', saveEdit);
    cancelEditBtn.addEventListener('click', closeModal);

    document.querySelector('.close-modal').addEventListener('click', closeModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeModal();
    });

    fullImageModal.addEventListener('click', () => {
        fullImageModal.style.display = 'none';
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            fullImageModal.style.display = 'none';
        }
    });

    // Global Paste (Ctrl+V)
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                if (editModal.style.display === 'flex') {
                    // Replace in modal
                    handleModalImageDrop(blob);
                } else {
                    openCreateModalWithFile(blob);
                }
                break;
            }
        }
    });

    // Global Drag & Drop
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                if (editModal.style.display === 'flex') {
                    // Replace in modal
                    handleModalImageDrop(file);
                } else {
                    openCreateModalWithFile(file);
                }
            }
        }
    });

    function handleModalImageDrop(file) {
        uploadedFile = file; // Store for save
        // Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            editImagePreview.src = e.target.result;
        };
        reader.readAsDataURL(file);
        showToast('图片已准备替换，请保存', 'info');
    }

    // --- Core Logic ---

    async function loadData() {
        try {
            const res = await fetch('/api/scan');
            const data = await res.json();
            fileTree = data;
            flattenFiles(fileTree);
            renderFolderTree();

            // Restore path expansion
            if (currentPath) {
                expandToPath(currentPath);
            }

            updateActiveFolder();
            renderGrid();
        } catch (err) {
            showToast('加载数据失败', 'error');
            console.error(err);
        }
    }

    async function performSearch(query) {
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const results = await res.json();

            // Results already have prompts from backend search
            renderSearchResults(results);
        } catch (err) {
            console.error(err);
        }
    }

    function flattenFiles(tree, parentPath = '') {
        // Reset if it's the initial call (we might want to refactor this to be pure)
        if (parentPath === '') allFiles = [];

        tree.forEach(item => {
            if (item.type === 'file') {
                allFiles.push(item);
            } else if (item.type === 'directory') {
                flattenFiles(item.children, item.path);
            }
        });
    }

    function renderFolderTree() {
        folderTreeEl.innerHTML = '';
        // Hide root, render top-level items directly
        renderTreeLevel(fileTree, folderTreeEl);
    }

    function expandToPath(path) {
        if (!path) return;
        const parts = path.split('/');
        let currentBuild = '';

        parts.forEach(part => {
            currentBuild += (currentBuild ? '/' : '') + part;
            // Find folder-item with this path
            // Note: querySelector might fail with special chars in ID, but data-path is attribute
            // We need to escape quotes in path if any
            const safePath = currentBuild.replace(/"/g, '\\"');
            const item = document.querySelector(`.folder-item[data-path="${safePath}"]`);
            if (item) {
                const folderDiv = item.parentElement;
                const subTree = folderDiv.querySelector('.sub-tree');
                if (subTree) {
                    subTree.classList.add('open');
                }
            }
        });
    }

    function showContextMenu(x, y, isRoot = false) {
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';
        contextMenu.style.display = 'block';

        // Hide delete for root? But root is hidden now.
        // For logic safety:
        const deleteItem = document.getElementById('ctxDeleteFolder');
        if (deleteItem) deleteItem.style.display = 'block';
    }

    function renderTreeLevel(nodes, container) {
        // Sort folders first
        let folders = nodes.filter(n => n.type === 'directory');

        // Apply sorting to folders based on current sortMethodFolders
        folders.sort((a, b) => {
            if (sortMethodFolders === 'name_asc') return a.name.localeCompare(b.name);
            if (sortMethodFolders === 'name_desc') return b.name.localeCompare(a.name);
            if (sortMethodFolders === 'date_new') {
                const am = typeof a.mtime === 'number' ? a.mtime : 0;
                const bm = typeof b.mtime === 'number' ? b.mtime : 0;
                return bm - am;
            }
            if (sortMethodFolders === 'date_old') {
                const am = typeof a.mtime === 'number' ? a.mtime : 0;
                const bm = typeof b.mtime === 'number' ? b.mtime : 0;
                return am - bm;
            }
            return 0;
        });

        folders.forEach(folder => {
            const folderDiv = document.createElement('div');

            const itemDiv = document.createElement('div');
            itemDiv.className = `folder-item ${currentPath === folder.path ? 'active' : ''}`;
            itemDiv.dataset.path = folder.path;
            itemDiv.innerHTML = `<span class="folder-icon">📁</span> ${folder.name}`;

            // Click to toggle accordion
            itemDiv.onclick = (e) => {
                e.stopPropagation();

                // Accordion logic: Close siblings
                const parent = folderDiv.parentElement; // The container
                // Find all open sub-trees in this container
                Array.from(parent.children).forEach(child => {
                    if (child !== folderDiv) {
                        const sub = child.querySelector('.sub-tree');
                        if (sub) sub.classList.remove('open');
                    }
                });

                // Toggle current
                const subTree = folderDiv.querySelector('.sub-tree');
                if (subTree) {
                    subTree.classList.toggle('open');
                }

                currentPath = folder.path;
                localStorage.setItem('currentPath', currentPath);
                updateActiveFolder();
                renderGrid();
            };

            // Context Menu for folders
            itemDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                contextMenuTargetFolder = folder.path;
                showContextMenu(e.pageX, e.pageY, false);
            });

            folderDiv.appendChild(itemDiv);

            if (folder.children && folder.children.some(c => c.type === 'directory')) {
                const subTree = document.createElement('div');
                subTree.className = 'sub-tree'; // Hidden by default
                // If current path starts with this folder, open it? 
                // Simple implementation: Default closed.
                renderTreeLevel(folder.children, subTree);
                folderDiv.appendChild(subTree);
            }

            container.appendChild(folderDiv);
        });
    }

    function updateActiveFolder() {
        document.querySelectorAll('.folder-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.path === currentPath || (currentPath === '' && !el.dataset.path)) {
                el.classList.add('active');
            }
        });
        updateBreadcrumbs();
    }

    function updateBreadcrumbs() {
        breadcrumbsEl.innerHTML = '';
        const parts = currentPath ? currentPath.split('/') : [];

        const rootSpan = document.createElement('span');
        rootSpan.textContent = 'root';
        rootSpan.onclick = () => { currentPath = ''; updateActiveFolder(); renderGrid(); };
        breadcrumbsEl.appendChild(rootSpan);

        let accumulatedPath = '';
        parts.forEach(part => {
            if (!part) return;
            accumulatedPath += (accumulatedPath ? '/' : '') + part;
            const sep = document.createTextNode(' / ');
            breadcrumbsEl.appendChild(sep);

            const span = document.createElement('span');
            span.textContent = part;
            const pathRef = accumulatedPath; // Closure capture
            span.onclick = () => { currentPath = pathRef; updateActiveFolder(); renderGrid(); };
            breadcrumbsEl.appendChild(span);
        });
    }

    // Helper to fetch prompts for visible grid items
    async function fetchPromptsForGrid(files) {
        const paths = files.map(f => f.path);
        if (paths.length === 0) return;

        try {
            const res = await fetch('/api/prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths })
            });
            const data = await res.json();

            // Update model and DOM
            files.forEach(f => {
                if (data[f.path] !== undefined) {
                    f.prompt = data[f.path];
                    // Find card content element and update
                    // This is a bit inefficient (searching DOM), but works.
                    // Better to re-render or bind ID.
                    // Since we just rendered the grid, let's just re-render or use data attributes.
                }
            });

            // Re-render grid to show prompts? Or update in place.
            // Let's update in place.
            const cards = document.querySelectorAll('.data-card');
            cards.forEach(card => {
                const path = card.dataset.path;
                if (data[path] !== undefined) {
                    const content = card.querySelector('.card-content');
                    content.textContent = data[path] || '(无内容)';
                    content.title = data[path];
                    // Also update the file object in allFiles if needed? 
                    // Yes, so editing works.
                    const fileObj = allFiles.find(af => af.path === path);
                    if (fileObj) fileObj.prompt = data[path];
                }
            });

        } catch (e) {
            console.error('Failed to fetch prompts', e);
        }
    }

    function renderSearchResults(results) {
        imageGridEl.innerHTML = '';
        statusBarEl.textContent = `搜索结果: ${results.length} 张`;

        results.forEach(file => {
            const card = createCard(file);
            imageGridEl.appendChild(card);
        });
    }

    function renderGrid() {
        imageGridEl.innerHTML = '';

        // Filter
        let filtered = allFiles.filter(file => {
            const fileDir = file.path.substring(0, file.path.lastIndexOf('/'));
            const isDirectChild = fileDir === currentPath;
            return isDirectChild;
        });

        // Sort
        filtered.sort((a, b) => {
            if (sortMethodFiles === 'name_asc') return a.name.localeCompare(b.name);
            if (sortMethodFiles === 'name_desc') return b.name.localeCompare(a.name);
            if (sortMethodFiles === 'date_new') return b.mtime - a.mtime;
            if (sortMethodFiles === 'date_old') return a.mtime - b.mtime;
            return 0;
        });

        statusBarEl.textContent = `当前目录: ${filtered.length} 张`;

        // Render Cards
        filtered.forEach(file => {
            const card = createCard(file);
            imageGridEl.appendChild(card);
        });

        // Fetch prompts for these files
        fetchPromptsForGrid(filtered);
    }

    function createCard(file) {
        const card = document.createElement('div');
        card.className = 'data-card';
        card.dataset.path = file.path;

        // Title
        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = file.name; // Backend already removed extension
        title.title = file.name;

        // Thumb
        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'card-thumb';
        const img = document.createElement('img');

        // Use timestamp if modified
        let src = `/imageData/thumbnails/${file.path}`;
        if (modifiedTimestamps[file.path]) {
            src += `?t=${modifiedTimestamps[file.path]}`;
        }
        img.src = src;

        // Set CSS variable for background image
        // Escape single quotes in src if any (though URL encoding usually handles it)
        thumbDiv.style.setProperty('--bg-image', `url('${src.replace(/'/g, "\\'")}')`);

        img.loading = 'lazy';
        img.onclick = () => openFullImage(file);
        thumbDiv.appendChild(img);

        // Content (Prompt) - Initially empty or cached
        const content = document.createElement('div');
        content.className = 'card-content';
        content.textContent = file.prompt || 'Loading...';
        content.title = file.prompt || '';

        // Actions
        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const btnEdit = document.createElement('button');
        btnEdit.textContent = '编辑';
        btnEdit.onclick = () => openEditModal(file);

        const btnDelete = document.createElement('button');
        btnDelete.textContent = '删除';
        btnDelete.className = 'btn-delete';
        btnDelete.onclick = () => deleteFile(file);

        const btnCopy = document.createElement('button');
        btnCopy.textContent = '复制';
        btnCopy.className = 'btn-copy';
        btnCopy.onclick = () => copyToClipboard(file.prompt);

        // Order: Edit, Delete, Copy (Requested: Edit, Delete, Copy)
        // User said: "Should be Edit, Delete, Copy instead of Edit, Copy, Delete"
        actions.append(btnEdit, btnDelete, btnCopy);

        card.append(title, thumbDiv, content, actions);
        return card;
    }

    // --- Actions ---

    let uploadedFile = null; // Store the dropped/pasted file

    function openFullImage(file) {
        fullImage.src = `/imageData/images/${file.path}`;
        fullImageModal.style.display = 'flex';

        let scale = 1;
        fullImage.style.transform = `scale(${scale})`;

        fullImage.onwheel = (e) => {
            e.preventDefault();
            scale += e.deltaY * -0.001;
            scale = Math.min(Math.max(.125, scale), 4);
            fullImage.style.transform = `scale(${scale})`;
        };
    }

    function openCreateModalWithFile(file) {
        currentEditFile = null; // New file mode
        uploadedFile = file;

        // Generate a default name from file name
        let name = file.name.split('.').slice(0, -1).join('.');
        editFilenameInput.value = name;
        editPromptInput.value = '';

        // Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            editImagePreview.src = e.target.result;
        };
        reader.readAsDataURL(file);

        document.querySelector('.modal-header h2').textContent = '新建单元';
        editModal.style.display = 'flex';
    }

    function openEditModal(file) {
        currentEditFile = file;
        uploadedFile = null; // Reset upload

        editFilenameInput.value = file.base_name;
        // Prompt might be missing if not loaded yet?
        // But we fetch prompts on grid render, so it should be there.
        // If not, maybe fetch it now?
        if (file.prompt === undefined || file.prompt === 'Loading...') {
            // Fetch single
            fetch('/api/prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: [file.path] })
            }).then(r => r.json()).then(d => {
                file.prompt = d[file.path] || '';
                editPromptInput.value = file.prompt;
            });
        }

        editPromptInput.value = file.prompt || '';
        editImagePreview.src = `/imageData/thumbnails/${file.path}`;

        document.querySelector('.modal-header h2').textContent = '编辑单元';
        editModal.style.display = 'flex';
    }

    function closeModal() {
        editModal.style.display = 'none';
        currentEditFile = null;
        uploadedFile = null;
        editImagePreview.src = '';
    }

    async function saveEdit() {
        const newName = editFilenameInput.value.trim();
        const newPrompt = editPromptInput.value;

        if (!newName) {
            showToast('请输入文件名', 'error');
            return;
        }

        if (currentEditFile) {
            // --- EDIT MODE ---
            let needsReload = false;
            let targetPath = currentEditFile.path;

            // 1. Rename if changed
            if (newName !== currentEditFile.base_name) {
                try {
                    await fetch('/api/rename', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ old_path: currentEditFile.path, new_name: newName })
                    });
                    showToast('重命名成功', 'success');
                    needsReload = true;

                    // Update targetPath for subsequent operations
                    const dir = targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : '';
                    const ext = currentEditFile.path.substring(currentEditFile.path.lastIndexOf('.'));
                    targetPath = (dir ? dir + '/' : '') + newName + ext;

                } catch (e) {
                    showToast('重命名失败', 'error');
                    return;
                }
            }

            // 2. Update Prompt
            if (newPrompt !== currentEditFile.prompt) {
                try {
                    await fetch('/api/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: targetPath, prompt: newPrompt })
                    });
                    needsReload = true;
                } catch (e) {
                    showToast('更新内容失败', 'error');
                }
            }

            // 3. Upload new image if exists
            if (uploadedFile) {
                const formData = new FormData();
                formData.append('image', uploadedFile);
                formData.append('filename', newName); // Use new name
                formData.append('prompt', newPrompt);
                const folderPath = targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : '';
                formData.append('folder_path', folderPath);
                formData.append('overwrite', 'true'); // Force overwrite

                try {
                    const res = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    if (!res.ok) throw new Error('Upload failed');
                    showToast('图片已替换', 'success');
                    needsReload = true;

                    // Update timestamp to force refresh
                    modifiedTimestamps[targetPath] = Date.now();

                } catch (e) {
                    showToast('图片替换失败', 'error');
                }
            }

            closeModal();
            if (needsReload) {
                loadData();
            }
        } else {
            // --- CREATE MODE ---
            if (!uploadedFile) {
                showToast('没有图片文件', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('image', uploadedFile);
            formData.append('filename', newName);
            formData.append('prompt', newPrompt);
            formData.append('folder_path', currentPath);

            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (res.ok) {
                    showToast('创建成功', 'success');
                    closeModal();
                    loadData();
                } else {
                    const data = await res.json();
                    if (data.code === 'EXISTS') {
                        showToast('错误：该项目已存在！', 'error'); // Specific error message requested
                    } else {
                        showToast(data.error || '创建失败', 'error');
                    }
                }
            } catch (e) {
                showToast('创建失败', 'error');
            }
        }
    }

    async function createFolder(parentPath, name) {
        if (!name) return;
        try {
            const res = await fetch('/api/folder/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parent_path: parentPath, name: name })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('文件夹创建成功', 'success');
                loadData();
            } else {
                showToast(data.error || '创建失败', 'error');
            }
        } catch (e) {
            showToast('请求失败', 'error');
        }
    }

    async function deleteFile(file) {
        if (!await showConfirmModal(`确定要删除 ${file.name} 吗?`)) return;

        try {
            const res = await fetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: file.path })
            });
            if (res.ok) {
                showToast('删除成功', 'error'); // Red toast
                loadData();
            } else {
                showToast('删除失败', 'error');
            }
        } catch (e) {
            showToast('请求失败', 'error');
        }
    }

    async function deleteFolder(path) {
        try {
            const res = await fetch('/api/folder/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path })
            });
            if (res.ok) {
                showToast('文件夹已删除', 'error');
                loadData();
            }
        } catch (e) {
            showToast('删除文件夹失败', 'error');
        }
    }

    async function renameFolder(oldPath, newName) {
        try {
            const res = await fetch('/api/folder/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: oldPath, new_name: newName })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('文件夹重命名成功', 'success');
                // Update current path if we renamed the current folder or its parent
                if (currentPath === oldPath) {
                    const parentPath = oldPath.includes('/')
                        ? oldPath.substring(0, oldPath.lastIndexOf('/'))
                        : '';
                    currentPath = (parentPath ? parentPath + '/' : '') + newName;
                    localStorage.setItem('currentPath', currentPath);
                } else if (currentPath.startsWith(oldPath + '/')) {
                    // Update if current path is inside the renamed folder
                    const parentPath = oldPath.includes('/')
                        ? oldPath.substring(0, oldPath.lastIndexOf('/'))
                        : '';
                    const newFolderPath = (parentPath ? parentPath + '/' : '') + newName;
                    currentPath = currentPath.replace(oldPath, newFolderPath);
                    localStorage.setItem('currentPath', currentPath);
                }
                loadData();
            } else {
                showToast(data.error || '重命名失败', 'error');
            }
        } catch (e) {
            showToast('请求失败', 'error');
        }
    }

    async function copyToClipboard(text) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            showToast('复制成功', 'success');
        } catch (err) {
            showToast('复制失败', 'error');
        }
    }

    // --- Utils ---

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    function showInputModal(title, defaultValue = '') {
        return new Promise((resolve) => {
            const modal = document.getElementById('inputModal');
            const input = document.getElementById('inputModalInput');
            const titleEl = document.getElementById('inputModalTitle');
            const confirmBtn = document.getElementById('inputModalConfirmBtn');
            const cancelBtn = document.getElementById('inputModalCancelBtn');
            const closeBtn = document.querySelector('.close-input-modal');

            titleEl.textContent = title;
            input.value = defaultValue;
            modal.style.display = 'flex';
            input.focus();

            const cleanup = () => {
                modal.style.display = 'none';
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                closeBtn.onclick = null;
                input.onkeydown = null;
            };

            const onConfirm = () => {
                const val = input.value.trim();
                cleanup();
                resolve(val);
            };

            const onCancel = () => {
                cleanup();
                resolve(null);
            };

            confirmBtn.onclick = onConfirm;
            cancelBtn.onclick = onCancel;
            closeBtn.onclick = onCancel;

            input.onkeydown = (e) => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape') onCancel();
            };
        });
    }

    function showConfirmModal(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const msgEl = document.getElementById('confirmModalMessage');
            const confirmBtn = document.getElementById('confirmModalConfirmBtn');
            const cancelBtn = document.getElementById('confirmModalCancelBtn');
            const closeBtn = document.querySelector('.close-confirm-modal');

            msgEl.textContent = message;
            modal.style.display = 'flex';
            confirmBtn.focus();

            const cleanup = () => {
                modal.style.display = 'none';
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                closeBtn.onclick = null;
            };

            const onConfirm = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            confirmBtn.onclick = onConfirm;
            cancelBtn.onclick = onCancel;
            closeBtn.onclick = onCancel;

            // Handle Esc key on window or button blur? 
            // Since modal blocks interaction, we can listen on window or just rely on focus.
            // But let's keep it simple.
        });
    }
});
