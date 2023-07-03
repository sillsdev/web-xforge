using System;
using System.Collections.Generic;
using System.Reflection;
using Paratext.PluginInterfaces;
using SIL.SFPlugin.Properties;

namespace SIL.SFPlugin
{
    /// <summary>
    /// The Scripture Forge Translation Suggestions Plugin
    /// </summary>
    public class TranslationSuggestionsPlugin : IParatextWindowPlugin
    {
        /// <summary>
        /// Gets a value indicating whether this instance is compiled in debug mode.
        /// </summary>
        /// <value>
        ///   <c>true</c> if this instance compiled debug mode; otherwise, <c>false</c>.
        /// </value>
        /// <remarks>Debug mode is used to enable functionality to aid developers.</remarks>
        public static bool IsDebug =>
#if DEBUG
            true;
#else
            false;
#endif

        /// <inheritdoc />
        public string Name => Resources.PluginName;

        /// <inheritdoc />
        public string GetDescription(string locale) => Resources.PluginDescription;

        /// <inheritdoc />
        public Version Version => new Version(VersionString);

        /// <inheritdoc />
        public string VersionString
        {
            get
            {
                AssemblyVersionAttribute versionAttribute = Assembly
                    .GetEntryAssembly()
                    ?.GetCustomAttribute<AssemblyVersionAttribute>();
                return versionAttribute?.Version ?? "1.0";
            }
        }

        /// <inheritdoc />
        public string Publisher
        {
            get
            {
                AssemblyCompanyAttribute companyAttribute = Assembly
                    .GetEntryAssembly()
                    ?.GetCustomAttribute<AssemblyCompanyAttribute>();
                return companyAttribute?.Company ?? "SIL International";
            }
        }

        /// <inheritdoc />
        public IEnumerable<WindowPluginMenuEntry> PluginMenuEntries
        {
            get
            {
                yield return new WindowPluginMenuEntry(
                    Resources.MenuEntryCaption,
                    Run,
                    PluginMenuLocation.ScrTextTools,
                    "app.ico"
                );
            }
        }

        /// <inheritdoc />
        /// <exception cref="NotImplementedException">This method is not implemented.</exception>
        public IDataFileMerger GetMerger(IPluginHost host, string dataIdentifier) =>
            throw new NotImplementedException();

        /// <summary>
        /// Called by Paratext when the menu item created for this plugin was clicked.
        /// </summary>
        /// <param name="host">The windows plugin host</param>
        /// <param name="windowState">The window state.</param>
        private static void Run(IWindowPluginHost host, IParatextChildState windowState) =>
            host.ShowEmbeddedUi(new TranslationSuggestionsControl(), windowState.Project);
    }
}
