import { TestBed } from '@angular/core/testing';
import { ChatInput, ChatService } from './chat.service';
import { ConversationService } from './conversation.service';

describe('ConversationService', () => {
  let calls: ChatInput[];
  let service: ConversationService;

  beforeEach(() => {
    calls = [];
    if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
      localStorage.clear();
    }

    const mockChat: Pick<ChatService, 'sendMessage'> = {
      sendMessage: async (input: ChatInput) => {
        calls.push(input);
        return 'Employees can work from home 2 days a week [Source: Remote_Work_Policy.pdf].';
      },
    };

    TestBed.configureTestingModule({
      providers: [ConversationService, { provide: ChatService, useValue: mockChat }],
    });

    service = TestBed.inject(ConversationService);
  });

  it('passes clean multi-turn history across consecutive questions and extracts citations', async () => {
    await service.sendMessage('What is our hybrid work policy?');
    expect(calls.length).toBe(1);
    expect(calls[0].history).toEqual([]);
    expect(service.activeConversation().title).toBe('What is our hybrid work policy?');
    expect(service.activeCitations()).toEqual(['Remote_Work_Policy.pdf']);

    await service.sendMessage('Does it require manager approval?');
    expect(calls.length).toBe(2);
    expect(calls[1].history).toEqual([
      { role: 'user', content: 'What is our hybrid work policy?' },
      {
        role: 'model',
        content: 'Employees can work from home 2 days a week [Source: Remote_Work_Policy.pdf].',
      },
    ]);
    expect(service.activeTurnCount()).toBe(2);
  });

  it('supports editing a prior user turn and branching from that point', async () => {
    await service.sendMessage('Initial question');
    await service.sendMessage('Follow-up question');

    const firstUserMsgId = service.activeMessages()[0].id;
    await service.editAndResubmit(firstUserMsgId, 'Revised first question');

    expect(service.activeMessages().length).toBe(2);
    expect(service.activeMessages()[0].content).toBe('Revised first question');
    expect(calls[2].history).toEqual([]);
  });
});
