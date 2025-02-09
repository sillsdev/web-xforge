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
        /// <summary>
        /// The eid which will be written for the current chapter.
        /// </summary>
        private string _currentChapterEid;

        /// <summary>
        /// The eid which will be written for the current verse.
        /// </summary>
        private string _currentVerseEid;

        private XmlElement CreateVerseEndElement(XmlDocument usxDoc)
        {
            XmlElement eidElement = usxDoc.CreateElement("verse");
            eidElement.SetAttribute("eid", _currentVerseEid);
            return eidElement;
        }

        private XmlElement CreateChapterEndElement(XmlDocument usxDoc)
        {
            XmlElement eidElement = usxDoc.CreateElement("chapter");
            eidElement.SetAttribute("eid", _currentChapterEid);
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

            // Store the previous verse eid so we can close that verse in the correct place
            string lastVerseEid = null;

            // Create chapter and verse end elements from SID attributes.
            if (_currentVerseEid != null && (type == "verse" || (parentElement.Name == "para" && isLastItem)))
            {
                eidElement = CreateVerseEndElement(usxDoc);
                lastVerseEid = _currentVerseEid;
                _currentVerseEid = null;
            }

            if (type == "verse" && usjMarker?.Sid != null)
            {
                _currentVerseEid = usjMarker.Sid;
            }

            if (_currentChapterEid != null && (type == "chapter" || (type == "para" && isLastItem)))
            {
                eidElement = CreateChapterEndElement(usxDoc);
                _currentChapterEid = null;
            }

            if (type == "chapter" && usjMarker?.Sid != null)
            {
                _currentChapterEid = usjMarker.Sid;
            }

            // See if we are at a new verse
            if (eidElement != null && isLastItem && _currentVerseEid != null && _currentVerseEid != lastVerseEid)
            {
                // Write the eid element for the previous verse
                parentElement.AppendChild(eidElement);

                // Ensure that eid element for the current verse is not written
                eidElement = null;
                _currentVerseEid = null;
            }

            // Append to parent to close the verse or chapter before this new node
            if (eidElement != null && !isLastItem)
            {
                parentElement.AppendChild(eidElement);
                eidElement = null;
            }

            parentElement.AppendChild(node);

            // Append the eid element as this is the last element
            if (eidElement != null)
            {
                parentElement.AppendChild(eidElement);
            }

            // Allow for final chapter and verse end elements at the end of an implied para.
            if (isLastItem && parentElement.Name == Usx.UsxType)
            {
                if (_currentVerseEid != null)
                {
                    parentElement.AppendChild(CreateVerseEndElement(usxDoc));
                }

                if (_currentChapterEid != null)
                {
                    parentElement.AppendChild(CreateChapterEndElement(usxDoc));
                }

                _currentVerseEid = null;
                _currentChapterEid = null;
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
            _currentChapterEid = null;
            _currentVerseEid = null;

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
