// API de Conversões da Meta — recebe eventos do navegador e reenvia server-side.
// Roda no mesmo domínio do site, então bloqueador de anúncio não derruba a chamada.

const API = 'https://graph.facebook.com/v21.0';

const sha256 = async (valor) => {
  const dado = new TextEncoder().encode(String(valor).trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', dado);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const lerCookie = (request, nome) => {
  const bruto = request.headers.get('cookie') || '';
  const achado = bruto.match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]+)'));
  return achado ? decodeURIComponent(achado[1]) : undefined;
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.META_PIXEL_ID || !env.META_ACCESS_TOKEN) {
    return Response.json({ erro: 'credenciais ausentes no ambiente' }, { status: 500 });
  }

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: 'json inválido' }, { status: 400 });
  }
  if (!corpo.event_name) {
    return Response.json({ erro: 'event_name obrigatório' }, { status: 400 });
  }

  const user_data = {
    client_ip_address: request.headers.get('CF-Connecting-IP') || undefined,
    client_user_agent: request.headers.get('User-Agent') || undefined,
    fbp: lerCookie(request, '_fbp'),
    fbc: lerCookie(request, '_fbc'),
  };

  // dado pessoal só sai daqui com hash, como a Meta exige
  const pessoais = corpo.user_data || {};
  if (pessoais.email) user_data.em = await sha256(pessoais.email);
  if (pessoais.phone) user_data.ph = await sha256(String(pessoais.phone).replace(/\D/g, ''));
  if (pessoais.first_name) user_data.fn = await sha256(pessoais.first_name);
  if (pessoais.last_name) user_data.ln = await sha256(pessoais.last_name);

  const evento = {
    event_name: corpo.event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: corpo.event_id, // mesmo id do Pixel do navegador, para a Meta deduplicar
    event_source_url: corpo.event_source_url || request.headers.get('referer') || undefined,
    action_source: 'website',
    user_data,
    custom_data: corpo.custom_data || undefined,
  };

  const payload = { data: [evento] };
  if (env.META_TEST_CODE) payload.test_event_code = env.META_TEST_CODE;

  const resposta = await fetch(
    `${API}/${env.META_PIXEL_ID}/events?access_token=${env.META_ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  const retorno = await resposta.json();
  return Response.json({ ok: resposta.ok, meta: retorno }, { status: resposta.ok ? 200 : 502 });
};
