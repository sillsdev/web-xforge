using System.Linq;
using System.Reflection;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NUnit.Framework;

namespace SIL.XForge.Scripture.I18N
{
    [TestFixture]
    public class SharedResourceTests
    {
        /// <summary>
        ///     This test will use reflection to find all the string properties in the SharedResource Keys class.
        ///     Then it will verify that each of those keys are present in the english .resx file
        /// </summary>
        [Test]
        public void VerifyAllSharedPropsAreInEnglishResx()
        {
            var options = Options.Create(new LocalizationOptions { ResourcesPath = "Resources" });
            var factory = new ResourceManagerStringLocalizerFactory(options, NullLoggerFactory.Instance);
            var localizer = new StringLocalizer<SharedResource>(factory);

            var sharedResourceAsm = Assembly.Load("SIL.XForge.Scripture");
            Assert.NotNull(sharedResourceAsm, "Um, what did you refactor?");
            var sharedResourceClass = sharedResourceAsm.GetType("SIL.XForge.Scripture.SharedResource");
            var sharedKeys = sharedResourceClass?.GetNestedType("Keys");
            Assert.NotNull(sharedKeys, "Um, what did you refactor?");
            // grab all the localization keys from SharedResource.Keys static class
            var publicProps = sharedKeys.GetFields(BindingFlags.Public | BindingFlags.Static);
            foreach (var propInfo in publicProps.Where(x => x.FieldType == typeof(string)))
            {
                var keyValue = (string)propInfo.GetValue(null);
                var englishStringFromResource = localizer.GetString(keyValue);
                // verify that each key is found
                Assert.IsFalse(
                    englishStringFromResource.ResourceNotFound,
                    "Missing english string from .resx for " + propInfo.Name
                );
            }

            Assert.AreEqual(
                publicProps.Length,
                localizer.GetAllStrings().Count(),
                "There are extra strings in the SharedResources.en.resx which are not in the SharedResource.Keys class"
            );
        }
    }
}
