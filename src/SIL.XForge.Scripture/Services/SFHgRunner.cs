using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Paratext.Data;
using PtxUtils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> An implementation of <see cref="HgExeRunner"/> that allows intercepting Mercurial commands. </summary>
    public class SFHgRunner : HgExeRunner
    {
        public SFHgRunner(string installPath, string repository, string mergePath) : base(installPath, repository, mergePath)
        {

        }

        public override void RunHg(string args)
        {
            // Since we don't have access to the users registration code, using 'tip' seems to be a working alternative
            args = Regex.Replace(args, @"outgoing\(.+\)", "tip");
            args = $"{args}";
            base.RunHg(args);
        }
    }
}
