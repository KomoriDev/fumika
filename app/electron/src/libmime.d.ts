declare module 'libmime' {
  interface Libmime {
    decodeWords: (value: string) => string
  }
  const libmime: Libmime
  export default libmime
}
