'use strict';

// Comportamentos compartilhados entre a home e a página de detalhe do imóvel:
// header sólido ao rolar, revelação suave de seções (fade-up) e barra mobile fixa.
(function () {
  document.documentElement.classList.add('js-ready'); // opt-in ao scroll-reveal (ver design-system.css)

  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('solid', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  const reveal = document.querySelectorAll('.reveal');
  if (reveal.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveal.forEach((el) => io.observe(el));
  } else {
    reveal.forEach((el) => el.classList.add('in-view'));
  }

  // Barra fixa mobile: WhatsApp direto + abrir o drawer de busca com IA.
  fetch('/api/status').then((r) => r.json()).then((s) => {
    const waLink = document.querySelector('[data-wa-link]');
    if (waLink && s.whatsapp) {
      waLink.href = `https://wa.me/${s.whatsapp}?text=${encodeURIComponent('Olá! Vim pelo site e quero falar sobre um imóvel.')}`;
      waLink.classList.remove('hidden');
    }
  }).catch(() => {});

  document.querySelectorAll('[data-open-chat]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('ael:abrir-chat', { detail: { texto: btn.dataset.texto || '' } }));
    });
  });
})();
