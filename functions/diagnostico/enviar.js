// Formulário do diagnóstico — valida no servidor, repassa ao Active Lead e avisa a Meta.
// Chamado duas vezes: etapa "contato" (nome/e-mail/WhatsApp) e etapa "completo" (qualificadoras).

import { enviarEventoMeta } from '../capi.js';

const limpar = (v, max = 200) => String(v ?? '').trim().slice(0, max);

export const CARGOS = ['Dono/sócio', 'Diretor/gestor', 'Corretor', 'Outro'];
export const SETORES = ['Somente venda', 'Somente locação', 'Venda e locação', 'Avaliação', 'Incorporação', 'Todas as anteriores'];
export const VGV = [
  'De R$ 0 a R$ 20.000.000,00',
  'De R$ 20.000.000,00 a R$ 50.000.000,00',
  'De R$ 50.000.000,00 a R$ 100.000.000,00',
  'Acima de R$ 100.000.000,00',
];
export const DESAFIOS_VENDAS = [
  'Engajamento da equipe',
  'Média de comissionamento baixo',
  'Falta de previsibilidade em vendas',
  'Falta de processos definidos',
  'Alta rotatividade de corretores',
  'Falta de metas claras',
  'Gestão ineficiente',
  'Falta de clareza de rotina da gestão/corretores',
  'Branding e posicionamento',
  'Gestão de dados deficitária/inexistente',
  'Dificuldade no recrutamento e seleção de corretores',
];

export const qualificar = (respostas) => {
  // TODO: critério do Vinicius
  return true;
};

const respostasDe = (corpo) => {
  const lista = Array.isArray(corpo.desafios_vendas) ? corpo.desafios_vendas : [];
  return {
    cargo: limpar(corpo.cargo, 40),
    tempo_mercado: limpar(corpo.tempo_mercado, 80),
    empresa_nome: limpar(corpo.empresa_nome, 160),
    socios: limpar(corpo.socios, 120),
    instagram: limpar(corpo.instagram, 160),
    setores: limpar(corpo.setores, 40),
    vgv: limpar(corpo.vgv, 60),
    satisfacao: limpar(corpo.satisfacao, 2),
    corretores_venda: limpar(corpo.corretores_venda, 6).replace(/\D/g, ''),
    colaboradores_locacao: limpar(corpo.colaboradores_locacao, 6).replace(/\D/g, ''),
    carteira_locacao: limpar(corpo.carteira_locacao, 8).replace(/\D/g, ''),
    desafios_vendas: lista.map((d) => limpar(d, 80)).filter((d) => DESAFIOS_VENDAS.includes(d)),
    desafios_empresa: limpar(corpo.desafios_empresa, 2000),
    objetivo_mentoria: limpar(corpo.objetivo_mentoria, 2000),
  };
};

const faltando = (r) => {
  if (!CARGOS.includes(r.cargo)) return 'Escolha seu cargo.';
  if (!r.tempo_mercado) return 'Informe seu tempo de mercado.';
  if (!r.empresa_nome) return 'Informe o nome da empresa.';
  if (!r.socios) return 'Responda sobre sócios.';
  if (!r.instagram) return 'Informe o Instagram.';
  if (!SETORES.includes(r.setores)) return 'Escolha o setor de atuação.';
  if (!VGV.includes(r.vgv)) return 'Escolha a faixa de VGV.';
  const nota = Number(r.satisfacao);
  if (r.satisfacao === '' || !Number.isInteger(nota) || nota < 0 || nota > 10) return 'Escolha uma nota de 0 a 10.';
  if (r.corretores_venda === '') return 'Informe quantos corretores de vendas.';
  if (!r.desafios_vendas.length) return 'Marque ao menos um desafio em vendas.';
  if (!r.desafios_empresa) return 'Conte seus maiores desafios na empresa.';
  if (!r.objetivo_mentoria) return 'Conte o que espera da mentoria.';
  return '';
};

const novoId = () => crypto.randomUUID();

export const onRequestPost = async ({ request, env, waitUntil }) => {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ ok: false, erro: 'Dados inválidos.' }, { status: 400 });
  }

  // campo-armadilha: humano não vê, robô preenche
  if (limpar(corpo.empresa_hp)) return Response.json({ ok: true, qualificado: false, event_id: novoId() });

  const etapa = corpo.etapa === 'completo' ? 'completo' : 'contato';
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

  let respostas = null;
  if (etapa === 'completo') {
    respostas = respostasDe(corpo);
    const erro = faltando(respostas);
    if (erro) return Response.json({ ok: false, erro }, { status: 422 });
  }

  if (!env.DIAGNOSTICO_WEBHOOK_URL) {
    return Response.json({ ok: false, erro: 'Formulário indisponível no momento.' }, { status: 503 });
  }

  const utm = corpo.utm && typeof corpo.utm === 'object' ? corpo.utm : {};
  const qualificado = respostas ? qualificar(respostas) : false;

  const lead = {
    // o capture-lead do Active Lead exige "name"; phone/whatsapp e nome repetidos para casar com o mapeamento
    name: nome,
    nome,
    phone: whatsapp,
    whatsapp,
    email,
    utm: {
      utm_source: limpar(utm.utm_source),
      utm_medium: limpar(utm.utm_medium),
      utm_campaign: limpar(utm.utm_campaign),
      utm_content: limpar(utm.utm_content),
      utm_term: limpar(utm.utm_term),
      utm_id: limpar(utm.utm_id),
    },
    fbclid: limpar(corpo.fbclid, 500) || undefined,
    pagina: limpar(corpo.pagina, 500),
    referrer: limpar(corpo.referrer, 500),
    etapa,
  };
  if (respostas) {
    Object.assign(lead, respostas, {
      desafios_vendas: respostas.desafios_vendas.join('; '),
      qualificado: qualificado ? 'sim' : 'nao',
    });
  }

  const resposta = await fetch(env.DIAGNOSTICO_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(lead),
  });
  if (!resposta.ok) {
    return Response.json({ ok: false, erro: 'Não foi possível concluir. Tente de novo.' }, { status: 502 });
  }

  const event_id = novoId();
  const evento = etapa === 'contato' ? 'Lead' : qualificado ? 'LeadQualificado' : null;
  if (evento) {
    const envio = enviarEventoMeta(request, env, {
      event_name: evento,
      event_id,
      event_source_url: lead.pagina || undefined,
      user_data: { email, phone: whatsapp, first_name: nome.split(' ')[0] },
      custom_data: { content_name: 'Diagnóstico', origem: lead.utm.utm_campaign || undefined },
    }).catch(() => null); // falha na Meta nunca derruba o formulário
    if (waitUntil) waitUntil(envio);
    else await envio;
  }

  return Response.json({ ok: true, qualificado, event_id });
};
