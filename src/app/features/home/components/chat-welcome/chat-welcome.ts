import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StarterPrompt } from '../../../../models/message';
import { ConversationService } from '../../../../services/conversation.service';

@Component({
  selector: 'app-chat-welcome',
  imports: [RouterLink],
  templateUrl: './chat-welcome.html',
  styleUrl: './chat-welcome.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWelcomeComponent {
  readonly conversationService = inject(ConversationService);
  readonly selectPrompt = output<string>();

  readonly starterPrompts: StarterPrompt[] = [
    {
      id: 'hybrid',
      category: 'Policy',
      title: 'Hybrid & remote work',
      prompt: 'What is our policy on hybrid and remote work?',
    },
    {
      id: 'vpn',
      category: 'IT Setup',
      title: 'Corporate VPN & email',
      prompt: 'How do I set up my corporate VPN and email?',
    },
    {
      id: 'benefits',
      category: 'HR & Benefits',
      title: 'Leave & health benefits',
      prompt: 'Summarize employee leave policies and core health benefits.',
    },
    {
      id: 'culture',
      category: 'Company',
      title: 'Culture & core values',
      prompt: "Tell me about the company's culture and values.",
    },
    {
      id: 'week1',
      category: 'Onboarding',
      title: 'First-week checklist',
      prompt: 'What key tasks should a new hire complete in their first week?',
    },
    {
      id: 'expenses',
      category: 'Operations',
      title: 'Expense reimbursements',
      prompt: 'What is the procedure for submitting work-related expenses?',
    },
  ];

  onChoosePrompt(prompt: string): void {
    this.selectPrompt.emit(prompt);
  }
}
