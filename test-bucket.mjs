import firebaseAdmin from 'firebase-admin';
import fs from 'fs/promises';

const serviceAccount = JSON.parse(await fs.readFile('./serviceAccountKey.json', 'utf-8'));

// Try standard format
const BUCKET_NAME = 'gangseo-senior.appspot.com';

console.log(`Testing bucket: ${BUCKET_NAME}`);

firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount),
    storageBucket: BUCKET_NAME
});

const bucket = firebaseAdmin.storage().bucket();

async function main() {
    try {
        await bucket.file('test_upload.txt').save('Hello World!');
        console.log('✅ Upload successful!');
    } catch (err) {
        console.error('❌ Upload failed:', err.message);

        // Try fallback bucket if failed
        if (err.code === 404) {
            console.log('Trying fallback: gangseo-senior.firebasestorage.app');
            // Re-init with other bucket? No, just get bucket by name
            const otherBucket = firebaseAdmin.storage().bucket('gangseo-senior.firebasestorage.app');
            try {
                await otherBucket.file('test_upload.txt').save('Hello World!');
                console.log('✅ Upload successful with fallback!');
            } catch (e) {
                console.error('❌ Fallback failed:', e.message);
            }
        }
    }
}

main();
