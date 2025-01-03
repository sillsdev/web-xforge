import sys, os, uuid
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
    hgRelativeDirName = b'.hg'
    mergeRelativeDir = b'merge'
    mergeListFile = b'Merges.txt'
    mergeToken = b'#Merge'
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
    root = os.path.abspath(os.sep.encode())
    while d and d != root:
        if os.path.isdir(os.path.join(d, hgRelativeDirName)):
            repositoryDir = d
            mergeDir = os.path.join(repositoryDir, mergeRelativeDir)
            return True
        d = os.path.abspath(os.path.join(d, os.pardir.encode()))

    ui.warn(b'File ' + fullNameMine + b' is not in a repository. No .hg found.')
    return False


def PrintInfo(ui):
    ui.write(b'Mine : ' + fullNameMine + b'\nParent: ' + fullNameParent + b'\nTheirs:' + fullNameTheirs + b'\nRoot : ' + repositoryDir + b'\nMerge: ' + mergeDir)


def Run(ui):
    if not os.path.isdir(mergeDir):
        os.makedirs(mergeDir)
    relativePathMine = fullNameMine[len(repositoryDir) + 1:]
    mergePathParent = os.path.join(mergeRelativeDir, str(uuid.uuid4()).encode())
    mergePathTheirs = os.path.join(mergeRelativeDir, str(uuid.uuid4()).encode())
    ui.debug(b'Relative File Names\nMine :' + relativePathMine + b'\nParent: ' + mergePathParent + b'\nTheirs: ' + mergePathTheirs + b'\n')
    ui.debug(b'Moving parent.\n')
    copyfile(fullNameParent, os.path.join(repositoryDir, mergePathParent))
    ui.debug(b'Moving Theirs.\n')
    copyfile(fullNameTheirs, os.path.join(repositoryDir, mergePathTheirs))
    ui.debug(b'Done moving.\n')
    with open(os.path.join(mergeDir, mergeListFile), 'ab', 0) as (text_file):
        text_file.write(mergeToken + b'\n')
        text_file.write(relativePathMine + b'\n')
        text_file.write(mergePathParent + b'\n')
        text_file.write(mergePathTheirs + b'\n')
        os.fsync(text_file)