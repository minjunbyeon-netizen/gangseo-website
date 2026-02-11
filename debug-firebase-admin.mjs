import firebaseAdmin from 'firebase-admin';
import fs from 'fs/promises';

const serviceAccount = JSON.parse(await fs.readFile('./serviceAccountKey.json', 'utf-8'));

firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount)
});

async function main() {
    console.log(`Project ID: ${serviceAccount.project_id}`);

    try {
        const [buckets] = await firebaseAdmin.storage().getBuckets();
        console.log('Buckets:');
        buckets.forEach(bucket => {
            console.log(`- ${bucket.name}`);
        });
    } catch (err) {
        console.error('Error listing buckets:', err);
    }
}

main();
