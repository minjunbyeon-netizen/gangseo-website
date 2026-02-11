<?php
/**
 * Cafe24 → 새 사이트 마이그레이션 크롤러
 * 모든 게시글(알림사항, 구인구직, 갤러리) + 상품을 수집하여 JSON으로 저장
 * 
 * 사용법: php migrate-crawl.php
 * 또는 브라우저: http://localhost/01_work/01_gangseo/migrate-crawl.php
 */

// 실행 시간 제한 해제 (크롤링은 오래 걸릴 수 있음)
set_time_limit(0);
ini_set('memory_limit', '512M');

// 출력 설정
if (php_sapi_name() === 'cli') {
    // CLI 실행
    define('IS_CLI', true);
} else {
    // 브라우저 실행
    define('IS_CLI', false);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cafe24 마이그레이션 크롤러</title>';
    echo '<style>body{font-family:"Noto Sans KR",sans-serif;max-width:900px;margin:40px auto;padding:20px;background:#1a1a2e;color:#e0e0e0}';
    echo 'h1{color:#00d4ff}h2{color:#ffc107;margin-top:30px}.ok{color:#4caf50}.err{color:#f44336}.info{color:#90caf9}';
    echo 'pre{background:#0d1117;padding:15px;border-radius:8px;overflow-x:auto;font-size:13px;border:1px solid #30363d}';
    echo '.progress{background:#333;border-radius:10px;height:24px;margin:10px 0;overflow:hidden}';
    echo '.progress-bar{background:linear-gradient(90deg,#00d4ff,#7c4dff);height:100%;transition:width 0.3s;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold}';
    echo '</style></head><body>';
    echo '<h1>🔄 Cafe24 마이그레이션 크롤러</h1>';
    ob_flush(); flush();
}

// ==================== 설정 ====================

$config = [
    'baseUrl' => 'https://gs2015.kr',
    'boards' => [
        1 => ['name' => '알림사항', 'slug' => '알림사항'],
        2 => ['name' => '구인구직', 'slug' => '구인구직'],
        8 => ['name' => '갤러리', 'slug' => '갤러리'],
    ],
    'productCategories' => [
        23 => '정일품참기름',
        25 => '액상차즙',
        53 => '더치커피',
    ],
    'outputDir' => __DIR__ . '/migration_data/',
    'imageDir' => __DIR__ . '/migration_data/images/',
    'delay' => 500000, // 요청 간 딜레이 (0.5초 = 500000 마이크로초)
];

// 출력 디렉토리 생성
if (!file_exists($config['outputDir'])) mkdir($config['outputDir'], 0755, true);
if (!file_exists($config['imageDir'])) mkdir($config['imageDir'], 0755, true);

// ==================== 메인 실행 ====================

$results = [
    'crawled_at' => date('Y-m-d H:i:s'),
    'boards' => [],
    'products' => [],
    'stats' => [
        'total_articles' => 0,
        'total_products' => 0,
        'total_images' => 0,
        'errors' => [],
    ]
];

logMsg("🚀 크롤링 시작: " . date('Y-m-d H:i:s'), 'info');
logMsg("대상: gs2015.kr (Cafe24)", 'info');
echo IS_CLI ? "\n" : "<hr>";

// ===== 게시판 크롤링 =====
foreach ($config['boards'] as $boardNo => $boardInfo) {
    logMsg("📋 게시판 크롤링: {$boardInfo['name']} (board_no={$boardNo})", 'info');
    
    $boardData = [
        'board_no' => $boardNo,
        'name' => $boardInfo['name'],
        'articles' => [],
    ];

    $page = 1;
    $maxPage = 1;
    $articleCount = 0;

    // 전체 페이지 순회
    while ($page <= $maxPage) {
        logMsg("  📄 페이지 {$page} 수집 중...", 'info');
        
        $listResult = fetchBoardList($config['baseUrl'], $boardNo, $page);
        
        if (!$listResult['success']) {
            logMsg("  ❌ 페이지 {$page} 목록 가져오기 실패: " . ($listResult['error'] ?? ''), 'err');
            $results['stats']['errors'][] = "Board {$boardNo} page {$page}: list fetch failed";
            break;
        }

        // 최대 페이지 업데이트
        if (isset($listResult['pagination']['total'])) {
            $maxPage = max($maxPage, $listResult['pagination']['total']);
        }

        // 각 게시글 상세 수집
        foreach ($listResult['data'] as $item) {
            $articleId = $item['id'];
            if (!$articleId) continue;

            logMsg("    📝 글 #{$articleId}: {$item['title']}", '');
            
            // 글 상세 가져오기
            $detail = fetchArticleDetail($config['baseUrl'], $boardNo, $articleId, $boardInfo['slug']);
            
            if ($detail['success']) {
                $article = $detail['data'];
                $article['list_info'] = $item; // 목록 정보도 함께 저장
                
                // 이미지 다운로드 (갤러리인 경우)
                if ($boardNo == 8 && !empty($article['content'])) {
                    $downloadedImages = downloadImagesFromContent($article['content'], $config['imageDir'], "board_{$boardNo}_{$articleId}");
                    $article['downloaded_images'] = $downloadedImages;
                    $results['stats']['total_images'] += count($downloadedImages);
                }

                // 첨부파일 정보 기록
                if (!empty($article['attachments'])) {
                    foreach ($article['attachments'] as &$attachment) {
                        $downloadedFile = downloadFile($attachment['url'], $config['imageDir'], $attachment['name']);
                        $attachment['local_path'] = $downloadedFile;
                    }
                }
                
                $boardData['articles'][] = $article;
                $articleCount++;
                $results['stats']['total_articles']++;
            } else {
                logMsg("    ❌ 글 #{$articleId} 상세 가져오기 실패", 'err');
                $results['stats']['errors'][] = "Board {$boardNo} article {$articleId}: detail fetch failed";
            }

            usleep($config['delay']); // 서버 부하 방지
        }

        $page++;
        usleep($config['delay']);
    }

    logMsg("  ✅ {$boardInfo['name']}: {$articleCount}건 수집 완료", 'ok');
    $boardData['total_articles'] = $articleCount;
    $results['boards'][$boardNo] = $boardData;

    // 게시판별 JSON 저장
    $boardFile = $config['outputDir'] . "board_{$boardNo}_{$boardInfo['name']}.json";
    file_put_contents($boardFile, json_encode($boardData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    logMsg("  💾 저장: {$boardFile}", 'ok');
}

// ===== 상품 크롤링 =====
logMsg("\n🛍️ 상품 크롤링 시작", 'info');

foreach ($config['productCategories'] as $cateNo => $cateName) {
    logMsg("  📦 카테고리: {$cateName} (cate_no={$cateNo})", 'info');
    
    $categoryData = [
        'cate_no' => $cateNo,
        'name' => $cateName,
        'products' => [],
    ];

    $page = 1;
    $maxPage = 1;

    while ($page <= $maxPage) {
        $listResult = fetchProductList($config['baseUrl'], $cateNo, $page);
        
        if (!$listResult['success'] || empty($listResult['data'])) break;

        if (isset($listResult['pagination']['total'])) {
            $maxPage = max($maxPage, $listResult['pagination']['total']);
        }

        foreach ($listResult['data'] as $product) {
            $productNo = $product['id'];
            if (!$productNo) continue;

            logMsg("    🏷️ 상품 #{$productNo}: {$product['name']}", '');
            
            // 상품 상세 가져오기
            $detail = fetchProductDetail($config['baseUrl'], $productNo);
            
            if ($detail['success']) {
                $productData = $detail['data'];
                $productData['list_info'] = $product;
                
                // 상품 이미지 다운로드
                if (!empty($productData['image'])) {
                    $imgPath = downloadFile($productData['image'], $config['imageDir'], "product_{$productNo}_main");
                    $productData['local_image'] = $imgPath;
                    $results['stats']['total_images']++;
                }

                $categoryData['products'][] = $productData;
                $results['stats']['total_products']++;
            }

            usleep($config['delay']);
        }

        $page++;
        usleep($config['delay']);
    }

    $results['products'][$cateNo] = $categoryData;

    // 카테고리별 JSON 저장
    $prodFile = $config['outputDir'] . "products_{$cateNo}_{$cateName}.json";
    file_put_contents($prodFile, json_encode($categoryData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    logMsg("  💾 저장: {$prodFile}", 'ok');
}

// ===== 전체 결과 저장 =====
$summaryFile = $config['outputDir'] . 'migration_summary.json';
file_put_contents($summaryFile, json_encode($results['stats'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

echo IS_CLI ? "\n" : "<hr>";
logMsg("🎉 크롤링 완료!", 'ok');
logMsg("📊 수집 결과:", 'info');
logMsg("  - 총 게시글: {$results['stats']['total_articles']}건", 'ok');
logMsg("  - 총 상품: {$results['stats']['total_products']}건", 'ok');
logMsg("  - 다운로드된 이미지: {$results['stats']['total_images']}개", 'ok');
logMsg("  - 오류: " . count($results['stats']['errors']) . "건", count($results['stats']['errors']) > 0 ? 'err' : 'ok');
logMsg("  - 저장 위치: {$config['outputDir']}", 'info');

if (!IS_CLI) {
    echo '<h2>📁 저장된 파일</h2><ul>';
    foreach (glob($config['outputDir'] . '*.json') as $file) {
        $size = round(filesize($file) / 1024, 1);
        echo "<li>" . basename($file) . " ({$size} KB)</li>";
    }
    echo '</ul>';
    echo '</body></html>';
}

// ==================== 함수 정의 ====================

/**
 * URL에서 HTML 가져오기
 */
function fetchUrl($url) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false, // 로컬 환경
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: ko-KR,ko;q=0.9,en;q=0.8'
        ]
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($httpCode !== 200 || $response === false) {
        return false;
    }

    // 인코딩 처리
    $encoding = mb_detect_encoding($response, ['UTF-8', 'EUC-KR', 'CP949'], true);
    if ($encoding && $encoding !== 'UTF-8') {
        $response = mb_convert_encoding($response, 'UTF-8', $encoding);
    }
    return $response;
}

/**
 * 게시판 목록 가져오기
 */
function fetchBoardList($baseUrl, $boardNo, $page) {
    $url = "{$baseUrl}/front/php/b/board_list.php?board_no={$boardNo}&page={$page}";
    $html = fetchUrl($url);
    if (!$html) return ['success' => false, 'error' => 'Fetch failed'];

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();
    $xpath = new DOMXPath($dom);

    $items = [];

    if ($boardNo == 8) {
        // 갤러리: ul/li 구조
        $galleryItems = $xpath->query("//div[contains(@module, 'board_list_8')]//li | //div[contains(@class, 'xans-board-list')]//li");
        foreach ($galleryItems as $li) {
            $linkNode = $xpath->query(".//a[contains(@href, '/article/')]", $li)->item(0);
            if (!$linkNode) continue;
            $href = $linkNode->getAttribute('href');
            preg_match('/\/article\/[^\/]+\/\d+\/(\d+)/', $href, $matches);
            $articleId = $matches[1] ?? 0;
            if (!$articleId) continue;

            $title = '';
            $titleNode = $xpath->query(".//p[not(contains(@class, 'imgLink'))]", $li)->item(0);
            if ($titleNode) $title = trim($titleNode->textContent);
            if (empty($title)) $title = trim($linkNode->textContent);
            if (empty($title) || strlen($title) < 2) continue;

            $dateText = '';
            $liHtml = $dom->saveHTML($li);
            if (preg_match('/(\d{4}-\d{2}-\d{2})/', $liHtml, $dateMatches)) {
                $dateText = $dateMatches[1];
            }
            if (strpos($dateText, '9999') !== false) continue;

            $thumbnail = '';
            $imgNode = $xpath->query(".//img", $li)->item(0);
            if ($imgNode) {
                $src = $imgNode->getAttribute('data-src') ?: $imgNode->getAttribute('src');
                if ($src && strpos($src, 'ico_') === false) {
                    $thumbnail = makeAbsoluteUrl($src, $baseUrl);
                }
            }

            $items[] = ['id' => $articleId, 'title' => $title, 'date' => $dateText, 'thumbnail' => $thumbnail];
        }
    }

    // 테이블 구조 (일반 게시판 또는 갤러리 폴백)
    if (count($items) === 0) {
        $rows = $xpath->query("//div[contains(@class, 'ec-base-table')]//tbody//tr");
        foreach ($rows as $row) {
            $cells = $xpath->query(".//td", $row);
            if ($cells->length < 3) continue;

            $linkNode = $xpath->query(".//td[contains(@class, 'subject')]//a", $row)->item(0);
            if (!$linkNode) $linkNode = $xpath->query(".//a[contains(@href, '/article/')]", $row)->item(0);
            if (!$linkNode) continue;

            $href = $linkNode->getAttribute('href');
            $title = trim($linkNode->textContent);
            if (empty($title)) continue;

            preg_match('/\/article\/[^\/]+\/\d+\/(\d+)/', $href, $matches);
            $articleId = $matches[1] ?? 0;
            if (!$articleId) continue;

            $dateText = '';
            $rowHtml = $dom->saveHTML($row);
            if (preg_match('/(\d{4}-\d{2}-\d{2})/', $rowHtml, $dateMatches)) {
                $dateText = $dateMatches[1];
            }
            if (strpos($dateText, '9999') !== false) continue;

            $type = '';
            if ($boardNo == 2) {
                $type = strpos($title, '구직') !== false ? '구직' : '구인';
            }

            $items[] = ['id' => $articleId, 'title' => $title, 'date' => $dateText, 'type' => $type];
        }
    }

    // 페이지네이션
    $maxPage = $page;
    $pageLinks = $xpath->query("//div[contains(@class, 'ec-base-paginate')]//a");
    foreach ($pageLinks as $link) {
        $href = $link->getAttribute('href');
        if (preg_match('/page=(\d+)/', $href, $m)) {
            $maxPage = max($maxPage, intval($m[1]));
        }
        $text = trim($link->textContent);
        if (is_numeric($text)) $maxPage = max($maxPage, intval($text));
    }

    return [
        'success' => true,
        'data' => $items,
        'pagination' => ['current' => $page, 'total' => $maxPage]
    ];
}

/**
 * 게시글 상세 가져오기
 */
function fetchArticleDetail($baseUrl, $boardNo, $articleId, $slug) {
    $url = "{$baseUrl}/article/" . urlencode($slug) . "/{$boardNo}/{$articleId}/";
    $html = fetchUrl($url);
    if (!$html) return ['success' => false, 'error' => 'Fetch failed'];

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();
    $xpath = new DOMXPath($dom);

    // 제목
    $title = '';
    foreach (["//td[contains(@class, 'subject')]", "//th[contains(text(), '제목')]/following-sibling::td", "//h1", "//h2"] as $sel) {
        $node = $xpath->query($sel)->item(0);
        if ($node && ($t = trim($node->textContent))) { $title = $t; break; }
    }

    // 본문
    $content = '';
    $selectors = $boardNo == 8 
        ? ["//div[contains(@class, 'detail')]", "//div[contains(@class, 'fr-view')]"]
        : ["//div[contains(@class, 'fr-view')]", "//div[contains(@class, 'detail')]"];
    $selectors[] = "//div[contains(@class, 'view_content')]";
    $selectors[] = "//td[@colspan]//div";

    foreach ($selectors as $sel) {
        $node = $xpath->query($sel)->item(0);
        if ($node) {
            $temp = $dom->saveHTML($node);
            if (strlen($temp) > 50) {
                $content = $temp;
                if (strpos($temp, '<img') !== false) break;
            }
        }
    }

    // URL 절대경로 변환
    $content = preg_replace('/src="\/\//', 'src="https://', $content);
    $content = preg_replace('/src="\//', 'src="' . $baseUrl . '/', $content);

    // 날짜
    $date = '';
    $etcNode = $xpath->query("//ul[contains(@class, 'etcArea')]")->item(0);
    if ($etcNode && preg_match('/(\d{4}-\d{2}-\d{2})/', $etcNode->textContent, $dm)) {
        $date = $dm[1];
    }
    if (!$date && preg_match('/(\d{4}-\d{2}-\d{2})/', $html, $dm)) {
        $date = $dm[1];
    }
    if (strpos($date, '9999') !== false) $date = date('Y-m-d');

    // 첨부파일
    $attachments = [];
    $attachRows = $xpath->query("//tr[contains(@class, 'attach')]//a | //th[contains(text(), '첨부파일')]/parent::tr//td//a");
    foreach ($attachRows as $link) {
        $onclick = $link->getAttribute('onclick');
        $fileName = trim($link->textContent);
        if (preg_match("/file_download\(['\"]([^'\"]+)['\"]/", $onclick, $um)) {
            $downloadPath = html_entity_decode($um[1]);
            $attachments[] = [
                'name' => $fileName,
                'url' => $baseUrl . $downloadPath
            ];
        }
    }

    // 본문에서 텍스트만 추출 (plain text 버전)
    $plainText = strip_tags($content);
    $plainText = preg_replace('/\s+/', ' ', $plainText);
    $plainText = trim($plainText);

    return [
        'success' => true,
        'data' => [
            'id' => $articleId,
            'title' => $title,
            'content_html' => $content,
            'content_text' => $plainText,
            'date' => $date,
            'attachments' => $attachments,
            'source_url' => $url
        ]
    ];
}

/**
 * 상품 목록 가져오기
 */
function fetchProductList($baseUrl, $cateNo, $page) {
    $url = "{$baseUrl}/product/list.html?cate_no={$cateNo}&page={$page}";
    $html = fetchUrl($url);
    if (!$html) return ['success' => false];

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();
    $xpath = new DOMXPath($dom);

    $items = [];
    $productItems = $xpath->query("//ul[contains(@class, 'prdList')]//li[contains(@id, 'anchorBoxId')]");

    foreach ($productItems as $li) {
        $idAttr = $li->getAttribute('id');
        preg_match('/anchorBoxId_(\d+)/', $idAttr, $m);
        $productNo = intval($m[1] ?? 0);
        if (!$productNo) continue;

        $nameNode = $xpath->query(".//strong[contains(@class, 'name')]//a", $li)->item(0);
        $name = $nameNode ? trim($nameNode->textContent) : '';
        if (!$name) continue;

        $image = '';
        $imgNode = $xpath->query(".//div[contains(@class, 'prdImg')]//img", $li)->item(0);
        if ($imgNode) {
            $src = $imgNode->getAttribute('src');
            $image = makeAbsoluteUrl($src, $baseUrl);
        }

        $price = '';
        $priceNode = $xpath->query(".//li[@rel='판매가']", $li)->item(0);
        if ($priceNode) {
            $price = trim($priceNode->textContent);
            $price = preg_replace('/^[^:]+:\s*/', '', $price);
        }

        $items[] = ['id' => $productNo, 'name' => $name, 'image' => $image, 'price' => $price];
    }

    return ['success' => true, 'data' => $items, 'pagination' => ['current' => $page, 'total' => 1]];
}

/**
 * 상품 상세 가져오기
 */
function fetchProductDetail($baseUrl, $productNo) {
    $url = "{$baseUrl}/product/detail.html?product_no={$productNo}";
    $html = fetchUrl($url);
    if (!$html) return ['success' => false];

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();
    $xpath = new DOMXPath($dom);

    $name = '';
    $nameNode = $xpath->query("//div[contains(@class, 'headingArea')]//h2")->item(0);
    if ($nameNode) $name = trim($nameNode->textContent);

    $image = '';
    $imgNode = $xpath->query("//div[contains(@class, 'keyImg')]//img")->item(0);
    if ($imgNode) {
        $image = makeAbsoluteUrl($imgNode->getAttribute('src'), $baseUrl);
    }

    $price = '';
    if (preg_match('/판매가[\s\S]*?<td[^>]*>([\d,]+)원/i', $html, $pm)) {
        $price = $pm[1] . '원';
    }

    $summary = '';
    $summNode = $xpath->query("//div[contains(@class, 'summary_desc')]")->item(0);
    if ($summNode) $summary = trim($summNode->textContent);

    $content = '';
    $contNode = $xpath->query("//div[@id='prdDetail']//div[contains(@class, 'cont')]")->item(0);
    if ($contNode) {
        $content = $dom->saveHTML($contNode);
        $content = preg_replace('/src="\/\//', 'src="https://', $content);
        $content = preg_replace('/src="\//', 'src="' . $baseUrl . '/', $content);
    }

    return [
        'success' => true,
        'data' => [
            'id' => $productNo,
            'name' => $name,
            'image' => $image,
            'price' => $price,
            'summary' => $summary,
            'content_html' => $content,
            'source_url' => $url
        ]
    ];
}

/**
 * 콘텐츠 내 이미지 다운로드
 */
function downloadImagesFromContent($html, $dir, $prefix) {
    $downloaded = [];
    if (preg_match_all('/src="(https?:\/\/[^"]+\.(jpg|jpeg|png|gif|webp|bmp))/i', $html, $matches)) {
        foreach ($matches[1] as $i => $imgUrl) {
            $ext = strtolower($matches[2][$i]);
            $filename = "{$prefix}_img_{$i}.{$ext}";
            $result = downloadFile($imgUrl, $dir, $filename);
            if ($result) {
                $downloaded[] = ['url' => $imgUrl, 'local' => $result];
            }
        }
    }
    return $downloaded;
}

/**
 * 파일 다운로드
 */
function downloadFile($url, $dir, $filename) {
    if (empty($url)) return null;
    
    // 파일명 정리
    $filename = preg_replace('/[^\w\-_\.]/', '_', $filename);
    $filepath = $dir . $filename;

    // 이미 존재하면 스킵
    if (file_exists($filepath) && filesize($filepath) > 0) {
        return $filepath;
    }

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ]);
    $data = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200 && $data && strlen($data) > 100) {
        file_put_contents($filepath, $data);
        return $filepath;
    }
    return null;
}

/**
 * URL을 절대경로로 변환
 */
function makeAbsoluteUrl($src, $baseUrl) {
    if (empty($src)) return '';
    if (strpos($src, 'http') === 0) return $src;
    if (strpos($src, '//') === 0) return 'https:' . $src;
    if (strpos($src, '/') === 0) return $baseUrl . $src;
    return $baseUrl . '/' . $src;
}

/**
 * 로그 메시지 출력
 */
function logMsg($msg, $type = '') {
    if (IS_CLI) {
        echo $msg . "\n";
    } else {
        $class = $type ?: '';
        echo "<p class=\"{$class}\">{$msg}</p>";
        ob_flush(); flush();
    }
}
