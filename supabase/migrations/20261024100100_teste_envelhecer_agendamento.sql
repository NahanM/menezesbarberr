-- Ajuda para os testes de integração da expiração de pendentes (20261024100000).
--
-- Por quê: para testar "pendente criado há mais de 2 h" é preciso empurrar `criado_em` para
-- trás, e nenhum cliente (nem a equipe) consegue dar update nessa coluna; só o service_role
-- conseguiria, e ele nunca entra no repositório nem no .env. Outra saída seria deixar o prazo
-- curto na `config` durante o teste, mas isso expiraria também os pendentes dos testes que
-- rodam em paralelo no mesmo banco (e a tabela `config` não aceita escrita pela API).
--
-- Proteções:
--   * só a equipe executa (revoke de public e anon; checagem de is_equipe() na primeira linha);
--   * só mexe em pendente ou confirmado cujo nome do cliente começa com "Teste", prefixo que os
--     testes usam; cliente de verdade não é afetado;
--   * só recua `criado_em` (1 a 1440 minutos); não muda status, horário nem nenhum outro campo.
-- Se um dia incomodar, basta um `drop function public.teste_envelhecer_agendamento(text, integer)`.

create function public.teste_envelhecer_agendamento(p_codigo text, p_minutos integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.is_equipe() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_codigo is null or p_minutos is null or p_minutos not between 1 and 1440 then
    raise exception 'Informe o código e os minutos (1 a 1440).' using errcode = 'URB10';
  end if;

  update public.agendamentos a
     set criado_em = a.criado_em - make_interval(mins => p_minutos)
   where a.codigo = p_codigo
     and a.status in ('pendente', 'confirmado')
     and a.cliente_nome like 'Teste%';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.teste_envelhecer_agendamento(text, integer) from public, anon, authenticated;
grant execute on function public.teste_envelhecer_agendamento(text, integer) to authenticated;
