# Mercurial extension to provide the 'hg changedChapter' command

'''command to list all changesets which changed the specified chapter'''

from mercurial import commands, registrar
from mercurial.i18n import _

from mercurial.node import short
import re

cmdtable = {}
command = registrar.command(cmdtable)
@command(b'changedChapter', 
    [(b'c', b'chap', b'', _(b'show revision changing the chapter'))] + commands.globalopts, 
	_(b'hg changedChapter [-c CHAPTER] [FILE]'))
def changedChapter(ui, repo, file_=None, **opts):
    parts = opts.get('chap').split(b'.')
    chapter = parts[0]
    if len(parts[1].split(b'-')) == 2:
        (v1, v2) = parts[1].split(b'-')
    else:
        # verse bridges present, just look for changed chapter text
        v1 = b''
        v2 = b''
        
    fl = repo.file(file_)    # get filelog 
    lastVerseText = b''   # track verse text seen
	
    for rev in fl:
        bookText = fl.revision(fl.node(rev)) 
        chapterText = getChapter(chapter, bookText)    
        if chapterText == b'': continue
        
        if v1 != b'':
            verseText = getVerses(v1, v2, chapterText)
        else:
            verseText = chapterText
        
        if verseText == lastVerseText: continue
        lastVerseText = verseText
        
        ui.write(str(int(fl.linkrev(rev))).encode() + b'\r\n')
        ui.flush()

# Extract the text of the specificed chapter from the text of the book

def getChapter(chapter, text):
    parts = re.split(b'(\\\\c\\s+\\S+)', text)
    i = findIndex(parts, chapter)
    if i == -1: return b''
    
    if chapter == b'1':
        return parts[i-1] + parts[i] + parts[i+1]
    
    return parts[i] + parts[i+1]

def getVerses(v1, v2, text):
    parts = re.split(b'(\\\\v\\s+\\S+)', text)
    i = findIndex(parts, v1)
    if i == -1: return text
    j = findIndex(parts, v2)
    if j == -1: return text
    
    result = b''
    if i == 1:
        result = parts[0]
        
    while i <= j:
        result += parts[i] + parts[i+1]
        i = i + 2
        
    return result
    
def findIndex(parts, match):
    for i in range(1, len(parts), 2):
        pieces = parts[i].split()
        if pieces[1] == match:
            return i
        
    return -1
