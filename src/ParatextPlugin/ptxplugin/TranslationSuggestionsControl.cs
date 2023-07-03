using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;
using Paratext.PluginInterfaces;
using SIL.SFPlugin.Properties;

namespace SIL.SFPlugin
{
    /// <summary>
    /// The translation suggestions control.
    /// </summary>
    public partial class TranslationSuggestionsControl : EmbeddedPluginControl
    {
        /// <summary>
        /// The project.
        /// </summary>
        private IProject _project;

        /// <summary>
        /// The verse reference.
        /// </summary>
        private IVerseRef _verseRef;

        /// <summary>
        /// Initializes a new instance of the <see cref="TranslationSuggestionsControl"/> class.
        /// </summary>
        public TranslationSuggestionsControl() => InitializeComponent();

        /// <inheritdoc />
        public override async void OnAddedToParent(IPluginChildWindow parent, IWindowPluginHost host, string state)
        {
            // Set up the window and event handlers
            parent.SetTitle(Resources.PluginTitle);
            _project = parent.CurrentState.Project;
            _verseRef = parent.CurrentState.VerseRef;
            parent.ProjectChanged += ProjectChanged;
            parent.VerseRefChanged += VerseRefChanged;

            // Set up the web view
            string initialUrl = host.UserSettings.IsInternetAccessEnabled
                ? "https://scriptureforge.org/draft-suggestions"
                : "http://localhost:5000/draft-suggestions";
            try
            {
                // Change the cache location from the program directory to the temp directory
                string userDataFolder = Path.Combine(Path.GetTempPath(), "sfplugin");
                CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await WebView.EnsureCoreWebView2Async(environment);
            }
            catch (Exception ex)
            {
                // On error, ask if the user wants to download Edge WebView2
                string text = Resources.WebViewNotFound;

                // If debugging, show the exception details
                if (TranslationSuggestionsPlugin.IsDebug)
                {
                    text += $"\r\n\r\nException Details:\r\n{ex}";
                }

                if (
                    MessageBox.Show(
                        text,
                        Resources.CannotStartPlugin,
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Exclamation
                    ) == DialogResult.Yes
                )
                {
                    // Download WebView2
                    Process.Start(
                        new ProcessStartInfo("https://go.microsoft.com/fwlink/p/?LinkId=2124703")
                        {
                            UseShellExecute = true,
                            Verb = "open",
                        }
                    );
                }

                return;
            }

            // Enable developer tools if we are debugging
            WebView.CoreWebView2.Settings.AreDevToolsEnabled = TranslationSuggestionsPlugin.IsDebug;

            // Navigate to the last open URL
            try
            {
                WebView.Source = new Uri(state ?? initialUrl);
            }
            catch (Exception ex)
            {
                if (ex is ArgumentNullException || ex is UriFormatException)
                {
                    WebView.Source = new Uri(initialUrl);
                }
                else
                {
                    throw;
                }
            }

            // Send the message to Scripture Forge
            GenerateTranslationSuggestions();
        }

        /// <inheritdoc />
        public override string GetState() => WebView.Source?.ToString();

        /// <inheritdoc />
        public override void DoLoad(IProgressInfo progressInfo) { }

        /// <summary>
        /// Sends a message to Scripture Forge to generate translation suggestions.
        /// </summary>
        private void GenerateTranslationSuggestions()
        {
            var request = new TranslationSuggestionsRequest
            {
                BBBCCCVVV = _verseRef.BBBCCCVVV,
                ParatextId = _project.ID,
            };
            WebView.CoreWebView2.PostWebMessageAsJson(JsonConvert.SerializeObject(request));
        }

        /// <summary>
        /// The IPluginChildWindow ProjectChanged event handler.
        /// </summary>
        /// <param name="sender">The sender.</param>
        /// <param name="newProject">The new project.</param>
        private void ProjectChanged(IPluginChildWindow sender, IProject newProject)
        {
            _project = newProject;
            GenerateTranslationSuggestions();
        }

        /// <summary>
        /// The IPluginChildWindow VerseRefChanged event handler.
        /// </summary>
        /// <param name="sender">The sender.</param>
        /// <param name="oldReference">The old reference.</param>
        /// <param name="newReference">The new reference.</param>
        private void VerseRefChanged(IPluginChildWindow sender, IVerseRef oldReference, IVerseRef newReference)
        {
            if (_verseRef?.BBBCCCVVV != newReference.BBBCCCVVV)
            {
                _verseRef = newReference;
                GenerateTranslationSuggestions();
            }
        }
    }
}
