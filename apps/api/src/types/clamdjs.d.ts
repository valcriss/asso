declare module 'clamdjs' {
  interface ScannerOptions {
    timeout?: number;
    chunkSize?: number;
  }

  interface Scanner {
    scanBuffer(buffer: Buffer, timeout?: number, chunkSize?: number): Promise<string>;
    scanStream(stream: NodeJS.ReadableStream, timeout?: number, chunkSize?: number): Promise<string>;
  }

  function createScanner(host: string, port?: number, options?: ScannerOptions): Scanner;
  function isCleanReply(reply: string): boolean;

  export { createScanner, isCleanReply, Scanner, ScannerOptions };
}
