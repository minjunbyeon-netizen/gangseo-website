/**
 * Cloudflare Worker - Cafe24 Scraper v6 (Final)
 * 상품 + 게시판 + 갤러리 + 글 상세보기 + 페이지네이션 완전 지원
 */

const ALLOWED_ORIGINS = [
    'https://2026.gs2015.kr',
    'https://minjunbyeon-netizen.github.io',
    'http://localhost',
    'http://127.0.0.1'
];

const BOARD_SLUGS = {
    '1': '알림사항',
    '2': '구인구직',
    '8': '갤러리'
};

function corsHeaders(origin) {
    const allowedOrigin = ALLOWED_ORIGINS.find(o => origin?.startsWith(o)) || ALLOWED_ORIGINS[0];
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

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders(origin) });
        }

        const url = new URL(request.url);
        const action = url.searchParams.get('action') || 'products';
        const cateNo = url.searchParams.get('cate_no') || '23';
        const page = url.searchParams.get('page') || '1';
        const boardNo = url.searchParams.get('board_no') || '2';
        const articleId = url.searchParams.get('article_id') || '';

        try {
            let result;

            if (action === 'products') {
                result = await fetchProducts(cateNo, page);
            } else if (action === 'list') {
                result = await fetchBoardList(boardNo, page);
            } else if (action === 'view' && articleId) {
                result = await fetchArticleDetail(boardNo, articleId);
            } else {
                result = { success: false, error: 'Unknown action' };
            }

            return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
        } catch (error) {
            return new Response(JSON.stringify({ success: false, error: error.message }), {
                status: 500, headers: corsHeaders(origin)
            });
        }
    }
};

async function fetchProducts(cateNo, page) {
    const targetUrl = `https://gs2015.kr/product/list.html?cate_no=${cateNo}&page=${page}`;
    const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await response.text();
    const products = [];

    // anchorBoxId_N 패턴으로 상품 li 추출
    const liPattern = /<li[^>]*id="anchorBoxId_(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;

    while ((liMatch = liPattern.exec(html)) !== null) {
        const productNo = liMatch[1];
        const liHtml = liMatch[2];

        // 상품명 추출: <strong class="name"><a>...<span>상품명</span></a></strong>
        // 마지막 span 안의 텍스트가 실제 상품명
        let name = '';
        // 방법 1: strong.name 안의 모든 span 중 마지막 span의 텍스트
        const allSpansMatch = liHtml.match(/<strong[^>]*class="[^"]*name[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        if (allSpansMatch) {
            const aContent = allSpansMatch[1];
            // 마지막 span의 내용 추출
            const spans = aContent.match(/<span[^>]*>([^<]*)<\/span>/gi);
            if (spans && spans.length > 0) {
                const lastSpan = spans[spans.length - 1];
                const textMatch = lastSpan.match(/<span[^>]*>([^<]*)<\/span>/i);
                if (textMatch) name = textMatch[1].trim();
            }
        }
        if (!name) continue;

        // 이미지 추출
        let image = '';
        const imgMatch = liHtml.match(/<img[^>]*src="([^"]+)"[^>]*alt="[^"]*"/i) ||
            liHtml.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
        if (imgMatch) {
            image = imgMatch[1];
            if (image.startsWith('//')) image = 'https:' + image;
            else if (image.startsWith('/')) image = 'https://gs2015.kr' + image;
        }

        // 가격 추출: <span>15,000원</span>
        let price = '';
        const priceMatch = liHtml.match(/<li[^>]*rel="판매가"[^>]*>[\s\S]*?<span[^>]*>([\d,]+원)<\/span>/i) ||
            liHtml.match(/([\d,]+)원/);
        if (priceMatch) {
            price = priceMatch[1].includes('원') ? priceMatch[1] : priceMatch[1] + '원';
        }

        // 링크 추출
        let link = '';
        const linkMatch = liHtml.match(/<a[^>]*href="([^"]*\/product\/[^"]+)"[^>]*>/i);
        if (linkMatch) {
            link = linkMatch[1].startsWith('http') ? linkMatch[1] : 'https://gs2015.kr' + linkMatch[1];
        }

        products.push({ id: parseInt(productNo), name, image, price, link });
    }

    return { success: true, data: products, pagination: { current: parseInt(page), total: 1 } };
}

async function fetchBoardList(boardNo, page) {
    const targetUrl = `https://gs2015.kr/front/php/b/board_list.php?board_no=${boardNo}&page=${page}`;
    const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await response.text();
    const items = [];
    let itemNum = 1;

    if (boardNo === '8') {
        // 갤러리
        const galleryPattern = /<li[^>]*>[\s\S]*?<a[^>]*href="([^"]*\/article\/[^/]+\/8\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
        let match;
        while ((match = galleryPattern.exec(html)) !== null) {
            const link = match[1].startsWith('http') ? match[1] : 'https://gs2015.kr' + match[1];
            const id = match[2];
            const content = match[3];

            const titleMatch = content.match(/<p[^>]*>([^<]+)<\/p>/i) || content.match(/>([^<\n]{3,50})</);
            let title = titleMatch ? titleMatch[1].trim() : '';

            const dateMatch = content.match(/(\d{4}-\d{2}-\d{2})/);
            let date = dateMatch ? dateMatch[1] : '';

            if (date.includes('9999')) continue;

            let thumbnail = '';
            const imgMatch = content.match(/<img[^>]*(?:src|data-src)="([^"]+)"[^>]*>/i);
            if (imgMatch) {
                thumbnail = imgMatch[1];
                if (thumbnail.startsWith('//')) thumbnail = 'https:' + thumbnail;
                else if (thumbnail.startsWith('/')) thumbnail = 'https://gs2015.kr' + thumbnail;
            }

            if (title && !items.find(i => i.id === id)) {
                items.push({ id, num: itemNum++, title, date, type: '', views: 0, thumbnail, link });
            }
        }
    } else {
        // 일반 게시판 (테이블)
        const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let trMatch;

        while ((trMatch = trPattern.exec(html)) !== null) {
            const trHtml = trMatch[1];
            if (trHtml.includes('<th')) continue;

            // 번호 추출
            const numMatch = trHtml.match(/<td[^>]*>\s*(\d+)\s*<\/td>/i);
            const num = numMatch ? parseInt(numMatch[1]) : itemNum;

            // 링크와 제목
            const linkMatch = trHtml.match(/<a[^>]*href="[^"]*(?:no=|article\/[^\/]+\/\d+\/)(\d+)[^"]*"[^>]*>([^<]+)<\/a>/i);
            if (!linkMatch) continue;

            const id = linkMatch[1];
            let title = linkMatch[2].trim();

            // 날짜
            const dateMatch = trHtml.match(/(\d{4}[-./]\d{2}[-./]\d{2})/);
            let date = dateMatch ? dateMatch[1] : '';
            if (date.includes('9999')) continue;

            // 조회수 - 마지막 td에서 숫자만 추출
            let views = 0;
            const allTds = trHtml.match(/<td[^>]*>[^<]*<\/td>/gi) || [];
            for (let i = allTds.length - 1; i >= 0; i--) {
                const tdContent = allTds[i].replace(/<[^>]+>/g, '').trim();
                if (/^\d+$/.test(tdContent) && parseInt(tdContent) < 100000) {
                    views = parseInt(tdContent);
                    break;
                }
            }

            // 타입 (구인/구직 판별 - 구직이 명시되면 구직, 그 외(모집/구인 등)는 구인)
            let type = '';
            if (boardNo === '2') {
                if (title.includes('구직')) {
                    type = '구직';
                } else {
                    type = '구인';
                }
            }

            if (!items.find(i => i.id === id)) {
                items.push({ id, num: num || itemNum++, title, date, type, views });
            }
        }
    }

    // 페이지네이션 정보 추출
    let maxPage = parseInt(page);
    const pagePattern = /page=(\d+)/g;
    let pageMatch;
    while ((pageMatch = pagePattern.exec(html)) !== null) {
        const pageNum = parseInt(pageMatch[1]);
        if (pageNum > maxPage) maxPage = pageNum;
    }

    return {
        success: true,
        data: items,
        pagination: {
            current: parseInt(page),
            total: maxPage,
            hasNext: parseInt(page) < maxPage,
            hasPrev: parseInt(page) > 1
        }
    };
}

async function fetchArticleDetail(boardNo, articleId) {
    const slug = BOARD_SLUGS[boardNo] || '구인구직';
    const targetUrl = `https://gs2015.kr/article/${encodeURIComponent(slug)}/${boardNo}/${articleId}/`;

    const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await response.text();

    // 제목 추출
    let title = '';
    const titleMatch = html.match(/<td[^>]*class="[^"]*subject[^"]*"[^>]*>([^<]+)<\/td>/i) ||
        html.match(/<th[^>]*>제목<\/th>[\s\S]*?<td[^>]*>([^<]+)<\/td>/i) ||
        html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i);
    if (titleMatch) title = titleMatch[1].trim();

    // 본문 추출
    let content = '';
    const contentMatch = html.match(/<div[^>]*class="[^"]*fr-view[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
        html.match(/<div[^>]*class="[^"]*detail[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
        html.match(/<div[^>]*class="[^"]*view_content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (contentMatch) {
        content = contentMatch[1];
        content = content.replace(/src="\/\//g, 'src="https://');
        content = content.replace(/src="\//g, 'src="https://gs2015.kr/');
    }

    // 날짜 추출
    let date = '';
    const dateMatch = html.match(/작성일[\s\S]*?(\d{4}-\d{2}-\d{2})/i) ||
        html.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) date = dateMatch[1];
    if (date.includes('9999')) date = new Date().toISOString().split('T')[0];

    // 첨부파일 추출
    const attachments = [];
    const attachPattern = /file_download\(['"]([^'"]+)['"]\)[^>]*>([^<]+)</gi;
    let attachMatch;
    while ((attachMatch = attachPattern.exec(html)) !== null) {
        attachments.push({
            name: attachMatch[2].trim(),
            url: 'https://gs2015.kr' + attachMatch[1].replace(/&amp;/g, '&')
        });
    }

    return {
        success: true,
        data: {
            id: articleId,
            title: title,
            content: content,
            date: date,
            attachments: attachments,
            url: targetUrl
        }
    };
}
