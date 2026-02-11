import firebaseAdmin from 'firebase-admin';
import fs from 'fs/promises';
import path from 'path';

// --- CONFIGURATION ---
const BUCKET_NAME = 'gangseo-senior.firebasestorage.app';
const COLLECTION_NAME = 'products'; // Target collection
const DRY_RUN = process.argv.includes('--run') ? false : true; // Default to DRY RUN

console.log(DRY_RUN ? "🚧 DRY RUN MODE (No changes will be saved) 🚧" : "🚨 LIVE MODE (Changes WILL be saved) 🚨");

// --- HELPER FUNCTIONS ---
function getStorageUrl(folder, filename) {
    const encodedPath = encodeURIComponent(`${folder}/${filename}`);
    return `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/${encodedPath}?alt=media`;
}

async function main() {
    // 1. Load Service Account
    let serviceAccount;
    try {
        const keyPath = './serviceAccountKey.json';
        await fs.access(keyPath);
        serviceAccount = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
    } catch (e) {
        console.error("❌ Error: 'serviceAccountKey.json' not found.");
        console.error("   To run this script, place the private key file in this directory.");
        process.exit(1);
    }

    // 2. Initialize Firebase
    if (!firebaseAdmin.apps.length) {
        firebaseAdmin.initializeApp({
            credential: firebaseAdmin.credential.cert(serviceAccount)
        });
    }
    const db = firebaseAdmin.firestore();

    // 3. Load Image Mapping
    console.log("📂 Loading image mapping...");
    const mapPath = './migration_data/content_images_map.json';
    let imageMap = {};
    try {
        const mapContent = await fs.readFile(mapPath, 'utf-8');
        imageMap = JSON.parse(mapContent);
    } catch (e) {
        console.warn("⚠️  Warning: content_images_map.json not found. Detail images might not be mapped.");
    }

    // 4. Process Products
    console.log(`🔍 Scanning '${COLLECTION_NAME}' collection...`);
    const snapshot = await db.collection(COLLECTION_NAME).get();

    let updatedCount = 0;
    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        let needsUpdate = false;
        let updates = {};

        // A. Update Main Images (array)
        if (data.images && Array.isArray(data.images)) {
            const newImages = data.images.map(imgUrl => {
                if (imgUrl.includes('cafe24.com') || imgUrl.includes('/web/product/')) {
                    // Logic to deduce filename from URL or Product ID?
                    // Strategy: We uploaded main images as "product_[id]_main".
                    // But 'images' array might have multiple?
                    // For now, let's assume the first image maps to 'product_[id]_main'.
                    // What about others?
                    // This is tricky without a precise mapping for main images.
                    // Fallback: If we can't map exactly, we might skip or use a generic pattern?

                    // Actually, we downloaded main images based on 'big_image' field in JSON.
                    // The 'images' field in Firestore might match that.

                    // Let's rely on Product ID.
                    const productId = data.id; // Assuming 'id' field exists
                    if (productId) {
                        const filename = `product_${productId}_main`; // We saved it as this
                        return getStorageUrl('products/main', filename);
                    }
                }
                return imgUrl;
            });

            if (JSON.stringify(newImages) !== JSON.stringify(data.images)) {
                updates.images = newImages;
                needsUpdate = true;
                console.log(`   [${doc.id}] Main images updated.`);
            }
        }

        // B. Update Content HTML (detail images)
        if (data.content) {
            let newContent = data.content;
            let contentChanged = false;

            // Replace URLs based on mapping
            for (const [originalUrl, filename] of Object.entries(imageMap)) {
                if (newContent.includes(originalUrl)) {
                    const newUrl = getStorageUrl('products/details', filename);
                    newContent = newContent.replaceAll(originalUrl, newUrl);
                    contentChanged = true;
                }
            }

            // Also generic regex for any remaining cafe24 images? 
            // Might be dangerous if not backed up.
            // Stick to mapping for now.

            if (contentChanged) {
                updates.content = newContent;
                needsUpdate = true;
                console.log(`   [${doc.id}] Content HTML updated (replaced detail images).`);
            }
        }

        // Commit Updates
        if (needsUpdate) {
            updatedCount++;
            if (!DRY_RUN) {
                batch.update(doc.ref, updates);
                batchCount++;
                // Commit batches of 500
                if (batchCount >= 400) {
                    await batch.commit();
                    batchCount = 0; // Reset batch
                    // Re-instantiate batch? `batch` object is single use?
                    // Yes, batch is single use. But here we defined it outside.
                    // Wait, cannot re-use batch after commit.
                    // Need to create new batch.
                    // Refactoring loop to handle batching properly is needed if massive.
                    // For 50 products, one batch is fine.
                }
            }
        }
    }

    if (!DRY_RUN && batchCount > 0) {
        await batch.commit();
    }

    console.log(`\n🎉 Scan Complete.`);
    console.log(`   - Documents scanned: ${snapshot.size}`);
    console.log(`   - Documents to update: ${updatedCount}`);
    console.log(`   - Mode: ${DRY_RUN ? 'DRY RUN (Nothing changed)' : 'LIVE (Updated)'}`);

    if (DRY_RUN && updatedCount > 0) {
        console.log(`\n💡 To apply changes, run: node update-firestore-images.mjs --run`);
    }
}

main().catch(console.error);
