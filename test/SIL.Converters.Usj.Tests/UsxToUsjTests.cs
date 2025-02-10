using System;
using System.Xml;
using NUnit.Framework;

namespace SIL.Converters.Usj.Tests;

[TestFixture]
public class UsxToUsjTests
{
    [Test]
    public void ShouldConvertFromEmptyUsxToUsj()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxEmpty);
        Assert.That(usj, Is.EqualTo(TestData.UsjEmpty).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromEmptyUsxToUsj_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxEmpty);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxEmpty)));
    }

    [Test]
    public void ShouldConvertFromNullToUsj()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(null);
        Assert.That(usj, Is.EqualTo(TestData.UsjEmpty).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsj()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsj_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsxToUsjAndRemoveSpecificAttributes()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithAttributesToRemove);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjAndRemoveSpecificAttributes_Roundtrip()
    {
        // NOTE: We do not compare with the original, as invalid attributes are removed
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithAttributesToRemove);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithBlankChapters()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithBlankChapters);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithBlankChapters).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithBlankChapters_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithBlankChapters);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithBlankChapters);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithBlankVerses()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithBlankVerses);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithBlankVerses).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithBlankVerses_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithBlankVerses);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithBlankVerses);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithImpliedParagraphs()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1ImpliedPara);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1ImpliedPara).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithImpliedParagraphs_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1ImpliedPara);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1ImpliedPara);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithSpecialWhiteSpace()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1Whitespace);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1Whitespace).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithSpecialWhiteSpace_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1Whitespace);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1Whitespace);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithNonStandardFeatures()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1Nonstandard);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1Nonstandard).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithNonStandardFeatures_RoundTrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1Nonstandard);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1Nonstandard);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithNoSids()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithNoSids);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithNoSids).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithNoSids_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithNoSids);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithNoSids)));
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithPoeticFormatting_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxMrk1V1WithPoeticFormatting);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxMrk1V1WithPoeticFormatting);
        expected = TestData.RemoveVidAttributes(expected);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithTable()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithTable);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithTable).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithTable_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithTable);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithTable);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromXmlDocumentToUsj()
    {
        XmlDocument document = new XmlDocument { PreserveWhitespace = true };
        document.LoadXml(TestData.UsxGen1V1);
        Usj usj = UsxToUsj.UsxXmlDocumentToUsj(document);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromXmlDocumentToUsj_Roundtrip()
    {
        XmlDocument document = new XmlDocument { PreserveWhitespace = true };
        string usx = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1);
        usx = TestData.RemoveEidElements(usx);
        document.LoadXml(usx);
        Usj usj = UsxToUsj.UsxXmlDocumentToUsj(document);

        XmlDocument actualUsx = UsjToUsx.UsjToUsxXmlDocument(usj);
        Assert.That(actualUsx, Is.EqualTo(document).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldNotConvertFromNullXmlDocumentToUsj() =>
        Assert.Throws<ArgumentException>(() => UsxToUsj.UsxXmlDocumentToUsj(null));

    [Test]
    public void ShouldNotConvertFromNonPreserveWhitespaceXmlDocumentToUsj() =>
        Assert.Throws<ArgumentException>(() => UsxToUsj.UsxXmlDocumentToUsj(new XmlDocument()));
}
