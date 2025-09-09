import { Component, DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TabHeaderDirective } from './tab-header.directive';

@Component({
    template: ` <div sf-tab-header></div> `,
    standalone: false
})
class TestComponent {}

describe('TabHeaderDirective', () => {
  let fixture: ComponentFixture<TestComponent>;
  let directiveElement: DebugElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TabHeaderDirective, TestComponent]
    });
    fixture = TestBed.createComponent(TestComponent);
    directiveElement = fixture.debugElement.query(By.directive(TabHeaderDirective));
  });

  it('should create an instance', () => {
    expect(directiveElement).toBeTruthy();
  });
});
