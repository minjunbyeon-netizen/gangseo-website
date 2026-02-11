import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import https from 'https';

const MIGRATION_DIR = 'migration_data';
const IMAGE_DIR = path.join(MIGRATION_DIR, 'images', 'details');

// Ensure directory exists
async function ensureDir(dir) {
    try {
        await fsPromises.access(dir);
    } catch {
        await fsPromises.mkdir(dir, { recursive: true });
    }
}

// Download image
function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        // Handle protocol-relative URLs (starts with //)
        if (url.startsWith('//')) {
            url = 'https:' + url;
        }

        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => { }); // Delete failed file
            reject(err);
        });
    });
}

// Extract filename from URL
function getFilenameFromUrl(url) {
    // Handle protocol-relative URLs
    if (url.startsWith('//')) {
        url = 'https:' + url;
    }

    try {
        const urlObj = new URL(url);
        return path.basename(urlObj.pathname);
    } catch (e) {
        // Fallback for simple string manipulation if URL parsing fails
        return url.split('/').pop().split('?')[0];
    }
}

async function main() {
    await ensureDir(IMAGE_DIR);
    console.log(`📂 Saving images to: ${IMAGE_DIR}`);

    // Read all JSON files
    const files = await fsPromises.readdir(MIGRATION_DIR);
    const jsonFiles = files.filter(f => f.startsWith('products_') && f.endsWith('.json'));

    let totalImages = 0;
    let successCount = 0;
    let failCount = 0;
    const downloadMap = {}; // original_url -> local_filename

    for (const file of jsonFiles) {
        console.log(`\n📄 Processing ${file}...`);
        const content = await fsPromises.readFile(path.join(MIGRATION_DIR, file), 'utf-8');
        const data = JSON.parse(content);

        if (!data.products) continue;

        for (const product of data.products) {
            let contentHtml = product.content_html || product.content || '';
            if (!contentHtml) continue;

            // Find all image URLs (ec-data-src or src)
            const imgRegex = /<img[^>]+(ec-data-src|src)="([^">]+)"/g;
            let match;

            while ((match = imgRegex.exec(contentHtml)) !== null) {
                const url = match[2];
                if (!url || url.includes('placeholder') || url.startsWith('data:')) continue;

                // Create unique filename: [product_id]_[original_filename]
                const filename = `${product.id}_${getFilenameFromUrl(url)}`;
                const filepath = path.join(IMAGE_DIR, filename); // No need for path.resolve here, relative is fine for fs operations usually, but let's stick to simple join

                // Avoid re-downloading if we already processed this URL in this run (though rare)
                if (downloadMap[url]) continue;

                try {
                    // Check if file already exists to skip
                    try {
                        await fs.access(filepath);
                        // console.log(`  Skipping existing: ${filename}`);
                        downloadMap[url] = filename;
                        continue;
                    } catch {
                        // File doesn't exist, proceed download
                    }

                    process.stdout.write(`  ⬇️ Downloading ${filename}... `);
                    await downloadImage(url, filepath);
                    console.log('✅ OK');

                    downloadMap[url] = filename;
                    successCount++;
                } catch (err) {
                    console.log(`❌ Failed: ${err.message}`);
                    failCount++;
                }
                totalImages++;
            }
        }
    }

    // Save map file
    await fsPromises.writeFile(
        path.join(MIGRATION_DIR, 'content_images_map.json'),
        JSON.stringify(downloadMap, null, 2)
    );

    console.log(`\n🎉 Completed!`);
    console.log(`Total images processed: ${totalImages}`);
    console.log(`Downloaded: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Map saved to: ${path.join(MIGRATION_DIR, 'content_images_map.json')}`);
}

main().catch(console.error);
