// Giscus评论系统配置
document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('giscus-container');
    if (container) {
        const script = document.createElement('script');
        script.src = 'https://giscus.app/client.js';
        script.setAttribute('data-repo', '999qw/13332');
        script.setAttribute('data-repo-id', 'R_kgDOS4H4ew');
        script.setAttribute('data-category', 'Announcements');
        script.setAttribute('data-category-id', 'DIC_kwDOS4H4e84C-_Nk');
        script.setAttribute('data-mapping', 'pathname');
        script.setAttribute('data-strict', '0');
        script.setAttribute('data-reactions-enabled', '1');
        script.setAttribute('data-emit-metadata', '0');
        script.setAttribute('data-input-position', 'bottom');
        script.setAttribute('data-theme', 'preferred_color_scheme');
        script.setAttribute('data-lang', 'zh-CN');
        script.crossOrigin = 'anonymous';
        script.async = true;
        container.appendChild(script);
    }
});