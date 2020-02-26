using Paratext.Data;
using PtxUtils;
using System;
using System.Collections.Generic;
using System.Text;

namespace SIL.XForge.Scripture
{
    class PersistedParatextDataSettings : IParatextDataSettings
    {
        public SerializableStringDictionary LastRegistryDataCachedTimes { get; set; }

        public void SafeSave()
        {

        }
    }
}
