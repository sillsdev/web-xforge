import { InjectionToken } from '@angular/core';
export interface NllbLanguage {
  /**
   * ISO language name.
   */
  name: string;

  /**
   * ISO 639-1: Two-letter codes, one per language for ISO 639 macrolanguage.
   */
  iso639_1: string;

  /**
   * ISO 639-2/T: Three-letter codes for the same languages as 639-1.
   */
  iso639_2t: string;

  /**
   * ISO 639-2/B: Three-letter codes, mostly the same as 639-2/T, but with some codes derived
   * from English names rather than native names of languages.
   */
  iso639_2b: string;
}

/**
 * Mapping of three-letter ISO 639-2/T code to other language props.
 */
export interface NllbLanguageDict {
  [iso639_2t: string]: NllbLanguage;
}

const nllb: NllbLanguageDict = {
  afr: {
    name: 'Afrikaans',
    iso639_1: 'af',
    iso639_2t: 'afr',
    iso639_2b: 'afr'
  },
  sqi: {
    name: 'Albanian',
    iso639_1: 'sq',
    iso639_2t: 'sqi',
    iso639_2b: 'alb'
  },
  amh: {
    name: 'Amharic',
    iso639_1: 'am',
    iso639_2t: 'amh',
    iso639_2b: 'amh'
  },
  ara: {
    name: 'Arabic',
    iso639_1: 'ar',
    iso639_2t: 'ara',
    iso639_2b: 'ara'
  },
  hye: {
    name: 'Armenian',
    iso639_1: 'hy',
    iso639_2t: 'hye',
    iso639_2b: 'arm'
  },
  aze: {
    name: 'Azerbaijani',
    iso639_1: 'az',
    iso639_2t: 'aze',
    iso639_2b: 'aze'
  },
  eus: {
    name: 'Basque',
    iso639_1: 'eu',
    iso639_2t: 'eus',
    iso639_2b: 'baq'
  },
  bel: {
    name: 'Belarusian',
    iso639_1: 'be',
    iso639_2t: 'bel',
    iso639_2b: 'bel'
  },
  ben: {
    name: 'Bengali',
    iso639_1: 'bn',
    iso639_2t: 'ben',
    iso639_2b: 'ben'
  },
  bos: {
    name: 'Bosnian',
    iso639_1: 'bs',
    iso639_2t: 'bos',
    iso639_2b: 'bos'
  },
  bul: {
    name: 'Bulgarian',
    iso639_1: 'bg',
    iso639_2t: 'bul',
    iso639_2b: 'bul'
  },
  mya: {
    name: 'Burmese',
    iso639_1: 'my',
    iso639_2t: 'mya',
    iso639_2b: 'bur'
  },
  cat: {
    name: 'Catalan',
    iso639_1: 'ca',
    iso639_2t: 'cat',
    iso639_2b: 'cat'
  },
  ceb: {
    name: 'Cebuano',
    iso639_1: 'none',
    iso639_2t: 'ceb',
    iso639_2b: 'ceb'
  },
  nya: {
    name: 'Chichewa',
    iso639_1: 'ny',
    iso639_2t: 'nya',
    iso639_2b: 'nya'
  },
  zho: {
    name: 'Chinese (Simplified)',
    iso639_1: 'zh',
    iso639_2t: 'zho',
    iso639_2b: 'chi'
  },
  chi: {
    name: 'Chinese (Traditional)',
    iso639_1: 'zh',
    iso639_2t: 'chi',
    iso639_2b: 'chi'
  },
  cos: {
    name: 'Corsican',
    iso639_1: 'co',
    iso639_2t: 'cos',
    iso639_2b: 'cos'
  },
  hrv: {
    name: 'Croatian',
    iso639_1: 'hr',
    iso639_2t: 'hrv',
    iso639_2b: 'hrv'
  },
  ces: {
    name: 'Czech',
    iso639_1: 'cs',
    iso639_2t: 'ces',
    iso639_2b: 'cze'
  },
  dan: {
    name: 'Danish',
    iso639_1: 'da',
    iso639_2t: 'dan',
    iso639_2b: 'dan'
  },
  nld: {
    name: 'Dutch',
    iso639_1: 'nl',
    iso639_2t: 'nld',
    iso639_2b: 'dut'
  },
  eng: {
    name: 'English',
    iso639_1: 'en',
    iso639_2t: 'eng',
    iso639_2b: 'eng'
  },
  epo: {
    name: 'Esperanto',
    iso639_1: 'eo',
    iso639_2t: 'epo',
    iso639_2b: 'epo'
  },
  est: {
    name: 'Estonian',
    iso639_1: 'et',
    iso639_2t: 'est',
    iso639_2b: 'est'
  },
  fil: {
    name: 'Filipino',
    iso639_1: 'tl',
    iso639_2t: 'fil',
    iso639_2b: 'fil'
  },
  fin: {
    name: 'Finnish',
    iso639_1: 'fi',
    iso639_2t: 'fin',
    iso639_2b: 'fin'
  },
  fra: {
    name: 'French',
    iso639_1: 'fr',
    iso639_2t: 'fra',
    iso639_2b: 'fre'
  },
  fry: {
    name: 'Frisian',
    iso639_1: 'fy',
    iso639_2t: 'fry',
    iso639_2b: 'fry'
  },
  glg: {
    name: 'Galician',
    iso639_1: 'gl',
    iso639_2t: 'glg',
    iso639_2b: 'glg'
  },
  kat: {
    name: 'Georgian',
    iso639_1: 'ka',
    iso639_2t: 'kat',
    iso639_2b: 'geo'
  },
  deu: {
    name: 'German',
    iso639_1: 'de',
    iso639_2t: 'deu',
    iso639_2b: 'ger'
  },
  ell: {
    name: 'Greek',
    iso639_1: 'el',
    iso639_2t: 'ell',
    iso639_2b: 'gre'
  },
  guj: {
    name: 'Gujarati',
    iso639_1: 'gu',
    iso639_2t: 'guj',
    iso639_2b: 'guj'
  },
  hat: {
    name: 'Haitian Creole',
    iso639_1: 'ht',
    iso639_2t: 'hat',
    iso639_2b: 'hat'
  },
  hau: {
    name: 'Hausa',
    iso639_1: 'ha',
    iso639_2t: 'hau',
    iso639_2b: 'hau'
  },
  haw: {
    name: 'Hawaiian',
    iso639_1: 'haw',
    iso639_2t: 'haw',
    iso639_2b: 'haw'
  },
  heb: {
    name: 'Hebrew',
    iso639_1: 'he',
    iso639_2t: 'heb',
    iso639_2b: 'heb'
  },
  hin: {
    name: 'Hindi',
    iso639_1: 'hi',
    iso639_2t: 'hin',
    iso639_2b: 'hin'
  },
  hmn: {
    name: 'Hmong',
    iso639_1: 'none',
    iso639_2t: 'hmn',
    iso639_2b: 'hmn'
  },
  hun: {
    name: 'Hungarian',
    iso639_1: 'hu',
    iso639_2t: 'hun',
    iso639_2b: 'hun'
  },
  isl: {
    name: 'Icelandic',
    iso639_1: 'is',
    iso639_2t: 'isl',
    iso639_2b: 'ice'
  },
  ibo: {
    name: 'Igbo',
    iso639_1: 'ig',
    iso639_2t: 'ibo',
    iso639_2b: 'ibo'
  },
  ind: {
    name: 'Indonesian',
    iso639_1: 'id',
    iso639_2t: 'ind',
    iso639_2b: 'ind'
  },
  gle: {
    name: 'Irish',
    iso639_1: 'ga',
    iso639_2t: 'gle',
    iso639_2b: 'gle'
  },
  ita: {
    name: 'Italian',
    iso639_1: 'it',
    iso639_2t: 'ita',
    iso639_2b: 'ita'
  },
  jpn: {
    name: 'Japanese',
    iso639_1: 'ja',
    iso639_2t: 'jpn',
    iso639_2b: 'jpn'
  },
  jav: {
    name: 'Javanese',
    iso639_1: 'jv',
    iso639_2t: 'jav',
    iso639_2b: 'jav'
  },
  kan: {
    name: 'Kannada',
    iso639_1: 'kn',
    iso639_2t: 'kan',
    iso639_2b: 'kan'
  },
  kaz: {
    name: 'Kazakh',
    iso639_1: 'kk',
    iso639_2t: 'kaz',
    iso639_2b: 'kaz'
  },
  khm: {
    name: 'Khmer',
    iso639_1: 'km',
    iso639_2t: 'khm',
    iso639_2b: 'khm'
  },
  kin: {
    name: 'Kinyarwanda',
    iso639_1: 'rw',
    iso639_2t: 'kin',
    iso639_2b: 'kin'
  },
  kir: {
    name: 'Kirundi',
    iso639_1: 'rn',
    iso639_2t: 'kir',
    iso639_2b: 'run'
  },
  kor: {
    name: 'Korean',
    iso639_1: 'ko',
    iso639_2t: 'kor',
    iso639_2b: 'kor'
  },
  kur: {
    name: 'Kurdish (Kurmanji)',
    iso639_1: 'ku',
    iso639_2t: 'kur',
    iso639_2b: 'kur'
  },
  kyr: {
    name: 'Kyrgyz',
    iso639_1: 'ky',
    iso639_2t: 'kyr',
    iso639_2b: 'kir'
  },
  lao: {
    name: 'Lao',
    iso639_1: 'lo',
    iso639_2t: 'lao',
    iso639_2b: 'lao'
  },
  lat: {
    name: 'Latin',
    iso639_1: 'la',
    iso639_2t: 'lat',
    iso639_2b: 'lat'
  },
  lav: {
    name: 'Latvian',
    iso639_1: 'lv',
    iso639_2t: 'lav',
    iso639_2b: 'lav'
  },
  lit: {
    name: 'Lithuanian',
    iso639_1: 'lt',
    iso639_2t: 'lit',
    iso639_2b: 'lit'
  },
  ltz: {
    name: 'Luxembourgish',
    iso639_1: 'lb',
    iso639_2t: 'ltz',
    iso639_2b: 'ltz'
  },
  mkd: {
    name: 'Macedonian',
    iso639_1: 'mk',
    iso639_2t: 'mkd',
    iso639_2b: 'mac'
  },
  mlg: {
    name: 'Malagasy',
    iso639_1: 'mg',
    iso639_2t: 'mlg',
    iso639_2b: 'mlg'
  },
  msa: {
    name: 'Malay',
    iso639_1: 'ms',
    iso639_2t: 'msa',
    iso639_2b: 'may'
  },
  mal: {
    name: 'Malayalam',
    iso639_1: 'ml',
    iso639_2t: 'mal',
    iso639_2b: 'mal'
  },
  mlt: {
    name: 'Maltese',
    iso639_1: 'mt',
    iso639_2t: 'mlt',
    iso639_2b: 'mlt'
  },
  mri: {
    name: 'Maori',
    iso639_1: 'mi',
    iso639_2t: 'mri',
    iso639_2b: 'mao'
  },
  mar: {
    name: 'Marathi',
    iso639_1: 'mr',
    iso639_2t: 'mar',
    iso639_2b: 'mar'
  },
  mon: {
    name: 'Mongolian',
    iso639_1: 'mn',
    iso639_2t: 'mon',
    iso639_2b: 'mon'
  },
  mya: {
    name: 'Myanmar (Burmese)',
    iso639_1: 'my',
    iso639_2t: 'mya',
    iso639_2b: 'bur'
  },
  nep: {
    name: 'Nepali',
    iso639_1: 'ne',
    iso639_2t: 'nep',
    iso639_2b: 'nep'
  },
  nor: {
    name: 'Norwegian',
    iso639_1: 'no',
    iso639_2t: 'nor',
    iso639_2b: 'nor'
  },
  nya: {
    name: 'Nyanja (Chichewa)',
    iso639_1: 'ny',
    iso639_2t: 'nya',
    iso639_2b: 'nya'
  },
  ori: {
    name: 'Odia (Oriya)',
    iso639_1: 'or',
    iso639_2t: 'ori',
    iso639_2b: 'ori'
  },
  pus: {
    name: 'Pashto',
    iso639_1: 'ps',
    iso639_2t: 'pus',
    iso639_2b: 'pus'
  },
  fas: {
    name: 'Persian',
    iso639_1: 'fa',
    iso639_2t: 'fas',
    iso639_2b: 'per'
  },
  pol: {
    name: 'Polish',
    iso639_1: 'pl',
    iso639_2t: 'pol',
    iso639_2b: 'pol'
  },
  por: {
    name: 'Portuguese',
    iso639_1: 'pt',
    iso639_2t: 'por',
    iso639_2b: 'por'
  },
  pan: {
    name: 'Punjabi',
    iso639_1: 'pa',
    iso639_2t: 'pan',
    iso639_2b: 'pan'
  },
  ron: {
    name: 'Romanian',
    iso639_1: 'ro',
    iso639_2t: 'ron',
    iso639_2b: 'rum'
  },
  rus: {
    name: 'Russian',
    iso639_1: 'ru',
    iso639_2t: 'rus',
    iso639_2b: 'rus'
  },
  smo: {
    name: 'Samoan',
    iso639_1: 'sm',
    iso639_2t: 'smo',
    iso639_2b: 'smo'
  },
  gla: {
    name: 'Scots Gaelic',
    iso639_1: 'gd',
    iso639_2t: 'gla',
    iso639_2b: 'gla'
  },
  srp: {
    name: 'Serbian',
    iso639_1: 'sr',
    iso639_2t: 'srp',
    iso639_2b: 'srp'
  },
  sot: {
    name: 'Sesotho',
    iso639_1: 'st',
    iso639_2t: 'sot',
    iso639_2b: 'sot'
  },
  sna: {
    name: 'Shona',
    iso639_1: 'sn',
    iso639_2t: 'sna',
    iso639_2b: 'sna'
  },
  snd: {
    name: 'Sindhi',
    iso639_1: 'sd',
    iso639_2t: 'snd',
    iso639_2b: 'snd'
  },
  sin: {
    name: 'Sinhala (Sinhalese)',
    iso639_1: 'si',
    iso639_2t: 'sin',
    iso639_2b: 'sin'
  },
  slk: {
    name: 'Slovak',
    iso639_1: 'sk',
    iso639_2t: 'slk',
    iso639_2b: 'slo'
  },
  slv: {
    name: 'Slovenian',
    iso639_1: 'sl',
    iso639_2t: 'slv',
    iso639_2b: 'slv'
  },
  som: {
    name: 'Somali',
    iso639_1: 'so',
    iso639_2t: 'som',
    iso639_2b: 'som'
  },
  spa: {
    name: 'Spanish',
    iso639_1: 'es',
    iso639_2t: 'spa',
    iso639_2b: 'spa'
  },
  sun: {
    name: 'Sundanese',
    iso639_1: 'su',
    iso639_2t: 'sun',
    iso639_2b: 'sun'
  },
  swa: {
    name: 'Swahili',
    iso639_1: 'sw',
    iso639_2t: 'swa',
    iso639_2b: 'swa'
  },
  swe: {
    name: 'Swedish',
    iso639_1: 'sv',
    iso639_2t: 'swe',
    iso639_2b: 'swe'
  },
  tgk: {
    name: 'Tajik',
    iso639_1: 'tg',
    iso639_2t: 'tgk',
    iso639_2b: 'tgk'
  },
  tam: {
    name: 'Tamil',
    iso639_1: 'ta',
    iso639_2t: 'tam',
    iso639_2b: 'tam'
  },
  tat: {
    name: 'Tatar',
    iso639_1: 'tt',
    iso639_2t: 'tat',
    iso639_2b: 'tat'
  },
  tel: {
    name: 'Telugu',
    iso639_1: 'te',
    iso639_2t: 'tel',
    iso639_2b: 'tel'
  },
  tha: {
    name: 'Thai',
    iso639_1: 'th',
    iso639_2t: 'tha',
    iso639_2b: 'tha'
  },
  tur: {
    name: 'Turkish',
    iso639_1: 'tr',
    iso639_2t: 'tur',
    iso639_2b: 'tur'
  },
  tuk: {
    name: 'Turkmen',
    iso639_1: 'tk',
    iso639_2t: 'tuk',
    iso639_2b: 'tuk'
  },
  ukr: {
    name: 'Ukrainian',
    iso639_1: 'uk',
    iso639_2t: 'ukr',
    iso639_2b: 'ukr'
  },
  urd: {
    name: 'Urdu',
    iso639_1: 'ur',
    iso639_2t: 'urd',
    iso639_2b: 'urd'
  },
  uzb: {
    name: 'Uzbek',
    iso639_1: 'uz',
    iso639_2t: 'uzb',
    iso639_2b: 'uzb'
  },
  vie: {
    name: 'Vietnamese',
    iso639_1: 'vi',
    iso639_2t: 'vie',
    iso639_2b: 'vie'
  },
  cym: {
    name: 'Welsh',
    iso639_1: 'cy',
    iso639_2t: 'cym',
    iso639_2b: 'wel'
  },
  xho: {
    name: 'Xhosa',
    iso639_1: 'xh',
    iso639_2t: 'xho',
    iso639_2b: 'xho'
  },
  yid: {
    name: 'Yiddish',
    iso639_1: 'yi',
    iso639_2t: 'yid',
    iso639_2b: 'yid'
  },
  yor: {
    name: 'Yoruba',
    iso639_1: 'yo',
    iso639_2t: 'yor',
    iso639_2b: 'yor'
  },
  zha: {
    name: 'Chuang (Chuang)',
    iso639_1: 'za',
    iso639_2t: 'zha',
    iso639_2b: 'zha'
  },
  zul: {
    name: 'Zulu',
    iso639_1: 'zu',
    iso639_2t: 'zul',
    iso639_2b: 'zul'
  }
};

export const NLLB_LANGUAGES = new InjectionToken<NllbLanguageDict>('NLLB_LANGUAGES', {
  providedIn: 'root',
  factory: () => nllb
});
