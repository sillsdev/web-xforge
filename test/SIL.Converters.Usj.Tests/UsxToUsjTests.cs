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
    public void ShouldConvertFromNullToUsj()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(null);
        Assert.That(usj, Is.EqualTo(TestData.UsjEmpty).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromNullXmlDocumentToUsj()
    {
        Usj usj = UsxToUsj.UsxXmlDocumentToUsj(null);
        Assert.That(usj, Is.EqualTo(TestData.UsjEmpty).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsj()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjAndRemoveSpecificAttributes()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithAttributesToRemove);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithImpliedParagraphs()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1ImpliedPara);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1ImpliedPara).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithSpecialWhiteSpace()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1Whitespace);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1Whitespace).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithNonStandardFeatures()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1Nonstandard);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1Nonstandard).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithTable()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1WithTable);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1WithTable).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromXmlDocumentToUsj()
    {
        XmlDocument document = new XmlDocument { PreserveWhitespace = true };
        document.LoadXml(TestData.UsxGen1V1);
        Usj usj = UsxToUsj.UsxXmlDocumentToUsj(document);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }
}
