// alisa-style toc scrollspy: highlights the toc link matching the section currently in viewport.
// uses IntersectionObserver, no scroll-listener throttling, no layout thrash on scroll.
(function () {
  const links = document.querySelectorAll('.toc-sidebar a[href^="#"]');
  if (!links.length) return;

  const idToLink = new Map();
  links.forEach((link) => {
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    idToLink.set(id, link);
  });

  const headings = Array.from(idToLink.keys())
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (!headings.length) return;

  function setActive(link) {
    if (!link) return;
    links.forEach((otherLink) => otherLink.classList.remove('active'));
    link.classList.add('active');
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActive(idToLink.get(entry.target.id));
        }
      });
    },
    { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
  );

  headings.forEach((heading) => observer.observe(heading));

  // clicking a toc link jumps the page but doesn't always cross the observer's
  // narrow band, so the highlight can lag. update immediately on click; the
  // observer keeps updating as the reader scrolls afterward.
  links.forEach((link) => {
    link.addEventListener('click', () => setActive(link));
  });
})();
