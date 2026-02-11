import firebaseAdmin from 'firebase-admin';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';

// 서비스 계정 키 로드 (동적 import로 JSON 읽기)
// 서비스 계정 키 로드 (fs로 직접 읽기)
const serviceAccount = JSON.parse(await fs.readFile('./serviceAccountKey.json', 'utf-8'));

const MIGRATION_DIR = 'migration_data';
const BUCKET_NAME = 'gangseo-senior.firebasestorage.app';

// Initialize Firebase Admin
if (!firebaseAdmin.apps.length) {
    firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
        storageBucket: BUCKET_NAME
    });
}

const bucket = firebaseAdmin.storage().bucket();

async function uploadFile(localPath, remotePath) {
    try {
        await bucket.upload(localPath, {
            destination: remotePath,
            metadata: {
                contentType: path.extname(localPath) === '.png' ? 'image/png' : 'image/jpeg'
            }
        });
        console.log(`✅ Uploaded: ${remotePath}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed: ${remotePath} - ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🚀 Starting admin upload...');

    let sCount = 0;
    let fCount = 0;

    // 1. 상세 이미지 업로드
    console.log('\n=== Uploading Detail Images ===');
    try {
        const mapContent = await fs.readFile(path.join(MIGRATION_DIR, 'content_images_map.json'), 'utf-8');
        const mapData = JSON.parse(mapContent);
        const uniqueFilenames = [...new Set(Object.values(mapData))];

        console.log(`Found ${uniqueFilenames.length} detail images.`);

        for (const filename of uniqueFilenames) {
            const localPath = path.join(MIGRATION_DIR, 'images', 'details', filename);
            const remotePath = `products/details/${filename}`;

            // Check if file exists
            try {
                await fs.access(localPath);
                const success = await uploadFile(localPath, remotePath);
                if (success) sCount++; else fCount++;
            } catch {
                console.log(`⚠️ Skip missing file: ${filename}`);
            }
        }
    } catch (e) {
        console.error(`Error processing details: ${e.message}`);
    }

    // 2. 대표 이미지 업로드
    console.log('\n=== Uploading Main Images ===');
    const productFiles = [
        'products_23_정일품참기름.json',
        'products_25_액상차즙.json',
        'products_53_더치커피.json'
    ];

    for (const file of productFiles) {
        try {
            const content = await fs.readFile(path.join(MIGRATION_DIR, file), 'utf-8');
            const data = JSON.parse(content);
            if (!data.products) continue;

            for (const product of data.products) {
                const filename = `product_${product.id}_main`; // No extension in local filename usually?
                // Check if file exists with matching name in images dir
                // Actually my validation showed `product_21_main` (no extension)
                // But upload logic needs to know which file to pick.

                const localPath = path.join(MIGRATION_DIR, 'images', filename);
                const remotePath = `products/main/${filename}`; // Uploading without extension or with?

                // Let's try to detect MIME type or just upload as is
                try {
                    await fs.access(localPath);
                    // Add .jpg or .png extension to remote path if missing?
                    // The browser tool was uploading as `product_${product.id}_main` (no ext on remote either)
                    // Let's keep it consistent.

                    const success = await uploadFile(localPath, remotePath);
                    if (success) sCount++; else fCount++;
                } catch {
                    // Maybe it has extension in local?
                    // In verification `list_dir` output: `product_21_main` (no ext).
                    // So exact match.
                    console.log(`⚠️ Skip missing main image: ${filename}`);
                }
            }
        } catch (e) {
            console.error(`Error processing ${file}: ${e.message}`);
        }
    }

    console.log('\n🎉 Finished!');
    console.log(`Success: ${sCount}, Failed: ${fCount}`);
}

main().catch(console.error);
