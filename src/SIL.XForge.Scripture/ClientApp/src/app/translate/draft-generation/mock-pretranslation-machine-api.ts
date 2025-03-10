/* eslint-disable brace-style */
import { Injectable } from '@angular/core';
import { Observable, of, Subscription, timer } from 'rxjs';
import { map, takeWhile } from 'rxjs/operators';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { HttpResponse } from '../../machine-api/http-client';
import { activeBuildStates, PreTranslation, PreTranslationData } from './draft-generation';

/**
 * Mocks the machine api http responses for the pre-translation endpoints.
 *
 * Stores the most recent job state and last completed build state in browser session storage
 * so that the mock build can be resumed if user refreshes, simulating a long running build.
 *
 * Set `MockPreTranslationHttpClient` in `TranslateModule` providers to use the mock service.
 * @example
 * import { HttpClient } from '../machine-api/http-client';  // Use this HttpClient
 * // ... other imports
 *
 * \@NgModule({
 *   // ...
 *   providers: [
 *     { provide: HttpClient, useClass: MockPreTranslationHttpClient },
 *     { provide: DRAFT_GENERATION_SERVICE_OPTIONS, useValue: { pollRate: 200 } }
 *   ]
 * })
 * export class TranslateModule {}
 */
@Injectable({
  providedIn: 'root'
})
export class MockPreTranslationHttpClient {
  private timerSub?: Subscription;

  private readonly initialJobState: BuildDto = {
    id: '',
    href: '',
    engine: { id: '', href: '' },
    revision: 0,
    state: BuildStates.Queued,
    percentCompleted: 0,
    message: '',
    queueDepth: 0
  };

  private readonly completedJobState: BuildDto = {
    id: '',
    href: '',
    engine: { id: '', href: '' },
    revision: 0,
    state: BuildStates.Completed,
    percentCompleted: 1.0,
    message: '',
    queueDepth: 0
  };

  // When true, build will fault when 3/4 finished
  testFaultedState = false;

  // Restore most recent job state from browser session if available
  private mostRecentJobState?: BuildDto = this.getFromBrowserSessionStorage<BuildDto>('mostRecentJobState');

  constructor() {
    // If a build was in progress when browser session ended, resume it
    if (this.mostRecentJobState && activeBuildStates.includes(this.mostRecentJobState.state as BuildStates)) {
      this.startGeneration(true);
    }
  }

  get<T extends BuildDto | PreTranslationData | undefined>(url: string): Observable<HttpResponse<T>> {
    const GET_DRAFT_URL_REGEX: RegExp = /^translation\/engines\/project:[^\/]+\/actions\/pretranslate\/(\d+)_(\d+)$/i;
    const GET_BUILD_PROGRESS_URL_REGEX: RegExp = /^translation\/builds\/id:[^\/?]+\?pretranslate=true$/i;
    const GET_LAST_COMPLETED_BUILD_URL_REGEX: RegExp =
      /^translation\/engines\/project:[^\/]+\/actions\/getLastCompletedPreTranslationBuild$/i;

    // Get build progress
    if (GET_BUILD_PROGRESS_URL_REGEX.test(url)) {
      if (!this.mostRecentJobState) {
        return of({ status: 204, data: undefined });
      }

      return of({ status: 200, data: this.mostRecentJobState as T });
    }

    // Get last completed build if a mock build has completed
    else if (GET_LAST_COMPLETED_BUILD_URL_REGEX.test(url)) {
      if (this.hasCompletedBuild()) {
        return of({ status: 200, data: this.completedJobState as T });
      }

      return of({ status: 204, data: undefined });
    }

    // Get generated draft
    else if (GET_DRAFT_URL_REGEX.test(url)) {
      // Build has not started, has not finished, or was cancelled
      if (!this.mostRecentJobState) {
        return of({ status: 200, data: { preTranslations: [] as PreTranslation[] } as T });
      }

      const matchResult: RegExpMatchArray | null = url.match(GET_DRAFT_URL_REGEX);

      if (matchResult) {
        const book: string = matchResult[1];
        const chapter: string = matchResult[2];
        return of({ status: 200, data: { preTranslations: samplePreTranslations[`${book}_${chapter}`] ?? [] } as T });
      }
    }

    throw new Error('unknown machine api endpoint');
  }

  post<T>(url: string, _: any): Observable<HttpResponse<T>> {
    // Start build
    if (url === 'translation/pretranslations') {
      this.startGeneration();
      return of({ status: 200, data: undefined });
    }

    // Cancel build
    else if (url === 'translation/pretranslations/cancel') {
      this.timerSub?.unsubscribe();
      this.mostRecentJobState!.state = BuildStates.Canceled;

      // Store most recent job state in browser session
      this.storeBrowserSessionStorage<BuildDto>('mostRecentJobState', this.mostRecentJobState!);

      return of({ status: 200, data: undefined });
    }

    throw new Error('unknown machine api endpoint');
  }

  // Mock generation
  private startGeneration(isContinue: boolean = false): void {
    const interval: number = 100; // Something small enough to simulate progress, but not too small to slow down browser
    const duration: number = 12000; // 12 seconds until completion. This can be adjusted as desired.
    const pendingAfter: number = duration / 4;
    const activeAfter: number = (duration / 4) * 2;
    const faultedAfter: number = (duration / 4) * 3;

    // If continuing a build, start at the last known percent completed
    const stepOffset: number =
      isContinue && this.mostRecentJobState?.state === BuildStates.Active
        ? activeAfter / interval +
          Math.floor(this.mostRecentJobState.percentCompleted * ((duration - activeAfter) / interval))
        : 0;

    const generationTimer$: Observable<number> = timer(0, interval).pipe(
      map(x => x + stepOffset),
      takeWhile(x => interval * x <= duration, true)
    );

    // Reset most recent job state if fresh start
    if (!isContinue) {
      this.mostRecentJobState = { ...this.initialJobState };
    }

    this.timerSub = generationTimer$.subscribe((step: number) => {
      if (!this.mostRecentJobState) {
        this.timerSub?.unsubscribe();
        return;
      }

      const elapsed: number = step * interval;

      if (elapsed >= pendingAfter) {
        this.mostRecentJobState.state = BuildStates.Pending;
      }

      if (elapsed >= activeAfter) {
        this.mostRecentJobState.state = BuildStates.Active;
      }

      // Test 'Faulted' state
      if (this.testFaultedState && elapsed >= faultedAfter) {
        this.mostRecentJobState.state = BuildStates.Faulted;
        this.mostRecentJobState.message = 'Error occurred during build';
        this.timerSub?.unsubscribe();
        this.storeBrowserSessionStorage<BuildDto>('mostRecentJobState', this.mostRecentJobState);
        return;
      }

      if (elapsed >= duration) {
        this.mostRecentJobState.state = BuildStates.Completed;
        this.mostRecentJobState.percentCompleted = 1.0;
        this.setHasCompletedBuild(true);
      }

      if (this.mostRecentJobState.state === BuildStates.Active) {
        this.mostRecentJobState.percentCompleted = (elapsed - activeAfter) / (duration - activeAfter);
      }

      // Store most recent job state in browser session
      this.storeBrowserSessionStorage<BuildDto>('mostRecentJobState', this.mostRecentJobState);
    });
  }

  // Get whether user has completed build from browser session flag
  private hasCompletedBuild(): boolean {
    return !!this.getFromBrowserSessionStorage<boolean>('hasCompletedBuild');
  }

  // Store whether user has completed build in browser session flag
  private setHasCompletedBuild(hasCompletedBuild: boolean): void {
    this.storeBrowserSessionStorage<boolean>('hasCompletedBuild', hasCompletedBuild);
  }

  // Store in browser session storage.  Will be cleared when browser session ends.
  private storeBrowserSessionStorage<T>(key: string, val: T): void {
    sessionStorage.setItem(`mockPreTranslationHttpClient:${key}`, JSON.stringify(val));
  }

  // Get from browser session storage
  private getFromBrowserSessionStorage<T>(key: string): T | undefined {
    const val: string | null = sessionStorage.getItem(`mockPreTranslationHttpClient:${key}`);
    return val ? JSON.parse(val) : undefined;
  }
}

const samplePreTranslations1_1: PreTranslation[] = [
  {
    reference: 'GEN 1:1',
    translation: 'THE book of the generation of Jesus Christ, the son of David, the son of Abraham:'
  },
  {
    reference: 'GEN 1:2',
    translation: 'Abraham begot Isaac. And Isaac begot Jacob. And Jacob begot Judas and his brethren.'
  },
  {
    reference: 'GEN 1:3',
    translation: 'And Juda begot Phares and Zara of Thamar. And Phares begot Esron. And Esron begot Aram.'
  },
  {
    reference: 'GEN 1:4',
    translation: 'And Aram begot Aminadab. And Aminadab begot Naasson. And Naasson begot Salmon.'
  },
  {
    reference: 'GEN 1:5',
    translation:
      'And Salmon begot Booz of Rahab. And Booz begot Obed of Ruth. And Obed begot Jesse. And Jesse begot David the king.'
  },
  {
    reference: 'GEN 1:6',
    translation: 'And king David begot Solomon, of her that had been the wife of Urias.'
  },
  {
    reference: 'GEN 1:7',
    translation: 'And Solomon begot Roboam. And Roboam begot Abiam. And Abia begot Asa.'
  },
  {
    reference: 'GEN 1:8',
    translation: 'And Asa begot Josaphat. And Josaphat begot Joram. And Joram begot Ozias.'
  },
  {
    reference: 'GEN 1:9',
    translation: 'And Ozias begot Joatham. And Joatham begot Achaz. And Achaz begot Ezechias.'
  },
  {
    reference: 'GEN 1:10',
    translation: 'And Ezechias begot Manasses. And Manasses begot Amon. And Amon begot Josias.'
  },
  {
    reference: 'GEN 1:11',
    translation: 'And Josias begot Jechonias and his brethren in the transmigration of Babylon.'
  },
  {
    reference: 'GEN 1:12',
    translation: 'And after the transmigration of Babylon, Jechonias begot Salathiel. And Salathiel begot Zorobabel.'
  },
  {
    reference: 'GEN 1:13',
    translation: 'And Zorobabel begot Abiud. And Abiud begot Eliacim. And Eliacim begot Azor.'
  },
  {
    reference: 'GEN 1:14',
    translation: 'And Azor begot Sadoc. And Sadoc begot Achim. And Achim begot Eliud.'
  },
  {
    reference: 'GEN 1:15',
    translation: 'And Eliud begot Eleazar. And Eleazar begot Mathan. And Mathan begot Jacob.'
  },
  {
    reference: 'GEN 1:16',
    translation: 'And Jacob begot Joseph the husband of Mary, of whom was born Jesus, who is called Christ.'
  },
  {
    reference: 'GEN 1:17',
    translation:
      'So all the generations, from Abraham to David, are fourteen generations: and from David to the transmigration of Babylon, are fourteen generations: and from the transmigration of Babylon to Christ are fourteen generations.'
  },
  {
    reference: 'GEN 1:18',
    translation:
      'Now the generation of Christ was in this manner. When his mother Mary was espoused to Joseph, before they came together, she was found with child, of the Holy Ghost.'
  },
  {
    reference: 'GEN 1:19',
    translation:
      'And Joseph her husband, being a just man, and not willing to expose her, was minded to put her away privately.'
  },
  {
    reference: 'GEN 1:20',
    translation:
      'But as he thought on these things, behold an angel of the Lord appeared to him in his sleep, saying: Joseph, son of David, fear not to take unto thee Mary thy wife; for that which is conceived in her, is of the Holy Ghost.'
  },
  {
    reference: 'GEN 1:21',
    translation:
      'And she shall bring forth a son; and thou shalt call his name JESUS. For he shall save his people from their sins.'
  },
  {
    reference: 'GEN 1:22',
    translation: 'Now all this was done that it might be fulfilled which the Lord spoke by the prophet, saying:'
  },
  {
    reference: 'GEN 1:23',
    translation:
      'Behold, a virgin shall be with child, and bring forth a son, and they shall call his name Emmanuel, which being interpreted is, God with us.'
  },
  {
    reference: 'GEN 1:24',
    translation:
      'And Joseph rising up from sleep, did as the angel of the Lord had commanded him, and took unto him his wife.'
  },
  {
    reference: 'GEN 1:25',
    translation: 'And he knew her not till she brought forth her firstborn son; and he called his name JESUS.'
  }
];

const samplePreTranslations1_2: PreTranslation[] = [
  {
    reference: 'GEN 2:1',
    translation: 'Thus the heavens and the earth were finished, and all the host of them.'
  },
  {
    reference: 'GEN 2:2',
    translation:
      'And on the seventh day God ended his work which he had made; and he rested on the seventh day from all his work which he had made.'
  },
  {
    reference: 'GEN 2:3',
    translation:
      'And God blessed the seventh day, and sanctified it: because that in it he had rested from all his work which God created and made.'
  },
  {
    reference: 'GEN 2:4',
    translation:
      'These are the generations of the heavens and of the earth when they were created, in the day that the LORD God made the earth and the heavens.'
  },
  {
    reference: 'GEN 2:5',
    translation:
      'And every plant of the field before it was in the earth, and every herb of the field before it grew: for the LORD God had not caused it to rain upon the earth, and there was not a man to till the ground.'
  },
  {
    reference: 'GEN 2:6',
    translation: 'But there went up a mist from the earth, and watered the whole face of the ground.'
  },
  {
    reference: 'GEN 2:7',
    translation:
      'And the LORD God formed man of the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul.'
  },
  {
    reference: 'GEN 2:8',
    translation: 'And the LORD God planted a garden eastward in Eden; and there he put the man whom he had formed.'
  },
  {
    reference: 'GEN 2:9',
    translation:
      'And out of the ground made the LORD God to grow every tree that is pleasant to the sight, and good for food; the tree of life also in the midst of the garden, and the tree of knowledge of good and evil.'
  },
  {
    reference: 'GEN 2:10',
    translation:
      'And a river went out of Eden to water the garden; and from thence it was parted, and became into four heads.'
  },
  {
    reference: 'GEN 2:11',
    translation:
      'The name of the first is Pison: that is it which compasseth the whole land of Havilah, where there is gold;'
  },
  {
    reference: 'GEN 2:12',
    translation: 'And the gold of that land is good: there is bdellium and the onyx stone.'
  },
  {
    reference: 'GEN 2:13',
    translation: 'And the name of the second river is Gihon: the same is it that compasseth the whole land of Ethiopia.'
  },
  {
    reference: 'GEN 2:14',
    translation:
      'And the name of the third river is Hiddekel: that is it which goeth toward the east of Assyria. And the fourth river is Euphrates.'
  },
  {
    reference: 'GEN 2:15',
    translation: 'And the LORD God took the man, and put him into the garden of Eden to dress it and to keep it.'
  },
  {
    reference: 'GEN 2:16',
    translation: 'And the LORD God commanded the man, saying, Of every tree of the garden thou mayest freely eat:'
  },
  {
    reference: 'GEN 2:17',
    translation:
      'But of the tree of the knowledge of good and evil, thou shalt not eat of it: for in the day that thou eatest thereof thou shalt surely die.'
  },
  {
    reference: 'GEN 2:18',
    translation:
      'And the LORD God said, It is not good that the man should be alone; I will make him an help meet for him.'
  },
  {
    reference: 'GEN 2:19',
    translation:
      'And out of the ground the LORD God formed every beast of the field, and every fowl of the air; and brought them unto Adam to see what he would call them: and whatsoever Adam called every living creature, that was the name thereof.'
  },
  {
    reference: 'GEN 2:20',
    translation:
      'And Adam gave names to all cattle, and to the fowl of the air, and to every beast of the field; but for Adam there was not found an help meet for him.'
  },
  {
    reference: 'GEN 2:21',
    translation:
      'And the LORD God caused a deep sleep to fall upon Adam, and he slept: and he took one of his ribs, and closed up the flesh instead thereof;'
  },
  {
    reference: 'GEN 2:22',
    translation: 'And the rib, which the LORD God had taken from man, made he a woman, and brought her unto the man.'
  },
  {
    reference: 'GEN 2:23',
    translation:
      'And Adam said, This is now bone of my bones, and flesh of my flesh: she shall be called Woman, because she was taken out of Man.'
  },
  {
    reference: 'GEN 2:24',
    translation:
      'Therefore shall a man leave his father and his mother, and shall cleave unto his wife: and they shall be one flesh.'
  },
  {
    reference: 'GEN 2:25',
    translation: 'And they were both naked, the man and his wife, and were not ashamed.'
  }
];

const samplePreTranslations2_1: PreTranslation[] = [
  {
    reference: 'EXO 1:1',
    translation:
      'Now these are the names of the children of Israel, which came into Egypt; every man and his household came with Jacob.'
  },
  {
    reference: 'EXO 1:2',
    translation: 'Reuben, Simeon, Levi, and Judah,'
  },
  {
    reference: 'EXO 1:3',
    translation: 'Issachar, Zebulun, and Benjamin,'
  },
  {
    reference: 'EXO 1:4',
    translation: 'Dan, and Naphtali, Gad, and Asher.'
  },
  {
    reference: 'EXO 1:5',
    translation:
      'And all the souls that came out of the loins of Jacob were seventy souls: for Joseph was in Egypt already.'
  },
  {
    reference: 'EXO 1:6',
    translation: 'And Joseph died, and all his brethren, and all that generation.'
  },
  {
    reference: 'EXO 1:7',
    translation:
      'And the children of Israel were fruitful, and increased abundantly, and multiplied, and waxed exceeding mighty; and the land was filled with them.'
  },
  {
    reference: 'EXO 1:8',
    translation: 'Now there arose up a new king over Egypt, which knew not Joseph.'
  },
  {
    reference: 'EXO 1:9',
    translation:
      'And he said unto his people, Behold, the people of the children of Israel are more and mightier than we:'
  },
  {
    reference: 'EXO 1:10',
    translation:
      'Come on, let us deal wisely with them; lest they multiply, and it come to pass, that, when there falleth out any war, they join also unto our enemies, and fight against us, and so get them up out of the land.'
  },
  {
    reference: 'EXO 1:11',
    translation:
      'Therefore they did set over them taskmasters to afflict them with their burdens. And they built for Pharaoh treasure cities, Pithom and Raamses.'
  },
  {
    reference: 'EXO 1:12',
    translation:
      'But the more they afflicted them, the more they multiplied and grew. And they were grieved because of the children of Israel.'
  },
  {
    reference: 'EXO 1:13',
    translation: 'And the Egyptians made the children of Israel to serve with rigor:'
  },
  {
    reference: 'EXO 1:14',
    translation:
      'And they made their lives bitter with hard bondage, in mortar, and in brick, and in all manner of service in the field: all their service, wherein they made them serve, was with rigor.'
  },
  {
    reference: 'EXO 1:15',
    translation:
      'And the king of Egypt spake to the Hebrew midwives, of which the name of the one was Shiphrah, and the name of the other Puah:'
  },
  {
    reference: 'EXO 1:16',
    translation:
      'And he said, When ye do the office of a midwife to the Hebrew women, and see them upon the stools; if it be a son, then ye shall kill him: but if it be a daughter, then she shall live.'
  },
  {
    reference: 'EXO 1:17',
    translation:
      'But the midwives feared God, and did not as the king of Egypt commanded them, but saved the men children alive.'
  },
  {
    reference: 'EXO 1:18',
    translation:
      'And the king of Egypt called for the midwives, and said unto them, Why have ye done this thing, and have saved the men children alive?'
  },
  {
    reference: 'EXO 1:19',
    translation:
      'And the midwives said unto Pharaoh, Because the Hebrew women are not as the Egyptian women; for they are lively, and are delivered ere the midwives come in unto them.'
  },
  {
    reference: 'EXO 1:20',
    translation: 'Therefore God dealt well with the midwives: and the people multiplied, and waxed very mighty.'
  },
  {
    reference: 'EXO 1:21',
    translation: 'And it came to pass, because the midwives feared God, that he made them houses.'
  },
  {
    reference: 'EXO 1:22',
    translation:
      'And Pharaoh charged all his people, saying, Every son that is born ye shall cast into the river, and every daughter ye shall save alive.'
  }
];

const samplePreTranslations2_2: PreTranslation[] = [
  {
    reference: 'EXO 2:1',
    translation: 'And there went a man of the house of Levi, and took to wife a daughter of Levi.'
  },
  {
    reference: 'EXO 2:2',
    translation:
      'And the woman conceived, and bare a son: and when she saw him that he was a goodly child, she hid him three months.'
  },
  {
    reference: 'EXO 2:3',
    translation:
      "And when she could not longer hide him, she took for him an ark of bulrushes, and daubed it with slime and with pitch, and put the child therein; and she laid it in the flags by the river's brink."
  },
  {
    reference: 'EXO 2:4',
    translation: 'And his sister stood afar off, to wit what would be done to him.'
  },
  {
    reference: 'EXO 2:5',
    translation:
      "And the daughter of Pharaoh came down to wash herself at the river; and her maidens walked along by the river's side; and when she saw the ark among the flags, she sent her maid to fetch it."
  },
  {
    reference: 'EXO 2:6',
    translation:
      "And when she had opened it, she saw the child: and, behold, the babe wept. And she had compassion on him, and said, This is one of the Hebrews' children."
  },
  {
    reference: 'EXO 2:7',
    translation:
      "Then said his sister to Pharaoh's daughter, Shall I go and call to thee a nurse of the Hebrew women, that she may nurse the child for thee?"
  },
  {
    reference: 'EXO 2:8',
    translation: "And Pharaoh's daughter said to her, Go. And the maid went and called the child's mother."
  },
  {
    reference: 'EXO 2:9',
    translation:
      "And Pharaoh's daughter said unto her, Take this child away, and nurse it for me, and I will give thee thy wages. And the woman took the child, and nursed it."
  },
  {
    reference: 'EXO 2:10',
    translation:
      "And the child grew, and she brought him unto Pharaoh's daughter, and he became her son. And she called his name Moses: and she said, Because I drew him out of the water."
  },
  {
    reference: 'EXO 2:11',
    translation:
      'And it came to pass in those days, when Moses was grown, that he went out unto his brethren, and looked on their burdens: and he spied an Egyptian smiting an Hebrew, one of his brethren.'
  },
  {
    reference: 'EXO 2:12',
    translation:
      'And he looked this way and that way, and when he saw that there was no man, he slew the Egyptian, and hid him in the sand.'
  },
  {
    reference: 'EXO 2:13',
    translation:
      'And when he went out the second day, behold, two men of the Hebrews strove together: and he said to him that did the wrong, Wherefore smitest thou thy fellow?'
  },
  {
    reference: 'EXO 2:14',
    translation:
      'And he said, Who made thee a prince and a judge over us? intendest thou to kill me, as thou killedst the Egyptian? And Moses feared, and said, Surely this thing is known.'
  },
  {
    reference: 'EXO 2:15',
    translation:
      'Now when Pharaoh heard this thing, he sought to slay Moses. But Moses fled from the face of Pharaoh, and dwelt in the land of Midian: and he sat down by a well.'
  },
  {
    reference: 'EXO 2:16',
    translation:
      "Now the priest of Midian had seven daughters: and they came and drew water, and filled the troughs to water their father's flock."
  },
  {
    reference: 'EXO 2:17',
    translation:
      'And the shepherds came and drove them away: but Moses stood up and helped them, and watered their flock.'
  },
  {
    reference: 'EXO 2:18',
    translation: 'And when they came to Reuel their father, he said, How is it that ye are come so soon today?'
  },
  {
    reference: 'EXO 2:19',
    translation:
      'And they said, An Egyptian delivered us out of the hand of the shepherds, and also drew water enough for us, and watered the flock.'
  },
  {
    reference: 'EXO 2:20',
    translation:
      'And he said unto his daughters, And where is he? why is it that ye have left the man? call him, that he may eat bread.'
  },
  {
    reference: 'EXO 2:21',
    translation: 'And Moses was content to dwell with the man: and he gave Moses Zipporah his daughter.'
  },
  {
    reference: 'EXO 2:22',
    translation:
      'And she bare him a son, and he called his name Gershom: for he said, I have been a stranger in a strange land.'
  },
  {
    reference: 'EXO 2:23',
    translation:
      'And it came to pass in process of time, that the king of Egypt died: and the children of Israel sighed by reason of the bondage, and they cried, and their cry came up unto God by reason of the bondage.'
  },
  {
    reference: 'EXO 2:24',
    translation:
      'And God heard their groaning, and God remembered his covenant with Abraham, with Isaac, and with Jacob.'
  },
  {
    reference: 'EXO 2:25',
    translation: 'And God looked upon the children of Israel, and God had respect unto them.'
  }
];

const samplePreTranslations: { [key: string]: PreTranslation[] } = {
  '1_1': samplePreTranslations1_1,
  '1_2': samplePreTranslations1_2,
  '2_1': samplePreTranslations2_1,
  '2_2': samplePreTranslations2_2
};
