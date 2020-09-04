namespace PtdaSyncAll
{
    /// <summary>
    /// Expected interface, to allow mocking.
    /// </summary>
    public interface IProgramLogger
    {
        void Log(string message, bool finalNewline = true);
    }
}
