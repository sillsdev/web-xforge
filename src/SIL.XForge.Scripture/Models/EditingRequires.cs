using System;

namespace SIL.XForge.Scripture.Models;

[Flags]
public enum EditingRequires
{
    None = 0,
    ParatextEditingEnabled = 1 << 0, // 1
    ViewModelBlankSupport = 1 << 1, // 2
}
