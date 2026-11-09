# Timbrando

App para aulas de música: **ouvir, sentir e manipular o timbre**. Primeiro a experiência, depois o nome.

Roda no navegador (computador ou celular) e como app Android, a partir do mesmo código.

- **Abrir no navegador:** https://renanmarquetti.github.io/timbrando/
- **Baixar o APK para Android:** na página [Releases](https://github.com/RenanMarquetti/timbrando/releases), arquivo `timbrando-x.y.z.apk`.

## O que tem

No topo: o botão do **microfone** (ligado por padrão; o app pede a permissão) e as **configurações** (tema claro/escuro, gráfico do medidor, créditos).

### Som: a parte sensível do timbre
Sem explicação, só a experiência. Um medidor mostra a altura (nota e Hz) e a intensidade (dB) do que está tocando: o som do app enquanto ele toca, senão o microfone.
- **Mesma nota, mesma força:** as vogais A, E, I, O, U e os instrumentos da lista do MSA (mais piano, violão e harpa), na nota escolhida (Dó 3 a Dó 5), com a mesma duração e a mesma intensidade. "Tocar todos" emenda um som no outro, sem pausa.
- **O começo do som:** arraste a linha sobre o desenho do som para escolher onde ele começa e botão "ao contrário".

### Fundamento: de onde vem a diferença
- **Espectro** fixo no topo, com cada harmônico e a sua frequência; toque no gráfico para ler qualquer ponto.
- **Laboratório de timbres:** teclado com "sustentar nota", onda geradora (com o que cada uma é e com que instrumento se parece), receitas dos instrumentos do MSA, 16 harmônicos, ajustes da nota (começo/meio/fim e abafamento, com gráficos explicados) e vibrato opcional; teclado de Dó 2 a Dó 6. Tudo muda ao vivo enquanto a nota soa.
- **Cores do som:** um instrumento real com os controles de um técnico de som (escuro/brilhante, seco/envolvente, suave/áspero, fino/cheio), cada um explicado, e sensações prontas.

## Desenvolvimento

```bash
npm install
npm run dev        # abre em http://localhost:5173 (e na rede local)
npm run build      # gera dist/
npm run apk        # gera dist-apk/timbrando-x.y.z.apk (precisa de JDK 21, Android SDK e a chave)
```

O microfone só funciona em `https` ou `localhost`. No celular, use o endereço do GitHub Pages ou o APK.

Stack: TypeScript, Vite, Web Audio API, [pitchy](https://github.com/ianprime0509/pitchy) para detectar a altura e [Capacitor](https://capacitorjs.com) para o APK. O nome aparece em `capacitor.config.json` (`appName`), `index.html` e `src/main.ts` (`APP_NAME`); o identificador do app Android (`io.github.renanmarquetti.aulas`) é neutro e não muda, para que as atualizações instalem por cima.

## Créditos

- Lista de instrumentos: a do *Método Simplificado de Aprendizagem Musical* (MSA), com piano, violão e harpa como extras. Ainda sem gravação livre: oboé d’amore, corne inglês, clarinete alto e baixo, saxofones soprano, tenor e barítono, cornet, flugelhorn, trombonito, barítono e eufônio.
- Amostras de instrumentos: [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), de Nicholaus Brosowsky, licença [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Fontes originais: VSCO 2 Community Edition, University of Iowa Electronic Music Studios, Karoryfer Samples e Freesound (flcellogrl, quartertone, donyaquick). Viola e oboé: [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE) (CC0). Algumas notas foram afinadas em até 2 semitons e todas foram cortadas e igualadas em intensidade pelo app.
- As vogais são sintetizadas pelo próprio app (formantes do português).
- Código: licença MIT.
