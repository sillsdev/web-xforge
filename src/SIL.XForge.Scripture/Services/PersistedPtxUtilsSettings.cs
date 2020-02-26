using PtxUtils;
using System;
using System.Collections.Generic;
using System.Text;

namespace SIL.XForge.Scripture
{
    class PersistedPtxUtilsSettings : IPtxUtilsSettings
    {
        public SerializableStringDictionary MementoData { get; set; }
        public bool UpgradeNeeded { get; set; }
        public bool EnableFormSnapping { get; set; }
        public void SafeSave()
        {

        }
    }
}
