declare module 'recordrtc' {
  const RecordRTC: {
    (stream: MediaStream, config: object): RecordRTC;
    MediaStreamRecorder(stream: MediaStream, config: object): RecorderType;
    StereoAudioRecorder(stream: MediaStream, config: object): RecorderType;
  };

  export = RecordRTC;

  interface RecordRTC {
    state: string;

    startRecording(): void;
    stopRecording(callback: Function): void;
    save(fileName: string): void;
    getDataURL(callback: Function): void;
    getBlob(): Blob;
  }

  interface RecorderType {
    config: object;
  }
}
