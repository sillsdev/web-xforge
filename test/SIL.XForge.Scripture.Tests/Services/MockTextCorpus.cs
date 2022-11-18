namespace SIL.XForge.Scripture.Services
{
    using SIL.Machine.Corpora;
    using System;
    using System.Collections.Generic;
    using System.Linq;

    public class MockTextCorpus : ITextCorpus
    {
        public IText CreateNullText(string id)
        {
            throw new NotImplementedException();
        }

        public IEnumerable<IText>? Texts { get; set; }

        public IText? this[string id] => Texts?.FirstOrDefault(t => t.Id == id);
    }
}
