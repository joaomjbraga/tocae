# Third-party notices

## FFmpeg and FFprobe

The application distributes the FFmpeg and FFprobe static binaries provided by
`ffmpeg-static` 5.3.0 and `@derhuerst/ffprobe-static` 5.3.0. These binaries are
licensed under GNU GPL version 3 or later. A copy of the license is included in
the installers as `licenses/GPL-3.0.txt`.

The packages download their binaries from the upstream
[b6.1.1 release](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1).
The Linux binaries identify as FFmpeg 7.0.2 static builds by John Van Sickle.
The [FFmpeg 7.0.2 source release](https://ffmpeg.org/releases/ffmpeg-7.0.2.tar.xz)
and the [binary build details](https://johnvansickle.com/ffmpeg/) are available
from their upstream sources. The package source and download scripts are in the
[ffmpeg-static repository](https://github.com/eugeneware/ffmpeg-static/tree/b6.1.1).

## HEIC conversion

HEIC decoding uses `heic-convert` 2.1.0 and `heic-decode` 2.1.0 (ISC), which
use `libheif-js` 1.23.5 (LGPL-3.0). Its JavaScript, WebAssembly, and license are
distributed with the application; the full LGPL-3.0 text is also included in
packaged installers as `licenses/LGPL-3.0.txt`.

- [`heic-convert`](https://github.com/catdad-experiments/heic-convert)
- [`heic-decode`](https://github.com/catdad-experiments/heic-decode)
- [`libheif-js`](https://github.com/catdad-experiments/libheif-js)
