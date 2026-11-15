/* MENEZES BARBER's: movimento das 3 camadas da primeira tela (parte 6 da especificação).
   JavaScript puro, sem biblioteca. Dois modos, nunca os dois ao mesmo tempo:
   - modo-mouse:   as camadas seguem o cursor (grava só --mx e --my no contêiner)
   - modo-rolagem: as camadas sobem com a rolagem (grava só --p no contêiner) */
(function () {
  'use strict';

  var topo = document.getElementById('topo');
  if (!topo || !window.matchMedia) return;

  // Passo 8: com movimento reduzido não inicia nenhum modo nem as animações de entrada.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ---------- Entradas (parte 5) ---------- */
  var fundo = topo.querySelector('.camada--fundo');
  topo.classList.add('anima');
  function mostrarCamadas() {
    requestAnimationFrame(function () { topo.classList.add('carregado'); });
  }
  if (fundo && fundo.complete && fundo.naturalWidth > 0) {
    void topo.offsetWidth;            // garante o estado inicial antes do fade
    mostrarCamadas();
  } else if (fundo) {
    fundo.addEventListener('load', mostrarCamadas, { once: true });
    fundo.addEventListener('error', mostrarCamadas, { once: true });
  } else {
    mostrarCamadas();
  }

  /* ---------- Passos 0 e 1: escolha do modo ---------- */
  // 840 px: abaixo disso, 5% da largura é menos que os 42 px da frente e a borda apareceria.
  var consulta = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 840px)');
  var modo = null;
  var visivel = true;

  /* ---------- Modo mouse (passos 2 a 4) ---------- */
  var alvoX = 0, alvoY = 0, atualX = 0, atualY = 0, quadro = 0;

  function aoMoverMouse(e) {
    alvoX = (e.clientX / window.innerWidth) * 2 - 1;
    alvoY = (e.clientY / window.innerHeight) * 2 - 1;
  }
  function aoSairDaJanela() { alvoX = 0; alvoY = 0; }

  function passoMouse() {
    atualX += (alvoX - atualX) * 0.08;
    atualY += (alvoY - atualY) * 0.08;
    topo.style.setProperty('--mx', atualX.toFixed(4));
    topo.style.setProperty('--my', atualY.toFixed(4));
    quadro = requestAnimationFrame(passoMouse);
  }
  function ligarLaco() { if (!quadro) quadro = requestAnimationFrame(passoMouse); }
  function desligarLaco() { if (quadro) { cancelAnimationFrame(quadro); quadro = 0; } }

  function entrarModoMouse() {
    window.addEventListener('mousemove', aoMoverMouse, { passive: true });
    document.documentElement.addEventListener('mouseleave', aoSairDaJanela);
    if (visivel) ligarLaco();
  }
  function sairModoMouse() {
    window.removeEventListener('mousemove', aoMoverMouse);
    document.documentElement.removeEventListener('mouseleave', aoSairDaJanela);
    desligarLaco();
    alvoX = alvoY = atualX = atualY = 0;
    topo.style.removeProperty('--mx');
    topo.style.removeProperty('--my');
  }

  /* ---------- Modo rolagem (passo 7) ---------- */
  var rolagemPendente = false;

  function gravarProgresso() {
    rolagemPendente = false;
    var altura = topo.offsetHeight || 1;
    var progresso = Math.min(1, Math.max(0, window.scrollY / altura));
    topo.style.setProperty('--p', progresso.toFixed(4));
  }
  function aoRolar() {
    if (rolagemPendente) return;
    rolagemPendente = true;
    requestAnimationFrame(gravarProgresso);
  }
  function entrarModoRolagem() {
    window.addEventListener('scroll', aoRolar, { passive: true });
    aoRolar();
  }
  function sairModoRolagem() {
    window.removeEventListener('scroll', aoRolar);
    topo.style.removeProperty('--p');
  }

  /* ---------- Troca de modo ---------- */
  function aplicarModo() {
    var novo = consulta.matches ? 'mouse' : 'rolagem';
    if (novo === modo) return;
    if (modo === 'mouse') sairModoMouse();
    if (modo === 'rolagem') sairModoRolagem();
    modo = novo;
    topo.classList.toggle('modo-mouse', modo === 'mouse');
    topo.classList.toggle('modo-rolagem', modo === 'rolagem');
    if (modo === 'mouse') entrarModoMouse(); else entrarModoRolagem();
  }
  if (consulta.addEventListener) consulta.addEventListener('change', aplicarModo);
  else if (consulta.addListener) consulta.addListener(aplicarModo);

  /* ---------- Passo 6: pausa o laço quando a primeira tela sai da vista ---------- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entradas) {
      visivel = entradas[entradas.length - 1].isIntersecting;
      if (modo !== 'mouse') return;
      if (visivel) ligarLaco(); else desligarLaco();
    }).observe(topo);
  }

  aplicarModo();
})();
