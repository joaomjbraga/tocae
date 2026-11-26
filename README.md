# Tocaê

Um espaço para reunir, organizar e aproveitar suas mídias.

O **Tocaê** é um reprodutor multimídia para Windows e Linux que reúne músicas, vídeos e imagens em um só lugar. Com uma interface minimalista e personalizável, permite explorar sua coleção, criar listas de reprodução e acessar o YouTube Music sem precisar alternar entre diferentes aplicativos.

![Demonstração do Tocaê](.github/captura.png)

## Recursos

### Sua biblioteca, do seu jeito

- **Biblioteca unificada:** reúna músicas, vídeos e imagens em um só lugar.
- **Pastas personalizadas:** utilize as pastas padrão do computador ou adicione outros locais para acompanhar suas mídias.
- **Pesquisa rápida:** encontre arquivos pelo nome e filtre os resultados por categoria.
- **Favoritos:** marque suas mídias preferidas e encontre-as facilmente quando quiser.
- **Continuar assistindo/ouvindo:** retome vídeos e músicas da posição salva pela biblioteca e acompanhe o progresso nos cards.
- **Informações detalhadas:** consulte capas, artistas, duração, formatos, dimensões, tamanho e outras informações dos arquivos.

### Mais controle sobre o que você assiste

- **Zoom e movimentação:** amplie vídeos e imagens e explore os detalhes sem perder o controle da visualização.
- **Zoom pelo scroll:** ajuste a ampliação usando a roda do mouse, mantendo em foco o ponto sob o cursor.
- **Vídeos verticais:** assista a conteúdos em formato retrato sem cortes na imagem.
- **Prévia na timeline:** visualize quadros do vídeo enquanto procura um momento específico.
- **Marcadores:** salve posições por vídeo, dê nomes opcionais e volte a elas rapidamente.
- **Captura de quadros:** salve como JPEG o quadro correspondente a uma posição do vídeo.
- **Navegação precisa:** avance ou retroceda em intervalos de um segundo.
- **Visualizador musical:** acompanhe suas músicas com animações que reagem à reprodução.

### YouTube Music integrado

Acesse o YouTube Music diretamente pelo Tocaê, em uma área dedicada e com sessão de login persistente.

- Acesse sua conta e suas músicas pelo serviço oficial.
- Mantenha seu login salvo entre as sessões.
- Utilize uma interface integrada à experiência do aplicativo.
- Preserve a separação entre o serviço online e sua biblioteca local.
- Controle a prioridade do áudio entre o reprodutor local e o YouTube Music.

A integração utiliza a própria interface do YouTube Music. O Tocaê não extrai músicas, não manipula cookies e não controla internamente a reprodução do serviço.

### Personalização e acessibilidade

- **Aparência:** personalize a cor de destaque da interface.
- **Idiomas:** escolha entre português (Brasil) e inglês.
- **Atalhos:** consulte os comandos disponíveis para navegar e controlar o player.
- **Interface adaptável:** utilize o aplicativo em diferentes tamanhos de janela.
- **Janela personalizada:** aproveite uma interface sem moldura, com controles próprios e cantos arredondados.

## Formatos compatíveis

| Categoria | Formatos |
|---|---|
| Vídeos | MP4, WebM, MKV, AVI, MOV e OGV |
| Áudios | MP3, M4A, AAC, WAV, FLAC, OGG e Opus |
| Imagens | JPG, PNG, APNG, GIF, WebP, BMP, AVIF e HEIC |

As imagens são exibidas individualmente, com navegação entre os arquivos. Músicas contam com controles de reprodução e linha do tempo.

Para compatibilidade com diferentes codecs, vídeos `.MOV` são preparados temporariamente em MP4: H.264 compatível é remuxado sem recodificação e outros formatos são convertidos com prioridade para rapidez. Quando o player informa suporte a HEVC Main 10, o HDR é preservado em HEVC; nos demais casos, o vídeo HDR é convertido para SDR com tone mapping. A biblioteca gera prévias JPEG leves sob demanda e as mantém em cache de memória limitado. O player mostra o progresso, cancela a preparação ao trocar de mídia e reutiliza conversões recentes em um cache limitado a 1 GiB e cinco arquivos. O original nunca é alterado.


## Executando o projeto

### Requisitos

- Node.js 24
- npm

### Instalação

```bash
git clone https://github.com/joaomjbraga/tocae.git

cd tocae

npm install

npm run dev
```

### Comandos disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o aplicativo em desenvolvimento |
| `npm run lint` | Verifica os estilos CSS |
| `npm test` | Executa os testes automatizados |
| `npm run typecheck` | Verifica os tipos TypeScript |
| `npm run build:linux` | Gera os pacotes Linux |
| `npm run build:windows` | Gera o instalador Windows |
| `npm run audit:release` | Verifica o pacote gerado |

## Instalação

O Tocaê possui suporte a Windows e Linux.

### Linux

O processo de build gera pacotes para distribuições baseadas em Debian e Red Hat:

- `.deb` — Debian e Ubuntu.
- `.rpm` — Fedora e distribuições compatíveis.

Os instaladores são disponibilizados no diretório `release/`.

Os pacotes Linux registram os formatos de mídia compatíveis para que o Tocaê apareça nas opções de abertura do sistema. Nas configurações do aplicativo, também é possível defini-lo como reprodutor padrão.

### Windows

O instalador utiliza NSIS e permite escolher o diretório de instalação, além de criar atalhos no Menu Iniciar e na área de trabalho. O Tocaê é registrado como opção em “Abrir com” e nas configurações de aplicativos padrão do Windows; a escolha do aplicativo padrão continua sendo controlada pelo usuário no Windows.

## Atualizações

O aplicativo verifica periodicamente a existência de novas versões. No Windows, baixa as atualizações automaticamente e pergunta se deseja reiniciar para instalá-las; se você escolher “Depois”, a instalação ocorre ao fechar o aplicativo. No Linux, o Tocaê informa quando há uma nova versão, que deve ser instalada manualmente pelo pacote publicado na release do GitHub.

O projeto utiliza GitHub Actions para executar validações e gerar os pacotes de distribuição para Windows e Linux.

## Idiomas

O aplicativo identifica o idioma do sistema operacional na primeira execução.

Idiomas disponíveis:

- Português (Brasil).
- Inglês.

A preferência pode ser alterada a qualquer momento nas configurações e fica salva para as próximas execuções.

## Autor

Desenvolvido por [João M J Braga](https://github.com/joaomjbraga).

[GitHub](https://github.com/joaomjbraga) · [Repositório](https://github.com/joaomjbraga/tocae)

Se o Tocaê for útil para você, considere deixar uma estrela no repositório!