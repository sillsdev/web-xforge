using System;

namespace SIL.XForge.Models;

public class ShareKey
{
    public string Email { get; set; }
    public string Key { get; set; }
    public DateTime? ExpirationTime { get; set; }
    public string ProjectRole { get; set; }
}
