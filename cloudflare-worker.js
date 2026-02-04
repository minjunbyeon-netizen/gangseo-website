/**
 * Cloudflare Worker - Cafe24 Proxy
 * GitHub Pages에서 Cafe24 데이터를 가져오기 위한 프록시
 * 직접 Cafe24 페이지를 파싱하여 JSON으로 반환
 */

// 허용된 origin 목록
const ALLOWED_ORIGINS = [
    'https://2026.gs2015.kr',
    'https://minjunbyeon-netizen.github.io',
    'http://localhost',
    'http://127.0.0.1'
];

// CORS 헤더 설정
function corsHeaders(origin) {
    const allowedOrigin = ALLOWED_ORIGINS.find(o => origin?.startsWith(o.replace(/:\d+$/, ''))) || ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json; charset=utf-8'
    };
}

export default {
    async fetch(request) {
        const origin = request.headers.get('Origin');

        // OPTIONS 요청 (CORS preflight) 처리
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders(origin) });
        }

        const url = new URL(request.url);
        const action = url.searchParams.get('action') || 'list';
        const boardNo = url.searchParams.get('board_no') || '2';
        const page = url.searchParams.get('page') || '1';
        const articleId = url.searchParams.get('article_id') || '0';
        const cateNo = url.searchParams.get('cate_no') || '23';
        const productId = url.searchParams.get('product_id') || '0';

        try {
            let result;

            if (action === 'products') {
                result = await fetchProductList(cateNo, page);
            } else if (action === 'product_view' && productId !== '0') {
                result = await fetchProductDetail(productId);
            } else if (action === 'list') {
                result = await fetchBoardList(boardNo, page);
            } else if (action === 'view' && articleId !== '0') {
                result = await fetchArticleDetail(boardNo, articleId);
            } else if (action === 'gallery') {
                result = await fetchGalleryList(page);
            } else {
                result = { success: false, error: 'Invalid action' };
            }

            return new Response(JSON.stringify(result), {
                headers: corsHeaders(origin)
            });
        } catch (error) {
            return new Response(JSON.stringify({
                success: false,
                error: error.message
            }), {
                status: 500,
                headers: corsHeaders(origin)
            });
        }
    }
};

/**
 * HTML에서 텍스트 추출
 */
function extractText(html) {
    return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * 상품 목록 가져오기 - Cafe24 HTML 직접 파싱
 */
async function fetchProductList(cateNo, page) {
    const targetUrl = `https://gs2015.kr/product/list.html?cate_no=${cateNo}&page=${page}`;

    const response = await fetch(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch product list');
    }

    const html = await response.text();
    const items = [];

    // 상품 링크 패턴: /product/상품명/상품번호/category/카테고리/display/1/
    // 예: /product/강서참기름/9/category/24/display/1/
    const productLinkRegex = /href="(\/product\/[^"]+\/(\d+)\/category\/\d+\/display\/\d+\/)"/g;
    const productMatches = [...html.matchAll(productLinkRegex)];

    // 유니크한 상품만 추출
    const uniqueProducts = new Map();
    for (const match of productMatches) {
        const [, href, productId] = match;
        if (!uniqueProducts.has(productId)) {
            uniqueProducts.set(productId, href);
        }
    }

    // 각 상품 정보 추출
    for (const [productId, href] of uniqueProducts) {
        // 상품명 추출 - "상품명 : XXX" 패턴
        const nameRegex = new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>\\s*상품명\\s*:\\s*([^<]+)`, 'i');
        let nameMatch = html.match(nameRegex);
        let name = '';

        if (nameMatch) {
            name = nameMatch[1].trim();
        } else {
            // URL에서 상품명 추출 시도
            const urlNameMatch = href.match(/\/product\/([^\/]+)\//);
            if (urlNameMatch) {
                name = decodeURIComponent(urlNameMatch[1]);
            }
        }

        if (!name) continue;

        // 가격 추출 - 해당 상품 근처의 "판매가 : XXX원" 패턴
        let price = '';
        const productSection = html.substring(
            html.indexOf(href) - 500,
            html.indexOf(href) + 1000
        );
        const priceMatch = productSection.match(/판매가\s*:?\s*([\d,]+)\s*원/);
        if (priceMatch) {
            price = priceMatch[1] + '원';
        }

        // 이미지 추출 - 상품 근처의 img 태그
        let image = '';
        const imgMatch = productSection.match(/src="([^"]*(?:product|prd)[^"]*\.(jpg|jpeg|png|gif|webp))"/i);
        if (imgMatch) {
            image = imgMatch[1];
            if (image.startsWith('//')) {
                image = 'https:' + image;
            } else if (image.startsWith('/')) {
                image = 'https://gs2015.kr' + image;
            }
        }

        items.push({
            id: productId,
            name: name,
            price: price || '가격문의',
            image: image || 'images/placeholder.png',
            link: 'https://gs2015.kr' + href
        });
    }

    return {
        success: true,
        data: items,
        pagination: {
            current: parseInt(page),
            total: 1
        }
    };
}

/**
 * 상품 상세 정보 가져오기
 */
async function fetchProductDetail(productId) {
    // 상품 상세는 일단 기본 정보만 반환
    return {
        success: true,
        data: {
            id: productId,
            title: '',
            content: '',
            images: []
        }
    };
}

/**
 * 게시판 목록 가져오기
 */
async function fetchBoardList(boardNo, page) {
    const targetUrl = `https://gs2015.kr/front/php/b/board_list.php?board_no=${boardNo}&page=${page}`;

    const response = await fetch(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch board list');
    }

    const html = await response.text();
    const items = [];

    // 게시글 링크 패턴: /article/슬러그/게시판번호/글번호/
    const articleRegex = /href="(\/article\/[^\/]+\/\d+\/(\d+)\/)"/g;
    const matches = [...html.matchAll(articleRegex)];

    const uniqueArticles = new Map();
    for (const match of matches) {
        const [, href, articleId] = match;
        if (!uniqueArticles.has(articleId)) {
            uniqueArticles.set(articleId, href);
        }
    }

    for (const [articleId, href] of uniqueArticles) {
        // 제목 추출
        const titleRegex = new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]+)`, 'i');
        const titleMatch = html.match(titleRegex);
        let title = titleMatch ? titleMatch[1].trim() : '';

        if (!title || title.length < 2) continue;

        // 날짜 추출
        const dateRegex = /(\d{4}-\d{2}-\d{2})/g;
        const dateMatches = [...html.matchAll(dateRegex)];
        let date = dateMatches.length > 0 ? dateMatches[0][1] : '';

        items.push({
            id: articleId,
            title: title,
            date: date,
            link: 'https://gs2015.kr' + href
        });
    }

    return {
        success: true,
        data: items,
        pagination: {
            current: parseInt(page),
            total: 1
        }
    };
}

/**
 * 게시글 상세 가져오기
 */
async function fetchArticleDetail(boardNo, articleId) {
    const slugMap = {
        '1': '알림사항',
        '2': '구인구직',
        '8': '갤러리'
    };
    const slug = slugMap[boardNo] || '구인구직';
    const targetUrl = `https://gs2015.kr/article/${encodeURIComponent(slug)}/${boardNo}/${articleId}/`;

    const response = await fetch(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch article detail');
    }

    const html = await response.text();

    // 제목 추출
    let title = '';
    const titleMatch = html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
    if (titleMatch) {
        title = titleMatch[1].trim();
    }

    // 본문 내용 추출 - fr-view 클래스 또는 detail 클래스
    let content = '';
    const contentMatch = html.match(/<div[^>]*class="[^"]*(?:fr-view|detail)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (contentMatch) {
        content = contentMatch[1];
        // 이미지 URL 절대경로 변환
        content = content.replace(/src="([^"]+)"/g, (match, src) => {
            if (src.startsWith('http')) return match;
            if (src.startsWith('//')) return `src="https:${src}"`;
            if (src.startsWith('/')) return `src="https://gs2015.kr${src}"`;
            return `src="https://gs2015.kr/${src}"`;
        });
    }

    // 날짜 추출
    let date = '';
    const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
        date = dateMatch[1];
    }

    return {
        success: true,
        data: {
            id: articleId,
            title: title,
            content: content,
            date: date,
            url: targetUrl
        }
    };
}

/**
 * 갤러리 목록 가져오기
 */
async function fetchGalleryList(page) {
    return await fetchBoardList('8', page);
}
