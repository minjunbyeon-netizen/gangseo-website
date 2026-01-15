<?php
/**
 * Cafe24 Board Proxy
 * Cafe24 게시판 콘텐츠를 가져와서 JSON으로 반환
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// 요청 파라미터
$boardNo = isset($_GET['board_no']) ? intval($_GET['board_no']) : 2;
$page = isset($_GET['page']) ? intval($_GET['page']) : 1;
$action = isset($_GET['action']) ? $_GET['action'] : 'list';
$articleId = isset($_GET['article_id']) ? intval($_GET['article_id']) : 0;

// 게시판 정보 매핑
$boardInfo = [
    1 => ['name' => '알림사항', 'slug' => '알림사항'],
    2 => ['name' => '구인구직', 'slug' => '구인구직'],
    8 => ['name' => '갤러리', 'slug' => '갤러리']
];

try {
    if ($action === 'list') {
        $result = fetchBoardList($boardNo, $page);
    } elseif ($action === 'view' && $articleId > 0) {
        $slug = $boardInfo[$boardNo]['slug'] ?? '구인구직';
        $result = fetchArticleDetail($boardNo, $articleId, $slug);
    } else {
        throw new Exception('Invalid action or missing parameters');
    }

    echo json_encode($result, JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * 게시판 목록 가져오기
 */
function fetchBoardList($boardNo, $page)
{
    $url = "https://gs2015.kr/front/php/b/board_list.php?board_no={$boardNo}&page={$page}";

    $html = fetchUrl($url);
    if (!$html) {
        throw new Exception('Failed to fetch board list');
    }

    // HTML 파싱
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();

    $xpath = new DOMXPath($dom);

    $items = [];

    // 게시글 목록 파싱 (Cafe24 구조에 맞게 조정 필요)
    // 일반적인 테이블 구조 시도
    $rows = $xpath->query("//table[contains(@class, 'board')]//tr[position()>1]");

    if ($rows->length === 0) {
        // 다른 구조 시도 - div 기반 목록
        $rows = $xpath->query("//div[contains(@class, 'board_list')]//li | //ul[contains(@class, 'board')]//li");
    }

    if ($rows->length === 0) {
        // 또 다른 구조 - 직접 링크 찾기
        $links = $xpath->query("//a[contains(@href, '/article/')]");

        foreach ($links as $link) {
            $href = $link->getAttribute('href');
            $title = trim($link->textContent);

            if (empty($title) || strlen($title) < 2)
                continue;

            // URL에서 article ID 추출
            preg_match('/\/article\/[^\/]+\/\d+\/(\d+)/', $href, $matches);
            $articleId = $matches[1] ?? 0;

            // 부모 요소에서 날짜와 타입 찾기
            $parent = $link->parentNode;
            while ($parent && $parent->nodeName !== 'li' && $parent->nodeName !== 'tr' && $parent->nodeName !== 'div') {
                $parent = $parent->parentNode;
            }

            $dateText = '';
            $type = '구인';
            $description = '';

            if ($parent) {
                $parentHtml = $dom->saveHTML($parent);

                // 날짜 추출 (YYYY-MM-DD 또는 YYYY.MM.DD 형식)
                if (preg_match('/(\d{4}[-\.]\d{2}[-\.]\d{2})/', $parentHtml, $dateMatches)) {
                    $dateText = str_replace('-', '.', $dateMatches[1]);
                }

                // 구인/구직 타입 추출
                if (strpos($parentHtml, '구직') !== false) {
                    $type = '구직';
                }

                // 설명 텍스트 추출
                $descNodes = $xpath->query(".//p | .//span[contains(@class, 'desc')] | .//div[contains(@class, 'info')]", $parent);
                foreach ($descNodes as $descNode) {
                    $desc = trim($descNode->textContent);
                    if (!empty($desc) && $desc !== $title && strlen($desc) > 5) {
                        $description = $desc;
                        break;
                    }
                }
            }

            $items[] = [
                'id' => $articleId,
                'type' => $type,
                'title' => $title,
                'description' => $description,
                'date' => $dateText,
                'link' => 'https://gs2015.kr' . $href
            ];
        }
    }

    // 페이지네이션 정보 추출
    $pagination = [
        'current' => $page,
        'total' => 1,
        'hasNext' => false,
        'hasPrev' => $page > 1
    ];

    $pageLinks = $xpath->query("//div[contains(@class, 'paging')]//a | //ul[contains(@class, 'pagination')]//a");
    $maxPage = $page;

    foreach ($pageLinks as $pageLink) {
        $pageText = trim($pageLink->textContent);
        if (is_numeric($pageText) && intval($pageText) > $maxPage) {
            $maxPage = intval($pageText);
        }
        if (strpos($pageText, '다음') !== false || strpos($pageLink->getAttribute('class'), 'next') !== false) {
            $pagination['hasNext'] = true;
        }
    }

    $pagination['total'] = $maxPage;

    return [
        'success' => true,
        'data' => $items,
        'pagination' => $pagination
    ];
}

/**
 * 게시글 상세 내용 가져오기
 */
function fetchArticleDetail($boardNo, $articleId, $slug)
{
    $url = "https://gs2015.kr/article/" . urlencode($slug) . "/{$boardNo}/{$articleId}/";

    $html = fetchUrl($url);
    if (!$html) {
        throw new Exception('Failed to fetch article detail');
    }

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();

    $xpath = new DOMXPath($dom);

    // 제목 추출
    $titleNode = $xpath->query("//h1 | //h2[contains(@class, 'title')] | //div[contains(@class, 'view_title')]")->item(0);
    $title = $titleNode ? trim($titleNode->textContent) : '';

    // 본문 내용 추출
    $contentNode = $xpath->query("//div[contains(@class, 'view_content')] | //div[contains(@class, 'board_view')] | //div[@id='contents']")->item(0);
    $content = $contentNode ? $dom->saveHTML($contentNode) : '';

    // 날짜 추출
    $date = '';
    $dateNode = $xpath->query("//*[contains(@class, 'date')] | //*[contains(@class, 'time')]")->item(0);
    if ($dateNode) {
        $date = trim($dateNode->textContent);
    }

    return [
        'success' => true,
        'data' => [
            'id' => $articleId,
            'title' => $title,
            'content' => $content,
            'date' => $date,
            'url' => $url
        ]
    ];
}

/**
 * URL에서 HTML 가져오기
 */
function fetchUrl($url)
{
    $ch = curl_init();

    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: ko-KR,ko;q=0.9,en;q=0.8'
        ]
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    if ($httpCode !== 200) {
        return false;
    }

    // 인코딩 처리
    $encoding = mb_detect_encoding($response, ['UTF-8', 'EUC-KR', 'CP949'], true);
    if ($encoding && $encoding !== 'UTF-8') {
        $response = mb_convert_encoding($response, 'UTF-8', $encoding);
    }

    return $response;
}
?>