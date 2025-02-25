using System;
using System.IO;
using System.IO.Compression;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
using System.Xml.XPath;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.Users;
using SIL.WritingSystems;

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
    public void ShouldConvertFromNullXDocumentToUsj()
    {
        Usj usj = UsxToUsj.UsxXDocumentToUsj(null);
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
    public void ShouldConvertFromUsxToUsjWithNbsp()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1Nbsp);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1Nbsp).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromUsxToUsjWithNbsp_Roundtrip()
    {
        Usj usj = UsxToUsj.UsxStringToUsj(TestData.UsxGen1V1Nbsp);
        string usx = UsjToUsx.UsjToUsxString(usj);
        usx = TestData.RemoveXmlWhiteSpace(usx);

        string expected = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1Nbsp);
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
    public void ShouldConvertFromUsxToUsjWithNonStandardFeatures_Roundtrip()
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
    public void ShouldConvertFromXDocumentToUsj()
    {
        XDocument document = XDocument.Parse(TestData.UsxGen1V1, LoadOptions.PreserveWhitespace);
        Usj usj = UsxToUsj.UsxXDocumentToUsj(document);
        Assert.That(usj, Is.EqualTo(TestData.UsjGen1V1).UsingPropertiesComparer());
    }

    [Test]
    public void ShouldConvertFromXDocumentToUsj_Roundtrip()
    {
        string usx = TestData.RemoveXmlWhiteSpace(TestData.UsxGen1V1);
        usx = TestData.RemoveEidElements(usx);
        XDocument document = XDocument.Parse(usx, LoadOptions.PreserveWhitespace);
        Usj usj = UsxToUsj.UsxXDocumentToUsj(document);

        XDocument actualUsx = UsjToUsx.UsjToUsxXDocument(usj);
        Assert.That(actualUsx, Is.EqualTo(document).UsingPropertiesComparer());
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
    public async Task ShouldRoundtripProjects()
    {
        // Set up the test environment
        if (!Sldr.IsInitialized)
        {
            Sldr.Initialize(true);
        }

        RegistrationInfo.Implementation = new TestRegistrationInfo();
        ICUDllLocator.Initialize();
        WritingSystemRepository.Initialize();
        ScrTextCollection.Initialize();
        using var scrText = new DummyScrText();
        ScrTextCollection.Add(scrText);

        // Iterate over every zip file in the test directory
        foreach (string zipFilePath in Directory.EnumerateFiles(@"D:\Downloads\Open.Bible", "*.zip"))
        {
            await using FileStream zipFileStream = new FileStream(zipFilePath, FileMode.Open, FileAccess.Read);
            using ZipArchive archive = new ZipArchive(zipFileStream, ZipArchiveMode.Read);
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                if (
                    entry.Name.EndsWith(".usfm", StringComparison.OrdinalIgnoreCase)
                    || entry.Name.EndsWith(".sfm", StringComparison.OrdinalIgnoreCase)
                )
                {
                    // Load the USFM
                    await using Stream entryStream = entry.Open();
                    using StreamReader reader = new StreamReader(entryStream);
                    string usfm = await reader.ReadToEndAsync();

                    // Normalize the USFM
                    string normalizedUsfm = UsfmToken.NormalizeUsfm(
                        scrText.DefaultStylesheet,
                        usfm,
                        preserveWhitespace: false,
                        scrText.RightToLeft,
                        scrText
                    );

                    // Convert the USFM to USX
                    XmlDocument usx = UsfmToUsx.ConvertToXmlDocument(
                        scrText,
                        scrText.DefaultStylesheet,
                        normalizedUsfm
                    );

                    // Convert the USX to USFM to handle any variance from ParatextData
                    UsxFragmenter.FindFragments(
                        scrText.DefaultStylesheet,
                        usx.CreateNavigator(),
                        XPathExpression.Compile("*[false()]"),
                        out string cleanedUsfm,
                        allowInvisibleChars: false
                    );

                    // Normalize the cleaned USFM, to get the expected USFM
                    string expectedUsfm = UsfmToken.NormalizeUsfm(
                        scrText.DefaultStylesheet,
                        cleanedUsfm,
                        preserveWhitespace: false,
                        scrText.RightToLeft,
                        scrText
                    );

                    // Convert the USX to USJ
                    Usj usj = UsxToUsj.UsxXmlDocumentToUsj(usx);

                    // Convert the USJ to USX
                    XmlDocument actualUsx = UsjToUsx.UsjToUsxXmlDocument(usj);

                    // Convert the USX to USFM
                    UsxFragmenter.FindFragments(
                        scrText.DefaultStylesheet,
                        actualUsx.CreateNavigator(),
                        XPathExpression.Compile("*[false()]"),
                        out string convertedUsfm,
                        allowInvisibleChars: false
                    );

                    // Normalize the USFM
                    string actualUsfm = UsfmToken.NormalizeUsfm(
                        scrText.DefaultStylesheet,
                        convertedUsfm,
                        preserveWhitespace: false,
                        scrText.RightToLeft,
                        scrText
                    );

                    // This is for a breakpoint to debug a specific file
                    if (actualUsfm != expectedUsfm)
                    {
                        Console.WriteLine($"USFM mismatch in {entry.Name} in {Path.GetFileName(zipFilePath)}");
                    }

                    Assert.That(actualUsfm, Is.EqualTo(expectedUsfm));
                }
                else
                {
                    Console.WriteLine($"Unknown File {entry.Name} in {Path.GetFileName(zipFilePath)}");
                }
            }
        }
    }
}
