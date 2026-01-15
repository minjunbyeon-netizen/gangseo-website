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
                } else {
                    $dateText = $text;
                }
            }
            // 날짜를 못 찾았으면 전체에서 찾기
            if (empty($dateText)) {
                $liHtml = $dom->saveHTML($li);
                if (preg_match('/(\d{4}-\d{2}-\d{2})/', $liHtml, $dateMatches)) {
                    $dateText = $dateMatches[1];
                }
            }

            // 썸네일 이미지 추출
            $thumbnail = '';
            $imgNode = $xpath->query(".//img", $li)->item(0);
            if ($imgNode) {
                $src = $imgNode->getAttribute('src');
                if (!empty($src)) {
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

    // 본문 내용 추출 - fr-view fr-view-article 클래스 우선
    $content = '';
    $contentSelectors = [
        "//div[contains(@class, 'fr-view') and contains(@class, 'fr-view-article')]",
        "//div[contains(@class, 'fr-view')]",
        "//div[contains(@class, 'detail')]",
        "//div[contains(@class, 'view_content')]",
        "//div[contains(@class, 'board_view')]",
        "//td[@colspan]//div"
    ];

    foreach ($contentSelectors as $selector) {
        $contentNode = $xpath->query($selector)->item(0);
        if ($contentNode) {
            $content = $dom->saveHTML($contentNode);
            if (!empty($content) && strlen($content) > 50)
                break;
        }
    }

    // 이미지 URL을 절대 경로로 변환
    $content = convertToAbsoluteUrls($content, 'https://gs2015.kr');

    // 날짜 추출
    $date = '';
    $dateNode = $xpath->query("//*[contains(@class, 'date')] | //*[contains(@class, 'time')]")->item(0);
    if ($dateNode) {
        $date = trim($dateNode->textContent);
    }
    // 날짜를 못 찾았으면 본문에서 찾기
    if (empty($date) && preg_match('/(\d{4}-\d{2}-\d{2})/', $html, $dateMatches)) {
        $date = $dateMatches[1];
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
?>