import { NgModule } from '@angular/core';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { lynxIcons } from './svg-icons/lynx-icons';

// The Hebrew character Aleph
const BIBLICAL_TERMS_ICON =
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M19.722 19.043q0 1.373` +
  `-.93 2.531-.787.987-1.301.987-.257 0-.257-.415 0-.057.186-.343.186-.286.186-.501 0-.701-.944-1.773l-1.459-1.459-7.` +
  `165-7.165q-.801 1.187-.801 2.102 0 1.244 1.759 3.353 1.759 2.109 1.759 3.353 0 1.015-.772 1.695-.772.679-1.888.679` +
  `H4.278l.157-.729q1.873-.243 1.873-1.258 0-.501-.851-2.095-.851-1.595-.851-2.567 0-2.245 2.717-5.234l-.701-.715q-1.` +
  `287-1.287-1.73-2.116-.515-1.001-.515-2.417 0-1.373.901-2.531.772-.987 1.287-.987.272 0 .272.415 0 .043-.193.329-.1` +
  `93.286-.193.486 0 .715.944 1.773.729.729 1.459 1.444l4.276 4.276 2.045-2.574q-1.058-.801-1.416-1.502-.243-.501-.24` +
  `3-1.301 0-1.387 1.015-2.46.815-.887 1.387-.887.257 0 .257.272 0 .057-.072.129-.072.071-.072.272 0 .701 1.544 1.816` +
  ` 1.845 1.344 1.845 3.404 0 1.43-.629 2.202-.486.601-1.058.601-.315 0-.572-.486-.429-.787-1.187-1.444l-2.145 2.674 ` +
  `3.604 3.632q1.287 1.301 1.745 2.116.543 1.001.543 2.417z"/></svg>`;

@NgModule({
  imports: [MatIconModule],
  exports: [MatIconModule]
})
export class CustomIconModule {
  constructor(iconRegistry: MatIconRegistry, sanitizer: DomSanitizer) {
    iconRegistry.addSvgIconLiteral('biblical_terms', sanitizer.bypassSecurityTrustHtml(BIBLICAL_TERMS_ICON));

    for (const [name, svg] of Object.entries(lynxIcons)) {
      iconRegistry.addSvgIconLiteral(name, sanitizer.bypassSecurityTrustHtml(svg));
    }
  }
}
