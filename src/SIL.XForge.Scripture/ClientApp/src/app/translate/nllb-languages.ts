import { InjectionToken } from '@angular/core';

/**
 * NllbLanguage interface represents a language in Facebook's No Language Left Behind (NLLB) project.
 * The NLLB project has developed an AI model called NLLB-200, which is capable of translating
 * between 200 different languages, including low-resource languages.
 *
 * List of language codes can be found here:
 * - https://huggingface.co/facebook/nllb-200-3.3B/blob/main/README.md
 * - https://github.com/facebookresearch/flores/blob/main/flores200/README.md#languages-in-flores-200
 *
 * This interface uses ISO 639 language codes to uniquely identify each language.
 *
 * To update this file with new languages, refer to the following resources:
 * - List of ISO 639-1 codes: https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
 * - List of ISO 639-2 codes: https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes
 */
export interface NllbLanguage {
  /**
   * ISO language name.
   */
  name: string;

  /**
   * ISO 639-1: Two-letter codes, one per language for ISO 639 macrolanguage.
   */
  iso639_1: string | null;

  /**
   * ISO 639-2/T: Three-letter codes for the same languages as 639-1.
   */
  iso639_2t: string;

  /**
   * ISO 639-2/B: Three-letter codes, mostly the same as 639-2/T, but with some codes derived
   * from English names rather than native names of languages.
   */
  iso639_2b: string | null;
}

/**
 * Mapping of three-letter ISO 639-2/T code to other language props.
 */
export interface NllbLanguageDict {
  [iso639_2t: string]: NllbLanguage;
}

export const nllb: NllbLanguageDict = {
  ace: {
    name: 'Achinese',
    iso639_1: null,
    iso639_2t: 'ace',
    iso639_2b: null
  },
  acm: {
    name: 'Mesopotamian Arabic',
    iso639_1: null,
    iso639_2t: 'acm',
    iso639_2b: null
  },
  acq: {
    name: `Ta'izzi-Adeni Arabic`,
    iso639_1: null,
    iso639_2t: 'acq',
    iso639_2b: null
  },
  aeb: {
    name: 'Tunisian Arabic',
    iso639_1: null,
    iso639_2t: 'aeb',
    iso639_2b: null
  },
  afr: {
    name: 'Afrikaans',
    iso639_1: 'af',
    iso639_2t: 'afr',
    iso639_2b: 'afr'
  },
  ajp: {
    name: 'South Levantine Arabic',
    iso639_1: null,
    iso639_2t: 'ajp',
    iso639_2b: null
  },
  aka: {
    name: 'Akan',
    iso639_1: 'ak',
    iso639_2t: 'aka',
    iso639_2b: null
  },
  amh: {
    name: 'Amharic',
    iso639_1: 'am',
    iso639_2t: 'amh',
    iso639_2b: 'amh'
  },
  apc: {
    name: 'North Levantine Arabic',
    iso639_1: null,
    iso639_2t: 'apc',
    iso639_2b: null
  },
  arb: {
    name: 'Standard Arabic',
    iso639_1: 'ar',
    iso639_2t: 'arb',
    iso639_2b: 'ara'
  },
  ars: {
    name: 'Najdi Arabic',
    iso639_1: null,
    iso639_2t: 'ars',
    iso639_2b: null
  },
  ary: {
    name: 'Moroccan Arabic',
    iso639_1: null,
    iso639_2t: 'ary',
    iso639_2b: null
  },
  arz: {
    name: 'Egyptian Arabic',
    iso639_1: null,
    iso639_2t: 'arz',
    iso639_2b: null
  },
  asm: {
    name: 'Assamese',
    iso639_1: 'as',
    iso639_2t: 'asm',
    iso639_2b: 'asm'
  },
  ast: {
    name: 'Asturian',
    iso639_1: null,
    iso639_2t: 'ast',
    iso639_2b: null
  },
  awa: {
    name: 'Awadhi',
    iso639_1: null,
    iso639_2t: 'awa',
    iso639_2b: null
  },
  ayr: {
    name: 'Aymara',
    iso639_1: null,
    iso639_2t: 'ayr',
    iso639_2b: null
  },
  azb: {
    name: 'South Azerbaijani',
    iso639_1: null,
    iso639_2t: 'azb',
    iso639_2b: null
  },
  azj: {
    name: 'North Azerbaijani',
    iso639_1: null,
    iso639_2t: 'azj',
    iso639_2b: null
  },
  bak: {
    name: 'Bashkir',
    iso639_1: 'ba',
    iso639_2t: 'bak',
    iso639_2b: 'bak'
  },
  bam: {
    name: 'Bambara',
    iso639_1: 'bm',
    iso639_2t: 'bam',
    iso639_2b: 'bam'
  },
  ban: {
    name: 'Balinese',
    iso639_1: null,
    iso639_2t: 'ban',
    iso639_2b: null
  },
  bel: {
    name: 'Belarusian',
    iso639_1: 'be',
    iso639_2t: 'bel',
    iso639_2b: 'bel'
  },
  bem: {
    name: 'Bemba',
    iso639_1: null,
    iso639_2t: 'bem',
    iso639_2b: null
  },
  ben: {
    name: 'Bengali',
    iso639_1: 'bn',
    iso639_2t: 'ben',
    iso639_2b: 'ben'
  },
  bho: {
    name: 'Bhojpuri',
    iso639_1: null,
    iso639_2t: 'bho',
    iso639_2b: null
  },
  bjn: {
    name: 'Banjar',
    iso639_1: null,
    iso639_2t: 'bjn',
    iso639_2b: null
  },
  bod: {
    name: 'Tibetan',
    iso639_1: 'bo',
    iso639_2t: 'bod',
    iso639_2b: 'tib'
  },
  bos: {
    name: 'Bosnian',
    iso639_1: 'bs',
    iso639_2t: 'bos',
    iso639_2b: 'bos'
  },
  bug: {
    name: 'Buginese',
    iso639_1: null,
    iso639_2t: 'bug',
    iso639_2b: null
  },
  bul: {
    name: 'Bulgarian',
    iso639_1: 'bg',
    iso639_2t: 'bul',
    iso639_2b: 'bul'
  },
  cat: {
    name: 'Catalan',
    iso639_1: 'ca',
    iso639_2t: 'cat',
    iso639_2b: 'cat'
  },
  ceb: {
    name: 'Cebuano',
    iso639_1: null,
    iso639_2t: 'ceb',
    iso639_2b: null
  },
  ces: {
    name: 'Czech',
    iso639_1: 'cs',
    iso639_2t: 'ces',
    iso639_2b: 'cze'
  },
  cjk: {
    name: 'Chokwe',
    iso639_1: null,
    iso639_2t: 'cjk',
    iso639_2b: null
  },
  ckb: {
    name: 'Central Kurdish',
    iso639_1: null,
    iso639_2t: 'ckb',
    iso639_2b: null
  },
  crh: {
    name: 'Crimean Turkish',
    iso639_1: null,
    iso639_2t: 'crh',
    iso639_2b: null
  },
  cym: {
    name: 'Welsh',
    iso639_1: 'cy',
    iso639_2t: 'cym',
    iso639_2b: 'wel'
  },
  dan: {
    name: 'Danish',
    iso639_1: 'da',
    iso639_2t: 'dan',
    iso639_2b: 'dan'
  },
  deu: {
    name: 'German',
    iso639_1: 'de',
    iso639_2t: 'deu',
    iso639_2b: 'ger'
  },
  dik: {
    name: 'Dinka',
    iso639_1: null,
    iso639_2t: 'dik',
    iso639_2b: null
  },
  dyu: {
    name: 'Dyula',
    iso639_1: null,
    iso639_2t: 'dyu',
    iso639_2b: null
  },
  dzo: {
    name: 'Dzongkha',
    iso639_1: 'dz',
    iso639_2t: 'dzo',
    iso639_2b: 'dzo'
  },
  ell: {
    name: 'Greek',
    iso639_1: 'el',
    iso639_2t: 'ell',
    iso639_2b: 'gre'
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
  eus: {
    name: 'Basque',
    iso639_1: 'eu',
    iso639_2t: 'eus',
    iso639_2b: 'baq'
  },
  ewe: {
    name: 'Ewe',
    iso639_1: 'ee',
    iso639_2t: 'ewe',
    iso639_2b: 'ewe'
  },
  fao: {
    name: 'Faroese',
    iso639_1: 'fo',
    iso639_2t: 'fao',
    iso639_2b: 'fao'
  },
  fij: {
    name: 'Fijian',
    iso639_1: 'fj',
    iso639_2t: 'fij',
    iso639_2b: 'fij'
  },
  fin: {
    name: 'Finnish',
    iso639_1: 'fi',
    iso639_2t: 'fin',
    iso639_2b: 'fin'
  },
  fon: {
    name: 'Fon',
    iso639_1: null,
    iso639_2t: 'fon',
    iso639_2b: null
  },
  fra: {
    name: 'French',
    iso639_1: 'fr',
    iso639_2t: 'fra',
    iso639_2b: 'fre'
  },
  fur: {
    name: 'Friulian',
    iso639_1: null,
    iso639_2t: 'fur',
    iso639_2b: null
  },
  fuv: {
    name: 'Nigerian Fulfulde',
    iso639_1: null,
    iso639_2t: 'fuv',
    iso639_2b: null
  },
  gla: {
    name: 'Scottish Gaelic',
    iso639_1: 'gd',
    iso639_2t: 'gla',
    iso639_2b: 'gla'
  },
  gle: {
    name: 'Irish',
    iso639_1: 'ga',
    iso639_2t: 'gle',
    iso639_2b: 'gle'
  },
  glg: {
    name: 'Galician',
    iso639_1: 'gl',
    iso639_2t: 'glg',
    iso639_2b: 'glg'
  },
  grn: {
    name: 'Guarani',
    iso639_1: 'gn',
    iso639_2t: 'grn',
    iso639_2b: 'grn'
  },
  guj: {
    name: 'Gujarati',
    iso639_1: 'gu',
    iso639_2t: 'guj',
    iso639_2b: 'guj'
  },
  hat: {
    name: 'Haitian Creole',
    iso639_1: null,
    iso639_2t: 'hat',
    iso639_2b: null
  },
  hau: {
    name: 'Hausa',
    iso639_1: 'ha',
    iso639_2t: 'hau',
    iso639_2b: 'hau'
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
  hne: {
    name: 'Chhattisgarhi',
    iso639_1: null,
    iso639_2t: 'hne',
    iso639_2b: null
  },
  hrv: {
    name: 'Croatian',
    iso639_1: 'hr',
    iso639_2t: 'hrv',
    iso639_2b: 'hrv'
  },
  hun: {
    name: 'Hungarian',
    iso639_1: 'hu',
    iso639_2t: 'hun',
    iso639_2b: 'hun'
  },
  hye: {
    name: 'Armenian',
    iso639_1: 'hy',
    iso639_2t: 'hye',
    iso639_2b: 'arm'
  },
  ibo: {
    name: 'Igbo',
    iso639_1: 'ig',
    iso639_2t: 'ibo',
    iso639_2b: 'ibo'
  },
  ilo: {
    name: 'Iloko',
    iso639_1: null,
    iso639_2t: 'ilo',
    iso639_2b: null
  },
  ind: {
    name: 'Indonesian',
    iso639_1: 'id',
    iso639_2t: 'ind',
    iso639_2b: 'ind'
  },
  isl: {
    name: 'Icelandic',
    iso639_1: 'is',
    iso639_2t: 'isl',
    iso639_2b: 'ice'
  },
  ita: {
    name: 'Italian',
    iso639_1: 'it',
    iso639_2t: 'ita',
    iso639_2b: 'ita'
  },
  jav: {
    name: 'Javanese',
    iso639_1: 'jv',
    iso639_2t: 'jav',
    iso639_2b: 'jav'
  },
  jpn: {
    name: 'Japanese',
    iso639_1: 'ja',
    iso639_2t: 'jpn',
    iso639_2b: 'jpn'
  },
  kab: {
    name: 'Kabyle',
    iso639_1: null,
    iso639_2t: 'kab',
    iso639_2b: null
  },
  kac: {
    name: 'Kachin',
    iso639_1: null,
    iso639_2t: 'kac',
    iso639_2b: null
  },
  kam: {
    name: 'Kamba',
    iso639_1: null,
    iso639_2t: 'kam',
    iso639_2b: null
  },
  kan: {
    name: 'Kannada',
    iso639_1: 'kn',
    iso639_2t: 'kan',
    iso639_2b: 'kan'
  },
  kas: {
    name: 'Kashmiri',
    iso639_1: 'ks',
    iso639_2t: 'kas',
    iso639_2b: 'kas'
  },
  kat: {
    name: 'Georgian',
    iso639_1: 'ka',
    iso639_2t: 'kat',
    iso639_2b: 'geo'
  },
  knc: {
    name: 'Central Kanuri',
    iso639_1: null,
    iso639_2t: 'knc',
    iso639_2b: null
  },
  kaz: {
    name: 'Kazakh',
    iso639_1: 'kk',
    iso639_2t: 'kaz',
    iso639_2b: 'kaz'
  },
  kbp: {
    name: 'Kabiye',
    iso639_1: null,
    iso639_2t: 'kbp',
    iso639_2b: null
  },
  kea: {
    name: 'Kabuverdianu',
    iso639_1: null,
    iso639_2t: 'kea',
    iso639_2b: null
  },
  khm: {
    name: 'Khmer',
    iso639_1: 'km',
    iso639_2t: 'khm',
    iso639_2b: 'khm'
  },
  kik: {
    name: 'Kikuyu',
    iso639_1: 'ki',
    iso639_2t: 'kik',
    iso639_2b: 'kik'
  },
  kin: {
    name: 'Kinyarwanda',
    iso639_1: 'rw',
    iso639_2t: 'kin',
    iso639_2b: 'kin'
  },
  kir: {
    name: 'Kyrgyz',
    iso639_1: 'ky',
    iso639_2t: 'kir',
    iso639_2b: 'kir'
  },
  kmb: {
    name: 'Kimbundu',
    iso639_1: null,
    iso639_2t: 'kmb',
    iso639_2b: null
  },
  kmr: {
    name: 'Northern Kurdish',
    iso639_1: null,
    iso639_2t: 'kmr',
    iso639_2b: null
  },
  kon: {
    name: 'Kongo',
    iso639_1: 'kg',
    iso639_2t: 'kon',
    iso639_2b: 'kon'
  },
  kor: {
    name: 'Korean',
    iso639_1: 'ko',
    iso639_2t: 'kor',
    iso639_2b: 'kor'
  },
  lao: {
    name: 'Lao',
    iso639_1: 'lo',
    iso639_2t: 'lao',
    iso639_2b: 'lao'
  },
  lij: {
    name: 'Ligurian',
    iso639_1: null,
    iso639_2t: 'lij',
    iso639_2b: null
  },
  lim: {
    name: 'Limburgish',
    iso639_1: 'li',
    iso639_2t: 'lim',
    iso639_2b: 'lim'
  },
  lin: {
    name: 'Lingala',
    iso639_1: 'ln',
    iso639_2t: 'lin',
    iso639_2b: 'lin'
  },
  lit: {
    name: 'Lithuanian',
    iso639_1: 'lt',
    iso639_2t: 'lit',
    iso639_2b: 'lit'
  },
  lmo: {
    name: 'Lombard',
    iso639_1: null,
    iso639_2t: 'lmo',
    iso639_2b: null
  },
  ltg: {
    name: 'Latgalian',
    iso639_1: null,
    iso639_2t: 'ltg',
    iso639_2b: null
  },
  ltz: {
    name: 'Luxembourgish',
    iso639_1: 'lb',
    iso639_2t: 'ltz',
    iso639_2b: 'ltz'
  },
  lua: {
    name: 'Luba-Lulua',
    iso639_1: null,
    iso639_2t: 'lua',
    iso639_2b: null
  },
  lug: {
    name: 'Luganda',
    iso639_1: 'lg',
    iso639_2t: 'lug',
    iso639_2b: 'lug'
  },
  luo: {
    name: 'Luo',
    iso639_1: null,
    iso639_2t: 'luo',
    iso639_2b: 'luo'
  },
  lus: {
    name: 'Lushai',
    iso639_1: null,
    iso639_2t: 'lus',
    iso639_2b: 'lus'
  },
  lvs: {
    name: 'Latvian',
    iso639_1: 'lv',
    iso639_2t: 'lvs',
    iso639_2b: 'lav'
  },
  mag: {
    name: 'Magahi',
    iso639_1: null,
    iso639_2t: 'mag',
    iso639_2b: 'mag'
  },
  mai: {
    name: 'Maithili',
    iso639_1: null,
    iso639_2t: 'mai',
    iso639_2b: 'mai'
  },
  mal: {
    name: 'Malayalam',
    iso639_1: 'ml',
    iso639_2t: 'mal',
    iso639_2b: 'mal'
  },
  mar: {
    name: 'Marathi',
    iso639_1: 'mr',
    iso639_2t: 'mar',
    iso639_2b: 'mar'
  },
  min: {
    name: 'Minangkabau',
    iso639_1: null,
    iso639_2t: 'min',
    iso639_2b: 'min'
  },
  mkd: {
    name: 'Macedonian',
    iso639_1: 'mk',
    iso639_2t: 'mkd',
    iso639_2b: 'mac'
  },
  plt: {
    name: 'Plateau Malagasy',
    iso639_1: null,
    iso639_2t: 'plt',
    iso639_2b: 'plt'
  },
  mlt: {
    name: 'Maltese',
    iso639_1: 'mt',
    iso639_2t: 'mlt',
    iso639_2b: 'mlt'
  },
  mni: {
    name: 'Manipuri',
    iso639_1: null,
    iso639_2t: 'mni',
    iso639_2b: 'mni'
  },
  khk: {
    name: 'Halh Mongolian',
    iso639_1: null,
    iso639_2t: 'khk',
    iso639_2b: 'khk'
  },
  mos: {
    name: 'Mossi',
    iso639_1: null,
    iso639_2t: 'mos',
    iso639_2b: 'mos'
  },
  mri: {
    name: 'Maori',
    iso639_1: 'mi',
    iso639_2t: 'mri',
    iso639_2b: 'mao'
  },
  mya: {
    name: 'Burmese',
    iso639_1: 'my',
    iso639_2t: 'mya',
    iso639_2b: 'bur'
  },
  nld: {
    name: 'Dutch',
    iso639_1: 'nl',
    iso639_2t: 'nld',
    iso639_2b: 'dut'
  },
  nno: {
    name: 'Norwegian Nynorsk',
    iso639_1: 'nn',
    iso639_2t: 'nno',
    iso639_2b: 'nno'
  },
  nob: {
    name: 'Norwegian Bokmål',
    iso639_1: 'nb',
    iso639_2t: 'nob',
    iso639_2b: 'nob'
  },
  npi: {
    name: 'Nepali',
    iso639_1: null,
    iso639_2t: 'npi',
    iso639_2b: 'npi'
  },
  nso: {
    name: 'Northern Sotho',
    iso639_1: null,
    iso639_2t: 'nso',
    iso639_2b: 'nso'
  },
  nus: {
    name: 'Nuer',
    iso639_1: null,
    iso639_2t: 'nus',
    iso639_2b: 'nus'
  },
  nya: {
    name: 'Chichewa',
    iso639_1: 'ny',
    iso639_2t: 'nya',
    iso639_2b: 'nya'
  },
  oci: {
    name: 'Occitan',
    iso639_1: 'oc',
    iso639_2t: 'oci',
    iso639_2b: 'oci'
  },
  gaz: {
    name: 'West Central Oromo',
    iso639_1: null,
    iso639_2t: 'gaz',
    iso639_2b: 'gaz'
  },
  ory: {
    name: 'Odia',
    iso639_1: null,
    iso639_2t: 'ory',
    iso639_2b: 'ory'
  },
  pag: {
    name: 'Pangasinan',
    iso639_1: null,
    iso639_2t: 'pag',
    iso639_2b: 'pag'
  },
  pan: {
    name: 'Punjabi',
    iso639_1: 'pa',
    iso639_2t: 'pan',
    iso639_2b: 'pan'
  },
  pap: {
    name: 'Papiamento',
    iso639_1: null,
    iso639_2t: 'pap',
    iso639_2b: 'pap'
  },
  pes: {
    name: 'Persian',
    iso639_1: 'fa',
    iso639_2t: 'pes',
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
  prs: {
    name: 'Dari',
    iso639_1: null,
    iso639_2t: 'prs',
    iso639_2b: 'prs'
  },
  pbt: {
    name: 'Southern Pashto',
    iso639_1: null,
    iso639_2t: 'pbt',
    iso639_2b: 'pbt'
  },
  quy: {
    name: 'Quechua',
    iso639_1: null,
    iso639_2t: 'quy',
    iso639_2b: 'quy'
  },
  ron: {
    name: 'Romanian',
    iso639_1: 'ro',
    iso639_2t: 'ron',
    iso639_2b: 'rum'
  },
  run: {
    name: 'Rundi',
    iso639_1: 'rn',
    iso639_2t: 'run',
    iso639_2b: 'run'
  },
  rus: {
    name: 'Russian',
    iso639_1: 'ru',
    iso639_2t: 'rus',
    iso639_2b: 'rus'
  },
  sag: {
    name: 'Sango',
    iso639_1: 'sg',
    iso639_2t: 'sag',
    iso639_2b: 'sag'
  },
  san: {
    name: 'Sanskrit',
    iso639_1: 'sa',
    iso639_2t: 'san',
    iso639_2b: 'san'
  },
  sat: {
    name: 'Santali',
    iso639_1: null,
    iso639_2t: 'sat',
    iso639_2b: 'sat'
  },
  scn: {
    name: 'Sicilian',
    iso639_1: null,
    iso639_2t: 'scn',
    iso639_2b: 'scn'
  },
  shn: {
    name: 'Shan',
    iso639_1: null,
    iso639_2t: 'shn',
    iso639_2b: 'shn'
  },
  sin: {
    name: 'Sinhala',
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
  smo: {
    name: 'Samoan',
    iso639_1: 'sm',
    iso639_2t: 'smo',
    iso639_2b: 'smo'
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
  som: {
    name: 'Somali',
    iso639_1: 'so',
    iso639_2t: 'som',
    iso639_2b: 'som'
  },
  sot: {
    name: 'Sotho, Southern',
    iso639_1: 'st',
    iso639_2t: 'sot',
    iso639_2b: 'sot'
  },
  spa: {
    name: 'Spanish',
    iso639_1: 'es',
    iso639_2t: 'spa',
    iso639_2b: 'spa'
  },
  als: {
    name: 'Tosk Albanian',
    iso639_1: 'sq',
    iso639_2t: 'als',
    iso639_2b: 'als'
  },
  srd: {
    name: 'Sardinian',
    iso639_1: 'sc',
    iso639_2t: 'srd',
    iso639_2b: 'srd'
  },
  srp: {
    name: 'Serbian',
    iso639_1: 'sr',
    iso639_2t: 'srp',
    iso639_2b: 'srp'
  },
  ssw: {
    name: 'Swazi',
    iso639_1: 'ss',
    iso639_2t: 'ssw',
    iso639_2b: 'ssw'
  },
  sun: {
    name: 'Sundanese',
    iso639_1: 'su',
    iso639_2t: 'sun',
    iso639_2b: 'sun'
  },
  swe: {
    name: 'Swedish',
    iso639_1: 'sv',
    iso639_2t: 'swe',
    iso639_2b: 'swe'
  },
  swh: {
    name: 'Swahili',
    iso639_1: 'sw',
    iso639_2t: 'swh',
    iso639_2b: 'swh'
  },
  szl: {
    name: 'Silesian',
    iso639_1: 'szl',
    iso639_2t: 'szl',
    iso639_2b: 'szl'
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
  tgk: {
    name: 'Tajik',
    iso639_1: 'tg',
    iso639_2t: 'tgk',
    iso639_2b: 'tgk'
  },
  tgl: {
    name: 'Tagalog',
    iso639_1: 'tl',
    iso639_2t: 'tgl',
    iso639_2b: 'tgl'
  },
  tha: {
    name: 'Thai',
    iso639_1: 'th',
    iso639_2t: 'tha',
    iso639_2b: 'tha'
  },
  tir: {
    name: 'Tigrinya',
    iso639_1: 'ti',
    iso639_2t: 'tir',
    iso639_2b: 'tir'
  },
  taq: {
    name: 'Tamashek',
    iso639_1: 'tmh',
    iso639_2t: 'taq',
    iso639_2b: 'taq'
  },
  tpi: {
    name: 'Tok Pisin',
    iso639_1: 'tpi',
    iso639_2t: 'tpi',
    iso639_2b: 'tpi'
  },
  tsn: {
    name: 'Tswana',
    iso639_1: 'tn',
    iso639_2t: 'tsn',
    iso639_2b: 'tsn'
  },
  tso: {
    name: 'Tsonga',
    iso639_1: 'ts',
    iso639_2t: 'tso',
    iso639_2b: 'tso'
  },
  tuk: {
    name: 'Turkmen',
    iso639_1: 'tk',
    iso639_2t: 'tuk',
    iso639_2b: 'tuk'
  },
  tum: {
    name: 'Tumbuka',
    iso639_1: 'tum',
    iso639_2t: 'tum',
    iso639_2b: 'tum'
  },
  tur: {
    name: 'Turkish',
    iso639_1: 'tr',
    iso639_2t: 'tur',
    iso639_2b: 'tur'
  },
  twi: {
    name: 'Twi',
    iso639_1: 'tw',
    iso639_2t: 'twi',
    iso639_2b: 'twi'
  },
  tzm: {
    name: 'Tamazight',
    iso639_1: 'tzm',
    iso639_2t: 'tzm',
    iso639_2b: 'tzm'
  },
  uig: {
    name: 'Uighur',
    iso639_1: 'ug',
    iso639_2t: 'uig',
    iso639_2b: 'uig'
  },
  ukr: {
    name: 'Ukrainian',
    iso639_1: 'uk',
    iso639_2t: 'ukr',
    iso639_2b: 'ukr'
  },
  umb: {
    name: 'Umbundu',
    iso639_1: 'umb',
    iso639_2t: 'umb',
    iso639_2b: 'umb'
  },
  urd: {
    name: 'Urdu',
    iso639_1: 'ur',
    iso639_2t: 'urd',
    iso639_2b: 'urd'
  },
  uzn: {
    name: 'Uzbek',
    iso639_1: 'uz',
    iso639_2t: 'uzn',
    iso639_2b: 'uzn'
  },
  vec: {
    name: 'Venetian',
    iso639_1: 'vec',
    iso639_2t: 'vec',
    iso639_2b: 'vec'
  },
  vie: {
    name: 'Vietnamese',
    iso639_1: 'vi',
    iso639_2t: 'vie',
    iso639_2b: 'vie'
  },
  war: {
    name: 'Waray',
    iso639_1: 'war',
    iso639_2t: 'war',
    iso639_2b: 'war'
  },
  wol: {
    name: 'Wolof',
    iso639_1: 'wo',
    iso639_2t: 'wol',
    iso639_2b: 'wol'
  },
  xho: {
    name: 'Xhosa',
    iso639_1: 'xh',
    iso639_2t: 'xho',
    iso639_2b: 'xho'
  },
  ydd: {
    name: 'Yiddish',
    iso639_1: 'yi',
    iso639_2t: 'ydd',
    iso639_2b: 'yid'
  },
  yor: {
    name: 'Yoruba',
    iso639_1: 'yo',
    iso639_2t: 'yor',
    iso639_2b: 'yor'
  },
  yue: {
    name: 'Cantonese',
    iso639_1: 'zh',
    iso639_2t: 'yue',
    iso639_2b: 'yue'
  },
  zho: {
    name: 'Chinese',
    iso639_1: 'zh',
    iso639_2t: 'zho',
    iso639_2b: 'chi'
  },
  zsm: {
    name: 'Malay',
    iso639_1: 'ms',
    iso639_2t: 'zsm',
    iso639_2b: 'zsm'
  },
  zul: {
    name: 'Zulu',
    iso639_1: 'zu',
    iso639_2t: 'zul',
    iso639_2b: 'zul'
  }
};

/**
 * No Language Left Behind (NLLB) language set.
 */
export const NLLB_LANGUAGES = new InjectionToken<NllbLanguageDict>('NLLB_LANGUAGES', {
  providedIn: 'root',
  factory: () => nllb
});
