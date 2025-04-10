// 全局状态
const state = {
    categories: [],
    bookmarks: [],
    allBookmarks: [],  // 存储所有书签的全局列表(用于搜索)
    currentCategory: null,
    selectedBookmarks: new Set(),
    draggedCategory: null,
    draggedBookmark: null,
    searchMode: false,
    searchResults: [],
    categoryToMove: null,
    searchEngine: {
        current: 'google',
        urls: {
            google: 'https://www.google.com/search?q=',
            bing: 'https://www.bing.com/search?q=',
            baidu: 'https://www.baidu.com/s?wd='
        }
    }
};

// DOM元素
const elements = {
    categoriesTree: document.getElementById('categories-tree'),
    categoryTitle: document.getElementById('category-title'),
    bookmarksContainer: document.getElementById('bookmarks-container'),
    searchResultsContainer: document.getElementById('search-results-container'),
    multiSelectToolbar: document.getElementById('multi-select-toolbar'),
    selectedCount: document.getElementById('selected-count'),
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    searchEngineBtn: document.getElementById('search-engine-btn'),
    searchEngineIcon: document.getElementById('search-engine-icon'),
    searchEngineDropdown: document.getElementById('search-engine-dropdown'),
    
    // 按钮
    addCategoryBtn: document.getElementById('add-category-btn'),
    addBookmarkHeaderBtn: document.getElementById('add-bookmark-header-btn'),
    openSelectedBtn: document.getElementById('open-selected-btn'),
    moveSelectedBtn: document.getElementById('move-selected-btn'),
    deleteSelectedBtn: document.getElementById('delete-selected-btn'),
    cancelMultiSelectBtn: document.getElementById('cancel-multi-select-btn'),
    
    // 模态框
    categoryModal: document.getElementById('category-modal'),
    bookmarkModal: document.getElementById('bookmark-modal'),
    moveModal: document.getElementById('move-modal'),
    categoryMoveModal: document.getElementById('category-move-modal'),
    confirmModal: document.getElementById('confirm-modal'),
    
    // 右键菜单
    categoryContextMenu: document.getElementById('category-context-menu'),
    bookmarkContextMenu: document.getElementById('bookmark-context-menu')
};

// 修复确认对话框实现
let confirmActionCallback = null;

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('应用初始化开始...');
        
        // 初始化事件监听
        initEventListeners();
        
        // 首先获取所有分类
        await fetchCategories();
        console.log('已获取所有分类');
        
        // 获取所有书签用于全局搜索
        await fetchAllBookmarks();
        console.log('已获取所有书签用于搜索');
        
        // 隐藏所有上下文菜单的事件
        document.addEventListener('click', hideContextMenus);
        
        console.log('应用初始化完成');
    } catch (error) {
        console.error('应用初始化失败:', error);
        showError('初始化失败，请刷新页面重试');
    }
});

// 初始化事件监听器
function initEventListeners() {
    // 添加主分类按钮
    elements.addCategoryBtn.addEventListener('click', () => {
        showCategoryModal();
    });
    
    // 添加书签按钮（顶部）
    elements.addBookmarkHeaderBtn.addEventListener('click', () => {
        showBookmarkModal();
    });
    
    // 搜索相关
    elements.searchInput.addEventListener('input', handleSearchInput);
    elements.searchBtn.addEventListener('click', handleExternalSearch);
    elements.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleExternalSearch();
        }
    });
    
    // 搜索引擎选择
    elements.searchEngineBtn.addEventListener('click', toggleSearchEngineDropdown);
    document.querySelectorAll('.search-engine-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const engine = e.currentTarget.dataset.engine;
            const icon = e.currentTarget.dataset.icon;
            setSearchEngine(engine, icon);
            toggleSearchEngineDropdown();
        });
    });
    
    // 关闭搜索引擎下拉菜单（点击外部区域）
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#search-engine-btn') && !e.target.closest('#search-engine-dropdown')) {
            elements.searchEngineDropdown.classList.remove('show');
        }
    });
    
    // 多选工具栏按钮
    elements.openSelectedBtn.addEventListener('click', openSelectedBookmarks);
    elements.moveSelectedBtn.addEventListener('click', showMoveModal);
    elements.deleteSelectedBtn.addEventListener('click', confirmDeleteSelected);
    elements.cancelMultiSelectBtn.addEventListener('click', clearSelection);
    
    // 分类模态框
    document.getElementById('category-form').addEventListener('submit', (e) => {
        e.preventDefault();
        submitCategoryForm();
    });
    
    // 书签模态框
    document.getElementById('bookmark-form').addEventListener('submit', (e) => {
        e.preventDefault();
        submitBookmarkForm();
    });
    
    // 移动确认按钮
    document.getElementById('move-confirm-btn').addEventListener('click', moveSelectedBookmarks);
    
    // 分类移动确认按钮
    document.getElementById('category-move-confirm-btn').addEventListener('click', moveCategoryToParent);
    
    // 确认对话框按钮
    document.getElementById('confirm-yes-btn').addEventListener('click', confirmAction);
    document.getElementById('confirm-no-btn').addEventListener('click', () => {
        closeModal(elements.confirmModal);
    });
    
    // 分类上下文菜单项
    document.getElementById('add-subcategory').addEventListener('click', () => {
        const categoryId = elements.categoryContextMenu.dataset.categoryId;
        showCategoryModal(null, categoryId);
        hideContextMenus();
    });
    
    document.getElementById('add-bookmark-category').addEventListener('click', () => {
        const categoryId = elements.categoryContextMenu.dataset.categoryId;
        showBookmarkModal(null, categoryId);
        hideContextMenus();
    });
    
    document.getElementById('rename-category').addEventListener('click', () => {
        const categoryId = elements.categoryContextMenu.dataset.categoryId;
        const category = state.categories.find(c => c.id == categoryId);
        if (category) {
            showCategoryModal(category);
        }
        hideContextMenus();
    });
    
    document.getElementById('move-category').addEventListener('click', () => {
        const categoryId = elements.categoryContextMenu.dataset.categoryId;
        const category = state.categories.find(c => c.id == categoryId);
        if (category) {
            showCategoryMoveModal(categoryId);
        }
        hideContextMenus();
    });
    
    document.getElementById('delete-category').addEventListener('click', () => {
        const categoryId = elements.categoryContextMenu.dataset.categoryId;
        const category = state.categories.find(c => c.id == categoryId);
        if (category) {
            showConfirmModal(
                '确认删除',
                `是否确认删除分类"${category.name}"及其所有内容？此操作不可撤销。`,
                () => deleteCategory(categoryId)
            );
        }
        hideContextMenus();
    });
    
    // 书签上下文菜单项
    document.getElementById('open-bookmark').addEventListener('click', () => {
        const bookmarkId = elements.bookmarkContextMenu.dataset.bookmarkId;
        const bookmark = state.bookmarks.find(b => b.id == bookmarkId);
        if (bookmark) {
            window.open(bookmark.url, '_blank');
        }
        hideContextMenus();
    });
    
    document.getElementById('edit-bookmark').addEventListener('click', () => {
        const bookmarkId = elements.bookmarkContextMenu.dataset.bookmarkId;
        const bookmark = state.bookmarks.find(b => b.id == bookmarkId);
        if (bookmark) {
            showBookmarkModal(bookmark);
        }
        hideContextMenus();
    });
    
    document.getElementById('move-bookmark').addEventListener('click', () => {
        const bookmarkId = elements.bookmarkContextMenu.dataset.bookmarkId;
        // 清除现有选择并只选中当前书签
        clearSelection();
        toggleBookmarkSelection(bookmarkId);
        // 复用多选移动功能
        showMoveModal();
        hideContextMenus();
    });
    
    document.getElementById('delete-bookmark').addEventListener('click', () => {
        const bookmarkId = elements.bookmarkContextMenu.dataset.bookmarkId;
        const bookmark = state.bookmarks.find(b => b.id == bookmarkId);
        if (bookmark) {
            showConfirmModal(
                '确认删除',
                `是否确认删除书签"${bookmark.title}"？此操作不可撤销。`,
                () => deleteBookmark(bookmarkId)
            );
        }
        hideContextMenus();
    });
    
    // 全局点击事件，用于隐藏上下文菜单
    document.addEventListener('click', () => {
        hideContextMenus();
    });
    
    // 全局右键菜单阻止默认行为
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.category-item') || e.target.closest('.bookmark-card')) {
            e.preventDefault();
        }
    });
    
    // 关闭模态框按钮
    document.querySelectorAll('.close, .cancel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                closeModal(modal);
            }
        });
    });
}

// 搜索相关函数
function handleSearchInput(e) {
    const query = e.target.value.trim().toLowerCase();
    
    if (query === '') {
        // 如果搜索框为空，退出搜索模式
        exitSearchMode();
        return;
    }
    
    // 进入搜索模式
    state.searchMode = true;
    
    // 确保先获取所有书签，再进行搜索
    (async () => {
        // 如果没有全局书签列表，先获取全部书签
        if (!state.allBookmarks || state.allBookmarks.length === 0) {
            await fetchAllBookmarks();
        }
        
        // 全局搜索所有书签，无论当前选中的是哪个分类
        const results = searchBookmarks(query);
        state.searchResults = results;
        
        // 渲染搜索结果
        renderSearchResults();
    })();
}

function handleExternalSearch() {
    const query = elements.searchInput.value.trim();
    if (query) {
        const searchUrl = state.searchEngine.urls[state.searchEngine.current] + encodeURIComponent(query);
        window.open(searchUrl, '_blank');
    }
}

function searchBookmarks(query) {
    // 确保使用全局书签列表进行搜索
    if (!state.allBookmarks || state.allBookmarks.length === 0) {
        console.warn('全局书签列表为空，无法进行搜索');
        return [];
    }
    
    // 在全局书签列表中搜索匹配项
    return state.allBookmarks.filter(bookmark => 
        bookmark.title.toLowerCase().includes(query) || 
        bookmark.url.toLowerCase().includes(query) || 
        (bookmark.description && bookmark.description.toLowerCase().includes(query))
    );
}

function renderSearchResults() {
    elements.searchResultsContainer.innerHTML = '';
    elements.bookmarksContainer.style.display = 'none';
    elements.searchResultsContainer.classList.add('active');
    
    if (state.searchResults.length === 0) {
        elements.searchResultsContainer.innerHTML = `
            <p class="empty-message">没有找到匹配的书签</p>
            <p class="empty-message">
                <button id="external-search-btn">
                    <i class="fas fa-search"></i> 使用${getCurrentSearchEngineName()}搜索
                </button>
            </p>
        `;
        
        document.getElementById('external-search-btn').addEventListener('click', handleExternalSearch);
        return;
    }
    
    // 按分类对结果进行分组
    const groupedResults = {};
    
    for (const bookmark of state.searchResults) {
        const categoryId = bookmark.category_id;
        if (!groupedResults[categoryId]) {
            groupedResults[categoryId] = [];
        }
        groupedResults[categoryId].push(bookmark);
    }
    
    // 渲染每个分组
    for (const categoryId in groupedResults) {
        const category = state.categories.find(c => c.id == categoryId);
        if (!category) continue;
        
        // 查找父分类（如果是子分类）
        let parentCategory = null;
        if (category.parent_id) {
            parentCategory = state.categories.find(c => c.id == category.parent_id);
        }
        
        const group = document.createElement('div');
        group.className = 'search-group';
        
        const title = document.createElement('h3');
        title.className = 'search-group-title';
        if (parentCategory) {
            title.innerHTML = `<i class="fas fa-folder-open"></i> ${parentCategory.name} <i class="fas fa-angle-right"></i> <i class="fas fa-folder"></i> ${category.name}`;
        } else {
            title.innerHTML = `<i class="fas fa-folder-open"></i> ${category.name}`;
        }
        
        const bookmarkGrid = document.createElement('div');
        bookmarkGrid.className = 'bookmark-grid';
        
        for (const bookmark of groupedResults[categoryId]) {
            const bookmarkElement = createBookmarkElement(bookmark);
            bookmarkGrid.appendChild(bookmarkElement);
        }
        
        group.appendChild(title);
        group.appendChild(bookmarkGrid);
        elements.searchResultsContainer.appendChild(group);
    }
}

// 获取当前搜索引擎名称
function getCurrentSearchEngineName() {
    switch (state.searchEngine.current) {
        case 'google': return 'Google';
        case 'bing': return 'Bing';
        case 'baidu': return '百度';
        default: return '搜索引擎';
    }
}

function exitSearchMode() {
    state.searchMode = false;
    elements.searchResultsContainer.classList.remove('active');
    elements.bookmarksContainer.style.display = 'flex';
    elements.searchInput.value = '';
}

// 获取所有书签（用于搜索）
async function fetchAllBookmarks() {
    try {
        // 使用不带分类筛选的API调用，获取所有书签
        const response = await fetch('/api/bookmarks');
        if (!response.ok) throw new Error('获取书签失败');
        
        // 保存到全局书签列表
        state.allBookmarks = await response.json();
        console.log(`成功获取所有书签，共 ${state.allBookmarks.length} 个`);
    } catch (error) {
        console.error('获取全部书签失败:', error);
        showError('获取书签失败');
    }
}

// API 请求函数
async function fetchCategories() {
    try {
        const response = await fetch('/api/categories');
        if (!response.ok) throw new Error('获取分类失败');
        
        state.categories = await response.json();
        renderCategories();
        
        // 如果有分类，默认选择第一个
        if (state.categories.length > 0) {
            selectCategory(state.categories[0].id);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('获取分类失败，请刷新页面重试');
    }
}

async function fetchBookmarks(categoryId = null) {
    try {
        let url = '/api/bookmarks';
        if (categoryId) {
            url += `?category_id=${categoryId}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('获取书签失败');
        
        state.bookmarks = await response.json();
        
        // 如果是主分类，还需要获取所有子分类的书签
        if (categoryId) {
            const currentCategory = state.categories.find(c => c.id == categoryId);
            if (currentCategory && !currentCategory.parent_id) {
                // 查找所有子分类
                const subCategories = state.categories.filter(c => c.parent_id == categoryId);
                
                // 获取所有子分类的书签
                for (const subCategory of subCategories) {
                    const response = await fetch(`/api/bookmarks?category_id=${subCategory.id}`);
                    if (response.ok) {
                        const subBookmarks = await response.json();
                        // 合并到主书签列表
                        state.bookmarks = [...state.bookmarks, ...subBookmarks];
                    }
                }
            }
        }
        
        renderBookmarks();
    } catch (error) {
        console.error('Error:', error);
        showError('获取书签失败，请刷新页面重试');
    }
}

async function createCategory(name, parentId = null) {
    try {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, parent_id: parentId })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '创建分类失败');
        }
        
        const newCategory = await response.json();
        state.categories.push(newCategory);
        renderCategories();
        selectCategory(newCategory.id);
        
        return newCategory;
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
        return null;
    }
}

async function updateCategory(id, name) {
    try {
        const response = await fetch(`/api/categories/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '更新分类失败');
        }
        
        // 更新本地状态
        const category = state.categories.find(c => c.id == id);
        if (category) {
            category.name = name;
            renderCategories();
            if (state.currentCategory == id) {
                renderCategoryTitle();
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
        return false;
    }
}

async function deleteCategory(id) {
    try {
        const response = await fetch(`/api/categories/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '删除分类失败');
        }
        
        // 从本地状态中移除
        const index = state.categories.findIndex(c => c.id == id);
        if (index !== -1) {
            state.categories.splice(index, 1);
        }
        
        // 同时移除子分类
        const childCategories = state.categories.filter(c => c.parent_id == id);
        for (const child of childCategories) {
            const childIndex = state.categories.findIndex(c => c.id == child.id);
            if (childIndex !== -1) {
                state.categories.splice(childIndex, 1);
            }
        }
        
        renderCategories();
        
        // 如果当前选中的是被删除的分类，则切换到第一个分类
        if (state.currentCategory == id || childCategories.some(c => c.id == state.currentCategory)) {
            if (state.categories.length > 0) {
                selectCategory(state.categories[0].id);
            } else {
                state.currentCategory = null;
                renderBookmarks();
                renderCategoryTitle();
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
        return false;
    }
}

async function createBookmark(title, url, description, categoryId) {
    try {
        const response = await fetch('/api/bookmarks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                url,
                description,
                category_id: categoryId
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '创建书签失败');
        }
        
        const newBookmark = await response.json();
        
        // 如果新书签属于当前分类，添加到本地状态
        if (state.currentCategory == categoryId) {
            state.bookmarks.push(newBookmark);
            renderBookmarks();
        }
        
        return newBookmark;
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
        return null;
    }
}

async function updateBookmark(id, title, url, description, categoryId) {
    try {
        const response = await fetch(`/api/bookmarks/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                url,
                description,
                category_id: categoryId
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '更新书签失败');
        }
        
        // 更新本地状态
        const bookmark = state.bookmarks.find(b => b.id == id);
        if (bookmark) {
            bookmark.title = title;
            bookmark.url = url;
            bookmark.description = description;
            
            // 如果分类改变了，需要重新获取书签列表
            if (bookmark.category_id != categoryId) {
                bookmark.category_id = categoryId;
                
                // 重新获取当前分类的书签
                fetchBookmarks(state.currentCategory);
            } else {
                renderBookmarks();
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
        return false;
    }
}

async function deleteBookmark(id) {
    try {
        const response = await fetch(`/api/bookmarks/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '删除书签失败');
        }
        
        // 从本地状态和选中列表中移除
        const index = state.bookmarks.findIndex(b => b.id == id);
        if (index !== -1) {
            state.bookmarks.splice(index, 1);
            state.selectedBookmarks.delete(id);
            renderBookmarks();
            updateMultiSelectToolbar();
        }
        
        return true;
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
        return false;
    }
}

async function moveBookmarks(bookmarkIds, targetCategoryId) {
    try {
        const response = await fetch('/api/bookmarks/move', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bookmark_ids: bookmarkIds,
                target_category_id: targetCategoryId
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '移动书签失败');
        }
        
        // 重新获取当前分类的书签
        fetchBookmarks(state.currentCategory);
        
        // 清除选择
        clearSelection();
        
        return true;
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
        return false;
    }
}

async function reorderCategories(categories) {
    try {
        const response = await fetch('/api/categories/reorder', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ categories })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '重新排序分类失败');
        }
        
        return true;
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
        return false;
    }
}

// 渲染函数
function renderCategories() {
    elements.categoriesTree.innerHTML = '';
    
    // 渲染主分类
    const mainCategories = state.categories.filter(c => !c.parent_id);
    mainCategories.sort((a, b) => a.position - b.position);
    
    for (const category of mainCategories) {
        const categoryItem = createCategoryElement(category);
        elements.categoriesTree.appendChild(categoryItem);
        
        // 查找并渲染子分类
        const subCategories = state.categories.filter(c => c.parent_id == category.id);
        if (subCategories.length > 0) {
            const subContainer = document.createElement('div');
            subContainer.className = 'subcategory-container';
            subContainer.dataset.parentId = category.id;
            
            subCategories.sort((a, b) => a.position - b.position);
            for (const subCategory of subCategories) {
                const subCategoryItem = createCategoryElement(subCategory, true);
                subContainer.appendChild(subCategoryItem);
            }
            
            elements.categoriesTree.appendChild(subContainer);
        }
    }
}

function createCategoryElement(category, isSubcategory = false) {
    const categoryItem = document.createElement('div');
    categoryItem.className = 'category-item';
    categoryItem.dataset.id = category.id;
    categoryItem.draggable = true;
    
    if (state.currentCategory == category.id) {
        categoryItem.classList.add('active');
    }
    
    const icon = document.createElement('i');
    icon.className = isSubcategory ? 'fas fa-folder' : 'fas fa-folder-open';
    
    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = category.name;
    
    categoryItem.appendChild(icon);
    categoryItem.appendChild(name);
    
    // 事件监听
    categoryItem.addEventListener('click', () => {
        selectCategory(category.id);
    });
    
    categoryItem.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showCategoryContextMenu(e, category);
    });
    
    // 拖拽事件
    categoryItem.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', category.id);
        state.draggedCategory = category;
        categoryItem.classList.add('dragging');
    });
    
    categoryItem.addEventListener('dragend', () => {
        categoryItem.classList.remove('dragging');
        state.draggedCategory = null;
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
    });
    
    categoryItem.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (state.draggedCategory && state.draggedCategory.id != category.id) {
            // 只允许将子分类拖到主分类上，或者在同级别之间拖动
            const isValidDrag = (state.draggedCategory.parent_id && !category.parent_id) || 
                                (state.draggedCategory.parent_id == category.parent_id);
            
            if (isValidDrag) {
                categoryItem.classList.add('drag-over');
            }
        }
    });
    
    categoryItem.addEventListener('dragleave', () => {
        categoryItem.classList.remove('drag-over');
    });
    
    categoryItem.addEventListener('drop', async (e) => {
        e.preventDefault();
        categoryItem.classList.remove('drag-over');
        
        if (state.draggedCategory && state.draggedCategory.id != category.id) {
            // 只允许将子分类拖到主分类上，或者在同级别之间拖动
            const isValidDrop = (state.draggedCategory.parent_id && !category.parent_id) || 
                               (state.draggedCategory.parent_id == category.parent_id);
            
            if (isValidDrop) {
                // 更新位置
                if (state.draggedCategory.parent_id) {
                    // 子分类拖到主分类
                    if (!category.parent_id) {
                        state.draggedCategory.parent_id = null;
                    }
                }
                
                // 找出所有同级分类
                const siblings = state.categories.filter(c => 
                    c.parent_id === state.draggedCategory.parent_id && c.id !== state.draggedCategory.id
                );
                
                // 更新位置
                const targetIdx = siblings.findIndex(c => c.id === category.id);
                
                // 更新所有受影响的分类位置
                const updateCategories = [];
                
                for (let i = 0; i < siblings.length; i++) {
                    if (i >= targetIdx) {
                        siblings[i].position = i + 1;
                    } else {
                        siblings[i].position = i;
                    }
                    updateCategories.push({
                        id: siblings[i].id,
                        position: siblings[i].position,
                        parent_id: siblings[i].parent_id
                    });
                }
                
                state.draggedCategory.position = targetIdx;
                updateCategories.push({
                    id: state.draggedCategory.id,
                    position: state.draggedCategory.position,
                    parent_id: state.draggedCategory.parent_id
                });
                
                // 发送请求更新顺序
                await reorderCategories(updateCategories);
                
                // 重新渲染
                renderCategories();
            }
        }
    });
    
    return categoryItem;
}

function renderBookmarks() {
    elements.bookmarksContainer.innerHTML = '';
    
    if (state.searchMode) {
        return;
    }
    
    if (!state.currentCategory) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'empty-message';
        emptyMessage.textContent = '请选择一个分类';
        elements.bookmarksContainer.appendChild(emptyMessage);
        return;
    }
    
    const currentCategory = state.categories.find(c => c.id == state.currentCategory);
    
    // 是否是主分类
    const isMainCategory = currentCategory && !currentCategory.parent_id;
    
    // 过滤当前分类的书签
    const currentCategoryBookmarks = state.bookmarks
        .filter(b => b.category_id == state.currentCategory)
        .sort((a, b) => a.position - b.position);
    
    if (isMainCategory) {
        // 主分类：分子分类显示
        const subCategories = state.categories
            .filter(c => c.parent_id == state.currentCategory)
            .sort((a, b) => a.position - b.position);
        
        // 如果没有子分类，直接显示书签
        if (subCategories.length === 0) {
            const bookmarkGrid = document.createElement('div');
            bookmarkGrid.className = 'bookmark-grid';
            
            if (currentCategoryBookmarks.length > 0) {
                for (const bookmark of currentCategoryBookmarks) {
                    const bookmarkElement = createBookmarkElement(bookmark);
                    bookmarkGrid.appendChild(bookmarkElement);
                }
            } else {
                const emptyMessage = document.createElement('p');
                emptyMessage.className = 'empty-message';
                emptyMessage.textContent = '该分类下暂无书签';
                bookmarkGrid.appendChild(emptyMessage);
            }
            
            // 给书签网格添加拖拽事件处理
            setupBookmarkGridDragEvents(bookmarkGrid, state.currentCategory);
            
            elements.bookmarksContainer.appendChild(bookmarkGrid);
        } else {
            // 有子分类，先显示主分类的书签
            if (currentCategoryBookmarks.length > 0) {
                const mainSection = document.createElement('div');
                mainSection.className = 'subcategory-section';
                
                const mainTitle = document.createElement('h3');
                mainTitle.innerHTML = `<i class="fas fa-bookmark"></i> ${currentCategory.name}`;
                
                const mainGrid = document.createElement('div');
                mainGrid.className = 'bookmark-grid';
                
                for (const bookmark of currentCategoryBookmarks) {
                    const bookmarkElement = createBookmarkElement(bookmark);
                    mainGrid.appendChild(bookmarkElement);
                }
                
                // 给书签网格添加拖拽事件处理
                setupBookmarkGridDragEvents(mainGrid, state.currentCategory);
                
                mainSection.appendChild(mainTitle);
                mainSection.appendChild(mainGrid);
                elements.bookmarksContainer.appendChild(mainSection);
            }
            
            // 显示每个子分类的书签
            for (const subCategory of subCategories) {
                const subBookmarks = state.bookmarks
                    .filter(b => b.category_id == subCategory.id)
                    .sort((a, b) => a.position - b.position);
                
                const subSection = document.createElement('div');
                subSection.className = 'subcategory-section';
                
                const subTitle = document.createElement('h3');
                subTitle.innerHTML = `<i class="fas fa-folder"></i> ${subCategory.name}`;
                
                const subGrid = document.createElement('div');
                subGrid.className = 'bookmark-grid';
                
                if (subBookmarks.length > 0) {
                    for (const bookmark of subBookmarks) {
                        const bookmarkElement = createBookmarkElement(bookmark);
                        subGrid.appendChild(bookmarkElement);
                    }
                } else {
                    const emptyMessage = document.createElement('p');
                    emptyMessage.className = 'empty-message';
                    emptyMessage.textContent = '该分类下暂无书签';
                    subGrid.appendChild(emptyMessage);
                }
                
                // 给书签网格添加拖拽事件处理
                setupBookmarkGridDragEvents(subGrid, subCategory.id);
                
                subSection.appendChild(subTitle);
                subSection.appendChild(subGrid);
                elements.bookmarksContainer.appendChild(subSection);
            }
        }
    } else {
        // 子分类：直接显示书签
        const bookmarkGrid = document.createElement('div');
        bookmarkGrid.className = 'bookmark-grid';
        
        if (currentCategoryBookmarks.length > 0) {
            for (const bookmark of currentCategoryBookmarks) {
                const bookmarkElement = createBookmarkElement(bookmark);
                bookmarkGrid.appendChild(bookmarkElement);
            }
        } else {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = '该分类下暂无书签';
            bookmarkGrid.appendChild(emptyMessage);
        }
        
        // 给书签网格添加拖拽事件处理
        setupBookmarkGridDragEvents(bookmarkGrid, state.currentCategory);
        
        elements.bookmarksContainer.appendChild(bookmarkGrid);
    }
}

// 设置书签网格的拖拽事件
function setupBookmarkGridDragEvents(gridElement, categoryId) {
    // 处理拖拽释放在空白区域事件
    gridElement.addEventListener('dragover', (e) => {
        // 清除所有事件，不创建占位符
        if (!e.target.closest('.bookmark-card')) {
            e.preventDefault();
        }
    });
    
    // 处理拖拽释放在空白区域事件
    gridElement.addEventListener('drop', async (e) => {
        // 确保是在书签卡片上的放置
        const targetElement = e.target.closest('.bookmark-card');
        if (!targetElement) {
            // 如果不是在书签上放置，不进行任何操作
            e.preventDefault();
        }
    });
}

function createBookmarkElement(bookmark) {
    const bookmarkCard = document.createElement('div');
    bookmarkCard.className = 'bookmark-card';
    bookmarkCard.dataset.id = bookmark.id;
    bookmarkCard.draggable = true;
    bookmarkCard.dataset.position = bookmark.position;
    bookmarkCard.dataset.categoryId = bookmark.category_id;
    
    if (state.selectedBookmarks.has(bookmark.id)) {
        bookmarkCard.classList.add('selected');
    }
    
    const title = document.createElement('div');
    title.className = 'bookmark-title';
    title.textContent = bookmark.title;
    
    const description = document.createElement('div');
    description.className = 'bookmark-description';
    description.textContent = bookmark.description || bookmark.url;
    
    const actions = document.createElement('div');
    actions.className = 'bookmark-actions';
    
    const openBtn = document.createElement('button');
    openBtn.className = 'open-btn';
    openBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> 打开';
    openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(bookmark.url, '_blank');
    });
    
    actions.appendChild(openBtn);
    
    bookmarkCard.appendChild(title);
    bookmarkCard.appendChild(description);
    bookmarkCard.appendChild(actions);
    
    // 事件监听
    bookmarkCard.addEventListener('click', (e) => {
        if (!e.target.closest('.open-btn')) {
            toggleBookmarkSelection(bookmark.id);
        }
    });
    
    bookmarkCard.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showBookmarkContextMenu(e, bookmark);
    });
    
    // 拖拽相关事件
    bookmarkCard.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', bookmark.id);
        state.draggedBookmark = bookmark;
        bookmarkCard.classList.add('dragging');
        
        // 设置延迟，保证拖拽开始时可见
        setTimeout(() => {
            bookmarkCard.style.opacity = '0.5';
        }, 0);
    });
    
    bookmarkCard.addEventListener('dragend', () => {
        bookmarkCard.classList.remove('dragging');
        bookmarkCard.style.opacity = '1';
        state.draggedBookmark = null;
    });
    
    bookmarkCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        
        if (!state.draggedBookmark || state.draggedBookmark.id === bookmark.id) {
            return;
        }
        
        // 只在同一分类内拖拽
        if (state.draggedBookmark.category_id === bookmark.category_id) {
            bookmarkCard.classList.add('drag-over');
        }
    });
    
    bookmarkCard.addEventListener('dragleave', () => {
        bookmarkCard.classList.remove('drag-over');
    });
    
    bookmarkCard.addEventListener('drop', async (e) => {
        e.preventDefault();
        bookmarkCard.classList.remove('drag-over');
        
        if (!state.draggedBookmark || state.draggedBookmark.id === bookmark.id) {
            return;
        }
        
        // 只在同一分类内处理
        if (state.draggedBookmark.category_id === bookmark.category_id) {
            // 判断拖放位置
            let newPosition;
            const bookmarkPosition = parseInt(bookmark.position);
            
            // 使用鼠标位置
            const bookmarkRect = bookmarkCard.getBoundingClientRect();
            const mouseX = e.clientX;
            const threshold = bookmarkRect.left + bookmarkRect.width / 2;
            
            if (mouseX < threshold) {
                newPosition = bookmarkPosition;
            } else {
                newPosition = bookmarkPosition + 1;
            }
            
            const container = bookmarkCard.closest('.bookmark-grid');
            
            try {
                // 添加轻量级加载指示器
                if (container) {
                    container.classList.add('loading');
                }
                
                // 发送API请求更新数据库
                const response = await fetch(`/api/bookmarks/${state.draggedBookmark.id}/position`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        position: newPosition,
                        category_id: bookmark.category_id
                    })
                });
                
                if (!response.ok) {
                    throw new Error('位置更新失败');
                }
                
                // 本地更新
                await fetchBookmarks(state.currentCategory);
                if (container) {
                    container.classList.remove('loading');
                }
                
                // 异步更新全局书签
                setTimeout(() => {
                    fetchAllBookmarks();
                }, 200);
                
            } catch (error) {
                console.error(error);
                showError('更新书签位置失败');
                if (container) {
                    container.classList.remove('loading');
                }
                await fetchBookmarks(state.currentCategory);
            }
        }
    });
    
    return bookmarkCard;
}

function renderCategoryTitle() {
    if (!state.currentCategory) {
        elements.categoryTitle.textContent = '';
        return;
    }
    
    const category = state.categories.find(c => c.id == state.currentCategory);
    if (category) {
        elements.categoryTitle.textContent = category.name;
    }
}

// 交互函数
function selectCategory(categoryId) {
    state.currentCategory = categoryId;
    
    // 更新UI激活状态
    document.querySelectorAll('.category-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const categoryItem = document.querySelector(`.category-item[data-id="${categoryId}"]`);
    if (categoryItem) {
        categoryItem.classList.add('active');
    }
    
    // 渲染分类标题
    renderCategoryTitle();
    
    // 重新获取书签
    fetchBookmarks(categoryId);
    
    // 清除选择
    clearSelection();
}

function toggleBookmarkSelection(bookmarkId) {
    if (state.selectedBookmarks.has(bookmarkId)) {
        state.selectedBookmarks.delete(bookmarkId);
    } else {
        state.selectedBookmarks.add(bookmarkId);
    }
    
    // 更新UI
    const bookmarkCard = document.querySelector(`.bookmark-card[data-id="${bookmarkId}"]`);
    if (bookmarkCard) {
        bookmarkCard.classList.toggle('selected', state.selectedBookmarks.has(bookmarkId));
    }
    
    // 更新多选工具栏
    updateMultiSelectToolbar();
}

function updateMultiSelectToolbar() {
    const count = state.selectedBookmarks.size;
    elements.selectedCount.textContent = `已选择: ${count}`;
    
    if (count > 0) {
        elements.multiSelectToolbar.classList.add('active');
    } else {
        elements.multiSelectToolbar.classList.remove('active');
    }
}

function clearSelection() {
    state.selectedBookmarks.clear();
    
    document.querySelectorAll('.bookmark-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    
    updateMultiSelectToolbar();
}

function openSelectedBookmarks() {
    const selectedIds = Array.from(state.selectedBookmarks);
    if (selectedIds.length === 0) return;
    
    // 按顺序打开所有选中的书签
    for (const id of selectedIds) {
        const bookmark = state.bookmarks.find(b => b.id == id);
        if (bookmark) {
            window.open(bookmark.url, '_blank');
        }
    }
}

// 模态框函数
function showCategoryModal(category = null, parentId = null) {
    const titleElement = document.getElementById('category-modal-title');
    const idInput = document.getElementById('category-id');
    const parentIdInput = document.getElementById('parent-id');
    const nameInput = document.getElementById('category-name');
    
    if (category) {
        titleElement.textContent = '编辑分类';
        idInput.value = category.id;
        nameInput.value = category.name;
        parentIdInput.value = category.parent_id || '';
    } else {
        titleElement.textContent = parentId ? '添加子分类' : '添加分类';
        idInput.value = '';
        nameInput.value = '';
        parentIdInput.value = parentId || '';
    }
    
    openModal(elements.categoryModal);
}

function showBookmarkModal(bookmark = null, categoryId = null) {
    const titleElement = document.getElementById('bookmark-modal-title');
    const idInput = document.getElementById('bookmark-id');
    const categoryIdInput = document.getElementById('bookmark-category-id');
    const titleInput = document.getElementById('bookmark-title');
    const urlInput = document.getElementById('bookmark-url');
    const descriptionInput = document.getElementById('bookmark-description');
    const categorySelect = document.getElementById('bookmark-category-select');
    
    // 填充分类选项
    categorySelect.innerHTML = '';
    for (const category of state.categories) {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.parent_id ? `  └ ${category.name}` : category.name;
        categorySelect.appendChild(option);
    }
    
    if (bookmark) {
        titleElement.textContent = '编辑书签';
        idInput.value = bookmark.id;
        titleInput.value = bookmark.title;
        urlInput.value = bookmark.url;
        descriptionInput.value = bookmark.description || '';
        categoryIdInput.value = bookmark.category_id;
        categorySelect.value = bookmark.category_id;
    } else {
        titleElement.textContent = '添加书签';
        idInput.value = '';
        titleInput.value = '';
        urlInput.value = '';
        descriptionInput.value = '';
        
        // 如果指定了分类ID，或当前有选中的分类
        const selectedCategoryId = categoryId || state.currentCategory;
        if (selectedCategoryId) {
            categoryIdInput.value = selectedCategoryId;
            categorySelect.value = selectedCategoryId;
        } else {
            // 默认选择第一个分类
            const firstCategory = state.categories[0];
            if (firstCategory) {
                categoryIdInput.value = firstCategory.id;
                categorySelect.value = firstCategory.id;
            }
        }
    }
    
    // 分类选择框事件监听
    categorySelect.addEventListener('change', () => {
        categoryIdInput.value = categorySelect.value;
    });
    
    openModal(elements.bookmarkModal);
}

function showMoveModal() {
    const selectElement = document.getElementById('target-category');
    selectElement.innerHTML = '';
    
    // 添加所有分类作为选项
    for (const category of state.categories) {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.parent_id ? `  └ ${category.name}` : category.name;
        selectElement.appendChild(option);
    }
    
    openModal(elements.moveModal);
}

function showConfirmModal(title, message, confirmCallback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    
    // 直接存储回调函数
    confirmActionCallback = confirmCallback;
    
    openModal(elements.confirmModal);
}

function confirmAction() {
    // 调用存储的回调函数
    if (typeof confirmActionCallback === 'function') {
        confirmActionCallback();
    }
    closeModal(elements.confirmModal);
    confirmActionCallback = null;
}

function confirmDeleteSelected() {
    if (state.selectedBookmarks.size === 0) return;
    
    const count = state.selectedBookmarks.size;
    showConfirmModal(
        '确认删除',
        `是否确认删除已选择的${count}个书签？此操作不可撤销。`,
        deleteSelectedBookmarks
    );
}

async function deleteSelectedBookmarks() {
    if (state.selectedBookmarks.size === 0) return;
    
    // 获取所有选中的书签ID并保存在数组中
    const bookmarkIds = Array.from(state.selectedBookmarks);
    let hasError = false;
    
    try {
        // 创建一个Promise数组，并行处理所有删除请求
        const deletePromises = bookmarkIds.map(async (id) => {
            try {
                const response = await fetch(`/api/bookmarks/${id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || `删除书签 ID ${id} 失败`);
                }
                
                return id; // 返回成功删除的ID
            } catch (error) {
                console.error(`删除书签 ID ${id} 时出错:`, error);
                hasError = true;
                return null; // 删除失败返回null
            }
        });
        
        // 等待所有删除请求完成
        const results = await Promise.all(deletePromises);
        
        // 从本地状态中移除成功删除的书签
        const successfullyDeletedIds = results.filter(id => id !== null);
        
        // 更新本地状态
        for (const id of successfullyDeletedIds) {
            // 从数组中移除
            const index = state.bookmarks.findIndex(b => b.id == id);
            if (index !== -1) {
                state.bookmarks.splice(index, 1);
            }
            
            // 从选中集合中移除
            state.selectedBookmarks.delete(id);
        }
        
        // 刷新视图
        renderBookmarks();
        updateMultiSelectToolbar();
        
        // 如果有错误，显示警告
        if (hasError) {
            showError('部分书签删除失败，请刷新页面后重试');
        }
    } catch (error) {
        console.error('批量删除书签时出错:', error);
        showError('删除书签失败，请刷新页面后重试');
    } finally {
        // 清除所有选择
        clearSelection();
    }
}

async function moveSelectedBookmarks() {
    const targetCategoryId = document.getElementById('target-category').value;
    
    if (!targetCategoryId) {
        showError('请选择目标分类');
        return;
    }
    
    const bookmarkIds = Array.from(state.selectedBookmarks);
    await moveBookmarks(bookmarkIds, targetCategoryId);
    
    closeModal(elements.moveModal);
}

function submitCategoryForm() {
    const idInput = document.getElementById('category-id');
    const parentIdInput = document.getElementById('parent-id');
    const nameInput = document.getElementById('category-name');
    
    const id = idInput.value;
    const parentId = parentIdInput.value || null;
    const name = nameInput.value.trim();
    
    if (!name) {
        showError('分类名称不能为空');
        return;
    }
    
    if (id) {
        // 更新现有分类
        updateCategory(id, name).then(success => {
            if (success) {
                closeModal(elements.categoryModal);
            }
        });
    } else {
        // 创建新分类
        createCategory(name, parentId).then(newCategory => {
            if (newCategory) {
                closeModal(elements.categoryModal);
            }
        });
    }
}

function submitBookmarkForm() {
    const idInput = document.getElementById('bookmark-id');
    const categoryIdInput = document.getElementById('bookmark-category-id');
    const titleInput = document.getElementById('bookmark-title');
    const urlInput = document.getElementById('bookmark-url');
    const descriptionInput = document.getElementById('bookmark-description');
    
    const id = idInput.value;
    const categoryId = categoryIdInput.value;
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    const description = descriptionInput.value.trim();
    
    if (!title || !url || !categoryId) {
        showError('标题、URL和分类不能为空');
        return;
    }
    
    if (id) {
        // 更新现有书签
        updateBookmark(id, title, url, description, categoryId).then(success => {
            if (success) {
                closeModal(elements.bookmarkModal);
                // 刷新所有书签以便搜索
                fetchAllBookmarks();
            }
        });
    } else {
        // 创建新书签
        createBookmark(title, url, description, categoryId).then(newBookmark => {
            if (newBookmark) {
                closeModal(elements.bookmarkModal);
                // 刷新所有书签以便搜索
                fetchAllBookmarks();
            }
        });
    }
}

// 上下文菜单函数
function showCategoryContextMenu(e, category) {
    const menu = elements.categoryContextMenu;
    
    // 设置菜单位置
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    
    // 存储分类ID
    menu.dataset.categoryId = category.id;
    
    // 控制子分类选项可见性
    const addSubcategoryItem = document.getElementById('add-subcategory');
    const moveCategoryItem = document.getElementById('move-category');
    
    // 检查是否有子分类
    const hasSubcategories = state.categories.some(c => c.parent_id == category.id);
    
    // 只有主分类可以添加子分类
    if (category.parent_id) {
        addSubcategoryItem.style.display = 'none';
    } else {
        addSubcategoryItem.style.display = 'flex';
    }
    
    // 如果有子分类，不显示移动选项
    if (hasSubcategories) {
        moveCategoryItem.style.display = 'none';
    } else {
        moveCategoryItem.style.display = 'flex';
    }
    
    // 显示菜单
    menu.style.display = 'block';
    
    // 隐藏书签上下文菜单
    elements.bookmarkContextMenu.style.display = 'none';
}

function showBookmarkContextMenu(e, bookmark) {
    const menu = elements.bookmarkContextMenu;
    
    // 设置菜单位置
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    
    // 存储书签ID
    menu.dataset.bookmarkId = bookmark.id;
    
    // 显示菜单
    menu.style.display = 'block';
    
    // 隐藏分类上下文菜单
    elements.categoryContextMenu.style.display = 'none';
}

function hideContextMenus() {
    elements.categoryContextMenu.style.display = 'none';
    elements.bookmarkContextMenu.style.display = 'none';
}

// 辅助函数
function openModal(modal) {
    modal.style.display = 'block';
}

function closeModal(modal) {
    modal.style.display = 'none';
}

function showError(message) {
    alert(message);
}

function showCategoryMoveModal(categoryId) {
    state.categoryToMove = categoryId;
    
    // 获取当前分类
    const categoryToMove = state.categories.find(c => c.id == categoryId);
    if (!categoryToMove) {
        showError('分类不存在');
        return;
    }
    
    // 填充目标父分类下拉框
    const targetParentSelect = document.getElementById('target-parent-category');
    targetParentSelect.innerHTML = '<option value="">作为主分类</option>';
    
    // 获取可选的父分类（只包括主分类，排除子分类和当前分类）
    const validParentCategories = state.categories.filter(c => {
        // 排除自身
        if (c.id == categoryId) return false;
        
        // 排除任何有父分类的分类（即子分类）
        if (c.parent_id) return false;
        
        return true;
    });
    
    // 添加选项
    for (const category of validParentCategories) {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        targetParentSelect.appendChild(option);
    }
    
    openModal(elements.categoryMoveModal);
}

async function moveCategoryToParent() {
    if (!state.categoryToMove) {
        showError('请选择要移动的分类');
        return;
    }
    
    const categoryId = state.categoryToMove;
    const targetParentId = document.getElementById('target-parent-category').value;
    
    try {
        // 检查要移动的分类
        const categoryToMove = state.categories.find(c => c.id == categoryId);
        if (!categoryToMove) {
            showError('分类不存在');
            return;
        }
        
        // 检查是否有子分类
        const hasSubcategories = state.categories.some(c => c.parent_id == categoryId);
        if (hasSubcategories) {
            showError('无法移动包含子目录的分类，请先移除所有子目录');
            return;
        }
        
        // 检查目标父分类，确保不会造成多层嵌套
        if (targetParentId) {
            const targetParent = state.categories.find(c => c.id == targetParentId);
            
            // 如果目标分类不是主分类，不允许移动
            if (targetParent && targetParent.parent_id) {
                showError('只能移动到主分类下，不能移动到子分类下');
                return;
            }
        }
        
        // 如果当前分类是主分类且有子分类，不允许移动到其他分类下
        if (!categoryToMove.parent_id && hasSubcategories) {
            showError('包含子目录的主分类不能移动');
            return;
        }
        
        const response = await fetch(`/api/categories/${categoryId}/move`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                parent_id: targetParentId || null
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '移动分类失败');
        }
        
        // 刷新分类列表
        await fetchCategories();
        
        closeModal(elements.categoryMoveModal);
        state.categoryToMove = null;
    } catch (error) {
        showError(error.message || '移动分类失败');
    }
}

function toggleSearchEngineDropdown() {
    elements.searchEngineDropdown.classList.toggle('show');
}

function setSearchEngine(engine, iconClass) {
    state.searchEngine.current = engine;
    elements.searchEngineIcon.className = iconClass;
}