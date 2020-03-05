using Microsoft.Win32;
using PtxUtils;
using System;
using System.Collections.Generic;
using System.Text;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>Dummy registry implementation for Paratext Data to use when running in dotnet core.</summary>
    class DotNetCoreRegistry : RegistryU
    {
        protected override bool ValueExistsInternal(string registryPath)
        {
            Console.WriteLine($"Unimplemented ValueExistsInternal {registryPath}");
            return false;
        }

        protected override bool KeyExistsInternal(string registryPath)
        {
            Console.WriteLine($"Unimplemented KeyExistsInternal {registryPath}");
            return false;
        }

        protected override bool KeyExistsInternal(RegistryKey key, string subKey)
        {
            Console.WriteLine($"Unimplemented KeyExistsInternal {key} {subKey}");
            return false;
        }

        protected override bool RegEntryExistsInternal(RegistryKey key, string subKey, string regEntry, out object value)
        {
            value = null;
            Console.WriteLine($"Unimplemented RegEntryExistsInternal {key} {subKey} {regEntry}");
            return false;
        }

        protected override object GetValInternal(string baseKey, string subKey, string key)
        {
            Console.WriteLine($"Unimplemented GetValInternal {baseKey} {subKey} {key}");
            return null;
        }

        protected override object GetValInternal(string registryPath)
        {
            Console.WriteLine($"Unimplemented GetValInternal {registryPath}");
            return null;
        }

        protected override object GetValIfExistsInternal(string registryPath)
        {
            Console.WriteLine($"Unimplemented GetValIfExistsInternal {registryPath}");
            return null;
        }

        protected override string GetStringInternal(string basekey, string path, string key)
        {
            Console.WriteLine($"Unimplemented GetStringInternal {basekey} {path} {key}");
            return null;
        }

        protected override string GetStringInternal(string registryPath)
        {
            Console.WriteLine($"Unimplemented GetStringInternal {registryPath}");
            return null;
        }

        protected override void DelKeyInternal(string baseKey, string subKey)
        {
            Console.WriteLine($"Unimplemented DelKeyInternal {baseKey} {subKey}");
        }

        protected override void DelKeyInternal(string registryPath)
        {
            Console.WriteLine($"Unimplemented DelKeyInternal {registryPath}");
        }

        protected override void SetValInternal(string baseKey, string subKey, string key, object theValue)
        {
            Console.WriteLine($"Unimplemented SetValInternal {baseKey} {subKey} {key} {theValue}");
        }

        protected override void SetValInternal(string registryPath, object theValue)
        {
            Console.WriteLine($"Unimplemented SetValInternal {registryPath} {theValue}");
        }

        protected override bool HasWritePermissionInternal(string registryPath)
        {
            Console.WriteLine($"Unimplemented HasWritePermissionInternal {registryPath}");
            return false;
        }
    }
}
