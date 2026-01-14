/**
 * Seoul Senior Club Association - Main JavaScript
 */

$(document).ready(function() {
    // Initialize Hero Slider
    initHeroSlider();
    
    // Initialize Product Slider (optional - using CSS scroll for now)
    // initProductSlider();
    
    // Header scroll effect
    initHeaderScroll();
    
    // Mobile menu toggle
    initMobileMenu();
});

/**
 * Hero Slider using Slick Carousel
 */
function initHeroSlider() {
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
    
    $(window).on('scroll', function() {
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
    const gnb = $('.gnb');
    
    menuBtn.on('click', function() {
        $(this).toggleClass('active');
        gnb.toggleClass('mobile-open');
    });
}

/**
 * Smooth scroll for anchor links
 */
$(document).on('click', 'a[href^="#"]', function(e) {
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
