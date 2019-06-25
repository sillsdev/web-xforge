// declare module 'recordrtc' {
//   interface RecordRTC {
//     state: string;
//
//     startRecording(): void;
//     stopRecording(callback: Function): void;
//     save(fileName: string): void;
//     getDataURL(callback: Function): void;
//   }
// }

declare module 'recordrtc' {
  function RecordRTC(stream: MediaStream, config: object): Object;

  export = RecordRTC;
}
