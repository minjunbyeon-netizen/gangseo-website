/**
 * Home Page Board Integration with Firebase Firestore
 * 메인 페이지 알림사항/구인구직/갤러리를 Firestore에서 가져와서 렌더링
 */

(function () {
    'use strict';

    const CONFIG = {
        noticeContainerId: 'home-notice-list',
        jobsContainerId: 'home-jobs-list',
        recentNoticeId: 'home-recent-notice-list',
        galleryContainerId: 'home-gallery-list',
        maxItems: 3,
        cachePrefix: 'home_board_',
        cacheTime: 3 * 60 * 1000  // 3분 캐시
    };

    let db = null;

    function initFirebase() {
        if (db) return;
        if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
            console.error('Firebase SDK or config not loaded');
            return;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
    }

    /**
     * 캐시 관리
     */
    function getCache(key) {
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > CONFIG.cacheTime) {
                localStorage.removeItem(key);
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    function setCache(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({
                data: data,
                timestamp: Date.now()
            }));
        } catch (e) {
            // 무시
        }
    }

    // 페이지 로드시 실행
    function init() {
        console.log('Home board integration initializing (Firebase)...');
        initFirebase();

        // 알림사항 로드
        const noticeContainer = document.getElementById(CONFIG.noticeContainerId);
        if (noticeContainer) {
            loadBoardList('notice', noticeContainer, 'notice-view.html');
        }

        // 구인/구직 로드
        const jobsContainer = document.getElementById(CONFIG.jobsContainerId);
        if (jobsContainer) {
            loadBoardList('jobs', jobsContainer, 'job-view.html');
        }

        // 최근 소식 로드
        const recentNoticeContainer = document.getElementById(CONFIG.recentNoticeId);
        if (recentNoticeContainer) {
            loadBoardList('notice', recentNoticeContainer, 'notice-view.html');
        }

        // 갤러리 로드
        const galleryContainer = document.getElementById(CONFIG.galleryContainerId);
        if (galleryContainer) {
            loadGalleryList('gallery', galleryContainer, 'gallery-view.html');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /**
     * Firestore에서 게시판 목록 로드
     */
    async function loadBoardList(collection, container, viewPage) {
        if (!container || !db) return;

        const cacheKey = `${CONFIG.cachePrefix}${collection}`;
        const cachedData = getCache(cacheKey);

        if (cachedData && cachedData.length > 0) {
            renderList(container, cachedData, viewPage);
            return;
        }

        try {
            const snapshot = await db.collection('boards')
                .doc(collection)
                .collection('articles')
                .orderBy('date', 'desc')
                .limit(CONFIG.maxItems)
                .get();

            const items = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                items.push({
                    id: doc.id,
                    title: data.title || '',
                    date: data.date || '',
                    type: data.type || ''
                });
            });

            if (items.length > 0) {
                setCache(cacheKey, items);
                renderList(container, items, viewPage);
            } else {
                container.innerHTML = '<li><span class="title">등록된 글이 없습니다.</span></li>';
            }
        } catch (error) {
            console.error(`Home board ${collection} load error:`, error);
            container.innerHTML = '<li><span class="title">불러오기 실패. 잠시 후 다시 시도해주세요.</span></li>';
        }
    }

    /**
     * Firestore에서 갤러리 목록 로드
     */
    async function loadGalleryList(collection, container, viewPage) {
        if (!container || !db) return;

        const cacheKey = `${CONFIG.cachePrefix}gallery_${collection}`;
        const cachedData = getCache(cacheKey);

        if (cachedData && cachedData.length > 0) {
            renderGallery(container, cachedData, viewPage);
            return;
        }

        try {
            const snapshot = await db.collection('boards')
                .doc(collection)
                .collection('articles')
                .orderBy('date', 'desc')
                .limit(6)
                .get();

            const items = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                items.push({
                    id: doc.id,
                    title: data.title || '',
                    date: data.date || '',
                    thumbnail: data.thumbnail || ''
                });
            });

            if (items.length > 0) {
                setCache(cacheKey, items);
                renderGallery(container, items, viewPage);
            } else {
                container.innerHTML = '<div class="board-empty"><p>등록된 이미지가 없습니다.</p></div>';
            }
        } catch (error) {
            console.error(`Home gallery load error:`, error);
            container.innerHTML = '<div class="board-error"><p>갤러리를 불러오지 못했습니다.</p></div>';
        }
    }

    /**
     * 목록 렌더링
     */
    function renderList(container, items, viewPage) {
        if (!container) return;

        const limitedItems = items.slice(0, CONFIG.maxItems);
        let html = '';

        limitedItems.forEach(item => {
            const localLink = `${viewPage}?id=${item.id}`;
            const formattedDate = item.date ? item.date.replace(/-/g, '.') : '';

            html += `
                <li>
                    <a href="${localLink}">
                        <span class="title">${escapeHtml(item.title)}</span>
                        <span class="date">${formattedDate}</span>
                    </a>
                </li>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * 갤러리 렌더링
     */
    function renderGallery(container, items, viewPage) {
        if (!container) return;

        const limitedItems = items.slice(0, 6);
        let html = '';

        limitedItems.forEach(item => {
            const localLink = `${viewPage}?id=${item.id}`;
            const thumbnail = item.thumbnail || 'images/placeholder.png';
            const formattedDate = item.date ? item.date.replace(/-/g, '.') : '';

            html += `
                <a href="${localLink}" class="gallery-card-home">
                    <div class="gallery-card-img">
                        <img src="${thumbnail}" alt="${escapeHtml(item.title)}" onerror="this.src='images/placeholder.png'" loading="lazy">
                    </div>
                    <div class="gallery-card-info">
                        <h4 class="gallery-card-title">${escapeHtml(item.title)}</h4>
                        <span class="gallery-card-date">${formattedDate}</span>
                    </div>
                </a>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * HTML 이스케이프
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

})();
