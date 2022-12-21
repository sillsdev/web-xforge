using Microsoft.Win32;
using PtxUtils;

namespace SIL.XForge.Scripture.Services;

/// <summary> Dummy registry implementation for Paratext Data to use when running in dotnet core. </summary>
class DotNetCoreRegistry : RegistryU
{
    protected override bool ValueExistsInternal(string registryPath) => false;

    protected override bool KeyExistsInternal(string registryPath) => false;

    protected override bool KeyExistsInternal(RegistryKey key, string subKey) => false;

    protected override bool RegEntryExistsInternal(RegistryKey key, string subKey, string regEntry, out object value)
    {
        value = null;
        return false;
    }

    protected override object GetValInternal(string baseKey, string subKey, string key) => null;

    protected override object GetValInternal(string registryPath) => null;

    protected override object GetValIfExistsInternal(string registryPath) => null;

    protected override string GetStringInternal(string basekey, string path, string key) => null;

    protected override string GetStringInternal(string registryPath) => null;

    protected override void DelKeyInternal(string baseKey, string subKey) { }

    protected override void DelKeyInternal(string registryPath) { }

    protected override void SetValInternal(string baseKey, string subKey, string key, object theValue) { }

    protected override void SetValInternal(string registryPath, object theValue) { }

    protected override bool HasWritePermissionInternal(string registryPath) => false;
}
