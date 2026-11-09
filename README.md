# Timbrando

App para aulas de música: **ouvir, sentir e manipular o timbre**. Primeiro a experiência, depois o nome.

Roda no navegador (computador ou celular) e como app Android, a partir do mesmo código.

- **Abrir no navegador:** https://renanmarquetti.github.io/timbrando/
- **Baixar o APK para Android:** na página [Releases](https://github.com/RenanMarquetti/timbrando/releases), arquivo `timbrando-x.y.z.apk`.

## O que tem

### Medidor (sempre visível no topo)
A altura (nota e Hz) e a intensidade (dB) do que está tocando: do próprio app ou do microfone. "Ver gráfico" mostra as duas linhas no tempo, e é aí que se vê que, nas comparações, só o timbre muda.

### Ouvir: a parte sensível do timbre
Sem explicação, só a experiência.
- **Mesma nota, mesma força:** as vogais A, E, I, O, U e 13 instrumentos, todos na mesma nota (Lá 220 ou Lá 440), com a mesma duração e a mesma intensidade.
- **Cores e sensações:** a mesma frase com quatro eixos sensoriais (escuro/brilhante, seco/envolvente, suave/áspero, fino/cheio), sensações prontas e o jogo "adivinhe a sensação".
- **O começo do som:** o mesmo som inteiro, sem o começo, com começo lento e ao contrário; gravação pelo microfone; o jogo "quem é, sem o começo?".

### Laboratório: os harmônicos
- **Espectro ao vivo** com os harmônicos numerados, congelar e guardar uma curva de referência para comparar.
- **Sintetizador:** onda geradora (senoidal, triangular, quadrada, dente de serra), 16 harmônicos, começo/meio/fim (ataque, queda, sustentação, final), ruído do começo, abafamento, ressonância, abertura no começo e vibrato. Receitas para imitar flauta, clarinete, oboé, violino, trompete, órgão e corda dedilhada, e o instrumento real para comparar.

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

- Amostras de instrumentos: [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), de Nicholaus Brosowsky, licença [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Fontes originais: VSCO 2 Community Edition, University of Iowa Electronic Music Studios, Karoryfer Samples e Freesound (flcellogrl, quartertone, donyaquick). Algumas notas foram afinadas em até 2 semitons e todas foram cortadas e igualadas em intensidade pelo app.
- As vogais são sintetizadas pelo próprio app (formantes do português).
- Código: licença MIT.
