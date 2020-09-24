# Mercurial extension to provide the 'hg changedChapter' command

"""command to list all changesets which changed the specified chapter"""

from mercurial import commands, registrar
from mercurial.i18n import _

import re

cmdtable = {}
command = registrar.command(cmdtable)


@command(
    "changedChapter",
    [("c", "chap", "", _("show revision changing the chapter"))] + commands.globalopts,
    _("hg changedChapter [-c CHAPTER] [FILE]"),
)
def changedChapter(ui, repo, file_=None, **opts):
    parts = opts.get("chap").split(".")
    chapter = parts[0]
    if len(parts[1].split("-")) == 2:
        (v1, v2) = parts[1].split("-")
    else:
        # verse bridges present, just look for changed chapter text
        v1 = ""
        v2 = ""

    fl = repo.file(file_)  # get filelog

    lastVerseText = ""  # track verse text seen

    for rev in fl:
        bookText = fl.revision(fl.node(rev))
        chapterText = getChapter(chapter, bookText)
        if chapterText == "":
            continue

        if v1 != "":
            verseText = getVerses(v1, v2, chapterText)
        else:
            verseText = chapterText

        if verseText == lastVerseText:
            continue
        lastVerseText = verseText

        ui.write(str(int(fl.linkrev(rev))) + "\r\n")
        ui.flush()


# Extract the text of the specificed chapter from the text of the book


def getChapter(chapter, text):
    parts = re.split(r"(\\c\s+\S+)", text)
    i = findIndex(parts, chapter)
    if i == -1:
        return ""

    if chapter == "1":
        return parts[i - 1] + parts[i] + parts[i + 1]

    return parts[i] + parts[i + 1]


def getVerses(v1, v2, text):
    parts = re.split(r"(\\v\s+\S+)", text)
    i = findIndex(parts, v1)
    if i == -1:
        return text
    j = findIndex(parts, v2)
    if j == -1:
        return text

    result = ""
    if i == 1:
        result = parts[0]

    while i <= j:
        result += parts[i] + parts[i + 1]
        i = i + 2

    return result


def findIndex(parts, match):
    for i in range(1, len(parts), 2):
        pieces = parts[i].split()
        if pieces[1] == match:
            return i

    return -1
