/**
 * Board Integration with Firebase Firestore
 * Firestore에서 게시판 콘텐츠를 가져와서 렌더링
 * LocalStorage 캐싱 + 스켈레톤 로딩 지원
 */

(function () {
    'use strict';

    // 게시판 설정
    const BOARDS = {
        jobs: {
            boardNo: 2,
            firestoreCollection: 'jobs',
            listContainerId: 'jobs-list-container',
            paginationId: 'jobs-pagination',
            articleContainerId: 'article-view-container',
            listPage: 'jobs.html',
            viewPage: 'job-view.html'
        },
        notice: {
            boardNo: 1,
            firestoreCollection: 'notice',
            listContainerId: 'notice-list-container',
            paginationId: 'notice-pagination',
            articleContainerId: 'notice-article-view-container',
            listPage: 'notice.html',
            viewPage: 'notice-view.html'
        },
        gallery: {
            boardNo: 8,
            firestoreCollection: 'gallery',
            listContainerId: 'gallery-list-container',
            paginationId: 'gallery-pagination',
            articleContainerId: 'gallery-article-view-container',
            listPage: 'gallery.html',
            viewPage: 'gallery-view.html'
        }
    };

    const CONFIG = {
        cachePrefix: 'board_cache_',
        listCacheTime: 3 * 60 * 1000,    // 목록 캐시: 3분
        articleCacheTime: 5 * 60 * 1000,  // 글 캐시: 5분
        pageSize: 10                       // 페이지당 글 수
    };

    // Firebase 초기화 (firebase-config.js에서 가져온 설정 사용)
    let db = null;

    function initFirebase() {
        if (db) return;
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
            console.error('Firebase SDK or config not loaded');
            return;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
    }

    /**
     * 캐시 관리 함수들
     */
    function getCacheKey(type, boardCollection, page, articleId) {
        return `${CONFIG.cachePrefix}${type}_${boardCollection}_${page || 0}_${articleId || 0}`;
    }

    function getCache(key, maxAge) {
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > maxAge) {
                localStorage.removeItem(key);
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    function setCache(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({
                data: data,
                timestamp: Date.now()
            }));
        } catch (e) {
            clearOldCache();
        }
    }

    function clearOldCache() {
        const prefix = CONFIG.cachePrefix;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                localStorage.removeItem(key);
            }
        }
    }

    /**
     * 스켈레톤 로딩 HTML 생성
     */
    function getSkeletonHTML(type) {
        if (type === 'table') {
            return `
                <div class="skeleton-container">
                    ${Array(5).fill(`
                        <div class="skeleton-row">
                            <div class="skeleton skeleton-num"></div>
                            <div class="skeleton skeleton-title"></div>
                            <div class="skeleton skeleton-date"></div>
                            <div class="skeleton skeleton-views"></div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (type === 'jobs') {
            return `
                <div class="skeleton-container">
                    ${Array(5).fill(`
                        <div class="skeleton-job-item">
                            <div class="skeleton skeleton-badge"></div>
                            <div class="skeleton skeleton-job-title"></div>
                            <div class="skeleton skeleton-job-date"></div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (type === 'gallery') {
            return `
                <div class="skeleton-container skeleton-gallery">
                    ${Array(6).fill(`
                        <div class="skeleton-gallery-card">
                            <div class="skeleton skeleton-img"></div>
                            <div class="skeleton skeleton-gallery-title"></div>
                            <div class="skeleton skeleton-gallery-date"></div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        return '<div class="board-loading"><p>게시글을 불러오는 중...</p></div>';
    }

    // 페이지 로드시 실행
    document.addEventListener('DOMContentLoaded', function () {
        initFirebase();
        const urlParams = new URLSearchParams(window.location.search);

        // 각 게시판별로 확인
        for (const [boardKey, board] of Object.entries(BOARDS)) {
            // 상세 보기 페이지 확인
            const articleContainer = document.getElementById(board.articleContainerId);
            if (articleContainer) {
                const articleId = urlParams.get('id');
                if (articleId) {
                    loadArticleDetail(board, articleId, articleContainer);
                } else {
                    articleContainer.innerHTML = '<div class="board-error"><p>게시글을 찾을 수 없습니다.</p></div>';
                }
                return;
            }

            // 목록 페이지 확인
            const listContainer = document.getElementById(board.listContainerId);
            if (listContainer) {
                const page = parseInt(urlParams.get('page')) || 1;
                loadBoardList(board, page);
                return;
            }
        }
    });

    /**
     * Firestore에서 게시판 목록 로드
     */
    async function loadBoardList(board, page) {
        const container = document.getElementById(board.listContainerId);
        const paginationContainer = document.getElementById(board.paginationId);

        if (!container || !db) return;

        // 캐시 확인
        const cacheKey = getCacheKey('list', board.firestoreCollection, page, 0);
        const cachedData = getCache(cacheKey, CONFIG.listCacheTime);

        if (cachedData) {
            renderBoardContent(board, container, paginationContainer, cachedData);
            return;
        }

        // 스켈레톤 로딩 표시
        const skeletonType = board.boardNo === 8 ? 'gallery' : (board.boardNo === 2 ? 'jobs' : 'table');
        container.innerHTML = getSkeletonHTML(skeletonType);

        try {
            // 전체 문서 수 가져오기 (페이지네이션용)
            const countSnapshot = await db.collection('boards')
                .doc(board.firestoreCollection)
                .collection('articles')
                .get();
            const totalItems = countSnapshot.size;
            const totalPages = Math.ceil(totalItems / CONFIG.pageSize);

            // 페이지에 해당하는 문서 가져오기
            let query = db.collection('boards')
                .doc(board.firestoreCollection)
                .collection('articles')
                .orderBy('date', 'desc');

            // 페이지 오프셋 계산
            if (page > 1) {
                const skipCount = (page - 1) * CONFIG.pageSize;
                const skipSnapshot = await db.collection('boards')
                    .doc(board.firestoreCollection)
                    .collection('articles')
                    .orderBy('date', 'desc')
                    .limit(skipCount)
                    .get();

                if (skipSnapshot.docs.length > 0) {
                    const lastDoc = skipSnapshot.docs[skipSnapshot.docs.length - 1];
                    query = query.startAfter(lastDoc);
                }
            }

            const snapshot = await query.limit(CONFIG.pageSize).get();

            const items = [];
            let num = totalItems - ((page - 1) * CONFIG.pageSize);
            snapshot.forEach(doc => {
                const data = doc.data();
                items.push({
                    id: doc.id,
                    num: num--,
                    title: data.title || '',
                    date: data.date || '',
                    type: data.type || '',
                    views: data.views || 0,
                    thumbnail: data.thumbnail || '',
                    isNotice: data.isNotice || false
                });
            });

            const result = {
                success: true,
                data: items,
                pagination: {
                    current: page,
                    total: totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            };

            // 캐시 저장
            setCache(cacheKey, result);
            renderBoardContent(board, container, paginationContainer, result);

        } catch (error) {
            console.error('Board load error:', error);
            container.innerHTML = '<div class="board-error"><p>게시글을 불러오는 중 오류가 발생했습니다.</p></div>';
        }
    }

    /**
     * 게시판 콘텐츠 렌더링
     */
    function renderBoardContent(board, container, paginationContainer, data) {
        if (board.boardNo === 2) {
            renderJobsList(container, data.data, board.viewPage);
        } else if (board.boardNo === 8) {
            renderGalleryList(container, data.data, board.viewPage);
        } else {
            renderNoticeList(container, data.data, board.viewPage);
        }
        renderPagination(paginationContainer, data.pagination);
    }

    /**
     * Firestore에서 게시글 상세 로드 + 조회수 증가
     */
    async function loadArticleDetail(board, articleId, container) {
        // 캐시 확인
        const cacheKey = getCacheKey('view', board.firestoreCollection, 0, articleId);
        const cachedData = getCache(cacheKey, CONFIG.articleCacheTime);

        if (cachedData) {
            renderArticleDetail(container, cachedData);
            if (cachedData.title) {
                document.title = cachedData.title + ' | 부산강서시니어클럽';
            }
            return;
        }

        // 로딩 표시
        container.innerHTML = `
            <div class="skeleton-article">
                <div class="skeleton skeleton-article-title"></div>
                <div class="skeleton skeleton-article-meta"></div>
                <div class="skeleton skeleton-article-content"></div>
            </div>
        `;

        try {
            const docRef = db.collection('boards')
                .doc(board.firestoreCollection)
                .collection('articles')
                .doc(articleId);

            // 조회수 증가 (비동기, 실패해도 무시)
            docRef.update({
                views: firebase.firestore.FieldValue.increment(1)
            }).catch(function () { /* 조회수 증가 실패 무시 */ });

            const doc = await docRef.get();

            if (doc.exists) {
                const article = { id: doc.id, ...doc.data() };
                // content_html → content 필드 매핑 (렌더링 함수 호환)
                article.content = article.content_html || '';
                // 조회수 반영 (increment 직후이므로 +1)
                article.views = (article.views || 0) + 1;

                // 캐시 저장
                setCache(cacheKey, article);
                renderArticleDetail(container, article);

                if (article.title) {
                    document.title = article.title + ' | 부산강서시니어클럽';
                }
            } else {
                container.innerHTML = '<div class="board-error"><p>게시글을 찾을 수 없습니다.</p></div>';
            }
        } catch (error) {
            console.error('Article load error:', error);
            container.innerHTML = '<div class="board-error"><p>게시글을 불러오는 중 오류가 발생했습니다.</p></div>';
        }
    }

    /**
     * 구인/구직 목록 렌더링
     */
    function renderJobsList(container, items, viewPage) {
        let html = '';

        items.forEach(item => {
            const badgeClass = item.type === '구직' ? 'seeking' : 'hiring';
            const description = item.description || '';
            const localLink = `${viewPage}?id=${item.id}`;

            const views = item.views || 0;

            html += `
                <div class="job-item">
                    <div class="job-badge ${badgeClass}">${item.type}</div>
                    <div class="job-info">
                        <h4><a href="${localLink}">${escapeHtml(item.title)}</a></h4>
                        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
                    </div>
                    <div class="job-meta">
                        <div class="job-date">${item.date}</div>
                        <div class="job-views">조회 ${views}</div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * 알림사항 목록 렌더링 (테이블 형식)
     */
    function renderNoticeList(container, items, viewPage) {
        let html = `
            <table class="board-table">
                <thead>
                    <tr>
                        <th class="num">번호</th>
                        <th class="title">제목</th>
                        <th class="date">작성일</th>
                        <th class="views">조회</th>
                    </tr>
                </thead>
                <tbody>
        `;

        items.forEach((item, index) => {
            const localLink = `${viewPage}?id=${item.id}`;
            const isNotice = item.isNotice || false;
            const numDisplay = isNotice ? '<span class="notice-badge">공지</span>' : item.num || (items.length - index);
            const views = item.views || '-';

            html += `
                <tr${isNotice ? ' class="notice-row"' : ''}>
                    <td class="num">${numDisplay}</td>
                    <td class="title"><a href="${localLink}">${escapeHtml(item.title)}</a></td>
                    <td class="date">${item.date}</td>
                    <td class="views">${views}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    }

    /**
     * 갤러리 목록 렌더링
     */
    function renderGalleryList(container, items, viewPage) {
        let html = '';

        items.forEach(item => {
            const localLink = `${viewPage}?id=${item.id}`;
            const thumbnail = item.thumbnail || 'images/placeholder.png';

            const views = item.views || 0;

            html += `
                <a href="${localLink}" class="gallery-card">
                    <div class="gallery-card-img">
                        <img src="${thumbnail}" alt="${escapeHtml(item.title)}" onerror="this.src='images/placeholder.png'" loading="lazy">
                    </div>
                    <div class="gallery-card-info">
                        <h4 class="gallery-card-title">${escapeHtml(item.title)}</h4>
                        <div class="gallery-card-meta">
                            <span class="gallery-card-date">${item.date}</span>
                            <span class="gallery-card-views">조회 ${views}</span>
                        </div>
                    </div>
                </a>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * 이미지 파일 확장자 확인
     */
    function isImageFile(filename) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
        const lowerName = (filename || '').toLowerCase();
        return imageExtensions.some(ext => lowerName.endsWith(ext));
    }

    /**
     * 게시글 상세 렌더링
     */
    function renderArticleDetail(container, article) {
        let imageFiles = [];
        let otherFiles = [];

        if (article.attachments && article.attachments.length > 0) {
            article.attachments.forEach(file => {
                if (isImageFile(file.name) || isImageFile(file.url)) {
                    imageFiles.push(file);
                } else {
                    otherFiles.push(file);
                }
            });
        }

        let imagesHtml = '';
        if (imageFiles.length > 0) {
            imagesHtml = `
                <div class="article-images">
                    <div class="article-images-grid">
                        ${imageFiles.map(file => `
                            <div class="article-image-item">
                                <a href="${file.url}" target="_blank" rel="noopener noreferrer">
                                    <img src="${file.url}" alt="${escapeHtml(file.name)}" loading="lazy" onerror="this.parentElement.style.display='none'">
                                </a>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        let attachmentsHtml = '';
        if (otherFiles.length > 0) {
            attachmentsHtml = `
                <div class="article-attachments">
                    <h4 class="attachments-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                        </svg>
                        첨부파일
                    </h4>
                    <ul class="attachments-list">
                        ${otherFiles.map(file => `
                            <li class="attachment-item">
                                <a href="${file.url}" target="_blank" rel="noopener noreferrer" class="attachment-link">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="7 10 12 15 17 10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                    <span class="attachment-name">${escapeHtml(file.name)}</span>
                                </a>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        const views = article.views || 0;

        const html = `
            <div class="article-header">
                <h3 class="article-title">${escapeHtml(article.title)}</h3>
                <div class="article-meta">
                    <span class="article-date">${article.date}</span>
                    <span class="article-views">조회 ${views}</span>
                </div>
            </div>
            ${imagesHtml}
            <div class="article-content">
                ${article.content || '<p>내용이 없습니다.</p>'}
            </div>
            ${attachmentsHtml}
        `;

        container.innerHTML = html;
    }

    /**
     * 페이지네이션 렌더링
     */
    function renderPagination(container, pagination) {
        if (!container || !pagination) return;

        let html = '';
        const currentPage = pagination.current || 1;
        const totalPages = pagination.total || 1;
        const maxVisiblePages = 5;

        let startPage, endPage;
        if (totalPages <= maxVisiblePages) {
            startPage = 1;
            endPage = totalPages;
        } else {
            const halfVisible = Math.floor(maxVisiblePages / 2);
            startPage = Math.max(1, currentPage - halfVisible);
            endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
            if (endPage - startPage < maxVisiblePages - 1) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }
        }

        if (currentPage > 1) {
            html += `<a href="?page=${currentPage - 1}" class="page-btn page-prev" title="이전 페이지">&lsaquo;</a>`;
        } else {
            html += `<button class="page-btn page-prev" disabled title="이전 페이지">&lsaquo;</button>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === currentPage ? 'active' : '';
            html += `<a href="?page=${i}" class="page-btn ${activeClass}">${i}</a>`;
        }

        if (currentPage < totalPages) {
            html += `<a href="?page=${currentPage + 1}" class="page-btn page-next" title="다음 페이지">&rsaquo;</a>`;
        } else {
            html += `<button class="page-btn page-next" disabled title="다음 페이지">&rsaquo;</button>`;
        }

        container.innerHTML = html;
    }

    /**
     * HTML 이스케이프
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

})();
