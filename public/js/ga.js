// 방문 통계(구글 애널리틱스 4, Firebase 프로젝트 early-reply).
// 글 내용은 보내지 않는다. 광고용 신호와 맞춤 광고는 끈다.
(function () {
  var ID = 'G-FV7PNLTV65';
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);
})();
