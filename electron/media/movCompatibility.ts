export function canRemuxMovVideo(codecName: unknown, pixelFormat: unknown): boolean {
  return codecName === 'h264' && pixelFormat === 'yuv420p'
}

export type MovVideoInfo = {
  codecName: string
  pixelFormat?: string
  duration?: number
  colorTransfer?: string
  colorPrimaries?: string
  colorSpace?: string
}

export function movVideoEncodingArgs(video: MovVideoInfo, preserveHdr: boolean): string[] {
  const isHdr = video.colorTransfer === 'smpte2084' || video.colorTransfer === 'arib-std-b67'
  if (!isHdr && canRemuxMovVideo(video.codecName, video.pixelFormat)) {
    return ['-c:v', 'copy']
  }

  if (isHdr && preserveHdr) {
    if (video.codecName === 'hevc' && video.pixelFormat === 'yuv420p10le') {
      return ['-c:v', 'copy', '-tag:v', 'hvc1']
    }
    return [
      '-c:v',
      'libx265',
      '-preset',
      'ultrafast',
      '-crf',
      '25',
      '-pix_fmt',
      'yuv420p10le',
      '-tag:v',
      'hvc1',
      ...(video.colorPrimaries ? ['-color_primaries', video.colorPrimaries] : []),
      ...(video.colorTransfer ? ['-color_trc', video.colorTransfer] : []),
      ...(video.colorSpace ? ['-colorspace', video.colorSpace] : []),
      ...(video.colorTransfer === 'smpte2084'
        ? ['-x265-params', 'hdr10=1:hdr10-opt=1']
        : []),
    ]
  }

  const h264Args = [
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
  ]
  if (!isHdr) return h264Args

  return [
    '-vf',
    'zscale=t=linear:npl=100,format=gbrpf32le,tonemap=tonemap=hable:desat=0,zscale=p=bt709:t=bt709:m=bt709:r=tv,format=yuv420p',
    ...h264Args,
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-colorspace',
    'bt709',
  ]
}
