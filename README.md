<img src="src/assets/tocae-wordmark.png" alt="Tocaê Reprodutor" width="320" />

# Tocaê Reprodutor

**Português (Brasil)** · [English](README.en.md)

Reprodutor de vídeo minimalista construído com Electron, React e TypeScript. Abre um vídeo e reproduz sem complicação.

![Demo](.github/demo.png)

## Recursos

- Reproduza uma lista de vídeos em sequência
- Reordene a lista arrastando os itens ou pelo teclado
- Pule entre vídeos com atalhos de uma tecla
- Use a janela principal sem moldura, com controles próprios e cantos arredondados
- Assista a vídeos verticais sem cortar a imagem; amplie e mova a área ampliada
- Navegue pela timeline com prévia do quadro ou avance e volte em intervalos de 1 segundo
- Defina o Tocaê como reprodutor padrão de vídeos no Linux
- Receba um aviso quando uma nova versão do Tocaê estiver disponível
- Troque entre português (Brasil) e inglês a qualquer momento

## Estrutura do projeto

- `src/features/player/`: reprodução, controles, zoom, prévia e navegação pela timeline
- `src/features/playlist/`: estado e interface da lista de reprodução
- `src/components/`: componentes reutilizáveis da aplicação
- `src/lib/`: utilitários do renderer
- `shared/`: tipos, contratos IPC e traduções compartilhados com o Electron
- `electron/`: processo principal, preload e integração com o sistema

O player preserva a proporção original de cada vídeo, inclusive em retrato. O zoom pode ser movido com o mouse ou toque e é limitado às bordas visíveis da imagem. A interface usa controles compactos e translúcidos, com adaptação para janelas estreitas.

## Idiomas

O app acompanha o idioma do sistema operacional na primeira execução e pode ser trocado a qualquer momento pelo seletor na barra superior (também disponível nas janelas *Sobre* e *Atalhos*).

Idiomas disponíveis: **Português (Brasil)** e **Inglês**. A escolha é persistida em `settings.json` na pasta de dados do app; a opção *Seguir o sistema* volta ao comportamento automático.

Os textos ficam em `shared/i18n/messages/`, com o catálogo em português como fonte de verdade das chaves: o catálogo em inglês é tipado a partir dele, então uma chave esquecida quebra a compilação.

## Executando a partir do código

```sh
npm install
npm run dev      # servidor de desenvolvimento do Vite
npm run build          # verificação de tipos + bundle + instaladores .deb e .rpm
npm run build:windows  # verificação de tipos + bundle + instalador Windows .exe (em Windows)
```

## Instaladores Linux

O `npm run build` gera instaladores `.deb` (Debian/Ubuntu) e `.rpm` (Fedora/RHEL) em `release/<versão>/`; a arquitetura acompanha a máquina que fez o build.

```sh
# Debian/Ubuntu
sudo apt install ./release/0.0.4/tocae-reprodutor_0.0.4_amd64.deb

# Fedora/RHEL
sudo dnf install ./release/0.0.4/tocae-reprodutor-0.0.4.x86_64.rpm
```

Para gerar o `.rpm` é preciso ter o `rpmbuild` instalado (pacote `rpm` no Debian/Ubuntu). Os pacotes registram o aplicativo no menu e o suporte aos tipos MIME de vídeo compatíveis, instalam os ícones nos tamanhos usuais e declaram as dependências de runtime do Electron. Depois de instalar, escolha **Configurações → Reprodutor padrão** para associar os vídeos ao Tocaê. Os metadados (categoria, mantenedor, descrição e nome do executável) ficam em `electron-builder.json5`.

## Instalador Windows

No Windows, execute `npm run build:windows` para gerar um instalador NSIS em `release/<versão>/`. O instalador permite escolher a pasta de instalação e cria atalhos no Menu Iniciar e na área de trabalho; não é gerada uma versão portátil.

## Versionamento

Em um push para `main`, quando a versão estável de `package.json` ainda não tem uma release, o workflow cria primeiro a tag `v<versão>`, depois constrói os instaladores Windows e Linux em paralelo e publica a release do GitHub com os arquivos `.deb`, `.rpm` e `.exe` se os dois builds passarem. Pull requests validam os builds sem criar tags ou releases. O app verifica a release mais recente ao iniciar e a cada 24 horas, avisando quando encontra uma versão mais nova. O aviso leva à página da release; atualização e instalação continuam sendo manuais.

## Autor

[![João M J Braga](https://github.com/joaomjbraga.png?size=100)](https://github.com/joaomjbraga)

Se você gostou, considere deixar uma ⭐ no repositório!
