// Inscrição da masterclass — valida no servidor e repassa para o webhook do CRM.
// A URL do webhook fica em variável de ambiente, fora do navegador.

const limpar = (v, max = 200) => String(v ?? '').trim().slice(0, max);

export const onRequestPost = async ({ request, env }) => {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ ok: false, erro: 'Dados inválidos.' }, { status: 400 });
  }

  // campo-armadilha: humano não vê, robô preenche
  if (limpar(corpo.empresa)) return Response.json({ ok: true });

  const nome = limpar(corpo.nome, 120);
  const email = limpar(corpo.email, 160).toLowerCase();
  const digitos = limpar(corpo.whatsapp, 30).replace(/\D/g, '');
  const whatsapp = digitos.startsWith('55') ? digitos : '55' + digitos;

  if (nome.length < 2) return Response.json({ ok: false, erro: 'Informe seu nome.' }, { status: 422 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return Response.json({ ok: false, erro: 'E-mail inválido.' }, { status: 422 });
  }
  if (whatsapp.length < 12 || whatsapp.length > 13) {
    return Response.json({ ok: false, erro: 'WhatsApp inválido. Use DDD + número.' }, { status: 422 });
  }

  if (!env.WEBHOOK_URL) {
    return Response.json({ ok: false, erro: 'Inscrições indisponíveis no momento.' }, { status: 503 });
  }

  const utm = corpo.utm && typeof corpo.utm === 'object' ? corpo.utm : {};
  const inscricao = {
    evento: 'masterclass_follow_up',
    // o CRM exige "name"; as demais chaves vão em inglês e português para casar com o mapeamento dele
    name: nome,
    phone: whatsapp,
    nome,
    email,
    whatsapp,
    utm_source: limpar(utm.utm_source),
    utm_medium: limpar(utm.utm_medium),
    utm_campaign: limpar(utm.utm_campaign),
    utm_content: limpar(utm.utm_content),
    utm_term: limpar(utm.utm_term),
    pagina: limpar(corpo.pagina, 500),
    referrer: limpar(corpo.referrer, 500),
    criado_em: new Date().toISOString(),
  };

  const resposta = await fetch(env.WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(inscricao),
  });

  if (!resposta.ok) {
    return Response.json({ ok: false, erro: 'Não foi possível concluir. Tente de novo.' }, { status: 502 });
  }
  return Response.json({ ok: true });
};
