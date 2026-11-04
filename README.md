<img src="src/assets/tocae-wordmark.png" alt="Tocaê Reprodutor" width="320" />

# Tocaê Reprodutor

**Português (Brasil)** · [English](README.en.md)

Reprodutor de vídeo minimalista construído com Electron, React e TypeScript. Abre um vídeo e reproduz sem complicação.

![Demo](.github/demo.png)

## Recursos

- Reproduza uma lista de vídeos em sequência
- Reordene a lista arrastando os itens ou pelo teclado
- Pule entre vídeos com atalhos de uma tecla
- Troque entre português (Brasil) e inglês a qualquer momento

## Idiomas

O app acompanha o idioma do sistema operacional na primeira execução e pode ser trocado a qualquer momento pelo seletor na barra superior (também disponível nas janelas *Sobre* e *Atalhos*).

Idiomas disponíveis: **Português (Brasil)** e **Inglês**. A escolha é persistida em `settings.json` na pasta de dados do app; a opção *Seguir o sistema* volta ao comportamento automático.

Os textos ficam em `shared/i18n/messages/`, com o catálogo em português como fonte de verdade das chaves: o catálogo em inglês é tipado a partir dele, então uma chave esquecida quebra a compilação.

## Executando a partir do código

```sh
npm install
npm run dev      # servidor de desenvolvimento do Vite
npm run build    # verificação de tipos + bundle + pacotes .deb e .rpm
```

## Pacotes Linux

O projeto é empacotado apenas para Linux, nos formatos `.deb` (Debian/Ubuntu) e `.rpm` (Fedora/RHEL). O `npm run build` gera os pacotes em `release/<versão>/`; a arquitetura acompanha a máquina que fez o build.

```sh
# Debian/Ubuntu
sudo apt install ./release/0.0.3/tocae-reprodutor_0.0.3_amd64.deb

# Fedora/RHEL
sudo dnf install ./release/0.0.3/tocae-reprodutor-0.0.3.x86_64.rpm
```

Para gerar o `.rpm` é preciso ter o `rpmbuild` instalado (pacote `rpm` no Debian/Ubuntu). Os pacotes registram o aplicativo no menu, instalam os ícones nos tamanhos usuais e declaram as dependências de runtime do Electron. Os metadados (categoria, mantenedor, descrição e nome do executável) ficam em `electron-builder.json5`.

## Versionamento

O workflow de build cria automaticamente a tag `v<versão>` quando a versão em `package.json` muda em um push para a `main`. Se a tag já existir, nada é feito. A tag só é criada depois que o build dos pacotes termina com sucesso.

## Autor

[![João M J Braga](https://github.com/joaomjbraga.png?size=100)](https://github.com/joaomjbraga)

Se você gostou, considere deixar uma ⭐ no repositório!
