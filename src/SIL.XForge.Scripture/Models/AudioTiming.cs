namespace SIL.XForge.Scripture.Models;

public class AudioTiming
{
    public string TextRef { get; set; }
    public double From { get; set; }
    public double To { get; set; }

    public override string ToString() => $"{TextRef}: {From} - {To}";
}
