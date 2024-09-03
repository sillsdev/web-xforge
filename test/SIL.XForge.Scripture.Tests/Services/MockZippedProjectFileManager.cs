using System;
using System.IO;
using System.Text;
using Ionic.Zip;
using Paratext.Data.ProjectFileAccess;

namespace SIL.XForge.Scripture.Services;

public class MockZippedProjectFileManager(ZipFile zipFile, bool loadDblSettings, string projectName)
    : ZippedProjectFileManagerBase(zipFile, loadDblSettings, projectName, null)
{
    public override void Delete(string relFilePath) => throw new NotImplementedException();

    public override void DeleteDirectory(string relDirPath) => throw new NotImplementedException();

    public override void MoveFile(string relFilePath, string newRelPath) => throw new NotImplementedException();

    public override void CopyFile(string absSourceFilePath, string dstRelPath) => throw new NotImplementedException();

    public override void WriteFileCreatingBackup(
        string relFilePath,
        Action<string> writeFile,
        Action<string> validateFile = null
    ) => throw new NotImplementedException();

    public override TextWriter OpenFileForWrite(string relFilePath, Encoding encoding = null) =>
        throw new NotImplementedException();

    public override BinaryWriter OpenFileForByteWrite(string relFilePath) => throw new NotImplementedException();

    public override void SetXml<T>(T obj, string relFilePath) => throw new NotImplementedException();

    public override void CreateDirIfNotExist(string relDirPath) => throw new NotImplementedException();

    public override string MakeSureFigureIsAccessible(string fileName) => throw new NotImplementedException();
}
