using PtxUtils;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Text;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>Simple alert implementation for Paratext Data to use when running in dotnet core.</summary>
    class DotNetCoreAlert : PtxUtils.Alert
    {
        protected override AlertResult ShowInternal(IComponent owner, string text, string caption, AlertButtons alertButtons, AlertLevel alertLevel, AlertDefaultButton defaultButton, bool showInTaskbar)
        {
            Console.WriteLine($"Alert: {text} : {caption}");
            return AlertResult.Positive;
        }

        protected override void ShowLaterInternal(string text, string caption, AlertLevel alertLevel)
        {
            Console.WriteLine($"Async Alert: {text} : {caption}");
        }
    }
}
