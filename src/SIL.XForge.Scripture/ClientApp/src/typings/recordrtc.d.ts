declare module 'recordrtc' {
  export = RecordRTC;

  function RecordRTC(stream: MediaStream, config: object): RecordRTC;

  interface RecordRTC {
    state: string;

    startRecording(): void;
    stopRecording(callback: Function): void;
    save(fileName: string): void;
    getDataURL(callback: Function): void;
  }
}
