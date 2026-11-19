/**
 * Catálogo de textos em português (Brasil).
 *
 * É a fonte de verdade das chaves: `MessageKey` é derivado deste objeto e o
 * catálogo em inglês é tipado como `Messages`, então qualquer chave esquecida
 * quebra a compilação em vez de vazar o texto do outro idioma.
 */
export const ptBRMessages = {
  // Barra superior
  'appbar.openVideos': 'Abrir vídeos',
  'appbar.openVideo': 'Abrir um vídeo',
  'appbar.openVideoTitle': 'Abrir um vídeo (Ctrl+O)',
  'appbar.openFolder': 'Abrir pasta de vídeos',
  'appbar.openFolderTitle': 'Abrir pasta de vídeos (Ctrl+Shift+O)',
  'appbar.navigation': 'Navegação do Tocaê',
  'appbar.togglePlaylist': 'Mostrar ou ocultar a lista de reprodução',
  'appbar.togglePlaylistTitle': 'Mostrar ou ocultar a lista (L)',
  'appbar.windowControls': 'Controles da janela',
  'appbar.minimizeWindow': 'Minimizar janela',
  'appbar.maximizeWindow': 'Maximizar janela',
  'appbar.restoreWindow': 'Restaurar janela',
  'appbar.closeWindow': 'Fechar janela',

  // Troca de idioma
  'language.button': 'Idioma',
  'language.menu': 'Selecionar idioma',
  'language.system': 'Seguir o sistema',
  'language.systemHint': 'Usar o idioma do sistema: {locale}',
  'settings.title': 'Configurações',
  'settings.description': 'Preferências do reprodutor',
  'settings.languageDescription': 'Escolha o idioma da interface.',
  'settings.languageLabel': 'Idioma da interface',
  'settings.shortcutsDescription': 'Consulte os comandos do reprodutor e da lista.',
  'settings.defaultPlayerDescription': 'Defina o aplicativo padrão para abrir vídeos.',

  // Player
  'player.play': 'Reproduzir',
  'player.pause': 'Pausar',
  'player.previous': 'Vídeo anterior',
  'player.previousTitle': 'Vídeo anterior (P)',
  'player.next': 'Próximo vídeo',
  'player.nextTitle': 'Próximo vídeo (N)',
  'player.loadingVideo': 'Carregando vídeo',
  'player.timeline': 'Linha do tempo do vídeo',
  'player.timelineValue': '{current} de {total}',
  'player.seekBackward': 'Voltar 1 segundo',
  'player.seekForward': 'Avançar 1 segundo',
  'player.zoomControls': 'Controles de zoom do vídeo',
  'player.zoomIn': 'Aumentar zoom',
  'player.zoomOut': 'Diminuir zoom',
  'player.resetZoom': 'Redefinir zoom',
  'player.unmute': 'Ativar som',
  'player.mute': 'Silenciar',
  'player.fullscreen': 'Tela cheia',
  'player.exitFullscreen': 'Sair da tela cheia',
  'player.volume': 'Volume',
  'player.dropHint': 'Abra um vídeo ou arraste-o para aqui',
  'player.welcomeTitle': 'Seu próximo vídeo começa aqui',
  'player.sessionTitle': 'Tocaê Reprodutor',
  'player.nowPlaying': 'Tocando {current} de {total}: {name}',
  'player.listCleared': 'Lista limpa',
  'player.undo': 'Desfazer',
  'player.showList': 'Mostrar lista',
  'player.showListTitle': 'Mostrar lista (L)',

  // Aparência
  'navigation.backToPlayer': 'Voltar ao reprodutor',
  'appearance.title': 'Personalização',
  'appearance.description': 'Ajuste a cor de destaque do reprodutor.',
  'appearance.accentTitle': 'Cor do reprodutor',
  'appearance.accentDescription': 'Escolha uma cor para os controles e indicadores.',
  'appearance.presets': 'Cores predefinidas',
  'appearance.colorViolet': 'Violeta',
  'appearance.colorLavender': 'Lavanda',
  'appearance.colorIndigo': 'Índigo',
  'appearance.colorBlue': 'Azul',
  'appearance.colorRoyal': 'Azul-real',
  'appearance.colorSky': 'Azul-celeste',
  'appearance.colorAzure': 'Azul-cerúleo',
  'appearance.colorCyan': 'Ciano',
  'appearance.colorTurquoise': 'Turquesa',
  'appearance.colorTeal': 'Verde-azulado',
  'appearance.colorMint': 'Menta',
  'appearance.colorGreen': 'Verde',
  'appearance.colorEmerald': 'Esmeralda',
  'appearance.colorForest': 'Verde-floresta',
  'appearance.colorLime': 'Lima',
  'appearance.colorChartreuse': 'Chartreuse',
  'appearance.colorYellow': 'Amarelo',
  'appearance.colorGold': 'Dourado',
  'appearance.colorOrange': 'Laranja',
  'appearance.colorAmber': 'Âmbar',
  'appearance.colorCoral': 'Coral',
  'appearance.colorRed': 'Vermelho',
  'appearance.colorRaspberry': 'Framboesa',
  'appearance.colorPink': 'Rosa',
  'appearance.colorMagenta': 'Magenta',

  // Lista de reprodução
  'playlist.label': 'Lista de reprodução',
  'playlist.title': 'A seguir',
  'playlist.hide': 'Ocultar lista',
  'playlist.hideTitle': 'Ocultar lista (L)',
  'playlist.loading': 'Carregando lista',
  'playlist.empty': 'A lista está vazia. Abra vídeos para tocar em sequência.',
  'playlist.clear': 'Limpar lista',
  'playlist.remove': 'Remover {name} da lista',
  'playlist.removeTitle': 'Remover da lista',
  'playlist.itemTitle': '{name} — Alt+↑ / Alt+↓ para mover',
  'playlist.moved': 'Movido para a posição {position} de {total}.',

  // Erros
  'error.unresolved': 'Não foi possível localizar os arquivos arrastados.',
  'error.playback': 'Não foi possível reproduzir este vídeo.',

  // Sobre
  'about.title': 'Sobre o Tocaê',
  'about.version': 'Versão',
  'about.author': 'Autor',
  'about.email': 'E-mail',
  'about.description': 'Reprodutor de vídeo minimalista',

  // Atalhos
  'shortcuts.title': 'Atalhos de teclado',
  'shortcuts.openVideo': 'Abrir um vídeo',
  'shortcuts.openFolder': 'Abrir pasta de vídeos e subpastas',
  'shortcuts.zoomIn': 'Aumentar o zoom do vídeo',
  'shortcuts.zoomOut': 'Diminuir o zoom do vídeo',
  'shortcuts.playPause': 'Reproduzir ou pausar',
  'shortcuts.fullscreen': 'Entrar ou sair da tela cheia',
  'shortcuts.mute': 'Silenciar ou ativar o som',
  'shortcuts.next': 'Próximo vídeo da lista',
  'shortcuts.previous': 'Vídeo anterior da lista',
  'shortcuts.toggleList': 'Mostrar ou ocultar a lista',
  'shortcuts.move': 'Mover o item focado na lista',
  'shortcuts.key.space': 'Espaço',

  // Reprodutor padrão
  'defaultPlayer.title': 'Reprodutor padrão',
  'defaultPlayer.description': 'Abra vídeos no Tocaê diretamente pelo gerenciador de arquivos.',
  'defaultPlayer.hint': 'A preferência se aplica aos formatos de vídeo compatíveis.',
  'defaultPlayer.checking': 'Verificando o aplicativo padrão...',
  'defaultPlayer.isDefault': 'O Tocaê está definido como reprodutor padrão.',
  'defaultPlayer.notDefault': 'Outro aplicativo está definido como reprodutor padrão.',
  'defaultPlayer.unsupported': 'Disponível somente em instalações empacotadas para Linux.',
  'defaultPlayer.set': 'Definir como padrão',
  'defaultPlayer.setting': 'Aplicando...',
  'defaultPlayer.error': 'Não foi possível verificar a configuração do sistema.',
  'defaultPlayer.errorDetail': 'Verifique se xdg-utils está instalado e tente novamente.',

  // Atualizações
  'updates.available': 'A versão {version} do Tocaê está disponível.',
  'updates.viewRelease': 'Ver atualização',

  // Diálogos nativos
  'dialog.openTitle': 'Abrir um vídeo',
  'dialog.openFolderTitle': 'Abrir pasta de vídeos',
  'dialog.noVideosFound': 'Não foram encontrados vídeos nesta pasta ou em suas subpastas.',
  'dialog.folderReadError': 'Não foi possível ler esta pasta e localizar os vídeos.',
  'dialog.videosFilter': 'Vídeos',
  'dialog.allFilesFilter': 'Todos os arquivos',
} as const

export type MessageKey = keyof typeof ptBRMessages

export type Messages = Record<MessageKey, string>
