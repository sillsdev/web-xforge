import type { Meta, StoryObj } from '@storybook/angular';
import FONT_FACE_DEFINITIONS from '../../../fonts.json';
import { FontService } from './font.service';

// Example text, only included for frequently used non-Latin fonts
const EXAMPLE_TEXT = {
  'Awami Nastaliq':
    'اقوام متحدہ نے ہر کہیں دے حقوق دی حفاظت تے ودھارے دا جھنڈا اچار کھڻ دا ارادہ کیتا ہوے۔ ایہو ڄئے و حشیانہ کماں دی صورت وچ ظاہر تھئی ہے  ',
  'Annapurna SIL':
    '१० दिसम्बर १९४८ को यूनाइटेड नेशन्स की जनरल असेम्बली ने मानव अधिकारों की सार्वभौम घोषणा को स्वीकृत और घोषित किया । इसका पूर्ण पाठ आगे के पृष्ठों में दिया गया है । इस ऐतिहासिक कार्य के बाद ही असेम्बली ने सभी सदस्य देशों से अपील की कि वे इस घोषणा का प्रचार करें और देशों अथवा प्रदेशों की राजनैतिक स्थिति पर आधारित भेदभाव का विचार किए बिना, विशेषतः स्कूलों और अन्य शिक्षा संस्थाओं में इसके प्रचार, प्रदर्शन, पठन और व्याख्या का प्रबन्ध करें ।',
  Lateef:
    'شِیلِلیکده، ابراهیمدان داوودا چِنلی بوُلان نِسیلِّر جِمی اوُن دؤرت آرقادئر. داووددان بابئل سوٚرگوٚنینه چِنلی هِم اوُن دؤرت، بابئل سوٚرگوٚنیندِن مِسیحه چِنلی هِم اوُن دؤرت آرقادئر. ۝٢٣ رامادان بیر سِس اِشیدیلدی،  '
};

// This set of stories is no testing a component, but is intended to show what fonts are available, demonstrate that
// they all are able to load, demonstrate differences between browsers, and differences between fonts (e.g. line height)
const meta: Meta = {
  title: 'Fonts',
  render: ({ text }) => {
    const fontService = new FontService(document);
    const elements = Object.keys(FONT_FACE_DEFINITIONS).map(
      font =>
        `<span>${font}</span><span style="font-family: '${fontService.getFontFamilyFromProject({ defaultFont: font })}'">${EXAMPLE_TEXT[font] ?? text}</span>`
    );
    return {
      template: `<div style="display: grid; grid-template-columns: auto 1fr; gap: 4px;">${elements.join('\n')}</div>`
    };
  }
};
export default meta;

type Story = StoryObj;

export const AllFonts: Story = {
  args: { text: 'This is example text.' }
};
