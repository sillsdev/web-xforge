using System;
using Jering.Javascript.NodeJS;

namespace SIL.XForge.Realtime;

public class ExistingNodeJSProcessFactory : INodeJSProcessFactory
{
    public INodeJSProcess Create(string serverScript) => new ExistingNodeJSProcess();

    public INodeJSProcess Create(string serverScript, EventHandler exitedEventHandler) => new ExistingNodeJSProcess();
}
