using System;
using System.Xml;
using System.Xml.Linq;
using NUnit.Framework;

namespace SIL.Converters.Usj.Tests;

[TestFixture]
public class UsjToUsxTests
{
    [Test]
    public void ShouldConvertFromEmptyUsjToUsx()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjEmpty);
        Assert.That(usx, Is.EqualTo(TestData.UsxEmpty));
    }

    [Test]
    public void ShouldConvertFromEmptyUsjToUsx_Roundtrip()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjEmpty);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjEmpty).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsx()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsjToUsx_Roundtrip()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxXDocument()
    {
        // Setup
        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1);
        expected = TestData.RemoveEidElements(expected);
        XDocument expectedUsx = XDocument.Parse(expected, LoadOptions.PreserveWhitespace);

        // SUT
        XDocument actualUsx = UsjToUsx.UsjToUsxXDocument(TestData.UsjGen1V1);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxXDocumentWithNullContent()
    {
        // Setup
        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxEmpty);
        expected = TestData.RemoveEidElements(expected);
        XDocument expectedUsx = XDocument.Parse(expected, LoadOptions.PreserveWhitespace);
        Usj usj = new Usj
        {
            Type = Usj.UsjType,
            Version = Usj.UsjVersion,
            Content = null,
        };

        // SUT
        XDocument actualUsx = UsjToUsx.UsjToUsxXDocument(usj);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxXDocument_Roundtrip()
    {
        XDocument usx = UsjToUsx.UsjToUsxXDocument(TestData.UsjGen1V1);
        Usj usj = UsxToUsj.UsxXDocumentToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxXmlDocument()
    {
        // Setup
        var expectedUsx = new XmlDocument { PreserveWhitespace = true };
        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1);
        expected = TestData.RemoveEidElements(expected);
        expectedUsx.LoadXml(expected);

        // SUT
        XmlDocument actualUsx = UsjToUsx.UsjToUsxXmlDocument(TestData.UsjGen1V1);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxXmlDocumentWithNullContent()
    {
        // Setup
        var expectedUsx = new XmlDocument { PreserveWhitespace = true };
        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxEmpty);
        expected = TestData.RemoveEidElements(expected);
        expectedUsx.LoadXml(expected);
        Usj usj = new Usj
        {
            Type = Usj.UsjType,
            Version = Usj.UsjVersion,
            Content = null,
        };

        // SUT
        XmlDocument actualUsx = UsjToUsx.UsjToUsxXmlDocument(usj);
        Assert.That(actualUsx, Is.EqualTo(expectedUsx).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxXmlDocument_Roundtrip()
    {
        XmlDocument usx = UsjToUsx.UsjToUsxXmlDocument(TestData.UsjGen1V1);
        Usj usj = UsxToUsj.UsxXmlDocumentToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithBlankChapters()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1WithBlankChapters);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithBlankChapters);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithBlankChapters_Roundtrip()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1WithBlankChapters);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithBlankChapters).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithBlankVerses()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1WithBlankVerses);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithBlankVerses);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithBlankVerses_Roundtrip()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1WithBlankVerses);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithBlankVerses).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjWithImpliedParagraphsToUsx()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1ImpliedPara);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1ImpliedPara);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsjWithImpliedParagraphsToUsx_Roundtrip()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1ImpliedPara);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1ImpliedPara).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjWithNonStandardFeaturesToUsx()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1Nonstandard);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1Nonstandard);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsjWithNonStandardFeaturesToUsx_Roundtrip()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1Nonstandard);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1Nonstandard).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithNoSids()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1WithNoSids);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithNoSids)));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithNoSids_Roundtrip()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1WithNoSids);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithNoSids).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithSpecialWhiteSpace()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1Whitespace);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1Whitespace);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithSpecialWhiteSpace_Roundtrip()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1Whitespace);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1Whitespace).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithTable()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1WithTable);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithTable);
        expected = TestData.RemoveEidElements(expected);
        Assert.That(usx, Is.EqualTo(expected));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxWithTable_Roundtrip()
    {
        string usx = UsjToUsx.UsjToUsxString(TestData.UsjGen1V1WithTable);
        Usj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithTable).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldNotAllowInvalidContent_String() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => UsjToUsx.UsjToUsxString(new Usj { Content = [new Usj()] }));

    [Test]
    public void ShouldNotAllowInvalidContent_XDocument() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => UsjToUsx.UsjToUsxXDocument(new Usj { Content = [new Usj()] }));

    [Test]
    public void ShouldNotAllowInvalidContent_XmlDocument() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => UsjToUsx.UsjToUsxXDocument(new Usj { Content = [new Usj()] }));
}
