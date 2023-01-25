using System.ComponentModel;
using Microsoft.Extensions.Logging;
using PtxUtils;

namespace SIL.XForge.Scripture.Services;

/// <summary> Simple alert implementation for Paratext Data to use when running in dotnet core. </summary>
class DotNetCoreAlert : PtxUtils.Alert
{
    private readonly ILogger _logger;

    public DotNetCoreAlert(ILogger logger) => _logger = logger;

    protected override AlertResult ShowInternal(
        IComponent owner,
        string text,
        string caption,
        AlertButtons alertButtons,
        AlertLevel alertLevel,
        AlertDefaultButton defaultButton,
        bool showInTaskbar
    )
    {
        _logger.LogInformation($"Alert: {text} : {caption}");
        return AlertResult.Positive;
    }

    protected override void ShowLaterInternal(string text, string caption, AlertLevel alertLevel) =>
        _logger.LogInformation($"Async Alert: {text} : {caption}");
}
