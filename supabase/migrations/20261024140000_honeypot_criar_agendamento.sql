-- Honeypot (S4): campo "website" invisível no formulário do /agendar. Pessoa nunca o preenche
-- (fica fora da tela, fora do Tab e escondido do leitor de tela); robô de formulário preenche tudo.
--
-- Regra: criar_agendamento ganha p_website (último parâmetro, padrão null). Se vier com algum
-- conteúdo depois de limpar espaços e caracteres de controle, a função recusa com URB20 SEM gravar
-- nada. A checagem é a PRIMEIRA coisa da função: vem antes da config, da validação e do limite
-- global (URB18), então o robô não gasta a cota de ninguém.
--
-- Por que erro (URB20) e não "falso sucesso": o robô não recebe um código real, e a pessoa que um
-- preenchimento automático de navegador acertou por engano vê uma mensagem em vez de achar que
-- reservou. Mensagem neutra, sem dizer que existe um honeypot.
--
-- Limite honesto: quem chama a RPC direto simplesmente não manda o campo. Isto só pega robô de formulário.
--
-- A assinatura muda, então a função antiga sai (drop) e a nova recebe os grants do zero.
-- _criar_agendamento e teste_criar_agendamento NÃO mudam: o honeypot é do formulário público.

drop function public.criar_agendamento(text[], text, timestamptz, text, text);

create function public.criar_agendamento(
  p_servicos text[],
  p_barbeiro text,
  p_inicio timestamptz,
  p_nome text,
  p_telefone text,
  p_website text default null
)
returns table (
  codigo text,
  barbeiro_nome text,
  servico_nome text,
  inicio timestamptz,
  preco_total_centavos integer,
  duracao_total_min integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_max_minuto integer;
  v_max_hora integer;
begin
  -- Honeypot: antes de qualquer outra coisa. Espaços e caracteres de controle não contam como conteúdo.
  if p_website is not null
     and regexp_replace(p_website, '[[:space:][:cntrl:]]+', '', 'g') <> '' then
    raise exception 'Não foi possível enviar agora. Tente de novo mais tarde.' using errcode = 'URB20';
  end if;

  select c.max_criacoes_por_minuto, c.max_criacoes_por_hora
    into v_max_minuto, v_max_hora
  from public.config c;
  if not found then
    raise exception 'Configuração do agendamento ausente.' using errcode = 'URB19';
  end if;

  return query
    select r.codigo, r.barbeiro_nome, r.servico_nome, r.inicio, r.preco_total_centavos, r.duracao_total_min
    from public._criar_agendamento(
      p_servicos, p_barbeiro, p_inicio, p_nome, p_telefone, v_max_minuto, v_max_hora, now(), true
    ) r;
end;
$$;
revoke execute on function public.criar_agendamento(text[], text, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.criar_agendamento(text[], text, timestamptz, text, text, text)
  to anon, authenticated;
