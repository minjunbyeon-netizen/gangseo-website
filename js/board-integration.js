/**
 * Cafe24 Board Integration with Caching
 * Cafe24 게시판 콘텐츠를 가져와서 현재 페이지에 렌더링
 * LocalStorage 캐싱 + 스켈레톤 로딩 지원
 */

(function () {
    'use strict';

    // 게시판 설정
    const BOARDS = {
        jobs: {
            boardNo: 2,
            listContainerId: 'jobs-list-container',
            paginationId: 'jobs-pagination',
            articleContainerId: 'article-view-container',
            listPage: 'jobs.html',
            viewPage: 'job-view.html'
        },
        notice: {
            boardNo: 1,
            listContainerId: 'notice-list-container',
            paginationId: 'notice-pagination',
            articleContainerId: 'notice-article-view-container',
            listPage: 'notice.html',
            viewPage: 'notice-view.html'
        },
        gallery: {
            boardNo: 8,
            listContainerId: 'gallery-list-container',
            paginationId: 'gallery-pagination',
            articleContainerId: 'gallery-article-view-container',
            listPage: 'gallery.html',
            viewPage: 'gallery-view.html'
        }
    };

    const CONFIG = {
        proxyUrl: 'https://gangseo-proxy.minjunbyeon.workers.dev',
        cachePrefix: 'board_cache_',
        listCacheTime: 3 * 60 * 1000,    // 목록 캐시: 3분
        articleCacheTime: 5 * 60 * 1000  // 글 캐시: 5분
    };

    /**
     * 캐시 관리 함수들
     */
    function getCacheKey(type, boardNo, page, articleId) {
        return `${CONFIG.cachePrefix}${type}_${boardNo}_${page || 0}_${articleId || 0}`;
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
            // localStorage 용량 초과 시 오래된 캐시 정리
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
        const urlParams = new URLSearchParams(window.location.search);

        // 각 게시판별로 확인
        for (const [boardKey, board] of Object.entries(BOARDS)) {
            // 상세 보기 페이지 확인
            const articleContainer = document.getElementById(board.articleContainerId);
            if (articleContainer) {
                const articleId = urlParams.get('id');
                if (articleId) {
                    loadArticleDetail(board.boardNo, articleId, articleContainer);
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
     * 게시판 목록 로드
     */
    function loadBoardList(board, page) {
        const container = document.getElementById(board.listContainerId);
        const paginationContainer = document.getElementById(board.paginationId);

        if (!container) return;

        // 캐시 확인
        const cacheKey = getCacheKey('list', board.boardNo, page, 0);
        const cachedData = getCache(cacheKey, CONFIG.listCacheTime);

        if (cachedData) {
            // 캐시에서 즉시 렌더링
            renderBoardContent(board, container, paginationContainer, cachedData);
            return;
        }

        // 스켈레톤 로딩 표시
        const skeletonType = board.boardNo === 8 ? 'gallery' : (board.boardNo === 2 ? 'jobs' : 'table');
        container.innerHTML = getSkeletonHTML(skeletonType);

        // AJAX 요청
        fetch(`${CONFIG.proxyUrl}?action=list&board_no=${board.boardNo}&page=${page}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data && data.data.length > 0) {
                    // 캐시 저장
                    setCache(cacheKey, data);
                    // 렌더링
                    renderBoardContent(board, container, paginationContainer, data);
                } else {
                    container.innerHTML = '<div class="board-empty"><p>등록된 게시글이 없습니다.</p></div>';
                }
            })
            .catch(error => {
                console.error('Board load error:', error);
                container.innerHTML = '<div class="board-error"><p>게시글을 불러오는 중 오류가 발생했습니다.</p></div>';
            });
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
     * 게시글 상세 로드
     */
    function loadArticleDetail(boardNo, articleId, container) {
        // 캐시 확인
        const cacheKey = getCacheKey('view', boardNo, 0, articleId);
        const cachedData = getCache(cacheKey, CONFIG.articleCacheTime);

        if (cachedData) {
            renderArticleDetail(container, cachedData.data);
            if (cachedData.data.title) {
                document.title = cachedData.data.title + ' | 부산강서시니어클럽';
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

        // AJAX 요청
        fetch(`${CONFIG.proxyUrl}?action=view&board_no=${boardNo}&article_id=${articleId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data) {
                    // 캐시 저장
                    setCache(cacheKey, data);
                    renderArticleDetail(container, data.data);
                    // 페이지 타이틀 업데이트
                    if (data.data.title) {
                        document.title = data.data.title + ' | 부산강서시니어클럽';
                    }
                } else {
                    container.innerHTML = '<div class="board-error"><p>게시글을 찾을 수 없습니다.</p></div>';
                }
            })
            .catch(error => {
                console.error('Article load error:', error);
                container.innerHTML = '<div class="board-error"><p>게시글을 불러오는 중 오류가 발생했습니다.</p></div>';
            });
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

            html += `
                <div class="job-item">
                    <div class="job-badge ${badgeClass}">${item.type}</div>
                    <div class="job-info">
                        <h4><a href="${localLink}">${escapeHtml(item.title)}</a></h4>
                        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
                    </div>
                    <div class="job-date">${item.date}</div>
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

            html += `
                <a href="${localLink}" class="gallery-card">
                    <div class="gallery-card-img">
                        <img src="${thumbnail}" alt="${escapeHtml(item.title)}" onerror="this.src='images/placeholder.png'" loading="lazy">
                    </div>
                    <div class="gallery-card-info">
                        <h4 class="gallery-card-title">${escapeHtml(item.title)}</h4>
                        <span class="gallery-card-date">${item.date}</span>
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
        // 첨부파일을 이미지와 기타 파일로 분류
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

        // 이미지 갤러리 섹션 생성
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

        // 기타 다운로드 파일 섹션 생성
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

        const html = `
            <div class="article-header">
                <h3 class="article-title">${escapeHtml(article.title)}</h3>
                <div class="article-meta">
                    <span class="article-date">${article.date}</span>
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
     * 페이지네이션 렌더링 (화살표 버튼 + 페이지 번호 제한)
     */
    function renderPagination(container, pagination) {
        if (!container || !pagination) return;

        let html = '';
        const currentPage = pagination.current || 1;
        const totalPages = pagination.total || 1;
        const maxVisiblePages = 5; // 항상 5개의 페이지 번호만 표시

        // 페이지 번호 범위 계산
        let startPage, endPage;
        if (totalPages <= maxVisiblePages) {
            // 전체 페이지가 최대 표시 개수보다 적으면 모두 표시
            startPage = 1;
            endPage = totalPages;
        } else {
            // 현재 페이지를 중심으로 범위 계산
            const halfVisible = Math.floor(maxVisiblePages / 2);
            startPage = Math.max(1, currentPage - halfVisible);
            endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

            // 끝에 도달했을 때 시작 페이지 조정
            if (endPage - startPage < maxVisiblePages - 1) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }
        }

        // 이전 페이지 버튼 (<)
        if (currentPage > 1) {
            html += `<a href="?page=${currentPage - 1}" class="page-btn page-prev" title="이전 페이지">&lsaquo;</a>`;
        } else {
            html += `<button class="page-btn page-prev" disabled title="이전 페이지">&lsaquo;</button>`;
        }

        // 페이지 번호 (5개만 표시)
        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === currentPage ? 'active' : '';
            html += `<a href="?page=${i}" class="page-btn ${activeClass}">${i}</a>`;
        }

        // 다음 페이지 버튼 (>)
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
