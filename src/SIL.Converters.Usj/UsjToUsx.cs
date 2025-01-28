using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Xml;

namespace SIL.Converters.Usj
{
    /// <summary>
    /// Convert Scripture from USJ to USX.
    /// </summary>
    /// <remarks>
    /// Ported to C# from this file:
    /// <c>https://github.com/BiblioNexus-Foundation/scripture-editors/blob/main/packages/utilities/src/converters/usj/usj-to-usx.ts</c>
    /// </remarks>
    public class UsjToUsx
    {
        private string _chapterEid;
        private string _verseEid;

        private XmlElement CreateVerseEndElement(XmlDocument usxDoc)
        {
            XmlElement eidElement = usxDoc.CreateElement("verse");
            eidElement.SetAttribute("eid", _verseEid);
            return eidElement;
        }

        private XmlElement CreateChapterEndElement(XmlDocument usxDoc)
        {
            XmlElement eidElement = usxDoc.CreateElement("chapter");
            eidElement.SetAttribute("eid", _chapterEid);
            return eidElement;
        }

        private static void SetAttributes(XmlElement element, UsjMarker markerContent)
        {
            // Get the standard attributes
            // This order is based on the order in ParatextData's UsxUsfmParserSink
            var attributes = new Dictionary<string, string>
            {
                { "code", markerContent.Code },
                { "caller", markerContent.Caller },
                { "number", markerContent.Number },
                { markerContent.Type == "unmatched" ? "marker" : "style", markerContent.Marker },
                { "altnumber", markerContent.AltNumber },
                { "pubnumber", markerContent.PubNumber },
                { "align", markerContent.Align },
                { "category", markerContent.Category },
                { "sid", markerContent.Sid },
                { "eid", markerContent.Eid },
            };

            // Add the standard attributes
            foreach (var kvp in attributes.Where(kvp => kvp.Value != null))
            {
                element.SetAttribute(kvp.Key, kvp.Value);
            }

            // Add the non-standard attributes
            foreach (KeyValuePair<string, object> nonStandardAttribute in markerContent.AdditionalData)
            {
                string key = nonStandardAttribute.Key;
                if (nonStandardAttribute.Value is string value && key != "type" && key != "marker" && key != "content")
                {
                    element.SetAttribute(key, value);
                }
            }
        }

        private void ConvertUsjRecurse(
            object markerContent,
            XmlElement parentElement,
            XmlDocument usxDoc,
            bool isLastItem
        )
        {
            XmlNode node;
            string type = null;
            XmlElement eidElement = null;
            UsjMarker usjMarker = markerContent as UsjMarker;
            if (markerContent is string markerText)
            {
                node = usxDoc.CreateTextNode(markerText);
            }
            else if (usjMarker != null)
            {
                type = usjMarker.Type.Replace("table:", string.Empty);
                XmlElement element = usxDoc.CreateElement(type);
                node = element;
                SetAttributes(element, usjMarker);
                if (usjMarker.Content != null)
                {
                    for (int i = 0; i < usjMarker.Content.Count; i++)
                    {
                        bool elementIsLastItem = i == usjMarker.Content.Count - 1;
                        ConvertUsjRecurse(usjMarker.Content[i], element, usxDoc, elementIsLastItem);
                    }
                }
            }
            else
            {
                throw new ArgumentOutOfRangeException(nameof(markerContent));
            }

            // Create chapter and verse end elements from SID attributes.
            if (_verseEid != null && (type == "verse" || (parentElement.Name == "para" && isLastItem)))
            {
                eidElement = CreateVerseEndElement(usxDoc);
                _verseEid = null;
            }

            if (type == "verse" && usjMarker?.Sid != null)
            {
                _verseEid = usjMarker.Sid;
            }

            if (_chapterEid != null && (type == "chapter" || (type == "para" && isLastItem)))
            {
                eidElement = CreateChapterEndElement(usxDoc);
                _chapterEid = null;
            }

            if (type == "chapter" && usjMarker?.Sid != null)
            {
                _chapterEid = usjMarker.Sid;
            }

            // Append to parent.
            if (eidElement != null && !isLastItem)
            {
                parentElement.AppendChild(eidElement);
            }

            parentElement.AppendChild(node);

            if (eidElement != null && isLastItem)
            {
                parentElement.AppendChild(eidElement);
            }

            // Allow for final chapter and verse end elements at the end of an implied para.
            if (isLastItem && parentElement.Name == Usx.UsxType)
            {
                if (_verseEid != null)
                {
                    parentElement.AppendChild(CreateVerseEndElement(usxDoc));
                }

                if (_chapterEid != null)
                {
                    parentElement.AppendChild(CreateChapterEndElement(usxDoc));
                }

                _verseEid = null;
                _chapterEid = null;
            }
        }

        private void UsjToUsxDom(IUsj usj, XmlDocument usxDoc)
        {
            for (int i = 0; i < usj.Content.Count; i++)
            {
                bool isLastItem = i == usj.Content.Count - 1;
                ConvertUsjRecurse(usj.Content[i], usxDoc.DocumentElement, usxDoc, isLastItem);
            }
        }

        /// <summary>
        /// Converts a USJ object to a USX string.
        /// </summary>
        /// <param name="usj">The USJ object.</param>
        /// <returns>The USX as a string.</returns>
        public string UsjToUsxString(IUsj usj)
        {
            XmlDocument usxDoc = new XmlDocument { PreserveWhitespace = true };
            XmlElement documentElement = usxDoc.CreateElement(Usx.UsxType);
            documentElement.SetAttribute("version", Usx.UsxVersion);
            usxDoc.AppendChild(documentElement);
            UsjToUsxDom(usj, usxDoc);

            using (StringWriter stringWriter = new StringWriter())
            {
                // These settings conform to ParatextData.UsfmToUsx
                XmlWriterSettings xmlWriterSettings = new XmlWriterSettings
                {
                    Indent = true,
                    Encoding = Encoding.UTF8,
                    OmitXmlDeclaration = true,
                    NewLineChars = "\r\n",
                };
                using (XmlWriter xmlWriter = XmlWriter.Create(stringWriter, xmlWriterSettings))
                {
                    usxDoc.WriteTo(xmlWriter);
                    xmlWriter.Flush();
                    return stringWriter.ToString();
                }
            }
        }
    }
}
