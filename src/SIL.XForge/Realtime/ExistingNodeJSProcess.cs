using System;
using System.Diagnostics;
using System.Threading.Tasks;
using Jering.Javascript.NodeJS;

namespace SIL.XForge.Realtime;

public class ExistingNodeJSProcess : INodeJSProcess
{
    public void Dispose() => GC.SuppressFinalize(this);

    public ValueTask DisposeAsync()
    {
        GC.SuppressFinalize(this);
        return ValueTask.CompletedTask;
    }

    public void AddOutputReceivedHandler(MessageReceivedEventHandler messageReceivedHandler) =>
        Task.Run(async () =>
        {
            // Delay to fake thread starting
            await Task.Delay(5000);

            // Code to be executed after the delay
            messageReceivedHandler.Invoke(
                "[Jering.Javascript.NodeJS: HttpVersion - HTTP/1.1 Listening on IP - 127.0.0.1 Port - 5002]"
            );
        });

    public void AddErrorReceivedHandler(MessageReceivedEventHandler messageReceivedHandler) { }

    public void BeginOutputAndErrorReading() { }

    public void AddOutputDataReceivedHandler(DataReceivedEventHandler dataReceivedEventHandler) { }

    public void AddErrorDataReceivedHandler(DataReceivedEventHandler dataReceivedEventHandler) { }

    public void SetConnected() => this.Connected = true;

    public void BeginErrorReadLine() { }

    public void BeginOutputReadLine() { }

    public void Kill() { }

    public bool Connected { get; private set; }

    public bool HasExited => false;
    public string ExitStatus => "Process has not exited";
    public int SafeID => -1;
}
