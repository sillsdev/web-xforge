import { TestBed } from '@angular/core/testing';
import { Breakpoint, MediaBreakpointService } from './media-breakpoint.service';

describe('MediaBreakpointService', () => {
  let service: MediaBreakpointService;

  beforeEach(() => {
    service = TestBed.inject(MediaBreakpointService);
  });

  describe('width', () => {
    it('should return a media query string with the specified comparison operator and breakpoint', () => {
      expect(service.width('>=', Breakpoint.SM)).toBe('(width >= 576px)');
    });

    it('should inherit the css variable from the specified element', () => {
      const element = document.createElement('div');
      element.style.setProperty('--sf-breakpoint-sm', '600px');
      document.body.append(element);
      expect(service.width('<', Breakpoint.SM, element)).toBe('(width < 600px)');
    });
  });
});
