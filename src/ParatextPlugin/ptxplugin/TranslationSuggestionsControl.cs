using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
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
        /// Initializes a new instance of the <see cref="TranslationSuggestionsControl"/> class.
        /// </summary>
        public TranslationSuggestionsControl() => InitializeComponent();

        /// <inheritdoc />
        public override async void OnAddedToParent(IPluginChildWindow parent, IWindowPluginHost host, string state)
        {
            // Set up the window
            parent.SetTitle(Resources.PluginTitle);

            // Set up the web view
            string initialUrl = host.UserSettings.IsInternetAccessEnabled
                ? "https://scriptureforge.org/"
                : "http://localhost:5000/";
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
        }

        /// <inheritdoc />
        public override string GetState() => WebView.Source?.ToString();

        /// <inheritdoc />
        public override void DoLoad(IProgressInfo progressInfo) { }
    }
}
