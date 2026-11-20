<img src="src/assets/tocae-wordmark.png" alt="Tocaê Reprodutor" width="320" />

# Tocaê Reprodutor

**Português (Brasil)**

Reprodutor multimídia minimalista construído com Electron, React e TypeScript. Reproduz vídeos e músicas e exibe imagens.

![Demo](.github/demo.png)

## Recursos

- Organize uma biblioteca de mídias com as pastas padrão do sistema ou adicione locais monitorados
- Pesquise vídeos, imagens e músicas e filtre os resultados pelo tipo de mídia
- Marque mídias como favoritas e filtre a biblioteca por favoritos; as escolhas ficam salvas no perfil do aplicativo
- Consulte metadados de áudio, vídeo e imagem, além do tamanho e da data dos arquivos
- Reproduza vídeos e músicas e navegue por imagens em uma única lista
- Selecione faixas de áudio e legendas embutidas em vídeos compatíveis
- Acesse o YouTube Music em uma sessão persistente isolada do reprodutor local
- Ative o avanço automático ou a repetição da mídia atual diretamente nos controles do player
- Reordene a lista arrastando os itens ou pelo teclado
- Pule entre mídias com atalhos de uma tecla
- Navegue entre Biblioteca, Player, YouTube Music e Configurações pela barra lateral
- Personalize a cor de destaque, escolha o idioma e consulte os atalhos em Configurações
- Use a janela principal sem moldura, com controles próprios e cantos arredondados
- Assista a vídeos verticais sem cortar a imagem; amplie e mova vídeos e imagens
- Ouça músicas com um visualizador animado que reage ao estado da reprodução
- Navegue pela timeline com prévia do quadro ou avance e volte em intervalos de 1 segundo
- Continue a reprodução de vídeos e músicas de onde parou, inclusive depois de fechar o aplicativo
- Defina o Tocaê como reprodutor padrão de mídias no Linux
- Receba um aviso quando uma nova versão do Tocaê estiver disponível
- Troque entre português (Brasil) e inglês a qualquer momento

Formatos aceitos: vídeos MP4, WebM, MKV, AVI, MOV e OGV; músicas MP3, M4A, AAC, WAV, FLAC, OGG e Opus; imagens JPG, PNG, APNG, GIF, WebP, BMP e AVIF. Imagens ficam paradas até a navegação para outra mídia; músicas usam a linha do tempo e os controles de reprodução.

## Estrutura do projeto

- `src/features/player/`: reprodução, controles, zoom, prévia e navegação pela timeline
- `src/features/library/`: biblioteca, pesquisa e filtros de mídia
- `src/features/playlist/`: estado e interface da lista de reprodução
- `src/features/integrations/youtube-music/`: interface da integração com o YouTube Music
- `src/features/settings/`: idioma, aparência, atalhos, reprodutor padrão e informações do app
- `src/components/`: componentes reutilizáveis da aplicação
- `src/lib/`: utilitários do renderer
- `shared/`: tipos, contratos IPC, estado compartilhado e traduções
- `electron/`: processo principal, preload, biblioteca monitorada, metadados e integração com o sistema
- `electron/integrations/`: sessão isolada e gerenciamento de áudio do YouTube Music
- `electron/media/`: leitura de metadados, seleção de faixas e geração de faixas temporárias

O player preserva a proporção original de vídeos e imagens, inclusive em retrato. O zoom pode ser movido com o mouse ou toque e é limitado às bordas visíveis da mídia. Músicas usam os mesmos controles de reprodução e linha do tempo, com um disco animado e um visualizador de barras enquanto tocam. A interface usa controles compactos e translúcidos, com adaptação para janelas estreitas.

Os metadados incluem tags e capas de áudio, duração e codec de mídia, dimensões de vídeo e imagem, dados EXIF básicos e informações do arquivo. A biblioteca os carrega conforme os itens são explorados. No Linux, o pacote instala Perl como dependência do ExifTool. A seleção de faixas usa FFmpeg e FFprobe; os binários GPL e as informações de licença e origem estão em [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

O YouTube Music usa a interface oficial em uma visualização Electron criada somente quando aberta, em um layout imersivo alinhado ao player. O login fica em uma sessão persistente isolada da biblioteca e do player local; o Tocaê não lê nem manipula cookies, nem controla ou extrai a reprodução do serviço. O player local tem prioridade de áudio: ele pausa ao abrir o YouTube Music e, se uma mídia local for iniciada depois, o serviço fica silenciado enquanto ela toca. O botão **Parar reprodução** encerra a visualização incorporada e interrompe o áudio, preservando o login; ao reabrir, a página começa novamente.

## Idiomas

O app acompanha o idioma do sistema operacional na primeira execução e pode ser trocado a qualquer momento pelo seletor na barra superior (também disponível nas janelas *Sobre* e *Atalhos*).

Idiomas disponíveis: **Português (Brasil)** e **Inglês**. A escolha é persistida em `settings.json` na pasta de dados do app; a opção *Seguir o sistema* volta ao comportamento automático.

Os textos ficam em `shared/i18n/messages/`, com o catálogo em português como fonte de verdade das chaves: o catálogo em inglês é tipado a partir dele, então uma chave esquecida quebra a compilação.

## Executando a partir do código

Use Node.js 24 e npm. Para desenvolver, instalar dependências e iniciar a interface junto com o aplicativo Electron:

```sh
npm install
npm run dev
```

Comandos de validação e empacotamento:

```sh
npm run lint          # verifica os estilos CSS
npm test              # executa os testes automatizados
npm run typecheck     # verifica os tipos TypeScript
npm run build         # tipos + bundles + instaladores Linux (.deb e .rpm)
npm run build:windows # tipos + bundles + instalador Windows (.exe), em Windows
```

O workflow de CI executa lint, testes e build para Windows e Linux em Node.js 24.

## Instaladores Linux

O `npm run build` gera instaladores `.deb` (Debian/Ubuntu) e `.rpm` (Fedora/RHEL) em `release/<versão>/`; a arquitetura acompanha a máquina que fez o build.

```sh
# Debian/Ubuntu
sudo apt install ./release/1.0.0/tocae-reprodutor_1.0.0_amd64.deb

# Fedora/RHEL
sudo dnf install ./release/1.0.0/tocae-reprodutor-1.0.0.x86_64.rpm
```

Para gerar o `.rpm` é preciso ter o `rpmbuild` instalado (pacote `rpm` no Debian/Ubuntu). Os pacotes registram o aplicativo no menu e os tipos MIME de vídeo, áudio e imagem compatíveis, instalam os ícones nos tamanhos usuais e declaram as dependências de runtime do Electron. Depois de instalar, escolha **Configurações → Reprodutor padrão** para associar as mídias ao Tocaê. Os metadados (categoria, mantenedor, descrição e nome do executável) ficam em `electron-builder.json5`.

## Instalador Windows

No Windows, execute `npm run build:windows` para gerar um instalador NSIS em `release/<versão>/`. O instalador permite escolher a pasta de instalação e cria atalhos no Menu Iniciar e na área de trabalho; não é gerada uma versão portátil.

## Versionamento

Em um push para `main`, quando a versão estável de `package.json` ainda não tem uma release, o workflow cria primeiro a tag `v<versão>`, depois constrói os instaladores Windows e Linux em paralelo e publica a release do GitHub com os arquivos `.deb`, `.rpm` e `.exe` se os dois builds passarem. Pull requests validam os builds sem criar tags ou releases. O app verifica a release mais recente ao iniciar e a cada 24 horas, avisando quando encontra uma versão mais nova. O aviso leva à página da release; atualização e instalação continuam sendo manuais.

## Autor

[![João M J Braga](https://github.com/joaomjbraga.png?size=100)](https://github.com/joaomjbraga)

Se você gostou, considere deixar uma ⭐ no repositório!
