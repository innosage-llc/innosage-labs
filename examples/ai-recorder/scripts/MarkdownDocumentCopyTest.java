package co.innosage.recorderdraft;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;

// Compile with MarkdownDocumentCopy.java, then run with a new temporary directory argument.
public final class MarkdownDocumentCopyTest {
  private static void require(boolean condition) {
    if (!condition) throw new AssertionError("Unexpected document copy result");
  }

  public static void main(String[] args) throws IOException {
    File root = new File(args[0]);
    File source = new File(root, "source.md");
    byte[] expected = "Edited.\n\n会议结束 · FIN-M13".getBytes(StandardCharsets.UTF_8);
    Files.write(source.toPath(), expected);
    File destination = new File(root, "selected.md");
    byte[] previous = "existing user content".getBytes(StandardCharsets.UTF_8);
    Files.write(destination.toPath(), previous);
    File marker = new File(root, "attempted");
    MarkdownDocumentCopy.Open<java.io.InputStream> read = () -> Files.newInputStream(destination.toPath());
    MarkdownDocumentCopy.Open<OutputStream> write = () -> Files.newOutputStream(destination.toPath());

    require(MarkdownDocumentCopy.write(source, marker, read,
      () -> { throw new AssertionError("Opened existing document for writing"); }) == MarkdownDocumentCopy.Result.OCCUPIED);
    require(Arrays.equals(previous, Files.readAllBytes(destination.toPath())));
    Files.write(destination.toPath(), new byte[0]);
    require(MarkdownDocumentCopy.write(source, marker, read, () -> new OutputStream() {
      public void write(int value) throws IOException {
        Files.write(destination.toPath(), new byte[]{(byte)value});
        throw new IOException("Synthetic provider stopped mid-write");
      }
    }) == MarkdownDocumentCopy.Result.INCOMPLETE);
    require(destination.isFile() && destination.length() == 1 && marker.isFile());

    // A recreated Activity cannot destroy a partial or externally changed destination.
    require(MarkdownDocumentCopy.write(source, marker, read,
      () -> { throw new AssertionError("Overwrote an incomplete document"); }) == MarkdownDocumentCopy.Result.INCOMPLETE);
    require(destination.length() == 1);
    File retry = new File(root, "new-name.md");
    Files.createFile(retry.toPath());
    File newMarker = new File(root, "retry-attempted");
    require(MarkdownDocumentCopy.write(source, newMarker, () -> Files.newInputStream(retry.toPath()),
      () -> Files.newOutputStream(retry.toPath())) == MarkdownDocumentCopy.Result.SAVED);
    require(Arrays.equals(expected, Files.readAllBytes(retry.toPath())));
    require(MarkdownDocumentCopy.write(source, newMarker, () -> Files.newInputStream(retry.toPath()),
      () -> { throw new AssertionError("Rewrote an already completed copy"); }) == MarkdownDocumentCopy.Result.SAVED);
    require(Arrays.equals(expected, Files.readAllBytes(source.toPath())));

    File silent = new File(root, "silent-provider.md");
    Files.createFile(silent.toPath());
    require(MarkdownDocumentCopy.write(source, new File(root, "silent-attempted"),
      () -> Files.newInputStream(silent.toPath()), ByteArrayOutputStream::new) == MarkdownDocumentCopy.Result.INCOMPLETE);
    System.out.println("PASS: existing destination, partial write, recreation, retry, silent data loss");
  }
}
