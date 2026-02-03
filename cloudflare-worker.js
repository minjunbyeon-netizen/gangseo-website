/**
 * Cloudflare Worker - Cafe24 Proxy
 * GitHub Pages에서 Cafe24 데이터를 가져오기 위한 프록시
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
            // Cafe24 proxy.php로 요청 전달
            const proxyUrl = `https://gs2015.kr/proxy.php?action=${action}&board_no=${boardNo}&page=${page}&article_id=${articleId}&cate_no=${cateNo}&product_id=${productId}`;

            const response = await fetch(proxyUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Origin': 'https://gs2015.kr'
                }
            });

            const data = await response.text();

            return new Response(data, {
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
