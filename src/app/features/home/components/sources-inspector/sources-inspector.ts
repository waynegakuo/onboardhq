import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConversationService } from '../../../../services/conversation.service';

@Component({
  selector: 'app-sources-inspector',
  imports: [RouterLink],
  templateUrl: './sources-inspector.html',
  styleUrl: './sources-inspector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    id: 'sources-inspector-panel',
    class: 'sources-inspector fade-in',
    role: 'complementary',
    'aria-label': 'Conversation sources and context',
  },
})
export class SourcesInspectorComponent {
  readonly conversationService = inject(ConversationService);

  readonly selectedCitation = input<string | null>(null);
  readonly closePanel = output<void>();
  readonly toggleCitation = output<string>();

  readonly citationMentions = computed(() => {
    const activeCite = this.selectedCitation();
    if (!activeCite) return [];
    return this.conversationService
      .activeMessages()
      .filter((m) => m.role === 'ai' && (m.citations ?? []).includes(activeCite));
  });
}
