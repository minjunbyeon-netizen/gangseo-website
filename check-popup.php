<?php
header('Content-Type: text/html; charset=utf-8');
echo "<h2>Cafe24 팝업/배너 구조 분석</h2><pre>";

$html = @file_get_contents('https://gs2015.kr');
if (!$html) {
    // try curl
    $ch = curl_init('https://gs2015.kr');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    ]);
    $html = curl_exec($ch);
    curl_close($ch);
}

if (!$html) {
    echo "페이지 로드 실패";
    exit;
}

// Encoding
$enc = mb_detect_encoding($html, ['UTF-8', 'EUC-KR', 'CP949'], true);
if ($enc && $enc !== 'UTF-8') {
    $html = mb_convert_encoding($html, 'UTF-8', $enc);
}

echo "HTML 길이: " . strlen($html) . " bytes\n\n";

// Search for popup-related patterns
$patterns = [
    'popup' => '/[^a-z](popup[^"\'<>\s]{0,50})/i',
    'banner' => '/[^a-z](banner[^"\'<>\s]{0,50})/i',
    'layer' => '/(layer[_-]?pop[^"\'<>\s]{0,50})/i',
    'window.open' => '/(window\.open\([^)]{0,200}\))/i',
    'popupzone' => '/(xans-popup[^"\'<>\s]{0,50})/i',
    'module_popup' => '/(module="[^"]*popup[^"]*")/i',
];

foreach ($patterns as $name => $pattern) {
    preg_match_all($pattern, $html, $matches);
    $unique = array_unique($matches[1] ?? []);
    echo "=== {$name} ({" . count($unique) . "} found) ===\n";
    foreach ($unique as $m) {
        echo "  " . htmlspecialchars(trim($m)) . "\n";
    }
    echo "\n";
}

// Look for div blocks with popup-related content
echo "=== popup/banner DIV blocks ===\n";
preg_match_all('/<div[^>]*(popup|banner|layer_pop)[^>]*>[\s\S]{0,500}?<\/div>/i', $html, $divMatches);
foreach ($divMatches[0] as $div) {
    echo htmlspecialchars(substr($div, 0, 300)) . "\n---\n";
}

// Look for image URLs in popup context
echo "\n=== popup-related images ===\n";
preg_match_all('/<img[^>]*src=["\']([^"\']*)["\'][^>]*>/i', $html, $imgMatches);
foreach ($imgMatches[1] as $img) {
    echo htmlspecialchars($img) . "\n";
}

echo "</pre>";
