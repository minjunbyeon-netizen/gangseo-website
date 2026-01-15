/**
 * Cafe24 Board Integration
 * Cafe24 게시판 콘텐츠를 가져와서 현재 페이지에 렌더링
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
        }
    };

    const CONFIG = {
        proxyUrl: 'proxy.php'
    };

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

        // 로딩 표시
        container.innerHTML = '<div class="board-loading"><p>게시글을 불러오는 중...</p></div>';

        // AJAX 요청
        fetch(`${CONFIG.proxyUrl}?action=list&board_no=${board.boardNo}&page=${page}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data && data.data.length > 0) {
                    // 게시판 종류에 따라 다른 렌더링
                    if (board.boardNo === 2) {
                        renderJobsList(container, data.data, board.viewPage);
                    } else {
                        renderNoticeList(container, data.data, board.viewPage);
                    }
                    renderPagination(paginationContainer, data.pagination);
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
     * 게시글 상세 로드
     */
    function loadArticleDetail(boardNo, articleId, container) {
        // 로딩 표시
        container.innerHTML = '<div class="board-loading"><p>게시글을 불러오는 중...</p></div>';

        // AJAX 요청
        fetch(`${CONFIG.proxyUrl}?action=view&board_no=${boardNo}&article_id=${articleId}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data) {
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
     * 알림사항 목록 렌더링
     */
    function renderNoticeList(container, items, viewPage) {
        let html = '';
        let index = items.length;

        items.forEach(item => {
            const localLink = `${viewPage}?id=${item.id}`;

            html += `
                <div class="notice-item">
                    <div class="notice-num">${index--}</div>
                    <div class="notice-info">
                        <h4><a href="${localLink}">${escapeHtml(item.title)}</a></h4>
                    </div>
                    <div class="notice-date">${item.date}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * 게시글 상세 렌더링
     */
    function renderArticleDetail(container, article) {
        const html = `
            <div class="article-header">
                <h3 class="article-title">${escapeHtml(article.title)}</h3>
                <div class="article-meta">
                    <span class="article-date">${article.date}</span>
                </div>
            </div>
            <div class="article-content">
                ${article.content || '<p>내용이 없습니다.</p>'}
            </div>
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

        // 이전 버튼
        if (pagination.hasPrev) {
            html += `<a href="?page=${currentPage - 1}" class="page-btn prev">이전</a>`;
        }

        // 페이지 번호
        for (let i = 1; i <= totalPages; i++) {
            const activeClass = i === currentPage ? 'active' : '';
            html += `<a href="?page=${i}" class="page-btn ${activeClass}">${i}</a>`;
        }

        // 다음 버튼
        if (pagination.hasNext) {
            html += `<a href="?page=${currentPage + 1}" class="page-btn next">다음</a>`;
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
