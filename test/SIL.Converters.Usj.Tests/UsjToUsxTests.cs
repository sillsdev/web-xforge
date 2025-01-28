using System;
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
    public void ShouldConvertFromUsjToUsx()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1)));
    }

    [Test]
    public void ShouldConvertFromUsjToUsxAndBack()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1);
        IUsj usj = UsxToUsj.UsxStringToUsj(usx);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
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
    public void ShouldConvertFromUsjWithNonStandardFeaturesToUsx()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1Nonstandard);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1Nonstandard)));
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
    public void ShouldConvertFromUsjToUsxWithTable()
    {
        var usjToUsx = new UsjToUsx();
        string usx = usjToUsx.UsjToUsxString(TestData.UsjGen1V1WithTable);
        usx = TestData.RemoveXmlWhiteSpace(usx);
        Assert.That(usx, Is.EqualTo(TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1WithTable)));
    }

    [Test]
    public void ShouldNotAllowInvalidContent()
    {
        var usjToUsx = new UsjToUsx();
        Assert.Throws<ArgumentOutOfRangeException>(() => usjToUsx.UsjToUsxString(new Usj { Content = [new Usj()] }));
    }
}
