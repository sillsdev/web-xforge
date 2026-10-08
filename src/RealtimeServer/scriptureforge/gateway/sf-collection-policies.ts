import {
  BiblicalTermsPolicy,
  NoteThreadsPolicy,
  QuestionsPolicy,
  TrainingDataPolicy
} from './policies/project-data-policies';
import { ProjectProfilesPolicy, ProjectsPolicy } from './policies/project-policies';
import { ProjectUserConfigsPolicy } from './policies/project-user-config-policy';
import { TextAudioPolicy, TextsPolicy } from './policies/text-policies';
import { UserProfilesPolicy, UsersPolicy } from './policies/users-policy';
import { CollectionPolicy } from './sf-collection-policy';

/**
 * The access policy of every collection and projection the Scripture Forge client addresses, by the name it uses.
 * A name that is not here (such as `text_documents`) has no client access at all.
 */
export const SF_COLLECTION_POLICIES: ReadonlyMap<string, CollectionPolicy> = new Map(
  [
    new UsersPolicy(),
    new UserProfilesPolicy(),
    new ProjectsPolicy(),
    new ProjectProfilesPolicy(),
    new ProjectUserConfigsPolicy(),
    new TextsPolicy(),
    new QuestionsPolicy(),
    new NoteThreadsPolicy(),
    new BiblicalTermsPolicy(),
    new TextAudioPolicy(),
    new TrainingDataPolicy()
  ].map((policy: CollectionPolicy): [string, CollectionPolicy] => [policy.name, policy])
);
