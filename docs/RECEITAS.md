# De onde vêm as receitas do laboratório

As receitas de instrumento do laboratório (aba Fundamento) usam medições, não números inventados. Elas mudam conforme a nota tocada.

## Harmônicos

| Instrumentos | Fonte |
|---|---|
| violino, viola, violoncelo, flauta, oboé, fagote, clarinete, trompete, trompa, trombone, tuba | **SHARC** (Sandell Harmonic Archive), de Gregory J. Sandell, v0.921 (1994): https://github.com/gregsandell/sharc. Espectros de regime permanente das gravações *McGill University Master Samples* (Opolko e Wapnick). Artigo: Sandell, G. J. (1991), *A library of orchestral instrument spectra*, ICMC. Uso sem fins lucrativos, com crédito ao autor. |
| saxofone, órgão, piano, violão, harpa | **Medidos pelo Timbrando** nas gravações do próprio app (`public/samples`), com o mesmo método do SHARC. Ver o script `scripts/spectra/build_spectra.py`. |

### Método

**SHARC:** a amplitude em dB de cada harmônico (relativa ao mais forte) é convertida para linear com `10^(dB/20)`.

**Medição própria:**
- Instrumentos sustentados (sax, órgão): FFT com janela de Hann, de 0,4 a 0,9 s depois do início.
- Instrumentos que somem (piano, violão, harpa): a mesma FFT de 30 a 230 ms depois do início.
- Cada harmônico é o pico perto de n × f₀. Esse pico é acompanhado parcial a parcial, para tolerar a inarmonicidade do piano.

**Suavização:** cada nota usa a média de potência das notas medidas a até 2 semitons dela. Isso tira o acaso de uma gravação só, mas mantém a mudança de registro (por exemplo, a flauta grave contra a aguda, ou o clarinete no chalumeau contra o clarion). Fora da extensão medida, vale a nota medida mais próxima.

## Tempos

- **Ataque, instrumentos do SHARC:** estimados dentro das faixas publicadas.
  - Luce, D. e Clark, M. (1965), *Durations of attack transients of nonpercussive orchestral instruments*, J. Audio Eng. Soc. 13(3):194–199. Ataques de 14 a 85 ms; do mais rápido ao mais lento: palhetas duplas, clarinete, metais, cordas, flauta.
  - Grobben (1967), *Transient phenomena in music and speech*, ICPhS.
  - Guettler (2002), *On the creation of the Helmholtz motion in bowed strings*, Acta Acustica 88.
- **Ataque e decaimento, instrumentos medidos pelo Timbrando:** o ataque é o tempo até 3 dB abaixo do pico. O decaimento é o T20 (queda de 20 dB). Os dois usam a mediana das notas a até 3 semitons.
- **Conversão para o sintetizador:** `ataque ≈ 1,4 × t(−3 dB)` e `decaimento ≈ 1,3 × T20`.
- **Para comparar com o piano:** Weinreich, G. (1977), *Coupled piano strings*, JASA 62:1474, DOI 10.1121/1.381677; Askenfelt, A. (org.) (1990), *Five lectures on the acoustics of the piano*, KTH.

## O que ainda é estimativa

- Ruído de sopro ou arco, abertura do filtro dos metais, release e vibrato.
- Os pesos do órgão: a correspondência de pés para harmônicos é exata, mas a registração é escolha do organista.

## Para ler mais

- Fletcher, N. H. e Rossing, T. D. (1998). *The Physics of Musical Instruments*. Springer. DOI 10.1007/978-0-387-21603-4
- Meyer, J. (2009). *Acoustics and the Performance of Music*. Springer. DOI 10.1007/978-0-387-09517-2
- Grey, J. M. (1977). *Multidimensional perceptual scaling of musical timbres*. JASA 61:1270. DOI 10.1121/1.381428
