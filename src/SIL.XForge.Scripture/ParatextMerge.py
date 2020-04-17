import os, uuid
from shutil import copyfile


def merge(ui, repo, args, **kwargs):
    global fullNameMine
    global fullNameParent
    global fullNameTheirs
    global hgRelativeDirName
    global mergeListFile
    global mergeRelativeDir
    global mergeToken
    if len(kwargs) != 1:
        return True
    hgRelativeDirName = ".hg"
    mergeRelativeDir = "merge"
    mergeListFile = "Merges.txt"
    mergeToken = "#Merge"
    fullNameMine = os.path.abspath(args[0])
    fullNameParent = os.path.abspath(args[1])
    fullNameTheirs = os.path.abspath(args[2])
    if not FindRepositoryRoot(ui):
        return True
    PrintInfo(ui)
    Run(ui)


def FindRepositoryRoot(ui):
    global mergeDir
    global repositoryDir
    d = os.path.dirname(fullNameMine)
    while d and d != "/":
        if os.path.isdir(os.path.join(d, hgRelativeDirName)):
            repositoryDir = d
            mergeDir = os.path.join(repositoryDir, mergeRelativeDir)
            return True
        d = os.path.abspath(os.path.join(d, os.pardir))

    ui.warn("File " + fullNameMine + " is not in a repository. No .hg found.")
    return False


def PrintInfo(ui):
    ui.write(
        "Mine : "
        + fullNameMine
        + "\nParent: "
        + fullNameParent
        + "\nTheirs:"
        + fullNameTheirs
        + "\nRoot : "
        + repositoryDir
        + "\nMerge: "
        + mergeDir
    )


def Run(ui):
    if not os.path.isdir(mergeDir):
        os.makedirs(mergeDir)
    relativePathMine = fullNameMine[len(repositoryDir) + 1 :]
    mergePathParent = os.path.join(mergeRelativeDir, str(uuid.uuid4()))
    mergePathTheirs = os.path.join(mergeRelativeDir, str(uuid.uuid4()))
    ui.debug(
        "Relative File Names\nMine :"
        + relativePathMine
        + "\nParent: "
        + mergePathParent
        + "\nTheirs: "
        + mergePathTheirs
        + "\n"
    )
    ui.debug("Moving parent.\n")
    copyfile(fullNameParent, os.path.join(repositoryDir, mergePathParent))
    ui.debug("Moving Theirs.\n")
    copyfile(fullNameTheirs, os.path.join(repositoryDir, mergePathTheirs))
    ui.debug("Done moving.\n")
    with open(os.path.join(mergeDir, mergeListFile), "a", 0) as (text_file):
        text_file.write(mergeToken + "\n")
        text_file.write(relativePathMine + "\n")
        text_file.write(mergePathParent + "\n")
        text_file.write(mergePathTheirs + "\n")
        os.fsync(text_file)
