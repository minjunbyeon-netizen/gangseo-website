/**
 * Cafe24 Product Integration
 * Cafe24 상품 목록을 가져와서 현재 페이지에 렌더링
 */

(function () {
    'use strict';

    // 카테고리 설정
    const CATEGORIES = {
        all: { cateNo: 23, containerId: 'products-all-container', name: '전체상품' },
        sesame: { cateNo: 24, containerId: 'products-sesame-container', name: '정일품참기름' },
        drinks: { cateNo: 25, containerId: 'products-drinks-container', name: '액상차&즙' },
        coffee: { cateNo: 28, containerId: 'products-coffee-container', name: '더치커피' }
    };

    const CONFIG = {
        proxyUrl: 'https://gangseo-proxy.minjunbyeon.workers.dev',
        cachePrefix: 'product_cache_',
        cacheTime: 5 * 60 * 1000  // 5분 캐시
    };

    /**
     * 캐시 관리
     */
    function getCacheKey(cateNo, page) {
        return `${CONFIG.cachePrefix}${cateNo}_${page}`;
    }

    function getCache(key) {
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > CONFIG.cacheTime) {
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
            // localStorage 용량 초과 시 무시
        }
    }

    /**
     * 스켈레톤 HTML
     */
    function getSkeletonHTML() {
        return `
            <div class="skeleton-container skeleton-products">
                ${Array(4).fill(`
                    <div class="skeleton-product-card">
                        <div class="skeleton skeleton-product-img"></div>
                        <div class="skeleton skeleton-product-name"></div>
                        <div class="skeleton skeleton-product-price"></div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // 페이지 로드시 실행
    document.addEventListener('DOMContentLoaded', function () {
        // 각 카테고리별로 확인하고 로드
        for (const [key, category] of Object.entries(CATEGORIES)) {
            const container = document.getElementById(category.containerId);
            if (container) {
                loadProductList(category.cateNo, 1, container);
            }
        }
    });

    /**
     * 상품 목록 로드
     */
    function loadProductList(cateNo, page, container) {
        // 캐시 확인
        const cacheKey = getCacheKey(cateNo, page);
        const cachedData = getCache(cacheKey);

        if (cachedData) {
            renderProductList(container, cachedData.data);
            return;
        }

        // 스켈레톤 로딩 표시
        container.innerHTML = getSkeletonHTML();

        // AJAX 요청
        fetch(`${CONFIG.proxyUrl}?action=products&cate_no=${cateNo}&page=${page}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.data && data.data.length > 0) {
                    // 캐시 저장
                    setCache(cacheKey, data);
                    // 렌더링
                    renderProductList(container, data.data);
                } else {
                    container.innerHTML = '<div class="board-empty"><p>등록된 상품이 없습니다.</p></div>';
                }
            })
            .catch(error => {
                console.error('Product load error:', error);
                container.innerHTML = '<div class="board-error"><p>상품을 불러오는 중 오류가 발생했습니다.</p></div>';
            });
    }

    /**
     * 상품 목록 렌더링
     */
    function renderProductList(container, items) {
        let html = '';

        items.forEach(item => {
            const image = item.image || 'images/placeholder.png';
            const price = item.price || '가격문의';

            html += `
                <a href="product-view.html?id=${item.id}" class="product-item">
                    <div class="product-item-img">
                        <img src="${image}" alt="${escapeHtml(item.name)}" onerror="this.src='images/placeholder.png'" loading="lazy">
                    </div>
                    <div class="product-item-info">
                        <h4 class="product-item-name">${escapeHtml(item.name)}</h4>
                        <p class="product-item-price">${escapeHtml(price)}</p>
                    </div>
                </a>
            `;
        });

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
