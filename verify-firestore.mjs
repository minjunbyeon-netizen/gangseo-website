const PROJECT_ID = 'gangseo-senior';
const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';

async function show() {
    console.log('========================================');
    console.log('  Firestore 데이터 현황 (gangseo-senior)');
    console.log('========================================\n');

    // 1) Boards meta
    const boardsResp = await fetch(BASE + '/boards?pageSize=10');
    const boards = await boardsResp.json();
    console.log('📁 게시판 메타문서:');
    if (boards.documents) {
        for (const doc of boards.documents) {
            const f = doc.fields;
            const name = doc.name.split('/').pop();
            console.log('  ├─ ' + name + ': ' + (f.name?.stringValue || '') + ' (boardNo=' + (f.boardNo?.integerValue || '') + ', 총 ' + (f.totalArticles?.integerValue || '') + '건)');
        }
    }

    // 2) Each board articles
    const colls = [
        { id: 'notice', name: '알림사항' },
        { id: 'jobs', name: '구인구직' },
        { id: 'gallery', name: '갤러리' }
    ];

    for (const c of colls) {
        console.log('\n📋 [' + c.name + '] 최근 게시글:');
        const resp = await fetch(BASE + '/boards/' + c.id + '/articles?pageSize=5');
        const data = await resp.json();
        if (data.documents) {
            console.log('  총 표시: ' + data.documents.length + '건 (최대 5건)');
            for (const doc of data.documents) {
                const f = doc.fields;
                const id = doc.name.split('/').pop();
                const title = (f.title?.stringValue || '').substring(0, 45);
                const date = f.date?.stringValue || '';
                const attCount = f.attachments?.arrayValue?.values?.length || 0;
                const extra = f.type?.stringValue ? ' [' + f.type.stringValue + ']' : '';
                const thumb = f.thumbnail?.stringValue ? ' 🖼️' : '';
                console.log('  ├─ #' + id + ' | ' + date + ' | ' + title + extra + thumb + ' (첨부 ' + attCount + '건)');
            }
        }
    }

    // 3) Products
    console.log('\n🛍️ [상품] 목록:');
    const prodResp = await fetch(BASE + '/products?pageSize=15');
    const prods = await prodResp.json();
    if (prods.documents) {
        console.log('  총: ' + prods.documents.length + '건');
        for (const doc of prods.documents) {
            const f = doc.fields;
            const id = doc.name.split('/').pop();
            const name = f.name?.stringValue || '';
            const price = f.price?.stringValue || '';
            const cat = f.category?.stringValue || '';
            console.log('  ├─ #' + id + ' | ' + cat + ' | ' + name + ' | ' + price);
        }
    }

    console.log('\n========================================');
    console.log('  ✅ 전체 데이터 확인 완료');
    console.log('========================================');
}

show();
