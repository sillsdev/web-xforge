using System;
using System.Collections.Generic;
using System.Linq;
using SIL.Machine.Corpora;

namespace SIL.XForge.Scripture.Services;

public class MockTextCorpus : ITextCorpus
{
    public IText CreateNullText(string id) => throw new NotImplementedException();

    public IEnumerable<IText>? Texts { get; set; }

    public IText? this[string id] => Texts?.FirstOrDefault(t => t.Id == id);
}
