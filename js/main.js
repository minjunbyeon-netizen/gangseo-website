/**
 * Busan Gangseo Senior Club - Main JavaScript
 */

$(document).ready(function () {
    // Initialize Hero Slider
    initHeroSlider();

    // Initialize Product Slider (optional - using CSS scroll for now)
    // initProductSlider();

    // Header scroll effect
    initHeaderScroll();

    // Mobile menu toggle
    initMobileMenu();

    // Global Image Error Handling
    initImageErrorHandler();

    // 참여신청서 팝업 처리
    initApplyFormPopup();
});

/**
 * 참여신청서 버튼을 팝업으로 열기
 * 이렇게 하면 폼 제출 후에도 원래 페이지에 남아있음
 */
function initApplyFormPopup() {
    $(document).on('click', '.btn-apply', function (e) {
        e.preventDefault();
        var url = $(this).attr('href');
        if (url && url.indexOf('urgency') !== -1) {
            window.open(url, 'applyForm', 'width=900,height=800,scrollbars=yes,resizable=yes,top=100,left=' + (screen.width / 2 - 450));
        }
    });
}

/**
 * Global Image Error Handling
 * Automatically replaces broken images with a placeholder
 */
function initImageErrorHandler() {
    // 1. 처리 함수 정의
    const handleImageError = (img) => {
        // 플레이스홀더 자체가 깨진 경우 무한 루프 방지
        if (img.src.includes('images/placeholder.png')) return;

        // 이미지가 이미 에러 상태거나 로드 실패인 경우
        console.warn('Handling broken image:', img.src);
        img.src = 'images/placeholder.png';
    };

    // 2. 이벤트 위임을 통한 실시간 에러 감지 (캡처링 사용)
    document.addEventListener('error', function (e) {
        if (e.target.tagName.toLowerCase() === 'img') {
            handleImageError(e.target);
        }
    }, true);

    // 3. 이미 로드 시도가 끝난(또는 실패한) 이미지들 체크
    document.querySelectorAll('img').forEach(function (img) {
        if (img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0)) {
            handleImageError(img);
        }
    });
}

/**
 * Hero Slider using Slick Carousel
 */
function initHeroSlider() {
    // If no slider container exists, don't even bother
    if ($('.slider-container').length === 0) return;

    // Check if slick is loaded before initializing
    if (typeof $.fn.slick === 'undefined') {
        console.warn('Slick carousel script is missing, retrying in 100ms...');
        setTimeout(initHeroSlider, 100);
        return;
    }

    $('.slider-container').slick({
        dots: true,
        arrows: true,
        infinite: true,
        speed: 500,
        fade: true,
        cssEase: 'ease-in-out',
        autoplay: true,
        autoplaySpeed: 5000,
        pauseOnHover: true,
        appendDots: $('.slider-dots')
    });
}

/**
 * Header scroll effect - add shadow on scroll
 */
function initHeaderScroll() {
    const header = $('.header');

    $(window).on('scroll', function () {
        if ($(this).scrollTop() > 50) {
            header.addClass('scrolled');
        } else {
            header.removeClass('scrolled');
        }
    });
}

/**
 * Mobile menu toggle
 */
function initMobileMenu() {
    const menuBtn = $('.mobile-menu-btn');
    const header = $('.header');
    const gnb = $('.gnb');

    // Mobile menu button click handler
    menuBtn.on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        header.toggleClass('active');
        gnb.toggleClass('mobile-open');

        // Toggle aria-expanded for accessibility
        const isExpanded = header.hasClass('active');
        $(this).attr('aria-expanded', isExpanded);
        $(this).attr('aria-label', isExpanded ? '메뉴 닫기' : '메뉴 열기');

        // Reset submenus when menu is closed
        if (!isExpanded) {
            $('.has-submenu').removeClass('active');
        }
    });

    // Accordion logic for submenus on mobile
    $('.has-submenu > a').on('click', function (e) {
        if ($(window).width() <= 768) {
            e.preventDefault();
            e.stopPropagation();

            const parentLi = $(this).parent();
            const isActive = parentLi.hasClass('active');

            // Close other open submenus
            $('.has-submenu').not(parentLi).removeClass('active');

            // Toggle current submenu
            parentLi.toggleClass('active');
        }
    });

    // Close menu when clicking on a final menu link
    $('.gnb a').on('click', function (e) {
        if ($(window).width() <= 768) {
            // Only close if it's NOT a parent item that was just clicked
            if (!$(this).parent().hasClass('has-submenu')) {
                header.removeClass('active');
                gnb.removeClass('mobile-open');
                menuBtn.attr('aria-expanded', 'false');
                menuBtn.attr('aria-label', '메뉴 열기');
                $('.has-submenu').removeClass('active');
            }
        }
    });

    // Close menu on window resize (if becoming desktop size)
    $(window).on('resize', function () {
        if ($(window).width() > 768) {
            header.removeClass('active');
            gnb.removeClass('mobile-open');
        }
    });
}

/**
 * Smooth scroll for anchor links
 */
$(document).on('click', 'a[href^="#"]', function (e) {
    e.preventDefault();

    const target = $(this.getAttribute('href'));

    if (target.length) {
        $('html, body').animate({
            scrollTop: target.offset().top - 80
        }, 600);
    }
});

/**
 * Add animation on scroll (optional enhancement)
 */
function initScrollAnimation() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.grid-item, .product-item, .status-stats li').forEach(el => {
        observer.observe(el);
    });
}

// Initialize scroll animation when DOM is ready
if ('IntersectionObserver' in window) {
    document.addEventListener('DOMContentLoaded', initScrollAnimation);
}
