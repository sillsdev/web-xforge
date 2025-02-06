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

                // Include any non-standard attributes that are strings for compatibility with USX.
                //
                // Notes:
                //  - If the non-standard attribute is not a string, discard it as it is invalid.
                //  - Type and marker are handled above, so do not repeat them.
                //  - Content is a collection handled in ConvertUsjRecurse.
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
            if (markerContent is string markerText)
            {
                node = usxDoc.CreateTextNode(markerText);
            }
            else if (markerContent is UsjMarker usjMarker)
            {
                string type = usjMarker.Type.Replace("table:", string.Empty);
                XmlElement element = usxDoc.CreateElement(type);
                node = element;
                SetAttributes(element, usjMarker);

                if (type == "verse")
                {
                    // If we encounter a new verse, write out a verse EID for the previous verse, and record the new
                    // verse ID.
                    WritePendingVerseEid(usxDoc, parentElement);
                    _verseEid = usjMarker.Sid;
                }

                if (type == "chapter")
                {
                    // If we encounter a new chapter, write out a verse EID for the previous verse (unless already done), write out a chapter EID for the previous chapter, and record the new chapter ID.
                    WritePendingVerseEid(usxDoc, parentElement);
                    WritePendingChapterEid(usxDoc, parentElement);
                    _chapterEid = usjMarker.Sid;
                }

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

            parentElement.AppendChild(node);

            if (isLastItem)
            {
                if (parentElement.Name == "para")
                {
                    // Write out the verse EID for the current verse at the end of a paragraph.
                    WritePendingVerseEid(usxDoc, parentElement);
                }

                if (_chapterEid != null && parentElement.Name == Usx.UsxType)
                {
                    // If the USX is using an implied paragraph, and we reach the end, write out any verse EID or
                    // chapter EID that hasn't been written already.
                    WritePendingVerseEid(usxDoc, parentElement);
                    WritePendingChapterEid(usxDoc, parentElement);
                }
            }
        }

        private void WritePendingChapterEid(XmlDocument usxDoc, XmlElement parentElement)
        {
            if (_chapterEid != null)
            {
                parentElement.AppendChild(CreateChapterEndElement(usxDoc));
                _chapterEid = null;
            }
        }

        private void WritePendingVerseEid(XmlDocument usxDoc, XmlElement parentElement)
        {
            if (_verseEid != null)
            {
                parentElement.AppendChild(CreateVerseEndElement(usxDoc));
                _verseEid = null;
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
        /// Converts a USJ object to a USX <see cref="XmlDocument"/>.
        /// </summary>
        /// <param name="usj">The USJ object.</param>
        /// <returns>The XML Document.</returns>
        public XmlDocument UsjToUsxXmlDocument(IUsj usj)
        {
            // Reset any instance variables
            _chapterEid = null;
            _verseEid = null;

            // Create the USX document
            XmlDocument usxDoc = new XmlDocument { PreserveWhitespace = true };
            XmlElement documentElement = usxDoc.CreateElement(Usx.UsxType);
            documentElement.SetAttribute("version", Usx.UsxVersion);
            usxDoc.AppendChild(documentElement);
            UsjToUsxDom(usj, usxDoc);
            return usxDoc;
        }

        /// <summary>
        /// Converts a USJ object to a USX string.
        /// </summary>
        /// <param name="usj">The USJ object.</param>
        /// <returns>The USX as a string.</returns>
        public string UsjToUsxString(IUsj usj)
        {
            XmlDocument usxDoc = UsjToUsxXmlDocument(usj);

            // Output as a string
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
