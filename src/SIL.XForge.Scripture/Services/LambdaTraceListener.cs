using System;
using System.Text;

namespace SIL.XForge.Scripture.Services;

/// <summary>TraceListener that passes messages to a delegate.</summary>
public class LambdaTraceListener : System.Diagnostics.TraceListener
{
    private readonly Action<string> _processor;
    private readonly StringBuilder _buffer;

    public LambdaTraceListener(Action<string> processor)
    {
        _processor = processor;
        _buffer = new StringBuilder();
    }

    ///<remarks>Writes are buffered, to be sent upon WriteLine.</remarks>
    public override void Write(string message) => _buffer.Append(message);

    public override void WriteLine(string message)
    {
        string combinedMessage = _buffer + message;
        _buffer.Clear();
        _processor(combinedMessage);
    }
}
