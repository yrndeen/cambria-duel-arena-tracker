document.addEventListener("DOMContentLoaded", () => {
  const animatedSelectors = [
    ".wallet-stats",
    ".live-feed-section",
    ".chart-container",
    ".content-section",
    ".insights-section",
    ".stat-card",
    ".feature-card",
    ".donation-card",
    ".support-section",
    ".leaderboard-table",
    ".duels-table",
    ".contact-link"
  ];

  const revealNodes = document.querySelectorAll(animatedSelectors.join(","));
  revealNodes.forEach((node) => node.classList.add("reveal-on-scroll"));

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  revealNodes.forEach((node) => observer.observe(node));
});
