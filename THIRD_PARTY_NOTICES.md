# Avisos sobre componentes de terceiros

## FFmpeg e FFprobe

O aplicativo distribui os binários estáticos do FFmpeg e do FFprobe fornecidos
por `ffmpeg-static` 5.3.0 e `@derhuerst/ffprobe-static` 5.3.0. Esses binários são
licenciados sob a GNU GPL versão 3 ou posterior. Uma cópia da licença está
incluída nos instaladores como `licenses/GPL-3.0.txt`.

Os pacotes baixam os binários da
[versão b6.1.1 do projeto original](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1).
Os binários para Linux são identificados como compilações estáticas do FFmpeg
7.0.2 feitas por John Van Sickle. O
[código-fonte do FFmpeg 7.0.2](https://ffmpeg.org/releases/ffmpeg-7.0.2.tar.xz)
e os [detalhes da compilação dos binários](https://johnvansickle.com/ffmpeg/)
estão disponíveis nas fontes originais. O código-fonte do pacote e os scripts
de download estão no [repositório ffmpeg-static](https://github.com/eugeneware/ffmpeg-static/tree/b6.1.1).

## Conversão de HEIC

A decodificação de HEIC utiliza `heic-convert` 2.1.0 e `heic-decode` 2.1.0
(ISC), que usam `libheif-js` 1.23.5 (LGPL-3.0). O JavaScript, o WebAssembly e a
licença dessa biblioteca são distribuídos com o aplicativo; o texto integral da
LGPL-3.0 também está incluído nos instaladores como `licenses/LGPL-3.0.txt`.

- [`heic-convert`](https://github.com/catdad-experiments/heic-convert)
- [`heic-decode`](https://github.com/catdad-experiments/heic-decode)
- [`libheif-js`](https://github.com/catdad-experiments/libheif-js)
