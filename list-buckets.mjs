import firebaseAdmin from 'firebase-admin';
import fs from 'fs/promises';

const serviceAccount = JSON.parse(await fs.readFile('./serviceAccountKey.json', 'utf-8'));

firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount)
});

async function main() {
    try {
        console.log('Listing buckets (via dummy ref)...');
        // Initialize a dummy bucket to get access to the storage client
        const dummyBucket = firebaseAdmin.storage().bucket('dummy-bucket');
        const storageClient = dummyBucket.storage;

        const [buckets] = await storageClient.getBuckets();

        console.log('Found buckets:');
        if (buckets.length === 0) {
            console.log('No buckets found.');
        } else {
            buckets.forEach(bucket => {
                console.log(`- ${bucket.name}`);
            });
        }
    } catch (err) {
        console.error('Error listing buckets:', err);
    }
}

main();
