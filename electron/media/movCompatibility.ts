export function canRemuxMovVideo(codecName: unknown, pixelFormat: unknown): boolean {
  return codecName === 'h264' && pixelFormat === 'yuv420p'
}
