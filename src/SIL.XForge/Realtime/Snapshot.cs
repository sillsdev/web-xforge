namespace SIL.XForge.Realtime
{
    public class Snapshot<T>
    {
        public int Version { get; set; }
        public T Data { get; set; }
    }
}
