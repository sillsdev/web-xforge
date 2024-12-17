using System;
using System.Collections.Generic;
using System.ComponentModel;
using Microsoft.Extensions.Logging;
using PtxUtils;

namespace SIL.XForge.Scripture.Services;

/// <summary> Simple alert implementation for Paratext Data to use when running in dotnet core. </summary>
class DotNetCoreAlert : PtxUtils.Alert
{
    private readonly List<Action<string>> _listeners = [];
    private readonly ILogger _logger;

    public DotNetCoreAlert(ILogger logger) => _logger = logger;

    /// <summary>Register a listener to receive alert messages.</summary>
    public void AddListener(Action<string> listener) => _listeners.Add(listener);

    public void RemoveListener(Action<string> listener) => _listeners.Remove(listener);

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
        string message = $"Alert: {caption}: {text}";
        _logger.LogError(message);
        foreach (var listener in _listeners)
            listener(message);

        return AlertResult.Positive;
    }

    protected override void ShowLaterInternal(string text, string caption, AlertLevel alertLevel)
    {
        string message = $"Deferred Alert: {caption}: {text}";
        _logger.LogError(message);
        foreach (var listener in _listeners)
            listener(message);
    }
}
