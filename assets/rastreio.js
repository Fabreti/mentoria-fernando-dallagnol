(function () {
  var w = window, d = document;
  w.dataLayer = w.dataLayer || [];

  var CHAVE = 'fd_origem', VALIDADE = 30 * 864e5;
  var q = new URLSearchParams(location.search);
  var nova = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) {
    if (q.get(k)) nova[k] = q.get(k);
  });
  if (q.get('fbclid')) nova.fbclid = 1;

  var origem = null;
  try {
    if (Object.keys(nova).length) {
      nova.t = Date.now();
      localStorage.setItem(CHAVE, JSON.stringify(nova));
      origem = nova;
    } else {
      var salva = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      if (salva && Date.now() - salva.t < VALIDADE) origem = salva;
    }
  } catch (e) { origem = Object.keys(nova).length ? nova : null; }

  var ref = '';
  if (origem) {
    ref = [origem.utm_source, origem.utm_campaign, origem.utm_content].filter(Boolean).join('/');
    if (!ref && origem.fbclid) ref = 'meta-ads';
  }
  if (!ref && d.referrer) {
    try {
      var host = new URL(d.referrer).hostname.replace(/^(www|l|lm|m)\./, '');
      if (host !== location.hostname) ref = host;
    } catch (e) {}
  }

  if (ref) {
    d.querySelectorAll('a[href*="wa.me/"]').forEach(function (a) {
      var partes = a.href.split('?text=');
      var texto = partes[1] ? decodeURIComponent(partes[1]) : '';
      a.href = partes[0] + '?text=' + encodeURIComponent(texto + '\n\n(ref: ' + ref + ')');
    });
  }

  var novoId = function () {
    return w.crypto && crypto.randomUUID ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  };

  d.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;

    if (a.href.indexOf('wa.me/') > -1) {
      var id = novoId();
      w.dataLayer.push({ event: 'clique_whatsapp', event_id: id, link_url: a.href, origem: ref || 'direto' });
      // fetch com keepalive sobrevive à troca de página; o Pixel no GTM usa o mesmo event_id para a Meta deduplicar
      fetch('/capi', {
        method: 'POST', keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_name: 'Contact', event_id: id, event_source_url: location.href,
          custom_data: { content_name: 'Clique WhatsApp', origem: ref || 'direto' },
        }),
      }).catch(function () {});
      return;
    }

    if (a.classList.contains('lk')) {
      var nome = a.querySelector('.lk-t');
      w.dataLayer.push({ event: 'clique_link', link_nome: nome ? nome.textContent.trim() : a.href, link_url: a.href });
    }
  });
})();
