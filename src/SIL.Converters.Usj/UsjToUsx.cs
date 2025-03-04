using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Xml;
using System.Xml.Linq;

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

        /// <summary>
        /// Converts a USJ object to a USX <see cref="XDocument"/>.
        /// </summary>
        /// <param name="usj">The USJ object.</param>
        /// <returns>The XDocument.</returns>
        /// <remarks>Refer to remarks for <seealso cref="UsjToUsxString"/>.</remarks>
        public static XDocument UsjToUsxXDocument(IUsj usj)
        {
            // Create the USX document
            XElement documentElement = new XElement(Usx.UsxType, new XAttribute("version", Usx.UsxVersion));
            foreach (object content in usj.Content ?? new List<object>())
            {
                ConvertUsjRecurse(content, documentElement);
            }

            return new XDocument(documentElement);
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
            foreach (object content in usj.Content ?? new List<object>())
            {
                ConvertUsjRecurse(content, usxDoc.DocumentElement, usxDoc);
            }

            return usxDoc;
        }

        /// <summary>
        /// Sets the attributes for an element via a delegate.
        /// </summary>
        /// <param name="markerContent">The USJ marker.</param>
        /// <param name="setAttribute">The delegate. This will be either XmlElement.SetAttribute or XElement.SetAttributeValue</param>
        private static void SetAttributes(UsjMarker markerContent, Action<string, string> setAttribute)
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
                setAttribute(kvp.Key, kvp.Value);
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
                    setAttribute(key, value);
                }
            }
        }

        /// <summary>
        /// Recursively converts USJ content to USX for an <see cref="XmlDocument"/>.
        /// </summary>
        /// <param name="markerContent">The marker content. This will be a <see cref="UsjMarker"/> or <see cref="string"/>.</param>
        /// <param name="parentElement">The parent element.</param>
        /// <param name="usxDoc">The USX document</param>
        /// <exception cref="ArgumentOutOfRangeException">The markerContent is an invalid type.</exception>
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
                    SetAttributes(usjMarker, element.SetAttribute);

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

        /// <summary>
        /// Recursively converts USJ content to USX for an <see cref="XDocument"/>.
        /// </summary>
        /// <param name="markerContent">The marker content. This will be a <see cref="UsjMarker"/> or <see cref="string"/>.</param>
        /// <param name="parentElement">The parent element.</param>
        /// <exception cref="ArgumentOutOfRangeException">The markerContent is an invalid type.</exception>
        private static void ConvertUsjRecurse(object markerContent, XElement parentElement)
        {
            XNode node;
            switch (markerContent)
            {
                case string markerText:
                    node = new XText(markerText);
                    break;
                case UsjMarker usjMarker:
                {
                    string type = usjMarker.Type.Replace("table:", string.Empty);
                    XElement element = new XElement(type);
                    node = element;
                    SetAttributes(usjMarker, (name, value) => element.SetAttributeValue(name, value));

                    if (usjMarker.Content != null)
                    {
                        foreach (object content in usjMarker.Content)
                        {
                            ConvertUsjRecurse(content, element);
                        }
                    }

                    break;
                }
                default:
                    throw new ArgumentOutOfRangeException(nameof(markerContent));
            }

            parentElement.Add(node);
        }
    }
}
