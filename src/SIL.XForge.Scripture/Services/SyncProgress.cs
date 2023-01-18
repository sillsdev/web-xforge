using System;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public class SyncProgress : IProgress<ProgressState>
{
    public event EventHandler ProgressUpdated;
    private string _progressString = "";
    private double _progressValue = 0;

    public double ProgressValue => _progressValue;

    public void Report(ProgressState progressState)
    {
        if (progressState.ProgressString != null)
            _progressString = progressState.ProgressString;
        if (progressState.ProgressValue > _progressValue)
            _progressValue = progressState.ProgressValue;
        OnProgressUpdated(new EventArgs());
    }

    protected void OnProgressUpdated(EventArgs e) => ProgressUpdated?.Invoke(this, e);
}
