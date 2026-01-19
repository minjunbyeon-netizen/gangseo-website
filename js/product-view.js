/**
 * Product Detail View Integration
 * Cafe24 상품 정보를 가져와서 렌더링
 */

(function () {
    'use strict';

    const CONFIG = {
        proxyUrl: 'proxy.php',
        containerId: 'product-detail-container',
        cachePrefix: 'product_view_',
        cacheTime: 10 * 60 * 1000 // 10분 캐시
    };

    /**
     * URL 파라미터 가져오기
     */
    function getParam(name) {
        const search = window.location.search;
        const params = new URLSearchParams(search);
        return params.get(name);
    }

    /**
     * 캐시 관리
     */
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
            // 무시
        }
    }

    // 페이지 로드시 실행
    document.addEventListener('DOMContentLoaded', function () {
        const productId = getParam('id');
        const container = document.getElementById(CONFIG.containerId);

        if (!productId) {
            if (container) container.innerHTML = '<div class="board-error"><p>잘못된 접근입니다.</p></div>';
            return;
        }

        loadProductDetail(productId, container);
    });

    /**
     * 상품 상세 정보 로드
     */
    function loadProductDetail(productId, container) {
        const cacheKey = `${CONFIG.cachePrefix}${productId}`;
        const cachedData = getCache(cacheKey);

        if (cachedData) {
            renderProductDetail(container, cachedData.data);
            return;
        }

        // AJAX 요청
        fetch(`${CONFIG.proxyUrl}?action=product_view&product_id=${productId}`)
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(data => {
                if (data.success && data.data) {
                    setCache(cacheKey, data);
                    renderProductDetail(container, data.data);
                } else {
                    container.innerHTML = '<div class="board-error"><p>상품 정보를 찾을 수 없습니다.</p></div>';
                }
            })
            .catch(error => {
                console.error('Product detail load error:', error);
                container.innerHTML = '<div class="board-error"><p>상품 정보를 불러오는 중 오류가 발생했습니다.</p></div>';
            });
    }

    /**
     * 상품 상세 렌더링
     */
    function renderProductDetail(container, product) {
        if (!container) return;

        // 페이지 타이틀 변경
        if (product.name) {
            document.title = `${product.name} | 부산강서시니어클럽`;
        }

        const html = `
            <div class="product-detail-header">
                <div class="product-detail-img">
                    <img src="${product.image || 'images/placeholder.png'}" alt="${escapeHtml(product.name)}">
                </div>
                <div class="product-detail-info">
                    <h3 class="product-detail-name">${escapeHtml(product.name)}</h3>
                    <div class="product-detail-price">${escapeHtml(product.price)}</div>
                    <div class="product-detail-guide">
                        <h4>구매 안내</h4>
                        <ul>
                            <li>모든 제품은 부산강서시니어클럽 어르신들이 직접 정성을 다해 만듭니다.</li>
                            <li>주문 및 문의: <strong>051) 973-1167</strong></li>
                            <li>단체 주문 및 대량 구매는 전화로 별도 문의 부탁드립니다.</li>
                            <li>배송 안내: 주문 확인 후 2~3일 이내 발송됩니다 (주말/공휴일 제외).</li>
                        </ul>
                    </div>
                </div>
            </div>
            
            <div class="product-detail-body">
                <h3>상세 정보</h3>
                <div class="product-content-area">
                    ${product.content || '<p style="text-align:center; color:#999; padding:50px 0;">상세 이미지 준비 중입니다.</p>'}
                </div>
            </div>
        `;

        container.innerHTML = html;

        // 상세 내용 내부의 스타일 조정 (옵션)
        const contentArea = container.querySelector('.product-content-area');
        if (contentArea) {
            // Cafe24 특유의 스타일이 레이아웃을 깨뜨릴 수 있으므로 일부 조정
            const elements = contentArea.querySelectorAll('*');
            elements.forEach(el => {
                if (el.style.width) el.style.maxWidth = '100%';
            });

            // Cafe24 이미지 lazy loading 속성 및 프로토콜 처리
            const allImages = contentArea.querySelectorAll('img');
            allImages.forEach(img => {
                const dataSrc = img.getAttribute('ec-data-src') || img.getAttribute('data-src') || img.getAttribute('org_src');
                if (dataSrc && (!img.src || img.src.includes('placeholder') || img.src.length < 10)) {
                    // 프로토콜 처리
                    let finalSrc = dataSrc;
                    if (finalSrc.startsWith('//')) {
                        finalSrc = 'https:' + finalSrc;
                    } else if (finalSrc.startsWith('/') && !finalSrc.startsWith('//')) {
                        finalSrc = 'https://gs2015.kr' + finalSrc;
                    }
                    img.src = finalSrc;
                }

                // 깨진 이미지 처리
                img.onerror = function () {
                    this.src = 'images/placeholder.png';
                    this.style.opacity = '0.5';
                };
            });
        }
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
