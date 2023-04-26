import { Component, OnInit } from '@angular/core';
import { moduleMetadata, StoryFn, Meta } from '@storybook/angular';
import { GamificationService } from './gamification.service';

@Component({
  selector: 'app-confetti-button',
  template: `<button id="confetti-button" (click)="confetti()">Show Confetti</button>`,
  styles: [
    `
      button {
        margin: auto;
        display: block;
        margin-top: 200px;
      }
    `
  ]
})
class ConfettiButtonComponent implements OnInit {
  constructor(private gamificationService: GamificationService) {}

  confetti(): void {
    const button = document.getElementById('confetti-button');
    this.gamificationService.confetti(button!);
  }

  ngOnInit(): void {
    this.confetti();
  }
}

export default {
  title: 'Gamification/Confetti',
  component: ConfettiButtonComponent,
  decorators: [moduleMetadata({ providers: [GamificationService] })]
} as Meta;

const Template: StoryFn<ConfettiButtonComponent> = (args: ConfettiButtonComponent) => ({
  component: ConfettiButtonComponent,
  props: args
});

export const Default = Template.bind({});
Default.args = {};
