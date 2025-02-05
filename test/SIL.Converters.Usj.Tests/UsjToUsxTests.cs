using System;
using System.Xml;
using NUnit.Framework;

namespace SIL.Converters.Usj.Tests;

[TestFixture]
public class UsjToUsxTests
{
    [Test]
    public void ShouldConvertFromEmptyUsjToUsx()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjEmpty);
        Assert.That(usx, Is.EqualTo(TestData.UsxEmpty));
    }

    [Test]
    public void ShouldConvertFromEmptyUsjToUsx_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjEmpty);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjEmpty).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsx()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1)));
    }

    [Test]
    public void ShouldConvertFromUsjToUsx_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxXmlDocument()
    {
        // Setup
        var expectedUsx = new XmlDocument { PreserveWhitespace = true };
        expectedUsx.LoadXml(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1));

        // SUT
        var usjToUsx = new UsjToUsx();
        XmlDocument usx = usjToUsx.UsjToUsxXmlDocument(TestData.UsjGen1V1);
        Assert.That(usx, Is.EqualTo(expectedUsx));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxXmlDocument_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        XmlDocument usx = usjToUsx.UsjToUsxXmlDocument(TestData.UsjGen1V1);
        Usj usj = UsxToUsj.UsxXmlDocumentToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithBlankChapters()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1WithBlankChapters);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithBlankChapters)));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithBlankChapters_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1WithBlankChapters);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithBlankChapters).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithBlankVerses()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1WithBlankVerses);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithBlankVerses)));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithBlankVerses_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1WithBlankVerses);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithBlankVerses).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjWithImpliedParagraphsToUsx()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1ImpliedPara);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1ImpliedPara)));
    }

    [Test]
    public void ShouldConvertFromUsjWithImpliedParagraphsToUsx_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1ImpliedPara);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1ImpliedPara).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjWithNonStandardFeaturesToUsx()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1Nonstandard);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1Nonstandard)));
    }

    [Test]
    public void ShouldConvertFromUsjWithNonStandardFeaturesToUsx_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1Nonstandard);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1Nonstandard).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithNoSids()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1WithNoSids);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithNoSids)));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithNoSids_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1WithNoSids);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithNoSids).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithSpecialWhiteSpace()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1Whitespace);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1Whitespace)));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithSpecialWhiteSpace_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1Whitespace);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1Whitespace).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithTable()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1WithTable);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithTable)));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithTable_Roundtrip()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1WithTable);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithTable).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldNotAllowInvalidContent()
    {
        var usjToUsx = new UsjToUsx();
        Assert.Throws<ArgumentOutOfRangeException>(() => usjToUsx.UsjToUsxString(new Usj { Content = [new Usj()] }));
    }
}
