namespace SIL.XForge.Realtime;

public class DuplicateKeyCheck
{
    public string Path { get; set; }
    public object Value { get; set; }
    public bool Ignore { get; set; }
}

public class SubmitOptions
{
    public OpSource? Source { get; set; }
    public DuplicateKeyCheck? CheckDuplicateKey { get; set; }
}
