namespace SIL.XForge.Realtime;

public class Snapshot<T>
{
    public string Id { get; set; }
    public int Version { get; set; }
    public T Data { get; set; }
}
