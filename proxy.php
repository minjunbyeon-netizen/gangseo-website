<?php
/**
 * Cafe24 Board Proxy with Caching
 * Cafe24 게시판 콘텐츠를 가져와서 JSON으로 반환 (캐싱 지원)
 */

header('Content-Type: application/json; charset=utf-8');

// 🔒 보안: CORS 설정 - 허용된 도메인만
$allowedOrigins = [
    'https://gs2015.kr',
    'http://localhost',
    'http://127.0.0.1'
];
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if (in_array($origin, $allowedOrigins) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false) {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    header('Access-Control-Allow-Origin: https://gs2015.kr');
}

// 🔒 보안 헤더
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');

// 캐시 설정
define('CACHE_DIR', __DIR__ . '/cache/');
define('CACHE_TIME_LIST', 300);    // 목록 캐시: 5분
define('CACHE_TIME_ARTICLE', 600); // 글 캐시: 10분

// 캐시 디렉토리 생성
if (!file_exists(CACHE_DIR)) {
    mkdir(CACHE_DIR, 0755, true);
}

// 요청 파라미터
$boardNo = isset($_GET['board_no']) ? intval($_GET['board_no']) : 2;
$page = isset($_GET['page']) ? intval($_GET['page']) : 1;
$action = isset($_GET['action']) ? $_GET['action'] : 'list';
$articleId = isset($_GET['article_id']) ? intval($_GET['article_id']) : 0;
$productId = isset($_GET['product_id']) ? intval($_GET['product_id']) : 0;
$cateNo = isset($_GET['cate_no']) ? intval($_GET['cate_no']) : 23;
$noCache = isset($_GET['nocache']) ? true : false;

// 게시판 정보 매핑
$boardInfo = [
    1 => ['name' => '알림사항', 'slug' => '알림사항'],
    2 => ['name' => '구인구직', 'slug' => '구인구직'],
    8 => ['name' => '갤러리', 'slug' => '갤러리']
];

// 캐시 키 생성
$cacheKey = $action . '_' . $boardNo . '_' . $page . '_' . $articleId . '_' . $cateNo . '_' . $productId;
$cacheFile = CACHE_DIR . $cacheKey . '.json';
$cacheTime = ($action === 'list' || $action === 'products') ? CACHE_TIME_LIST : CACHE_TIME_ARTICLE;

// 캐시 확인
if (!$noCache && file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTime) {
    // 캐시에서 반환
    echo file_get_contents($cacheFile);
    exit;
}

try {
    if ($action === 'list') {
        $result = fetchBoardList($boardNo, $page);
    } elseif ($action === 'view' && $articleId > 0) {
        $slug = $boardInfo[$boardNo]['slug'] ?? '구인구직';
        $result = fetchArticleDetail($boardNo, $articleId, $slug);
    } elseif ($action === 'products') {
        $result = fetchProductList($cateNo, $page);
    } elseif ($action === 'product_view' && $productId > 0) {
        $result = fetchProductDetail($productId);
    } else {
        throw new Exception('Invalid action or missing parameters');
    }

    $json = json_encode($result, JSON_UNESCAPED_UNICODE);

    // 캐시 저장
    file_put_contents($cacheFile, $json);

    echo $json;

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

    // 갤러리 게시판(board_no=8)은 ul/li 구조 사용
    if ($boardNo == 8) {
        // 갤러리 li 항목들 파싱
        $galleryItems = $xpath->query("//div[contains(@module, 'board_list_8')]//li | //div[contains(@class, 'xans-board-list')]//li");

        foreach ($galleryItems as $li) {
            // 링크 추출
            $linkNode = $xpath->query(".//a[contains(@href, '/article/')]", $li)->item(0);
            if (!$linkNode)
                continue;

            $href = $linkNode->getAttribute('href');

            // URL에서 article ID 추출
            preg_match('/\/article\/[^\/]+\/\d+\/(\d+)/', $href, $matches);
            $articleId = $matches[1] ?? 0;
            if (!$articleId)
                continue;

            // 제목 추출
            $title = '';
            $titleNode = $xpath->query(".//p[not(contains(@class, 'imgLink'))]", $li)->item(0);
            if ($titleNode) {
                $title = trim($titleNode->textContent);
            }
            if (empty($title)) {
                $title = trim($linkNode->textContent);
            }
            if (empty($title) || strlen($title) < 2)
                continue;

            // 날짜 추출
            $dateText = '';
            $dateNode = $xpath->query(".//span | .//em", $li)->item(0);
            if ($dateNode) {
                $text = trim($dateNode->textContent);
                if (preg_match('/\d{4}-\d{2}-\d{2}/', $text, $dateMatches)) {
                    $dateText = $dateMatches[0];
                }
            }
            // 날짜를 못 찾았으면 전체에서 찾기
            if (empty($dateText)) {
                $liHtml = $dom->saveHTML($li);
                if (preg_match('/(\d{4}-\d{2}-\d{2})/', $liHtml, $dateMatches)) {
                    $dateText = $dateMatches[1];
                }
            }

            // 날짜가 없거나 유효하지 않은 경우 (9999-12-31 등) 처리
            if (empty($dateText) || strpos($dateText, '9999') !== false) {
                $dateText = date('Y-m-d'); // 기본값으로 오늘 날짜 사용 또는 빈 문자열
            }

            // 썸네일 이미지 추출
            $thumbnail = '';
            // 우선 data-src 확인 (지연 로딩 대응)
            $imgNode = $xpath->query(".//img", $li)->item(0);
            if ($imgNode) {
                $src = $imgNode->getAttribute('data-src');
                if (empty($src)) {
                    $src = $imgNode->getAttribute('src');
                }

                // ico_ 가 포함된 이미지는 무시
                if (!empty($src) && strpos($src, 'ico_') === false) {
                    if (strpos($src, 'http') !== 0) {
                        if (strpos($src, '//') === 0) {
                            $thumbnail = 'https:' . $src;
                        } elseif (strpos($src, '/') === 0) {
                            $thumbnail = 'https://gs2015.kr' . $src;
                        } else {
                            $thumbnail = 'https://gs2015.kr/' . $src;
                        }
                    } else {
                        $thumbnail = $src;
                    }
                }
            }

            $items[] = [
                'id' => $articleId,
                'num' => 0,
                'isNotice' => false,
                'type' => '',
                'title' => $title,
                'date' => $dateText,
                'views' => 0,
                'link' => 'https://gs2015.kr' . $href,
                'thumbnail' => $thumbnail
            ];
        }
    }

    // 테이블 구조 파싱 (갤러리가 아니거나 갤러리에서 아이템을 못 찾은 경우)
    if (count($items) === 0) {
        // Cafe24 테이블 구조 파싱: ec-base-table 내의 tbody tr
        $rows = $xpath->query("//div[contains(@class, 'ec-base-table')]//tbody//tr");

        foreach ($rows as $row) {
            $cells = $xpath->query(".//td", $row);
            if ($cells->length < 3)
                continue;

            // 링크와 제목 추출
            $linkNode = $xpath->query(".//td[contains(@class, 'subject')]//a", $row)->item(0);
            if (!$linkNode) {
                $linkNode = $xpath->query(".//a[contains(@href, '/article/')]", $row)->item(0);
            }

            if (!$linkNode)
                continue;

            $href = $linkNode->getAttribute('href');
            $title = trim($linkNode->textContent);

            if (empty($title) || strlen($title) < 2)
                continue;

            // URL에서 article ID 추출
            preg_match('/\/article\/[^\/]+\/\d+\/(\d+)/', $href, $matches);
            $articleId = $matches[1] ?? 0;
            if (!$articleId)
                continue;

            // 번호 추출
            $numCell = $cells->item(0);
            $numText = trim($numCell->textContent);
            $isNotice = (strpos($numText, '공지') !== false || $xpath->query(".//img[contains(@alt, '공지')]", $numCell)->length > 0);
            $num = $isNotice ? 0 : intval($numText);

            // 날짜 추출 - txtNum 클래스 또는 날짜 패턴
            $dateText = '';
            $dateCells = $xpath->query(".//td//span[@class='txtNum']", $row);
            foreach ($dateCells as $dateCell) {
                $text = trim($dateCell->textContent);
                if (preg_match('/\d{4}-\d{2}-\d{2}/', $text)) {
                    $dateText = $text;
                    break;
                }
            }
            // 날짜를 못 찾았으면 전체 row에서 찾기
            if (empty($dateText)) {
                $rowHtml = $dom->saveHTML($row);
                if (preg_match('/(\d{4}-\d{2}-\d{2})/', $rowHtml, $dateMatches)) {
                    $dateText = $dateMatches[1];
                }
            }

            // 조회수 추출 - hit_display 클래스가 있는 td 내의 txtNum
            $views = 0;
            $hitCells = $xpath->query(".//td[contains(@class, 'hit')]//span[@class='txtNum'] | .//td[5]//span[@class='txtNum']", $row);
            if ($hitCells->length > 0) {
                foreach ($hitCells as $hitCell) {
                    $hitText = trim($hitCell->textContent);
                    if (is_numeric($hitText)) {
                        $views = intval($hitText);
                        break;
                    }
                }
            }
            // 조회수를 못 찾았으면 5번째 td에서 시도
            if ($views === 0 && $cells->length >= 5) {
                $viewCell = $cells->item(4);
                $viewText = trim($viewCell->textContent);
                if (is_numeric($viewText)) {
                    $views = intval($viewText);
                }
            }

            // 구인/구직 타입 추출
            $type = '구인';
            $rowHtml = $dom->saveHTML($row);
            if (strpos($title, '구직') !== false || strpos($rowHtml, '구직') !== false) {
                $type = '구직';
            }

            // 썸네일 이미지 추출 (갤러리용)
            $thumbnail = '';
            $imgNodes = $xpath->query(".//img[not(contains(@src, 'ico_'))]", $row);
            foreach ($imgNodes as $imgNode) {
                $src = $imgNode->getAttribute('src');
                if (!empty($src) && strpos($src, 'ico_') === false && strpos($src, 'icon') === false) {
                    if (strpos($src, 'http') !== 0) {
                        if (strpos($src, '//') === 0) {
                            $thumbnail = 'https:' . $src;
                        } elseif (strpos($src, '/') === 0) {
                            $thumbnail = 'https://gs2015.kr' . $src;
                        } else {
                            $thumbnail = 'https://gs2015.kr/' . $src;
                        }
                    } else {
                        $thumbnail = $src;
                    }
                    break;
                }
            }

            $items[] = [
                'id' => $articleId,
                'num' => $num,
                'isNotice' => $isNotice,
                'type' => $type,
                'title' => $title,
                'date' => $dateText,
                'views' => $views,
                'link' => 'https://gs2015.kr' . $href,
                'thumbnail' => $thumbnail
            ];
        }
    } // end if (count($items) === 0)

    // 페이지네이션 정보 추출
    $pagination = [
        'current' => $page,
        'total' => 1,
        'hasNext' => false,
        'hasPrev' => $page > 1
    ];

    // ec-base-paginate에서 페이지 정보 추출
    $pageLinks = $xpath->query("//div[contains(@class, 'ec-base-paginate')]//a | //div[contains(@class, 'ec-base-paginate')]//li//a");
    $maxPage = $page;

    foreach ($pageLinks as $pageLink) {
        $pageText = trim($pageLink->textContent);
        if (is_numeric($pageText) && intval($pageText) > $maxPage) {
            $maxPage = intval($pageText);
        }
        $href = $pageLink->getAttribute('href');
        if (strpos($href, 'page=') !== false) {
            preg_match('/page=(\d+)/', $href, $pageMatches);
            if (!empty($pageMatches[1]) && intval($pageMatches[1]) > $maxPage) {
                $maxPage = intval($pageMatches[1]);
            }
        }
    }

    // 다음 페이지 버튼 확인
    $nextBtn = $xpath->query("//div[contains(@class, 'ec-base-paginate')]//a[contains(@alt, '다음')]")->item(0);
    if ($nextBtn) {
        $pagination['hasNext'] = true;
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

    // 제목 추출 - 다양한 셀렉터 시도
    $title = '';
    $titleSelectors = [
        "//div[contains(@class, 'ec-base-table')]//th[contains(text(), '제목')]/following-sibling::td",
        "//td[contains(@class, 'subject')]",
        "//h1",
        "//h2[contains(@class, 'title')]",
        "//div[contains(@class, 'view_title')]"
    ];

    foreach ($titleSelectors as $selector) {
        $titleNode = $xpath->query($selector)->item(0);
        if ($titleNode) {
            $title = trim($titleNode->textContent);
            if (!empty($title))
                break;
        }
    }

    // 본문 내용 추출 - 게시판 유형에 따라 다른 셀렉터 우선순위 적용
    $content = '';

    // 갤러리 게시판(board_no=8)은 .detail 셀렉터를 우선 사용 (이미지가 이 영역에 있음)
    if ($boardNo == 8) {
        $contentSelectors = [
            "//div[contains(@class, 'detail')]",
            "//div[contains(@class, 'fr-view') and contains(@class, 'fr-view-article')]",
            "//div[contains(@class, 'fr-view')]",
            "//div[contains(@class, 'view_content')]",
            "//div[contains(@class, 'board_view')]",
            "//td[@colspan]//div"
        ];
    } else {
        $contentSelectors = [
            "//div[contains(@class, 'fr-view') and contains(@class, 'fr-view-article')]",
            "//div[contains(@class, 'fr-view')]",
            "//div[contains(@class, 'detail')]",
            "//div[contains(@class, 'view_content')]",
            "//div[contains(@class, 'board_view')]",
            "//td[@colspan]//div"
        ];
    }

    foreach ($contentSelectors as $selector) {
        $contentNode = $xpath->query($selector)->item(0);
        if ($contentNode) {
            $tempContent = $dom->saveHTML($contentNode);
            // 콘텐츠가 충분히 길고, 가능하면 이미지가 포함된 것을 선호
            if (!empty($tempContent) && strlen($tempContent) > 50) {
                $content = $tempContent;
                // 이미지가 있으면 바로 사용, 없으면 계속 탐색
                if (strpos($tempContent, '<img') !== false) {
                    break;
                }
            }
        }
    }

    // 이미지 URL을 절대 경로로 변환
    $content = convertToAbsoluteUrls($content, 'https://gs2015.kr');

    // 날짜 추출 - 다양한 셀렉터 순차 시도
    $date = '';
    $dateSelectors = [
        "//ul[contains(@class, 'etcArea')]//li[contains(., '작성일')]//span[@class='txtNum']",
        "//ul[contains(@class, 'etcArea')]//li//span[@class='txtNum']",
        "//*[contains(@class, 'date')]",
        "//*[contains(@class, 'time')]"
    ];

    foreach ($dateSelectors as $selector) {
        $dateNodes = $xpath->query($selector);
        foreach ($dateNodes as $dateNode) {
            $text = trim($dateNode->textContent);
            // 전각 공백 및 일반 공백 제거
            $text = preg_replace('/[\s\x{3000}]+/u', '', $text);
            if (preg_match('/(\d{4}-\d{2}-\d{2})/', $text, $matches)) {
                $date = $matches[1];
                break 2; // 날짜를 찾으면 루프 탈출
            }
        }
    }

    // 날짜를 못 찾았으면 etcArea 전체에서 찾기
    if (empty($date)) {
        $etcAreaNode = $xpath->query("//ul[contains(@class, 'etcArea')]")->item(0);
        if ($etcAreaNode) {
            $etcText = $etcAreaNode->textContent;
            if (preg_match('/(\d{4}-\d{2}-\d{2})/', $etcText, $dateMatches)) {
                $date = $dateMatches[1];
            }
        }
    }

    // 그래도 못 찾으면 테이블(ec-base-table)에서 날짜 행 찾기
    if (empty($date)) {
        $tableRows = $xpath->query("//div[contains(@class, 'ec-base-table')]//tr");
        foreach ($tableRows as $row) {
            $rowText = $row->textContent;
            if (strpos($rowText, '작성일') !== false || strpos($rowText, '등록일') !== false) {
                if (preg_match('/(\d{4}-\d{2}-\d{2})/', $rowText, $dateMatches)) {
                    $date = $dateMatches[1];
                    break;
                }
            }
        }
    }

    // 날짜가 없거나 유효하지 않은 경우 처리
    if (empty($date) || strpos($date, '9999') !== false) {
        $date = date('Y-m-d');
    }

    // 첨부파일 추출
    $attachments = [];

    // 방법 1: tr.attach 클래스에서 첨부파일 찾기
    $attachRows = $xpath->query("//tr[contains(@class, 'attach')]");
    foreach ($attachRows as $attachRow) {
        $attachLinks = $xpath->query(".//a", $attachRow);
        foreach ($attachLinks as $link) {
            $onclick = $link->getAttribute('onclick');
            $fileName = trim($link->textContent);

            if (!empty($onclick) && strpos($onclick, 'file_download') !== false) {
                // onclick에서 다운로드 URL 추출
                // BOARD_READ.file_download('/exec/front/Board/download/?no=326&realname=xxx.pdf&filename=파일명.pdf');
                if (preg_match("/file_download\\(['\"]([^'\"]+)['\"]/", $onclick, $urlMatches)) {
                    $downloadPath = $urlMatches[1];
                    // HTML 엔티티 디코딩
                    $downloadPath = html_entity_decode($downloadPath);
                    $downloadUrl = 'https://gs2015.kr' . $downloadPath;

                    $attachments[] = [
                        'name' => $fileName,
                        'url' => $downloadUrl
                    ];
                }
            }
        }
    }

    // 방법 2: '첨부파일' 텍스트가 포함된 행에서 찾기 (attach 클래스가 없는 경우)
    if (empty($attachments)) {
        $tableRows = $xpath->query("//div[contains(@class, 'ec-base-table')]//tr");
        foreach ($tableRows as $row) {
            $thNode = $xpath->query(".//th", $row)->item(0);
            if ($thNode && strpos($thNode->textContent, '첨부파일') !== false) {
                $attachLinks = $xpath->query(".//td//a", $row);
                foreach ($attachLinks as $link) {
                    $onclick = $link->getAttribute('onclick');
                    $fileName = trim($link->textContent);

                    if (!empty($onclick) && strpos($onclick, 'file_download') !== false) {
                        if (preg_match("/file_download\\(['\"]([^'\"]+)['\"]/", $onclick, $urlMatches)) {
                            $downloadPath = $urlMatches[1];
                            $downloadPath = html_entity_decode($downloadPath);
                            $downloadUrl = 'https://gs2015.kr' . $downloadPath;

                            $attachments[] = [
                                'name' => $fileName,
                                'url' => $downloadUrl
                            ];
                        }
                    }
                }
            }
        }
    }

    return [
        'success' => true,
        'data' => [
            'id' => $articleId,
            'title' => $title,
            'content' => $content,
            'date' => $date,
            'attachments' => $attachments,
            'url' => $url
        ]
    ];
}

/**
 * 상대 URL을 절대 URL로 변환
 */
function convertToAbsoluteUrls($html, $baseUrl)
{
    // src 속성 변환 (이미지, 스크립트 등)
    $html = preg_replace_callback(
        '/src=["\']([^"\']+)["\']/i',
        function ($matches) use ($baseUrl) {
            $src = $matches[1];
            // data: URL은 그대로 유지
            if (strpos($src, 'data:') === 0) {
                return $matches[0];
            }
            if (strpos($src, 'http') === 0 || strpos($src, '//') === 0) {
                return $matches[0]; // 이미 절대 경로
            }
            if (strpos($src, '/') === 0) {
                return 'src="' . $baseUrl . $src . '"';
            }
            return 'src="' . $baseUrl . '/' . $src . '"';
        },
        $html
    );

    // href 속성 변환 (링크)
    $html = preg_replace_callback(
        '/href=["\']([^"\']+)["\']/i',
        function ($matches) use ($baseUrl) {
            $href = $matches[1];
            if (strpos($href, 'http') === 0 || strpos($href, '//') === 0 || strpos($href, '#') === 0 || strpos($href, 'javascript') === 0 || strpos($href, 'mailto') === 0) {
                return $matches[0]; // 이미 절대 경로이거나 특수 링크
            }
            if (strpos($href, '/') === 0) {
                return 'href="' . $baseUrl . $href . '"';
            }
            return 'href="' . $baseUrl . '/' . $href . '"';
        },
        $html
    );

    // style 속성의 background-image url 변환
    $html = preg_replace_callback(
        '/url\(["\']?([^"\')\s]+)["\']?\)/i',
        function ($matches) use ($baseUrl) {
            $url = $matches[1];
            // data:, http, // 로 시작하면 그대로 유지
            if (strpos($url, 'data:') === 0 || strpos($url, 'http') === 0 || strpos($url, '//') === 0) {
                return $matches[0];
            }
            if (strpos($url, '/') === 0) {
                return 'url("' . $baseUrl . $url . '")';
            }
            return 'url("' . $baseUrl . '/' . $url . '")';
        },
        $html
    );

    return $html;
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

/**
 * 상품 목록 가져오기
 */
function fetchProductList($cateNo, $page)
{
    $url = "https://gs2015.kr/product/list.html?cate_no={$cateNo}&page={$page}";

    $html = fetchUrl($url);
    if (!$html) {
        throw new Exception('Failed to fetch product list');
    }

    // HTML 파싱
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();

    $xpath = new DOMXPath($dom);

    $items = [];

    // Cafe24 상품 목록 파싱: prdList 내의 li 항목들
    $productItems = $xpath->query("//ul[contains(@class, 'prdList')]//li[contains(@id, 'anchorBoxId')]");

    foreach ($productItems as $li) {
        // 상품 상세 링크 추출
        $linkNode = $xpath->query(".//a[contains(@href, '/product/')]", $li)->item(0);
        if (!$linkNode)
            continue;

        $href = $linkNode->getAttribute('href');

        // 상품 ID 추출
        $productNo = 0;
        $idAttr = $li->getAttribute('id');
        if (preg_match('/anchorBoxId_(\d+)/', $idAttr, $matches)) {
            $productNo = intval($matches[1]);
        }
        if (!$productNo)
            continue;

        // 상품명 추출
        $name = '';
        $nameNode = $xpath->query(".//strong[contains(@class, 'name')]//a", $li)->item(0);
        if ($nameNode) {
            $name = trim($nameNode->textContent);
        }
        if (empty($name))
            continue;

        // 상품 이미지 추출
        $image = '';
        $imgNode = $xpath->query(".//div[contains(@class, 'prdImg')]//img", $li)->item(0);
        if ($imgNode) {
            $src = $imgNode->getAttribute('src');
            if (!empty($src)) {
                if (strpos($src, 'http') !== 0) {
                    if (strpos($src, '//') === 0) {
                        $image = 'https:' . $src;
                    } elseif (strpos($src, '/') === 0) {
                        $image = 'https://gs2015.kr' . $src;
                    } else {
                        $image = 'https://gs2015.kr/' . $src;
                    }
                } else {
                    $image = $src;
                }
            }
        }

        // 가격 추출
        $price = '';
        $priceNode = $xpath->query(".//li[@rel='판매가']", $li)->item(0);
        if ($priceNode) {
            $price = trim($priceNode->textContent);
            $price = preg_replace('/^[^:]+:\s*/', '', $price); // "판매가 :" 제거
        }
        // 가격을 못 찾았으면 다른 방법 시도
        if (empty($price)) {
            $specLis = $xpath->query(".//ul[@class='spec']//li", $li);
            foreach ($specLis as $specLi) {
                $text = trim($specLi->textContent);
                if (strpos($text, '원') !== false || strpos($text, ',') !== false) {
                    $price = preg_replace('/^[^:]+:\s*/', '', $text);
                    break;
                }
            }
        }

        // 상품 링크를 절대 경로로 변환
        $fullLink = 'https://gs2015.kr' . $href;

        $items[] = [
            'id' => $productNo,
            'name' => $name,
            'image' => $image,
            'price' => $price,
            'link' => $fullLink
        ];
    }

    // 페이지네이션 정보 추출
    $pagination = [
        'current' => $page,
        'total' => 1,
        'hasNext' => false,
        'hasPrev' => $page > 1
    ];

    // 페이지 정보 추출
    $pageLinks = $xpath->query("//div[contains(@class, 'ec-base-paginate')]//a | //div[contains(@class, 'ec-base-paginate')]//ol//li//a");
    $maxPage = $page;

    foreach ($pageLinks as $pageLink) {
        $pageText = trim($pageLink->textContent);
        if (is_numeric($pageText) && intval($pageText) > $maxPage) {
            $maxPage = intval($pageText);
        }
    }

    // 다음 페이지 버튼 확인
    $nextBtn = $xpath->query("//div[contains(@class, 'ec-base-paginate')]//a[contains(@href, 'page=')]")->item(0);
    if ($nextBtn && $page < $maxPage) {
        $pagination['hasNext'] = true;
    }

    $pagination['total'] = $maxPage;

    // 카테고리 정보
    $categoryName = '';
    $categoryNode = $xpath->query("//div[contains(@class, 'title')]//h2")->item(0);
    if ($categoryNode) {
        $categoryName = trim($categoryNode->textContent);
    }

    return [
        'success' => true,
        'category' => $categoryName,
        'data' => $items,
        'pagination' => $pagination
    ];
}

/**
 * 상품 상세 정보 가져오기
 */
function fetchProductDetail($productId)
{
    $url = "https://gs2015.kr/product/detail.html?product_no={$productId}";

    $html = fetchUrl($url);
    if (!$html) {
        throw new Exception('Failed to fetch product detail');
    }

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();

    $xpath = new DOMXPath($dom);

    // 상품명 추출
    $name = '';
    $nameNode = $xpath->query("//div[contains(@class, 'infoArea')]//h2")->item(0);
    if ($nameNode) {
        $name = trim($nameNode->textContent);
    }

    // 가격 추출
    $price = '';
    $priceNode = $xpath->query("//*[@id='span_product_price_text']")->item(0);
    if ($priceNode) {
        $price = trim($priceNode->textContent);
    }

    // 메인 이미지 추출
    $image = '';
    $imgNode = $xpath->query("//div[contains(@class, 'keyImg')]//img")->item(0);
    if ($imgNode) {
        $src = $imgNode->getAttribute('src');
        if (!empty($src)) {
            if (strpos($src, 'http') !== 0) {
                if (strpos($src, '//') === 0) {
                    $image = 'https:' . $src;
                } elseif (strpos($src, '/') === 0) {
                    $image = 'https://gs2015.kr' . $src;
                } else {
                    $image = 'https://gs2015.kr/' . $src;
                }
            } else {
                $image = $src;
            }
        }
    }

    // 상세 설명 추출
    $content = '';
    $contentNode = $xpath->query("//div[@id='prdDetail']")->item(0);
    if ($contentNode) {
        $content = $dom->saveHTML($contentNode);
    }

    // 이미지 및 링크를 절대 경로로 변환
    $content = convertToAbsoluteUrls($content, 'https://gs2015.kr');

    return [
        'success' => true,
        'data' => [
            'id' => $productId,
            'name' => $name,
            'price' => $price,
            'image' => $image,
            'content' => $content,
            'url' => $url
        ]
    ];
}
?>