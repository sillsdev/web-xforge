using System;
using PtxUtils.Progress;

namespace SIL.XForge.Scripture.Services
{
    public class SyncProgressDisplay : ProgressDisplay
    {
        public event EventHandler ProgressUpdated;
        private string _progressText = "";
        private double _progressValue = 0;

        public double ProgressValue
        {
            get { return _progressValue; }
        }

        public void SetProgressText(string text)
        {
            _progressText = text;
        }

        public void SetProgressValue(double value)
        {
            _progressValue = value;
            OnProgressUpdated(new EventArgs());
        }

        protected void OnProgressUpdated(EventArgs e)
        {
            EventHandler handler = ProgressUpdated;
            handler?.Invoke(this, e);
        }
    }
}
