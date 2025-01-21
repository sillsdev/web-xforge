using Paratext.Data;

namespace SIL.XForge.Scripture.Services;

internal class MockHgRunner() : HgExeRunner(null, null, null)
{
    private bool _appendCallCount;
    private int _callCount;
    private string _standardOutput = string.Empty;

    /// <summary>
    /// Mocks running a Mercurial command by incrementing a call count.
    /// </summary>
    /// <param name="args"></param>
    public override void RunHg(string args) => _callCount++;

    /// <summary>
    /// Gets a success exit code.
    /// </summary>
    public override int ExitCode => 0;

    /// <summary>
    /// Gets the standard error, which is always empty.
    /// </summary>
    public override string StandardError => string.Empty;

    /// <summary>
    /// Gets the standard output.
    /// </summary>
    public override string StandardOutput =>
        _standardOutput + (_appendCallCount ? _callCount.ToString() : string.Empty);

    /// <summary>
    /// Gets the standard output.
    /// </summary>
    public override string StandardOutputNoTrim => StandardOutput;

    /// <summary>
    /// Initialize the HgRunner (i.e. do nothing)
    /// </summary>
    public override void Initialize()
    {
        // Do nothing
    }

    /// <summary>
    /// Sets the standard output
    /// </summary>
    /// <param name="standardOutput">The standard output.</param>
    /// <param name="appendCallCountToOutput">
    /// Adds the call count to the end of the output.
    /// This is useful to simulate the last verse changing in hg cat output.
    /// </param>
    public void SetStandardOutput(string standardOutput, bool appendCallCountToOutput)
    {
        _standardOutput = standardOutput;
        _appendCallCount = appendCallCountToOutput;
    }
}
