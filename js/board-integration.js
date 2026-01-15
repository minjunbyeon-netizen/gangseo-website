/**
 * Cafe24 Board Integration
 * Cafe24 게시판 콘텐츠를 가져와서 현재 페이지에 렌더링
 */

(function () {
    'use strict';

    // 설정
    const CONFIG = {
        proxyUrl: 'proxy.php',
        boardNo: 2,  // 구인/구직 게시판
        containerId: 'jobs-list-container',
        paginationId: 'jobs-pagination'
    };

    // 페이지 로드시 실행
    document.addEventListener('DOMContentLoaded', function () {
        // jobs.html 페이지인지 확인
        const container = document.getElementById(CONFIG.containerId);
        if (!container) return;

        // URL에서 페이지 번호 가져오기
        const urlParams = new URLSearchParams(window.location.search);
        const page = parseInt(urlParams.get('page')) || 1;

        // 게시글 목록 로드
        loadBoardList(page);
    });

    /**
     * 게시판 목록 로드
     */
    function loadBoardList(page) {
        const container = document.getElementById(CONFIG.containerId);
        const paginationContainer = document.getElementById(CONFIG.paginationId);

        if (!container) return;

        // 로딩 표시
        container.innerHTML = '<div class="board-loading"><p>게시글을 불러오는 중...</p></div>';

        // AJAX 요청
        fetch(`${CONFIG.proxyUrl}?action=list&board_no=${CONFIG.boardNo}&page=${page}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data && data.data.length > 0) {
                    renderJobsList(container, data.data);
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
     * 구인/구직 목록 렌더링
     */
    function renderJobsList(container, items) {
        let html = '';

        items.forEach(item => {
            const badgeClass = item.type === '구직' ? 'seeking' : 'hiring';
            const description = item.description || '';

            html += `
                <div class="job-item">
                    <div class="job-badge ${badgeClass}">${item.type}</div>
                    <div class="job-info">
                        <h4><a href="${item.link}" target="_blank">${escapeHtml(item.title)}</a></h4>
                        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
                    </div>
                    <div class="job-date">${item.date}</div>
                </div>
            `;
        });

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
