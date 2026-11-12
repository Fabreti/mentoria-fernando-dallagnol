// API de Conversões da Meta — recebe eventos do navegador e reenvia server-side.
// Roda no mesmo domínio do site, então bloqueador de anúncio não derruba a chamada.

const API = 'https://graph.facebook.com/v21.0';

export const EVENTOS_PERMITIDOS = ['Contact', 'Lead', 'LeadQualificado', 'Schedule'];

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

export const enviarEventoMeta = async (request, env, { event_name, event_id, event_source_url, user_data, custom_data }) => {
  if (!env.META_PIXEL_ID || !env.META_ACCESS_TOKEN) {
    return { ok: false, status: 500, retorno: { erro: 'credenciais ausentes no ambiente' } };
  }

  const dados = {
    client_ip_address: request.headers.get('CF-Connecting-IP') || undefined,
    client_user_agent: request.headers.get('User-Agent') || undefined,
    fbp: lerCookie(request, '_fbp'),
    fbc: lerCookie(request, '_fbc'),
  };

  // dado pessoal só sai daqui com hash, como a Meta exige
  const pessoais = user_data || {};
  if (pessoais.email) dados.em = await sha256(pessoais.email);
  if (pessoais.phone) dados.ph = await sha256(String(pessoais.phone).replace(/\D/g, ''));
  if (pessoais.first_name) dados.fn = await sha256(pessoais.first_name);
  if (pessoais.last_name) dados.ln = await sha256(pessoais.last_name);

  const evento = {
    event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id, // mesmo id do Pixel do navegador, para a Meta deduplicar
    event_source_url: event_source_url || request.headers.get('referer') || undefined,
    action_source: 'website',
    user_data: dados,
    custom_data: custom_data || undefined,
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
  return { ok: resposta.ok, status: resposta.ok ? 200 : 502, retorno };
};

export const onRequestPost = async ({ request, env }) => {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: 'json inválido' }, { status: 400 });
  }
  // endpoint público: só aceita os eventos que o site realmente dispara
  if (!EVENTOS_PERMITIDOS.includes(corpo.event_name)) {
    return Response.json({ erro: 'event_name não permitido' }, { status: 400 });
  }

  const { ok, status, retorno } = await enviarEventoMeta(request, env, corpo);
  if (status === 500) return Response.json(retorno, { status });
  return Response.json({ ok, meta: retorno }, { status });
};
