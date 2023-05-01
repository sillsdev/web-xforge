import { Component } from '@angular/core';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectService } from '../../core/sf-project.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';

interface Event {
  type: 'answer' | 'comment' | 'note' | 'comment_on_note';
  userId: string;
  timestamp?: number;
}

@Component({
  selector: 'app-activity',
  templateUrl: './activity.component.html',
  styleUrls: ['./activity.component.scss']
})
export class ActivityComponent extends SubscriptionDisposable {
  timeFrameInSeconds = 60 * 60 * 24 * 7; // 1 week

  events: Event[] = [];

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService
  ) {
    super();

    this.subscribe(activatedProject.projectDoc$, projectDoc => this.updateEventList(projectDoc));
  }

  async updateEventList(projectDoc: SFProjectProfileDoc | undefined): Promise<void> {
    if (projectDoc?.data == null) {
      this.events = [];
      return;
    }

    const questionsQuery = await this.projectService.queryQuestions(projectDoc.id);
    const notesQuery = await this.projectService.queryNoteThreads(projectDoc.id);

    let events: Event[] = [];

    // process questions, answers, and comments

    for (const questionDoc of questionsQuery.docs) {
      const question = questionDoc.data;
      if (question == null) continue;

      for (const answer of question.answers) {
        events.push({
          type: 'answer',
          userId: answer.ownerRef,
          timestamp: new Date(answer.dateCreated).getTime()
        });

        for (const comment of answer.comments) {
          events.push({
            type: 'comment',
            userId: comment.ownerRef,
            timestamp: new Date(comment.dateCreated).getTime()
          });
        }
      }
    }

    // process notes

    for (const noteDoc of notesQuery.docs) {
      const thread = noteDoc.data;
      if (thread == null) continue;

      for (const [index, comment] of thread.notes.entries()) {
        events.push({
          type: index === 0 ? 'note' : 'comment_on_note',
          userId: comment.ownerRef,
          timestamp: new Date(comment.dateCreated).getTime()
        });
      }
    }

    // filter the events
    const now = new Date().getTime();
    this.events = events.filter(event => {
      if (event.timestamp == null) return false;
      return now - event.timestamp < this.timeFrameInSeconds * 1000;
    });

    // sort the events
    this.events.sort((a, b) => {
      if (a.timestamp == null || b.timestamp == null) return 0;
      return b.timestamp - a.timestamp;
    });
  }

  get project(): SFProjectProfile | undefined {
    return this.activatedProject.projectDoc?.data;
  }

  getMessage(event: Event): string {
    if (event.type === 'answer') {
      return `wrote an answer`;
    } else if (event.type === 'comment') {
      return `commented on an answer`;
    } else if (event.type === 'note') {
      return `created a new note`;
    } else if (event.type === 'comment_on_note') {
      return `commented on a note`;
    } else {
      return '';
    }
  }

  getTimeMessage(event: Event): string {
    if (event.timestamp == null) return '';
    const now = new Date().getTime();
    const diff = now - event.timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    } else if (hours >= 1) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else if (minutes >= 1) {
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    } else {
      return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
    }
  }

  getIcon(event: Event): string {
    return {
      answer: 'add_comment',
      comment: 'rate_review',
      note: 'note_add',
      comment_on_note: 'note_add'
    }[event.type];
  }
}
