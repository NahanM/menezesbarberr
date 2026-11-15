// Ajustes da rolagem (sequência "Você cuida do carro..." e combos). Tudo que dá para mexer no
// navegador está aqui, com o efeito de aumentar e de diminuir. Salve e a página recarrega.
//
// Como funciona: cada frase (e cada combo) tem uma "etapa" de rolagem dividida em três trechos:
//   ENTRADA  a frase chega (aparece, sobe até o lugar)
//   PAUSA    a frase fica inteira e parada: é o tempo de ler
//   SAÍDA    a frase vai embora
// A pausa NÃO trava a rolagem: ela só existe porque a rolagem daquele trecho não mexe em nada.
// Quanto mais rolagem (vh) tem a etapa, mais a pessoa precisa rolar para chegar na próxima.
// ENTRADA, PAUSA e SAÍDA são proporções normalizadas: só a relação entre as três importa
// (0.35/0.30/0.35 e 35/30/35 dão o mesmo resultado; 1/1/1 divide a etapa em três partes iguais).

// ---------------------------------------------------------------------------
// Onde cada modo vale
// ---------------------------------------------------------------------------

/**
 * Quando é "desktop": mouse (pointer fine) e tela de pelo menos 1024px. Só nele roda o Lenis e só
 * nele valem os números "DESKTOP" abaixo. Celular e tablet usam rolagem nativa e os números "CELULAR".
 */
export const CONSULTA_DESKTOP = '(pointer: fine) and (min-width: 1024px)'

// ---------------------------------------------------------------------------
// Suavização
// ---------------------------------------------------------------------------

/**
 * Lenis (scroll suave do desktop): fração do caminho que a rolagem anda a cada quadro. Vai de 0 a 1.
 * Menor (ex.: 0.05) = a rolagem "escorrega" mais e demora a parar, sensação pesada.
 * Maior (ex.: 0.3) = segue a roda de perto, sensação seca. 1 = sem suavização.
 */
export const LENIS_LERP = 0.1

/**
 * Mola (useSpring) que segue a posição da rolagem e dá peso às animações das seções.
 * Rigidez: a força que puxa a animação para onde a rolagem está.
 * Maior = alcança rápido, mais seco. Menor = demora a chegar, mais lento e "boiando".
 */
export const MOLA_RIGIDEZ = 400

/**
 * Amortecimento da mola: o freio dela.
 * Maior = chega sem balançar e mais devagar. Menor = chega mais rápido, mas pode passar do ponto e voltar (tranco).
 * O ponto de equilíbrio (amortecimento crítico) é 2 x raiz(rigidez): com rigidez 400, 2 x 20 = 40.
 * O valor 40 é exatamente esse ponto: a mola chega o mais rápido possível sem balançar. Acima disso ela fica
 * mais pesada e lenta; abaixo disso ela balança (passa do ponto e volta). Se mudar a rigidez, mantenha o
 * amortecimento perto de 2 x raiz(rigidez).
 * Atenção: no desktop o Lenis (LENIS_LERP) também suaviza, e o atraso dele soma com o da mola (atraso duplo).
 * Por isso a mola é dura (rigidez 400): ela só acompanha o Lenis de perto, sem somar um segundo "boiar".
 */
export const MOLA_AMORTECIMENTO = 40

// ---------------------------------------------------------------------------
// Frases: "Você cuida do carro. / Cuida do tênis. / E o visual?" (+ fechamento)
// ---------------------------------------------------------------------------

/**
 * Rolagem de CADA frase no desktop, em vh (1vh = 1% da altura da tela; 60 = 60% de uma tela).
 * Maior = precisa rolar mais para trocar de frase, ritmo mais lento. Menor = troca com pouca rolagem.
 * Conta da pausa: vh/100 x pausa normalizada x altura da tela. Precisa dar pelo menos 150px. A conta é para
 * tela de 900px (1440x900, a dos testes): 60/100 x 0,34 x 900px = 184px; em 800px dá cerca de 163px.
 * Os testes medem de 25 em 25px: uma pausa precisa de pelo menos 175px para a medida nunca cair abaixo de 150px
 * (com pausa 0,30 eram 162px e a medida deu 125px).
 */
export const FRASES_VH_DESKTOP = 60

/**
 * Rolagem de cada frase no celular, em vh. É maior porque uma passada de dedo comum
 * anda cerca de uma tela: com 100, uma passada leva a uma frase.
 * Maior = pede mais de uma passada por frase. Menor = uma passada pode pular de frase.
 */
export const FRASES_VH_CELULAR = 100

/**
 * ENTRADA e SAÍDA das frases formam a TROCA: a frase que sai e a próxima que entra acontecem juntas,
 * no mesmo trecho de rolagem (crossfade), para a tela nunca ficar vazia. Por isso a troca ocupa
 * ENTRADA + SAÍDA (com os valores padrão, 66% da etapa) e a PAUSA ocupa o resto. A etapa de cada
 * frase é FRASES_VH_*: pausa + troca. O que importa é a soma das duas; as duas devem ficar iguais.
 *
 * Parte da etapa da troca em que a frase ENTRA.
 * Maior (junto com a saída) = a troca é mais longa e suave, e a pausa mais curta. Menor = troca rápida.
 */
export const FRASES_ENTRADA = 0.33

/**
 * Parte da etapa em que a frase fica PARADA e inteira (opacidade 1, sem mexer).
 * Maior = mais rolagem com a frase lida e parada. Menor = a frase já começa a sair logo.
 * Mínimo: vh x pausa x altura da tela >= 150px (desktop, conta para 900px: 60/100 x 0,34 x 900px = 184px, e cerca de 163px em 800px; celular: 100/100 x 0,34 x 800px = 272px).
 */
export const FRASES_PAUSA = 0.34

/**
 * Parte da etapa da troca em que a frase SAI (some e sobe), junto com a entrada da próxima.
 * Maior (junto com a entrada) = troca mais longa. Menor = troca rápida. Mantenha igual à ENTRADA.
 */
export const FRASES_SAIDA = 0.33

/**
 * Quanto a entrada da frase nova e a saída da velha se encavalam dentro da troca (0 a 0,9).
 * 0 = a nova só termina de entrar quando a velha termina de sair: no meio da troca as duas estão em 50%.
 * 0,25 = a nova fica inteira um pouco antes da velha sumir: no meio da troca as duas passam de 60%.
 * Maior = as duas ficam juntas mais tempo (texto sobreposto). Menor = mais perto do fade simples, com a tela
 * mais "fraca" no meio da troca.
 * Está em 0 porque frases grandes sobrepostas ficam borradas (duas frases legíveis ao mesmo tempo). Com 0, o
 * meio da troca fica em 50/50: cada frase com metade da opacidade, e nenhuma passa de 50% nesse instante.
 */
export const FRASES_SOBREPOSICAO = 0

/**
 * Quanto a frase anda (em px) enquanto entra e sai: o curso do movimento vertical.
 * Maior = deslocamento mais evidente. 0 = a frase só faz fade, sem subir.
 * Com a sobreposição em 0, 60px dá um movimento mais claro: a velha sobe enquanto a nova chega de baixo.
 */
export const FRASES_DESLOCAMENTO_PX = 60

/**
 * Quanto a ÚLTIMA frase ("E o visual?") sobe quando o fechamento chega, em px. Ela NÃO some: continua branca e
 * inteira (é o clímax da sequência) e só sobe, para o fechamento ("Seu corte também merece manutenção.") entrar
 * logo abaixo dela, ligado por uma linha fina em neon. É o dobro do deslocamento das outras (2 x 60 = 120).
 * Maior = a frase sobe mais e libera mais espaço. Menor = pode colidir com o fechamento, principalmente em tela baixa.
 */
export const FRASES_DESLOCAMENTO_ULTIMA_PX = 120

/**
 * Só no celular: o contador "03/03" some durante a troca da última frase para o fechamento. Este número é a
 * parte da troca (0 a 1) em que ele leva para chegar a 0. A frase sobe e, se o contador ficasse, passaria por
 * cima dele no meio do caminho. 0,3 = some no primeiro terço da troca. Maior = fica visível por mais tempo
 * (risco de a frase cruzar o contador). Menor = some quase de imediato.
 */
export const CONTADOR_ULTIMO_FRACAO_SAIDA = 0.3

/**
 * Respiro no fim da sequência: rolagem extra, em etapas (1 etapa = a rolagem de uma frase), com o fechamento
 * ("Seu corte também merece manutenção.") parado antes de a seção soltar a pessoa para os Combos.
 * Sem ele, quem rola rápido passa do fechamento e a saída fica seca.
 * 0,5 = meia etapa: 30vh no desktop (60 x 0,5) e 50vh no celular (100 x 0,5). 0 = sem respiro.
 */
export const FRASES_RESPIRO = 0.5

// ---------------------------------------------------------------------------
// Combos: os 3 posts empilhados (cada um cobre o anterior)
// ---------------------------------------------------------------------------

/**
 * Rolagem de cada combo no desktop, em vh. Maior = cada post demora mais para cobrir o anterior
 * e fica mais tempo parado. Menor = a pilha passa depressa.
 */
export const COMBOS_VH_DESKTOP = 60

/** Rolagem de cada combo no celular, em vh. Com 100, uma passada de dedo leva a um combo. */
export const COMBOS_VH_CELULAR = 100

/**
 * Parte da etapa em que o post SOBE e cobre o anterior (só a proporção entre os três importa).
 * Maior = a subida é mais lenta e suave. Menor = o post "bate" rápido por cima do anterior.
 */
export const COMBOS_ENTRADA = 0.25

/**
 * Parte da etapa com o post inteiro, parado, sem nada se mexendo (nem o post de baixo).
 * Maior = mais rolagem com o post parado. Menor = o próximo já começa a subir logo.
 * Mínimo: vh x pausa x altura da tela >= 150px. Aqui as três partes somam 1 (0,25 + 0,50 + 0,25), então
 * a pausa vale 0,50 x vh (desktop, conta para 900px: 60/100 x 0,50 x 900px = 270px; celular: 100/100 x 0,50 x 800px = 400px).
 * O passo real de cada combo (a rolagem de um post até o próximo) é (entrada + pausa) x vh = 0,75 x 60 = 45vh no
 * desktop: os posts se sobrepõem, porque a saída de um é a entrada do seguinte.
 * Era 0,30 e ficava no limite dos 150px em dois casos; com 0,50 há folga grande.
 */
export const COMBOS_PAUSA = 0.5

/**
 * Parte da etapa em que o post vai sendo COBERTO (encolhe e escurece). Termina junto com a subida
 * do próximo post. Maior = começa a escurecer antes de o próximo chegar. Menor = escurece só no fim da subida.
 */
export const COMBOS_SAIDA = 0.25
