import { Component } from '@angular/core';

@Component({
  selector: 'app-sa-help-videos',
  templateUrl: './sa-help-videos.component.html',
  styleUrl: './sa-help-videos.component.scss'
})
export class SaHelpVideosComponent {
  constructor() {}
  displayedColumns: string[] = ['videoName', 'videoDescription', 'url', 'component', 'keywords', 'edit', 'delete'];
  dataSource = [
    {
      videoName: 'Video 1',
      videoDescription: 'Description for Video 1',
      url: 'https://youtube.com',
      component: ['Component1']
    }
  ];

  componentOptions: string[] = ['Component1', 'Component2', 'Component3'];

  addEditVideoData() {
    this.dataSource.push({ videoName: '', videoDescription: '', url: '', component: [] });
  }
}
