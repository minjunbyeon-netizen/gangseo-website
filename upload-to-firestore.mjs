/**
 * Cafe24 → Firebase Firestore 데이터 업로드 스크립트
 * Firestore REST API 개별 PATCH 방식 (batchWrite 권한 문제 우회)
 * 
 * 사용법: node upload-to-firestore.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ID = 'gangseo-senior';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const BOARD_MAP = {
    1: { collection: 'notice', name: '알림사항', fileName: 'board_1_알림사항.json' },
    2: { collection: 'jobs', name: '구인구직', fileName: 'board_2_구인구직.json' },
    8: { collection: 'gallery', name: '갤러리', fileName: 'board_8_갤러리.json' }
};

const PRODUCT_MAP = [
    { cateNo: 23, name: '정일품참기름', fileName: 'products_23_정일품참기름.json' },
    { cateNo: 25, name: '액상차즙', fileName: 'products_25_액상차즙.json' },
    { cateNo: 53, name: '더치커피', fileName: 'products_53_더치커피.json' }
];

let stats = { total: 0, success: 0, error: 0 };

// ===== Firestore value conversion =====
function toFV(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(v => toFV(v)) } };
    if (typeof val === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(val)) fields[k] = toFV(v);
        return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
}

function toDoc(data) {
    const fields = {};
    for (const [k, v] of Object.entries(data)) fields[k] = toFV(v);
    return { fields };
}

// ===== Write single document via PATCH =====
async function writeDoc(path, data) {
    const url = `${FIRESTORE_URL}/${path}`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toDoc(data))
    });
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${err.substring(0, 200)}`);
    }
    return true;
}

// ===== Concurrent write with throttling =====
async function writeDocs(items, concurrency = 10) {
    let idx = 0;
    let done = 0;
    const total = items.length;

    async function worker() {
        while (idx < total) {
            const i = idx++;
            const item = items[i];
            try {
                await writeDoc(item.path, item.data);
                stats.success++;
                done++;
            } catch (e) {
                stats.error++;
                done++;
                // Log only first few errors
                if (stats.error <= 3) {
                    console.log(`  ❌ 오류 (${item.path}): ${e.message}`);
                }
            }
        }
    }

    const workers = [];
    for (let w = 0; w < concurrency; w++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return done;
}

// ===== Upload board =====
async function uploadBoard(boardNo, boardInfo) {
    console.log(`\n📋 [${boardInfo.name}] 로드 중...`);

    const filePath = join(__dirname, 'migration_data', boardInfo.fileName);
    let raw;
    try { raw = readFileSync(filePath, 'utf8'); } catch (e) {
        console.log(`  ❌ 파일 읽기 실패: ${e.message}`);
        return;
    }
    const data = JSON.parse(raw);

    if (!data.articles?.length) { console.log(`  ⚠️ 데이터 없음`); return; }

    const articles = data.articles;
    console.log(`  📊 ${articles.length}건 발견`);
    stats.total += articles.length;

    // Meta document
    await writeDoc(`boards/${boardInfo.collection}`, {
        name: boardInfo.name, boardNo, totalArticles: articles.length
    });
    console.log(`  ✅ 메타문서 생성`);

    // Prepare items
    const items = articles.map(article => {
        const docData = {
            title: article.title || '',
            content_html: article.content_html || '',
            content_text: article.content_text || '',
            date: article.date || '',
            attachments: (article.attachments || []).map(a => ({ name: a.name || '', url: a.url || '' })),
            source_url: article.source_url || '',
            boardNo, boardName: boardInfo.name
        };
        if (article.list_info?.thumbnail) docData.thumbnail = article.list_info.thumbnail;
        if (article.list_info?.type) docData.type = article.list_info.type;

        return {
            path: `boards/${boardInfo.collection}/articles/${String(article.id)}`,
            data: docData
        };
    });

    // Write with concurrency
    const startTime = Date.now();
    const count = await writeDocs(items, 15);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ [${boardInfo.name}] ${count}건 처리 (${elapsed}초)`);
}

// ===== Upload products =====
async function uploadProducts() {
    console.log('\n🛍️ 상품 업로드 시작...');

    for (const cat of PRODUCT_MAP) {
        const filePath = join(__dirname, 'migration_data', cat.fileName);
        let raw;
        try { raw = readFileSync(filePath, 'utf8'); } catch { console.log(`  ⚠️ ${cat.name}: 파일 없음`); continue; }
        const data = JSON.parse(raw);

        if (!data.products?.length) { console.log(`  ⚠️ ${cat.name}: 상품 없음`); continue; }

        stats.total += data.products.length;
        const items = data.products.map(p => ({
            path: `products/${String(p.id)}`,
            data: {
                name: p.name || '', price: p.price || '', image: p.image || '',
                summary: p.summary || '', content_html: p.content_html || '',
                category: cat.name, cateNo: cat.cateNo, source_url: p.source_url || ''
            }
        }));

        await writeDocs(items, 5);
        console.log(`  ✅ ${cat.name}: ${data.products.length}건 완료`);
    }
}

// ===== Verify =====
async function verify() {
    console.log('\n🔍 검증 중...');
    for (const [, info] of Object.entries(BOARD_MAP)) {
        try {
            const url = `${FIRESTORE_URL}/boards/${info.collection}/articles?pageSize=3`;
            const resp = await fetch(url);
            const d = await resp.json();
            const cnt = d.documents?.length || 0;
            console.log(`  📊 ${info.name}: ${cnt > 0 ? '✅ 데이터 존재' : '❌ 없음'}`);
            if (cnt > 0) console.log(`     └─ "${d.documents[0].fields?.title?.stringValue}"`);
        } catch (e) { console.log(`  ❌ ${info.name}: ${e.message}`); }
    }
    try {
        const resp = await fetch(`${FIRESTORE_URL}/products?pageSize=3`);
        const d = await resp.json();
        const cnt = d.documents?.length || 0;
        console.log(`  📊 상품: ${cnt > 0 ? '✅ 데이터 존재' : '❌ 없음'}`);
    } catch (e) { console.log(`  ❌ 상품: ${e.message}`); }
}

// ===== Main =====
async function main() {
    console.log('════════════════════════════════════════');
    console.log('  Cafe24 → Firestore 업로드 (REST API)');
    console.log('════════════════════════════════════════\n');

    for (const [boardNo, info] of Object.entries(BOARD_MAP)) {
        await uploadBoard(parseInt(boardNo), info);
    }
    await uploadProducts();

    console.log('\n════════════════════════════════════════');
    console.log(`  🎉 완료! 성공: ${stats.success} | 실패: ${stats.error} | 전체: ${stats.total}`);
    console.log('════════════════════════════════════════');

    await verify();
}

main();
