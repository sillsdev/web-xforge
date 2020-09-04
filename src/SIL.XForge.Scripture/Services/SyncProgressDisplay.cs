using System;
using SIL.XForge.Scripture.Models;
using PtxUtils.Progress;

namespace SIL.XForge.Scripture.Services
{
    public class SyncProgressDisplay : ProgressDisplay
    {
        private IProgress<ProgressState> _syncProgress;

        public SyncProgressDisplay(IProgress<ProgressState> progress)
        {
            _syncProgress = progress;
        }

        public void SetProgressText(string text)
        {
            _syncProgress.Report(new ProgressState { ProgressString = text });
        }

        public void SetProgressValue(double value)
        {
            _syncProgress.Report(new ProgressState { ProgressValue = value });
        }
    }
}
