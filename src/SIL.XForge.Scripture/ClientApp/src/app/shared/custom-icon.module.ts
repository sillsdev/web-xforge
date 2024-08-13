import { NgModule } from '@angular/core';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

// The biblical Terms icon from Paratext
const TRIQUETRA_ICON =
  `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path d="M4.853 21.855c-1.282.001-2.575-.22-3.823-.679.684-3.955 3.455-7.194 7.138-8.544a11.16 11.16 0 0 1 3.832-` +
  `10.456 11.15 11.15 0 0 1 3.83 10.455 11.15 11.15 0 0 1 7.138 8.545c-3.767 1.385-7.957.603-10.967-1.911-2.017 1.6` +
  `82-4.559 2.589-7.149 2.59zm.099-1.856a9.31 9.31 0 0 0 5.722-2.047c-.434-.51-.828-1.066-1.175-1.667s-.629-1.218-.` +
  `854-1.848c-2.47.958-4.428 2.943-5.349 5.431a9.23 9.23 0 0 0 1.656.131zm14.179 0a9.24 9.24 0 0 0 1.573-.131 9.31 ` +
  `9.31 0 0 0-5.347-5.432c-.224.631-.508 1.25-.855 1.851s-.741 1.156-1.175 1.665a9.31 9.31 0 0 0 5.805 2.047zm-7.13` +
  `2-3.354c.329-.398.63-.826.895-1.287a9.34 9.34 0 0 0 .666-1.416 9.34 9.34 0 0 0-1.562-.131c-.532 0-1.052.046-1.55` +
  `9.131a9.33 9.33 0 0 0 .665 1.416 9.34 9.34 0 0 0 .894 1.287zm-2.027-4.506a11.21 11.21 0 0 1 2.027-.184c.694 0 1.` +
  `372.063 2.03.184a9.3 9.3 0 0 0-2.029-7.346c-1.694 2.041-2.434 4.729-2.029 7.346z"
  stroke="#000" stroke-width=".206"/>
  </svg>
`;

@NgModule({
  imports: [MatIconModule],
  exports: [MatIconModule]
})
export class CustomIconModule {
  constructor(iconRegistry: MatIconRegistry, sanitizer: DomSanitizer) {
    iconRegistry.addSvgIconLiteral('triquetra', sanitizer.bypassSecurityTrustHtml(TRIQUETRA_ICON));
  }
}
