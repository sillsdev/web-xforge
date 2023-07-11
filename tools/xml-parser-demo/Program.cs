using System.Diagnostics;
using System.Xml.Serialization;
using Paratext.Data.ProjectComments;

// Warm up on a small file
Console.WriteLine("Small File (includes warm-up):");
Stopwatch smallWatch = Stopwatch.StartNew();
XmlSerializer smallSerializer = new XmlSerializer(typeof(CommentList));
using StreamReader smallStreamReader = new StreamReader("small_xml.xml");
CommentList? smallCommentList = smallSerializer.Deserialize(smallStreamReader) as CommentList;
smallWatch.Stop();
Console.WriteLine($"Elapsed: {smallWatch.ElapsedMilliseconds} ms");
Console.WriteLine($"Comments: {smallCommentList?.Count}");

// Run on the large file after warm up
Console.WriteLine("Large File:");
Stopwatch largeWatch = Stopwatch.StartNew();
XmlSerializer largeSerializer = new XmlSerializer(typeof(CommentList));
using StreamReader largeStreamReader = new StreamReader("large_xml.xml");
CommentList? largeCommentList = largeSerializer.Deserialize(largeStreamReader) as CommentList;
largeWatch.Stop();
Console.WriteLine($"Elapsed: {largeWatch.ElapsedMilliseconds} ms");
Console.WriteLine($"Comments: {largeCommentList?.Count}");
