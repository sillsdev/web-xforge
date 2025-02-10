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
    public static class UsjToUsx
    {
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

        private static void ConvertUsjRecurse(object markerContent, XmlElement parentElement, XmlDocument usxDoc)
        {
            XmlNode node;
            switch (markerContent)
            {
                case string markerText:
                    node = usxDoc.CreateTextNode(markerText);
                    break;
                case UsjMarker usjMarker:
                {
                    string type = usjMarker.Type.Replace("table:", string.Empty);
                    XmlElement element = usxDoc.CreateElement(type);
                    node = element;
                    SetAttributes(element, usjMarker);

                    if (usjMarker.Content != null)
                    {
                        foreach (object content in usjMarker.Content)
                        {
                            ConvertUsjRecurse(content, element, usxDoc);
                        }
                    }

                    break;
                }
                default:
                    throw new ArgumentOutOfRangeException(nameof(markerContent));
            }

            parentElement.AppendChild(node);
        }

        private static void UsjToUsxDom(IUsj usj, XmlDocument usxDoc)
        {
            foreach (object content in usj.Content)
            {
                ConvertUsjRecurse(content, usxDoc.DocumentElement, usxDoc);
            }
        }

        /// <summary>
        /// Converts a USJ object to a USX <see cref="XmlDocument"/>.
        /// </summary>
        /// <param name="usj">The USJ object.</param>
        /// <returns>The XML Document.</returns>
        /// <remarks>Refer to remarks for <seealso cref="UsjToUsxString"/>.</remarks>
        public static XmlDocument UsjToUsxXmlDocument(IUsj usj)
        {
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
        /// <remarks>
        /// The USX is not fully USX compliant as it does not contain <c>vid</c> attributes or <c>eid</c>
        /// attributes for <c>verse</c> or <c>chapter</c> elements. If you wish to have these,
        /// please insert via post-processing, or round-tripping via USFM in ParatextData.
        /// </remarks>
        public static string UsjToUsxString(IUsj usj)
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
