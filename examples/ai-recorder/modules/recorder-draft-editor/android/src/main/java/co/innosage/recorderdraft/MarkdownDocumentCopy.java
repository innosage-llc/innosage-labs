package co.innosage.recorderdraft;

import java.io.DataInputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** The document picker does not attest whether a returned URI was previously user-owned. */
final class MarkdownDocumentCopy {
  enum Result { SAVED, OCCUPIED, INCOMPLETE }

  interface Open<T> { T open() throws IOException; }

  static Result write(File snapshot, File attempted, Open<InputStream> read, Open<OutputStream> write) {
    try {
      boolean empty;
      try (InputStream current = read.open()) {
        empty = current.read() == -1;
      }
      if (!empty) {
        if (!attempted.exists()) return Result.OCCUPIED;
        // Android may recreate the Activity after a successful write but before acknowledgment.
        return matches(snapshot, read) ? Result.SAVED : Result.INCOMPLETE;
      }
      if (!attempted.exists() && !attempted.createNewFile()) return Result.INCOMPLETE;
      try (InputStream in = new FileInputStream(snapshot); OutputStream out = write.open()) {
        byte[] buffer = new byte[8192];
        int count;
        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
      }
      return matches(snapshot, read) ? Result.SAVED : Result.INCOMPLETE;
    } catch (Exception failure) {
      // Never delete the external URI. The UI tells the user to retry with a fresh name.
      return Result.INCOMPLETE;
    }
  }

  private static boolean matches(File snapshot, Open<InputStream> read) throws IOException {
    try (InputStream source = new FileInputStream(snapshot); DataInputStream saved = new DataInputStream(read.open())) {
      byte[] expected = new byte[8192];
      byte[] actual = new byte[8192];
      int count;
      while ((count = source.read(expected)) != -1) {
        saved.readFully(actual, 0, count);
        for (int index = 0; index < count; index++) if (actual[index] != expected[index]) return false;
      }
      return saved.read() == -1;
    } catch (EOFException incomplete) {
      return false;
    }
  }
}
