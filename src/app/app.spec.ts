import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { ChatService } from './services/chat.service';

describe('App', () => {
  const mockChatService = {
    sendMessage: async () => 'According to [Source: Remote_Work_Policy.pdf], hybrid work is allowed.',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: ChatService, useValue: mockChatService },
      ],
    }).compileComponents();
  });

  it('should create the workspace shell', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render primary workspace navigation and main landmark', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('main#main-workspace')).toBeTruthy();
    expect(compiled.textContent).toContain('New conversation');
    expect(compiled.textContent).toContain('Ask Knowledge Base');
    expect(compiled.textContent).toContain('Knowledge Sources');
  });
});
